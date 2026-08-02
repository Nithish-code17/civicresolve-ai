const assert = require("node:assert/strict");
const {
  createEvidenceHandlers,
  EVIDENCE_ROOT,
  MAX_FILE_SIZE
} = require("../server/evidence-provider");

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
  }
  throw new Error(`Unsupported Firestore test value: ${typeof value}`);
}

function firestoreDocument(value) {
  return { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) };
}

function firebaseToken(uid) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ sub: uid, user_id: uid })}.signature`;
}

function responseHarness() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) { this.body = JSON.parse(body); }
  };
}

function request(body, uid = "citizen-1", method = "POST") {
  return {
    method,
    headers: { authorization: `Bearer ${firebaseToken(uid)}` },
    body
  };
}

async function run() {
  const writes = { config: [], uploads: [], deletes: [], reads: [], downloads: [] };
  let complaint = {
    id: "GRV-2026-ABC",
    createdByUid: "citizen-1",
    status: "Submitted",
    evidence: []
  };
  const profiles = {
    "citizen-1": { uid: "citizen-1", role: "citizen" },
    "admin-1": { uid: "admin-1", role: "administrator" }
  };
  const fetchImpl = async (url, options) => {
    writes.reads.push({ url, options });
    const decoded = decodeURIComponent(url);
    if (decoded.includes("/documents/complaints/")) {
      return { ok: true, status: 200, json: async () => firestoreDocument(complaint) };
    }
    const uid = decoded.split("/documents/users/")[1];
    return { ok: true, status: 200, json: async () => firestoreDocument(profiles[uid]) };
  };
  const cloudinary = {
    config(value) { writes.config.push(value); },
    uploader: {
      async upload(data, options) {
        writes.uploads.push({ data, options });
        const bytes = Buffer.from(data.split(",")[1], "base64").length;
        return {
          asset_id: "asset-1",
          public_id: options.public_id,
          resource_type: options.resource_type,
          type: options.type,
          format: options.resource_type === "raw" ? "pdf" : "jpg",
          bytes
        };
      },
      async destroy(publicId, options) {
        writes.deletes.push({ publicId, options });
        return { result: "ok" };
      }
    },
    utils: {
      private_download_url(publicId, format, options) {
        writes.downloads.push({ publicId, format, options });
        return `https://api.cloudinary.example/download/${encodeURIComponent(publicId)}`;
      }
    }
  };
  const environment = {
    CLOUDINARY_CLOUD_NAME: "civicresolve",
    CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "private-secret",
    FIREBASE_PROJECT_ID: "civicresolve-ai-3d54c"
  };
  const handlers = createEvidenceHandlers({ cloudinary, fetchImpl, environment, now: () => 1_700_000_000_000 });

  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const uploadResponse = responseHarness();
  await handlers.upload(request({
    complaintId: complaint.id,
    slot: 1,
    fileName: "broken-light.jpg",
    contentType: "image/jpeg",
    size: imageBytes.length,
    data: `data:image/jpeg;base64,${imageBytes.toString("base64")}`
  }), uploadResponse);

  assert.equal(uploadResponse.statusCode, 201);
  assert.equal(uploadResponse.body.evidence.provider, "cloudinary");
  assert.equal(uploadResponse.body.evidence.deliveryType, "authenticated");
  assert.equal(uploadResponse.body.evidence.publicId, `${EVIDENCE_ROOT}/GRV-2026-ABC/citizen-1/evidence-1`);
  assert.equal(writes.uploads[0].options.overwrite, true);
  assert.deepEqual(writes.uploads[0].options.tags, ["civicresolve", "complaint-evidence"]);
  assert.equal(writes.config[0].api_secret, "private-secret");
  assert.equal(writes.reads[0].options.headers.Authorization.startsWith("Bearer "), true);

  complaint = { ...complaint, evidence: [{ ...uploadResponse.body.evidence, uploadedAt: "2026-08-02T00:00:00Z" }] };
  const accessResponse = responseHarness();
  await handlers.access(request({
    complaintId: complaint.id,
    assetId: uploadResponse.body.evidence.assetId,
    publicId: uploadResponse.body.evidence.publicId
  }), accessResponse);
  assert.equal(accessResponse.statusCode, 200);
  assert.match(accessResponse.body.url, /^https:\/\/api\.cloudinary\.example\/download\//);
  assert.equal(accessResponse.body.expiresAt, 1_700_000_300);
  assert.equal(writes.downloads[0].options.type, "authenticated");

  const deleteResponse = responseHarness();
  await handlers.remove(request({
    complaintId: complaint.id,
    assetId: uploadResponse.body.evidence.assetId,
    publicId: uploadResponse.body.evidence.publicId
  }), deleteResponse);
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.body.removed, true);
  assert.equal(writes.deletes[0].options.type, "authenticated");

  const badBytes = Buffer.from("not a jpeg");
  const invalidResponse = responseHarness();
  await handlers.upload(request({
    complaintId: complaint.id,
    slot: 2,
    fileName: "fake.jpg",
    contentType: "image/jpeg",
    size: badBytes.length,
    data: `data:image/jpeg;base64,${badBytes.toString("base64")}`
  }), invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.body.error.code, "evidence/type-mismatch");

  const oversizedResponse = responseHarness();
  const oversized = Buffer.alloc(MAX_FILE_SIZE + 1, 0xff);
  await handlers.upload(request({
    complaintId: complaint.id,
    slot: 2,
    fileName: "huge.jpg",
    contentType: "image/jpeg",
    size: oversized.length,
    data: `data:image/jpeg;base64,${oversized.toString("base64")}`
  }), oversizedResponse);
  assert.equal(oversizedResponse.statusCode, 413);
  assert.equal(oversizedResponse.body.error.code, "evidence/file-too-large");

  const missingProviderHandlers = createEvidenceHandlers({ cloudinary, fetchImpl, environment: {} });
  const missingProviderResponse = responseHarness();
  await missingProviderHandlers.access(request({ complaintId: complaint.id }), missingProviderResponse);
  assert.equal(missingProviderResponse.statusCode, 503);
  assert.equal(missingProviderResponse.body.error.code, "evidence/provider-not-configured");

  console.log("Evidence API tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
