"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createComplaintHandler } = require("../server/complaint-creator");
const { decodeFirestoreFields, encodeFirestoreValue } = require("../server/sla-monitor");

function firebaseToken(uid) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ sub: uid, user_id: uid })}.signature`;
}

function request(body, uid = "citizen-1", method = "POST") {
  return {
    method,
    headers: { authorization: `Bearer ${firebaseToken(uid)}` },
    body
  };
}

function responseHarness() {
  return {
    statusCode: 0,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

function firestoreDocument(data) {
  return {
    fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]))
  };
}

async function run() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const environment = {
    FIREBASE_PROJECT_ID: "civicresolve-ai-3d54c",
    FIREBASE_ADMIN_CLIENT_EMAIL: "sla-monitor@civicresolve-ai-3d54c.iam.gserviceaccount.com",
    FIREBASE_ADMIN_PRIVATE_KEY: pem
  };
  const createdAt = new Date("2026-08-04T12:00:00.000Z");
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("/documents/users/")) {
      return {
        ok: true,
        status: 200,
        json: async () => firestoreDocument({
          uid: "citizen-1",
          email: "citizen@example.com",
          displayName: "Citizen One",
          phone: "9876543210",
          role: "citizen"
        })
      };
    }
    if (url === "https://oauth2.googleapis.com/token") {
      return { ok: true, status: 200, json: async () => ({ access_token: "server-access-token" }) };
    }
    if (url.includes("/documents/complaints?documentId=")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const handler = createComplaintHandler({ fetchImpl, environment, now: () => createdAt });
  const response = responseHarness();
  await handler(request({
    phone: "9876543210",
    title: "Exposed electrical wire near school",
    description: "An exposed wire is hanging near the school gate and may cause electric shock.",
    location: "Namakkal bus stand",
    locationData: {
      latitude: 11.2196,
      longitude: 78.1677,
      address: "Namakkal bus stand",
      ward: "Namakkal",
      source: "address-search",
      accuracyMeters: null
    },
    category: "Electricity & Streetlights",
    department: "General Administration",
    priority: "Low",
    duplicateId: "",
    classification: {
      source: "gemini",
      model: "gemini-3.5-flash-lite",
      confidence: 99,
      summary: "A dangerous exposed electrical wire is near a school.",
      reasoning: "Electrical infrastructure and immediate safety risk were detected.",
      reviewRequired: false,
      safetyOverride: false
    }
  }), response);

  assert.equal(response.statusCode, 201);
  assert.match(response.body.complaint.id, /^GRV-2026-[A-Z0-9_-]+$/);
  assert.equal(response.body.complaint.createdByUid, "citizen-1");
  assert.equal(response.body.complaint.department, "Electricity Department", "The server controls the department mapping.");
  assert.equal(response.body.complaint.priority, "High", "Deterministic safety rules can raise the submitted priority.");
  assert.equal(response.body.complaint.classification.safetyOverride, true);
  assert.deepEqual(response.body.complaint.locationData, {
    latitude: 11.2196,
    longitude: 78.1677,
    address: "Namakkal bus stand",
    ward: "Namakkal",
    source: "address-search",
    accuracyMeters: null
  });
  assert.equal(response.body.complaint.sla.targetDays, 1);
  assert.equal(response.body.complaint.sla.deadlineAt, "2026-08-05T12:00:00.000Z");
  assert.equal(response.body.complaint.sla.lastEvaluatedAt, createdAt.toISOString());
  assert.equal(response.body.complaint.expectedResolutionDate, "2026-08-05");
  assert.equal(response.headers["Cache-Control"], "no-store");

  const profileCall = calls.find(call => call.url.includes("/documents/users/"));
  assert.match(profileCall.options.headers.Authorization, /^Bearer ey/);
  const writeCall = calls.find(call => call.url.includes("/documents/complaints?documentId="));
  assert.equal(writeCall.options.headers.Authorization, "Bearer server-access-token");
  const stored = decodeFirestoreFields(JSON.parse(writeCall.options.body).fields);
  assert.equal(stored.id, response.body.complaint.id);
  assert.equal(stored.createdAt, createdAt.toISOString());
  assert.equal(stored.sla.deadlineAt, "2026-08-05T12:00:00.000Z");
  assert.equal(stored.sla.lastEvaluatedAt, createdAt.toISOString());
  assert.equal(stored.locationData.latitude, 11.2196);
  assert.equal(stored.locationData.address, stored.location);
  assert.equal(stored.statusHistory[0].changedByRole, "citizen");

  const invalidLocationResponse = responseHarness();
  await handler(request({
    title: "Streetlight is broken",
    description: "The streetlight has not worked for several days.",
    location: "Ward 12",
    locationData: { latitude: 200, longitude: 76.9, address: "Ward 12", source: "map-pin" }
  }), invalidLocationResponse);
  assert.equal(invalidLocationResponse.statusCode, 400);
  assert.equal(invalidLocationResponse.body.error.code, "complaint/invalid-location");

  const officerHandler = createComplaintHandler({
    environment,
    fetchImpl: async url => {
      if (url.includes("/documents/users/")) {
        return {
          ok: true,
          status: 200,
          json: async () => firestoreDocument({
            uid: "officer-1",
            email: "officer@example.gov.in",
            displayName: "Electricity Officer",
            role: "department-officer"
          })
        };
      }
      throw new Error(`Unexpected URL: ${url}`);
    }
  });
  const officerResponse = responseHarness();
  await officerHandler(request({
    title: "Streetlight is broken",
    description: "The streetlight has not worked for several days.",
    location: "Ward 12"
  }, "officer-1"), officerResponse);
  assert.equal(officerResponse.statusCode, 403);
  assert.equal(officerResponse.body.error.code, "complaint/unauthorized");

  const unconfigured = createComplaintHandler({ fetchImpl, environment: {} });
  const unconfiguredResponse = responseHarness();
  await unconfigured(request({
    title: "Streetlight is broken",
    description: "The streetlight has not worked for several days.",
    location: "Ward 12"
  }), unconfiguredResponse);
  assert.equal(unconfiguredResponse.statusCode, 503);
  assert.equal(unconfiguredResponse.body.error.code, "complaint/server-not-configured");

  console.log("Secure complaint creation API tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
