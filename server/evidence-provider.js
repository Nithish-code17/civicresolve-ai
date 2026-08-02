"use strict";

const DEFAULT_FIREBASE_PROJECT_ID = "civicresolve-ai-3d54c";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_BODY_SIZE = 8 * 1024 * 1024;
const EVIDENCE_ROOT = "civicresolve/complaint-evidence";
const ACCESS_SECONDS = 5 * 60;
const ALLOWED_FILES = Object.freeze({
  "image/jpeg": { resourceType: "image", format: "jpg" },
  "image/png": { resourceType: "image", format: "png" },
  "image/webp": { resourceType: "image", format: "webp" },
  "application/pdf": { resourceType: "raw", format: "pdf" }
});

class EvidenceApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "EvidenceApiError";
    this.status = status;
    this.code = code;
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader?.("Content-Type", "application/json; charset=utf-8");
  response.setHeader?.("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function methodOnly(request, expected) {
  if (request.method !== expected) {
    throw new EvidenceApiError(405, "evidence/method-not-allowed", `Use ${expected} for this endpoint.`);
  }
}

function bearerToken(request) {
  const header = request.headers?.authorization || request.headers?.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new EvidenceApiError(401, "evidence/unauthenticated", "Sign in before accessing complaint evidence.");
  return match[1];
}

function decodeToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const uid = String(payload.sub || payload.user_id || "");
    if (!uid || uid.includes("/")) throw new Error("Invalid Firebase UID");
    return { uid, payload };
  } catch {
    throw new EvidenceApiError(401, "evidence/unauthenticated", "Your sign-in session is invalid. Sign in again.");
  }
}

async function readRequestBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > MAX_BODY_SIZE) {
      throw new EvidenceApiError(413, "evidence/request-too-large", "The evidence request is too large.");
    }
    try { return JSON.parse(request.body); } catch { /* handled below */ }
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_SIZE) {
      throw new EvidenceApiError(413, "evidence/request-too-large", "The evidence request is too large.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new EvidenceApiError(400, "evidence/invalid-request", "The evidence request body is invalid.");
  }
}

function safeComplaintId(value) {
  const complaintId = String(value || "").trim();
  if (!/^GRV-\d{4}-[A-Za-z0-9_-]{3,64}$/.test(complaintId)) {
    throw new EvidenceApiError(400, "evidence/invalid-complaint", "The grievance ID is invalid.");
  }
  return complaintId;
}

function safeName(value) {
  const name = String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 150);
  if (!name) throw new EvidenceApiError(400, "evidence/invalid-file", "The evidence filename is invalid.");
  return name;
}

function safeSlot(value) {
  const slot = Number(value);
  if (!Number.isInteger(slot) || slot < 1 || slot > 3) {
    throw new EvidenceApiError(400, "evidence/invalid-slot", "The evidence slot is invalid.");
  }
  return slot;
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

function firestoreDocumentUrl(projectId, collection, documentId) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${encodeURIComponent(collection)}/${encodeURIComponent(documentId)}`;
}

async function readFirestoreDocument(fetchImpl, projectId, collection, documentId, token) {
  let response;
  try {
    response = await fetchImpl(firestoreDocumentUrl(projectId, collection, documentId), {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new EvidenceApiError(503, "evidence/firebase-unavailable", "Evidence authorization is temporarily unavailable.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new EvidenceApiError(403, "evidence/unauthorized", "This account cannot access the requested complaint evidence.");
  }
  if (response.status === 404) {
    throw new EvidenceApiError(404, "evidence/complaint-not-found", "The complaint no longer exists.");
  }
  if (!response.ok) {
    throw new EvidenceApiError(503, "evidence/firebase-unavailable", "Evidence authorization is temporarily unavailable.");
  }
  const document = await response.json();
  return decodeFirestoreFields(document.fields || {});
}

function requireProviderEnvironment(environment) {
  const config = {
    cloudName: String(environment.CLOUDINARY_CLOUD_NAME || "").trim(),
    apiKey: String(environment.CLOUDINARY_API_KEY || "").trim(),
    apiSecret: String(environment.CLOUDINARY_API_SECRET || "").trim(),
    firebaseProjectId: String(environment.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID).trim()
  };
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new EvidenceApiError(503, "evidence/provider-not-configured", "Evidence storage is not configured yet.");
  }
  return config;
}

function configureProvider(cloudinary, config) {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true
  });
}

function fileBuffer(data, contentType, declaredSize) {
  const prefix = `data:${contentType};base64,`;
  if (typeof data !== "string" || !data.startsWith(prefix)) {
    throw new EvidenceApiError(400, "evidence/invalid-file", "The evidence file encoding is invalid.");
  }
  let buffer;
  try { buffer = Buffer.from(data.slice(prefix.length), "base64"); } catch { buffer = Buffer.alloc(0); }
  if (!buffer.length) throw new EvidenceApiError(400, "evidence/empty-file", "The evidence file is empty.");
  if (buffer.length > MAX_FILE_SIZE) throw new EvidenceApiError(413, "evidence/file-too-large", "Each evidence file must be 5 MB or smaller.");
  if (Number(declaredSize) !== buffer.length) {
    throw new EvidenceApiError(400, "evidence/invalid-file", "The evidence file size could not be verified.");
  }
  return buffer;
}

function hasExpectedSignature(buffer, contentType) {
  if (contentType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (contentType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  return false;
}

function expectedPublicId(complaintId, uid, slot, format) {
  const extension = format === "pdf" ? ".pdf" : "";
  return `${EVIDENCE_ROOT}/${complaintId}/${uid}/evidence-${slot}${extension}`;
}

function publicIdBelongsToComplaint(publicId, complaintId, ownerUid) {
  const prefix = `${EVIDENCE_ROOT}/${complaintId}/${ownerUid}/evidence-`;
  return typeof publicId === "string" && publicId.startsWith(prefix) && !publicId.includes("..") && publicId.length <= 240;
}

function evidenceList(complaint) {
  return Array.isArray(complaint.evidence) ? complaint.evidence : [];
}

function findEvidence(complaint, publicId, assetId = "") {
  return evidenceList(complaint).find(item => item?.provider === "cloudinary"
    && item.publicId === publicId
    && (!assetId || item.assetId === assetId));
}

function uploadToCloudinary(cloudinary, dataUri, options) {
  return cloudinary.uploader.upload(dataUri, options);
}

function createEvidenceHandlers({ cloudinary, fetchImpl = globalThis.fetch, environment = process.env, now = () => Date.now() } = {}) {
  if (!cloudinary) throw new Error("A Cloudinary client is required.");

  async function authorize(request, complaintId, config) {
    const token = bearerToken(request);
    const { uid } = decodeToken(token);
    const complaint = await readFirestoreDocument(fetchImpl, config.firebaseProjectId, "complaints", complaintId, token);
    return { token, uid, complaint };
  }

  async function upload(request, response) {
    methodOnly(request, "POST");
    const config = requireProviderEnvironment(environment);
    configureProvider(cloudinary, config);
    const body = await readRequestBody(request);
    const complaintId = safeComplaintId(body.complaintId);
    const originalName = safeName(body.fileName);
    const slot = safeSlot(body.slot);
    const allowed = ALLOWED_FILES[body.contentType];
    if (!allowed) throw new EvidenceApiError(400, "evidence/unsupported-type", "Use a JPG, PNG, WebP, or PDF file.");
    const buffer = fileBuffer(body.data, body.contentType, body.size);
    if (!hasExpectedSignature(buffer, body.contentType)) {
      throw new EvidenceApiError(400, "evidence/type-mismatch", "The file contents do not match the selected file type.");
    }

    const { uid, complaint } = await authorize(request, complaintId, config);
    const currentEvidence = evidenceList(complaint);
    if (complaint.createdByUid !== uid) {
      throw new EvidenceApiError(403, "evidence/unauthorized", "Only the complaint owner can upload citizen evidence.");
    }
    if (!["Submitted", "Under Review"].includes(complaint.status)) {
      throw new EvidenceApiError(409, "evidence/window-closed", "Evidence can be added only before department work begins.");
    }
    if (currentEvidence.length >= 3 || slot <= currentEvidence.length) {
      throw new EvidenceApiError(409, "evidence/invalid-slot", "Refresh the complaint before adding more evidence.");
    }

    const publicId = expectedPublicId(complaintId, uid, slot, allowed.format);
    const dataUri = `data:${body.contentType};base64,${buffer.toString("base64")}`;
    let result;
    try {
      result = await uploadToCloudinary(cloudinary, dataUri, {
        public_id: publicId,
        resource_type: allowed.resourceType,
        type: "authenticated",
        overwrite: true,
        invalidate: true,
        tags: ["civicresolve", "complaint-evidence"],
        context: {
          complaint_id: complaintId,
          uploader_uid: uid,
          original_name: originalName
        }
      });
    } catch (error) {
      console.error("Cloudinary evidence upload failed.", error?.message || error);
      throw new EvidenceApiError(502, "evidence/provider-upload-failed", "The evidence provider could not store this file. Try again.");
    }

    if (!result?.asset_id || result.public_id !== publicId || result.type !== "authenticated"
      || result.resource_type !== allowed.resourceType || result.bytes !== buffer.length) {
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: allowed.resourceType,
          type: "authenticated",
          invalidate: true
        });
      } catch { /* best-effort provider cleanup */ }
      throw new EvidenceApiError(502, "evidence/provider-response-invalid", "The evidence provider returned an invalid upload result.");
    }

    sendJson(response, 201, {
      evidence: {
        provider: "cloudinary",
        complaintId,
        assetId: result.asset_id,
        publicId: result.public_id,
        resourceType: result.resource_type,
        deliveryType: result.type,
        format: result.format || allowed.format,
        originalName,
        contentType: body.contentType,
        size: result.bytes,
        uploadedByUid: uid
      }
    });
  }

  async function access(request, response) {
    methodOnly(request, "POST");
    const config = requireProviderEnvironment(environment);
    configureProvider(cloudinary, config);
    const body = await readRequestBody(request);
    const complaintId = safeComplaintId(body.complaintId);
    const publicId = String(body.publicId || "");
    const { complaint } = await authorize(request, complaintId, config);
    const evidence = findEvidence(complaint, publicId, String(body.assetId || ""));
    if (!evidence) throw new EvidenceApiError(404, "evidence/object-not-found", "This evidence file is no longer attached to the complaint.");

    const expiresAt = Math.floor(now() / 1000) + ACCESS_SECONDS;
    const url = cloudinary.utils.private_download_url(evidence.publicId, evidence.format, {
      resource_type: evidence.resourceType,
      type: evidence.deliveryType,
      expires_at: expiresAt,
      attachment: false
    });
    sendJson(response, 200, { url, expiresAt });
  }

  async function remove(request, response) {
    methodOnly(request, "POST");
    const config = requireProviderEnvironment(environment);
    configureProvider(cloudinary, config);
    const body = await readRequestBody(request);
    const complaintId = safeComplaintId(body.complaintId);
    const requestedPublicId = String(body.publicId || "");
    const { token, uid, complaint } = await authorize(request, complaintId, config);
    const existing = findEvidence(complaint, requestedPublicId, String(body.assetId || ""));
    const owner = complaint.createdByUid === uid;
    let administrator = false;
    if (!owner) {
      const userProfile = await readFirestoreDocument(fetchImpl, config.firebaseProjectId, "users", uid, token);
      administrator = userProfile.role === "administrator";
    }
    if (!owner && !administrator) {
      throw new EvidenceApiError(403, "evidence/unauthorized", "This account cannot delete complaint evidence.");
    }
    if (!existing && (!owner || !publicIdBelongsToComplaint(requestedPublicId, complaintId, uid))) {
      throw new EvidenceApiError(404, "evidence/object-not-found", "This evidence file is not attached to the complaint.");
    }
    if (owner && existing && !["Submitted", "Under Review"].includes(complaint.status)) {
      throw new EvidenceApiError(409, "evidence/window-closed", "Attached evidence cannot be removed after department work begins.");
    }

    const publicId = existing?.publicId || requestedPublicId;
    const resourceType = existing?.resourceType || (publicId.endsWith(".pdf") ? "raw" : "image");
    let result;
    try {
      result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        type: "authenticated",
        invalidate: true
      });
    } catch (error) {
      console.error("Cloudinary evidence deletion failed.", error?.message || error);
      throw new EvidenceApiError(502, "evidence/provider-delete-failed", "The evidence provider could not remove this file.");
    }
    sendJson(response, 200, { removed: result?.result === "ok" || result?.result === "not found" });
  }

  function expose(handler) {
    return async (request, response) => {
      try {
        await handler(request, response);
      } catch (error) {
        const known = error instanceof EvidenceApiError;
        if (!known) console.error("Unexpected evidence API failure.", error);
        sendJson(response, known ? error.status : 500, {
          error: {
            code: known ? error.code : "evidence/internal-error",
            message: known ? error.message : "The evidence service could not complete the request."
          }
        });
      }
    };
  }

  return Object.freeze({
    upload: expose(upload),
    access: expose(access),
    remove: expose(remove)
  });
}

module.exports = {
  ACCESS_SECONDS,
  ALLOWED_FILES,
  EVIDENCE_ROOT,
  MAX_FILE_SIZE,
  EvidenceApiError,
  createEvidenceHandlers,
  decodeFirestoreFields,
  publicIdBelongsToComplaint
};
