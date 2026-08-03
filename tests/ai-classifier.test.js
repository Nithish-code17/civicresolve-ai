"use strict";

const assert = require("node:assert/strict");
const { createClassifierHandler, DEFAULT_GEMINI_MODEL } = require("../server/ai-classifier");

function firestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  throw new Error(`Unsupported Firestore value: ${typeof value}`);
}

function firestoreDocument(value) {
  return { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) };
}

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
    end(body) { this.body = JSON.parse(body); }
  };
}

function environment(overrides = {}) {
  return {
    GEMINI_API_KEY: "server-only-gemini-key",
    GEMINI_MODEL: DEFAULT_GEMINI_MODEL,
    FIREBASE_PROJECT_ID: "civicresolve-ai-3d54c",
    ...overrides
  };
}

async function run() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes("firestore.googleapis.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => firestoreDocument({ uid: "citizen-1", role: "citizen" })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        steps: [{
          type: "model_output",
          content: [{
            type: "text",
            text: JSON.stringify({
              category: "Electricity & Streetlights",
              priority: "Low",
              confidence: 91,
              summary: "An exposed electrical wire is creating a public safety risk.",
              reasoning: "The issue concerns electrical infrastructure and public safety.",
              safetyAdvice: "Keep away from the wire and alert emergency services if danger is immediate.",
              reviewRequired: false
            })
          }]
        }]
      })
    };
  };
  const handler = createClassifierHandler({ fetchImpl, environment: environment(), now: () => 1_700_000_000_000 });
  const response = responseHarness();
  await handler(request({
    title: "Exposed wire near school",
    description: "An exposed wire is hanging beside the school gate and could cause electric shock.",
    location: "Ward 12, Coimbatore"
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.classification.category, "Electricity & Streetlights");
  assert.equal(response.body.classification.department, "Electricity Department");
  assert.equal(response.body.classification.priority, "High", "Safety rules must be able to raise AI priority.");
  assert.equal(response.body.classification.days, 1, "High-priority electricity complaints use the accelerated SLA.");
  assert.equal(response.body.classification.safetyOverride, true);
  assert.equal(response.body.classification.source, "gemini");
  assert.equal(response.body.classification.model, DEFAULT_GEMINI_MODEL);
  assert.equal(response.headers["Cache-Control"], "no-store");

  const providerCall = calls.find(call => call.url.includes("generativelanguage.googleapis.com"));
  assert.equal(providerCall.options.headers["x-goog-api-key"], "server-only-gemini-key");
  assert.equal(providerCall.options.headers["Api-Revision"], "2026-05-20");
  const providerBody = JSON.parse(providerCall.options.body);
  assert.equal(providerBody.store, false);
  assert.equal(providerBody.model, DEFAULT_GEMINI_MODEL);
  assert.equal(providerBody.response_format.mime_type, "application/json");
  assert.equal(providerBody.response_format.schema.properties.category.enum.includes("General Civic Issue"), true);
  assert.equal(providerBody.input.includes("citizen@example.com"), false);
  assert.equal(providerBody.input.includes("9876543210"), false);
  assert.equal(providerBody.input.includes("Ward 12, Coimbatore"), false, "Exact locations must not be sent to Gemini.");

  const missingKeyHandler = createClassifierHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => firestoreDocument({ uid: "citizen-1", role: "citizen" })
    }),
    environment: environment({ GEMINI_API_KEY: "" })
  });
  const missingKeyResponse = responseHarness();
  await missingKeyHandler(request({
    title: "Broken streetlight",
    description: "The streetlight has not worked for three nights.",
    location: "Ward 4"
  }), missingKeyResponse);
  assert.equal(missingKeyResponse.statusCode, 503);
  assert.equal(missingKeyResponse.body.error.code, "ai/provider-not-configured");

  const officerHandler = createClassifierHandler({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => firestoreDocument({ uid: "officer-1", role: "department-officer" })
    }),
    environment: environment()
  });
  const officerResponse = responseHarness();
  await officerHandler(request({
    title: "Broken streetlight",
    description: "The streetlight has not worked for three nights.",
    location: "Ward 4"
  }, "officer-1"), officerResponse);
  assert.equal(officerResponse.statusCode, 403);
  assert.equal(officerResponse.body.error.code, "ai/unauthorized");

  const unauthenticatedResponse = responseHarness();
  await handler({ method: "POST", headers: {}, body: {
    title: "Broken streetlight",
    description: "The streetlight has not worked for three nights.",
    location: "Ward 4"
  } }, unauthenticatedResponse);
  assert.equal(unauthenticatedResponse.statusCode, 401);
  assert.equal(unauthenticatedResponse.body.error.code, "ai/unauthenticated");

  console.log("AI classifier API tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
