"use strict";

const crypto = require("node:crypto");
const classificationRules = require("../assets/js/classification-rules");
const slaPolicy = require("../assets/js/sla-policy");
const {
  decodeFirestoreFields,
  encodeFirestoreValue,
  serviceAccountAssertion
} = require("./sla-monitor");

const DEFAULT_FIREBASE_PROJECT_ID = "civicresolve-ai-3d54c";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MAX_BODY_SIZE = 16 * 1024;

class ComplaintApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ComplaintApiError";
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader?.("Content-Type", "application/json; charset=utf-8");
  response.setHeader?.("Cache-Control", "no-store");
  response.setHeader?.("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function bearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ComplaintApiError(401, "complaint/unauthenticated", "Sign in before submitting a complaint.");
  return match[1];
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const uid = String(payload.sub || payload.user_id || "");
    if (!uid || uid.includes("/")) throw new Error("Invalid Firebase UID");
    return { uid, payload };
  } catch {
    throw new ComplaintApiError(401, "complaint/unauthenticated", "Your sign-in session is invalid. Sign in again.");
  }
}

async function readRequestBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_SIZE) {
      throw new ComplaintApiError(413, "complaint/request-too-large", "The complaint request is too large.");
    }
    try { return JSON.parse(request.body); } catch { /* handled below */ }
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_SIZE) {
      throw new ComplaintApiError(413, "complaint/request-too-large", "The complaint request is too large.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ComplaintApiError(400, "complaint/invalid-request", "The complaint request body is invalid.");
  }
}

function requiredText(value, minimum, maximum, label) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length < minimum || text.length > maximum) {
    throw new ComplaintApiError(400, "complaint/invalid-input", `${label} must contain ${minimum} to ${maximum} characters.`);
  }
  return text;
}

function optionalText(value, maximum) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function safeLocationData(value, address) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ComplaintApiError(400, "complaint/invalid-location", "Select a valid complaint location on the map.");
  }
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new ComplaintApiError(400, "complaint/invalid-location", "The selected map coordinates are invalid.");
  }
  const source = ["map-pin", "device", "address-search"].includes(value.source) ? value.source : "map-pin";
  let accuracyMeters = null;
  if (value.accuracyMeters !== null && value.accuracyMeters !== undefined && value.accuracyMeters !== "") {
    accuracyMeters = Number(value.accuracyMeters);
    if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000) {
      throw new ComplaintApiError(400, "complaint/invalid-location", "The selected location accuracy is invalid.");
    }
  }
  return {
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
    address,
    ward: optionalText(value.ward, 120),
    source,
    accuracyMeters
  };
}

function requireEnvironment(environment) {
  const config = {
    projectId: String(environment.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim(),
    clientEmail: String(environment.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim(),
    privateKey: String(environment.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim()
  };
  if (!config.clientEmail || !config.privateKey) {
    throw new ComplaintApiError(503, "complaint/server-not-configured", "Secure complaint submission is being activated. Try again shortly.");
  }
  return config;
}

function firestoreRoot(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

async function readCitizenProfile(fetchImpl, config, token, uid) {
  let response;
  try {
    response = await fetchImpl(`${firestoreRoot(config.projectId)}/users/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new ComplaintApiError(503, "complaint/firebase-unavailable", "Citizen authorization is temporarily unavailable.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ComplaintApiError(401, "complaint/unauthenticated", "Your sign-in session expired. Sign in again.");
  }
  if (response.status === 404) {
    throw new ComplaintApiError(403, "complaint/profile-missing", "Your citizen profile could not be found.");
  }
  if (!response.ok) {
    throw new ComplaintApiError(503, "complaint/firebase-unavailable", "Citizen authorization is temporarily unavailable.");
  }
  const document = await response.json();
  const profile = decodeFirestoreFields(document.fields || {});
  if (profile.uid !== uid || profile.role !== "citizen") {
    throw new ComplaintApiError(403, "complaint/unauthorized", "Only citizen accounts can submit complaints.");
  }
  return profile;
}

async function adminAccessToken(fetchImpl, config, now) {
  let response;
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(config, now)
      }).toString()
    });
  } catch {
    throw new ComplaintApiError(503, "complaint/firebase-unavailable", "Secure complaint submission is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new ComplaintApiError(503, "complaint/firebase-authorization-failed", "Firebase rejected the complaint service credential.");
  }
  const payload = await response.json();
  if (!payload.access_token) {
    throw new ComplaintApiError(503, "complaint/firebase-authorization-failed", "Firebase did not return a complaint service token.");
  }
  return payload.access_token;
}

function safeClassification(value, input, category, priority, requestedPriority) {
  const fallback = classificationRules.analyse(input);
  const source = value?.source === "gemini" ? "gemini" : "rules";
  return {
    source,
    model: optionalText(value?.model || (source === "gemini" ? "gemini" : "keyword-rules-v1"), 80) || "keyword-rules-v1",
    confidence: Math.max(0, Math.min(100, Math.round(Number(value?.confidence) || 0))),
    summary: optionalText(value?.summary || input.title, 220) || input.title,
    reasoning: optionalText(value?.reasoning || fallback.reasoning, 300) || "Verified server-side civic service routing was applied.",
    reviewRequired: Boolean(value?.reviewRequired) || category === classificationRules.GENERAL_RULE.category,
    safetyOverride: Boolean(value?.safetyOverride) || (fallback.priority === "High" && requestedPriority !== "High")
  };
}

function safeComplaintInput(body) {
  const input = {
    title: requiredText(body.title, 3, 160, "Title"),
    description: requiredText(body.description, 15, 5000, "Description"),
    location: requiredText(body.location, 3, 500, "Location")
  };
  const locationData = safeLocationData(body.locationData, input.location);
  const fallback = classificationRules.analyse(input);
  const category = classificationRules.validCategory(body.category) ? body.category : fallback.category;
  const route = classificationRules.ruleForCategory(category);
  const requestedPriority = classificationRules.validPriority(body.priority) ? body.priority : fallback.priority;
  const priority = fallback.priority === "High" ? "High" : requestedPriority;
  return {
    ...input,
    phone: optionalText(body.phone, 20),
    category: route.category,
    department: route.department,
    priority,
    duplicateId: optionalText(body.duplicateId, 80),
    locationData,
    classification: safeClassification(body.classification, input, route.category, priority, requestedPriority)
  };
}

function grievanceId(now) {
  return `GRV-${now.getUTCFullYear()}-${crypto.randomBytes(12).toString("base64url").toUpperCase()}`;
}

function complaintRecord(input, profile, uid, now) {
  const slaDraft = slaPolicy.createRecord({ category: input.category, priority: input.priority }, now);
  const sla = {
    ...slaDraft,
    deadlineAt: new Date(slaDraft.deadlineAt),
    lastEvaluatedAt: new Date(now)
  };
  const id = grievanceId(now);
  return {
    id,
    citizenName: requiredText(profile.displayName, 2, 120, "Citizen name"),
    email: requiredText(profile.email, 3, 254, "Citizen email"),
    phone: input.phone || optionalText(profile.phone, 20),
    title: input.title,
    description: input.description,
    location: input.location,
    ...(input.locationData ? { locationData: input.locationData } : {}),
    category: input.category,
    department: input.department,
    priority: input.priority,
    classification: input.classification,
    status: "Submitted",
    expectedResolutionDate: slaDraft.deadlineDate,
    sla,
    resolutionNote: "",
    rating: null,
    feedback: "",
    evidence: [],
    duplicateId: input.duplicateId,
    createdByUid: uid,
    createdByEmail: profile.email,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    statusHistory: [{
      status: "Submitted",
      note: "Complaint submitted by citizen.",
      changedAt: new Date(now),
      changedByUid: uid,
      changedByName: profile.displayName,
      changedByRole: "citizen"
    }]
  };
}

async function writeComplaint(fetchImpl, config, token, complaint) {
  const fields = Object.fromEntries(Object.entries(complaint).map(([key, value]) => [key, encodeFirestoreValue(value)]));
  let response;
  try {
    response = await fetchImpl(`${firestoreRoot(config.projectId)}/complaints?documentId=${encodeURIComponent(complaint.id)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });
  } catch {
    throw new ComplaintApiError(503, "complaint/firestore-write-failed", "The complaint could not be stored. Try again.");
  }
  if (!response.ok) {
    throw new ComplaintApiError(503, "complaint/firestore-write-failed", "The complaint could not be stored. Try again.");
  }
}

function createComplaintHandler({ fetchImpl = globalThis.fetch, environment = process.env, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  return async (request, response) => {
    try {
      if (request.method !== "POST") {
        throw new ComplaintApiError(405, "complaint/method-not-allowed", "Use POST for this endpoint.");
      }
      const config = requireEnvironment(environment);
      const token = bearerToken(request);
      const { uid } = decodeToken(token);
      const [body, profile] = await Promise.all([
        readRequestBody(request),
        readCitizenProfile(fetchImpl, config, token, uid)
      ]);
      const input = safeComplaintInput(body);
      const createdAt = now();
      const complaint = complaintRecord(input, profile, uid, createdAt);
      const serviceToken = await adminAccessToken(fetchImpl, config, createdAt);
      await writeComplaint(fetchImpl, config, serviceToken, complaint);
      sendJson(response, 201, { complaint });
    } catch (error) {
      const known = error instanceof ComplaintApiError;
      if (!known) console.error("Unexpected complaint creation failure.", error);
      sendJson(response, known ? error.status : 500, {
        error: {
          code: known ? error.code : "complaint/internal-error",
          message: known ? error.message : "The complaint service could not complete the request."
        }
      });
    }
  };
}

module.exports = {
  ComplaintApiError,
  complaintRecord,
  createComplaintHandler,
  safeLocationData,
  safeComplaintInput
};
