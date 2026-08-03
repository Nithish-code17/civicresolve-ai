"use strict";

const crypto = require("node:crypto");
const slaPolicy = require("../assets/js/sla-policy");

const DEFAULT_FIREBASE_PROJECT_ID = "civicresolve-ai-3d54c";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";
const MAX_COMPLAINTS_PER_RUN = 500;

class SlaMonitorError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "SlaMonitorError";
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

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function requireEnvironment(environment) {
  const config = {
    cronSecret: String(environment.CRON_SECRET || "").trim(),
    projectId: String(environment.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim(),
    clientEmail: String(environment.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim(),
    privateKey: String(environment.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim()
  };
  if (config.cronSecret.length < 32) {
    throw new SlaMonitorError(503, "sla/cron-not-configured", "The SLA monitor secret is not configured.");
  }
  if (!config.clientEmail || !config.privateKey) {
    throw new SlaMonitorError(503, "sla/firebase-not-configured", "The SLA monitor Firebase credentials are not configured.");
  }
  return config;
}

function authorizeCron(request, secret) {
  const header = request.headers?.authorization || request.headers?.Authorization || "";
  if (!secureEqual(header, `Bearer ${secret}`)) {
    throw new SlaMonitorError(401, "sla/unauthorized", "This endpoint accepts only the protected Vercel schedule.");
  }
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function serviceAccountAssertion(config, now = new Date()) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: config.clientEmail,
    sub: config.clientEmail,
    aud: TOKEN_AUDIENCE,
    scope: FIRESTORE_SCOPE,
    iat: issuedAt,
    exp: issuedAt + 3600
  });
  const unsigned = `${header}.${payload}`;
  let signature;
  try {
    signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), config.privateKey).toString("base64url");
  } catch {
    throw new SlaMonitorError(503, "sla/firebase-credential-invalid", "The SLA monitor Firebase credential is invalid.");
  }
  return `${unsigned}.${signature}`;
}

async function accessToken(fetchImpl, config, now) {
  let response;
  try {
    response = await fetchImpl(TOKEN_AUDIENCE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: serviceAccountAssertion(config, now)
      }).toString()
    });
  } catch {
    throw new SlaMonitorError(503, "sla/firebase-unavailable", "Firebase authorization is temporarily unavailable.");
  }
  if (!response.ok) {
    throw new SlaMonitorError(503, "sla/firebase-authorization-failed", "Firebase rejected the SLA monitor credential.");
  }
  const payload = await response.json();
  if (!payload.access_token) {
    throw new SlaMonitorError(503, "sla/firebase-authorization-failed", "Firebase did not return an SLA monitor token.");
  }
  return payload.access_token;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeFirestoreValue(item)]))
    }
  };
}

function firestoreRoot(projectId) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
}

async function readComplaints(fetchImpl, config, token) {
  const response = await fetchImpl(`${firestoreRoot(config.projectId)}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "complaints" }],
        limit: MAX_COMPLAINTS_PER_RUN
      }
    })
  });
  if (!response.ok) {
    throw new SlaMonitorError(503, "sla/firestore-read-failed", "The SLA monitor could not read complaints.");
  }
  const rows = await response.json();
  return rows
    .filter(row => row.document?.name && row.document?.fields)
    .map(row => ({
      name: row.document.name,
      data: decodeFirestoreFields(row.document.fields)
    }));
}

function validStoredSla(sla) {
  return sla && sla.policyVersion === slaPolicy.POLICY_VERSION && sla.deadlineAt;
}

function nextSlaRecord(complaint, now = new Date()) {
  const assessment = slaPolicy.assess(complaint, now);
  const existing = complaint.sla || {};
  const record = {
    policyVersion: slaPolicy.POLICY_VERSION,
    baseDays: Number(existing.baseDays) || assessment.baseDays,
    targetDays: Number(existing.targetDays) || assessment.targetDays,
    deadlineAt: new Date(assessment.deadlineAt),
    deadlineDate: assessment.deadlineDate,
    state: assessment.state,
    lastEvaluatedAt: new Date(now),
    dueSoonAlertedAt: existing.dueSoonAlertedAt ? new Date(existing.dueSoonAlertedAt) : null,
    overdueAlertedAt: existing.overdueAlertedAt ? new Date(existing.overdueAlertedAt) : null
  };
  if (assessment.state === "due-soon" && !record.dueSoonAlertedAt) record.dueSoonAlertedAt = new Date(now);
  if (assessment.state === "overdue" && !record.overdueAlertedAt) record.overdueAlertedAt = new Date(now);
  return record;
}

function requiresUpdate(complaint, next) {
  const existing = complaint.sla || {};
  if (!validStoredSla(existing)) return true;
  if (existing.state !== next.state) return true;
  if (next.state === "due-soon" && !existing.dueSoonAlertedAt) return true;
  if (next.state === "overdue" && !existing.overdueAlertedAt) return true;
  return false;
}

async function commitUpdates(fetchImpl, config, token, updates) {
  if (!updates.length) return;
  const response = await fetchImpl(`${firestoreRoot(config.projectId)}:commit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      writes: updates.map(update => ({
        update: {
          name: update.name,
          fields: { sla: encodeFirestoreValue(update.sla) }
        },
        updateMask: { fieldPaths: ["sla"] },
        currentDocument: { exists: true }
      }))
    })
  });
  if (!response.ok) {
    throw new SlaMonitorError(503, "sla/firestore-write-failed", "The SLA monitor could not persist alert state.");
  }
}

function createSlaMonitorHandler({ fetchImpl = globalThis.fetch, environment = process.env, now = () => new Date() } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  return async (request, response) => {
    try {
      if (request.method !== "GET") throw new SlaMonitorError(405, "sla/method-not-allowed", "Use GET for this endpoint.");
      const config = requireEnvironment(environment);
      authorizeCron(request, config.cronSecret);
      const runAt = now();
      const token = await accessToken(fetchImpl, config, runAt);
      const complaints = await readComplaints(fetchImpl, config, token);
      const updates = complaints
        .map(({ name, data }) => ({ name, data, sla: nextSlaRecord(data, runAt) }))
        .filter(item => requiresUpdate(item.data, item.sla));
      await commitUpdates(fetchImpl, config, token, updates);
      const states = complaints.reduce((counts, item) => {
        const state = slaPolicy.stateFor(item.data, runAt);
        counts[state] = (counts[state] || 0) + 1;
        return counts;
      }, {});
      sendJson(response, 200, {
        ok: true,
        scanned: complaints.length,
        updated: updates.length,
        states,
        checkedAt: runAt.toISOString()
      });
    } catch (error) {
      const known = error instanceof SlaMonitorError;
      if (!known) console.error("Unexpected SLA monitor failure.", error);
      sendJson(response, known ? error.status : 500, {
        error: {
          code: known ? error.code : "sla/internal-error",
          message: known ? error.message : "The SLA monitor could not complete this run."
        }
      });
    }
  };
}

module.exports = {
  MAX_COMPLAINTS_PER_RUN,
  SlaMonitorError,
  createSlaMonitorHandler,
  decodeFirestoreFields,
  encodeFirestoreValue,
  nextSlaRecord,
  requiresUpdate,
  serviceAccountAssertion
};
