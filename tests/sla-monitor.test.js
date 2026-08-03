"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  createSlaMonitorHandler,
  decodeFirestoreFields,
  encodeFirestoreValue,
  serviceAccountAssertion
} = require("../server/sla-monitor");
const policy = require("../assets/js/sla-policy");

function responseHarness() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = JSON.parse(value); }
  };
}

function firestoreDocument(id, data) {
  return {
    document: {
      name: `projects/civicresolve-ai-3d54c/databases/(default)/documents/complaints/${id}`,
      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue(value)]))
    }
  };
}

async function run() {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const environment = {
    CRON_SECRET: "protected-cron-secret-32-characters-long",
    FIREBASE_PROJECT_ID: "civicresolve-ai-3d54c",
    FIREBASE_ADMIN_CLIENT_EMAIL: "sla-monitor@civicresolve-ai-3d54c.iam.gserviceaccount.com",
    FIREBASE_ADMIN_PRIVATE_KEY: pem
  };
  const runAt = new Date("2026-08-10T02:30:00.000Z");
  const onTrackRecord = policy.createRecord(
    { category: "Roads & Potholes", priority: "Low" },
    new Date("2026-08-09T02:30:00.000Z")
  );
  const resolvedRecord = policy.createRecord(
    { category: "Water Supply", priority: "Medium" },
    new Date("2026-08-01T02:30:00.000Z")
  );
  const rows = [
    firestoreDocument("OVERDUE", {
      category: "Waste Management", priority: "Medium", status: "In Progress",
      createdAt: new Date("2026-08-01T00:00:00.000Z"), expectedResolutionDate: "2026-08-03"
    }),
    firestoreDocument("DUE-SOON", {
      category: "Electricity & Streetlights", priority: "High", status: "Assigned",
      createdAt: new Date("2026-08-09T08:00:00.000Z"),
      sla: policy.createRecord({ category: "Electricity & Streetlights", priority: "High" }, new Date("2026-08-09T08:00:00.000Z"))
    }),
    firestoreDocument("ON-TRACK", {
      category: "Roads & Potholes", priority: "Low", status: "Submitted",
      createdAt: new Date("2026-08-09T02:30:00.000Z"), sla: onTrackRecord
    }),
    firestoreDocument("RESOLVED", {
      category: "Water Supply", priority: "Medium", status: "Resolved",
      createdAt: new Date("2026-08-01T02:30:00.000Z"), sla: resolvedRecord
    })
  ];
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "https://oauth2.googleapis.com/token") {
      return { ok: true, json: async () => ({ access_token: "service-access-token" }) };
    }
    if (url.endsWith(":runQuery")) return { ok: true, json: async () => rows };
    if (url.endsWith(":commit")) return { ok: true, json: async () => ({ writeResults: [] }) };
    throw new Error(`Unexpected URL: ${url}`);
  };
  const handler = createSlaMonitorHandler({ fetchImpl, environment, now: () => runAt });
  const response = responseHarness();
  await handler({ method: "GET", headers: { authorization: "Bearer protected-cron-secret-32-characters-long" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.scanned, 4);
  assert.equal(response.body.updated, 3);
  assert.equal(response.body.states.overdue, 1);
  assert.equal(response.body.states["due-soon"], 1);
  assert.equal(response.body.states["on-track"], 1);
  assert.equal(response.body.states.resolved, 1);

  const commit = calls.find(call => call.url.endsWith(":commit"));
  const writes = JSON.parse(commit.options.body).writes;
  assert.equal(writes.length, 3);
  const decoded = writes.map(write => ({
    id: write.update.name.split("/").pop(),
    sla: decodeFirestoreFields(write.update.fields).sla
  }));
  assert.equal(decoded.find(item => item.id === "OVERDUE").sla.state, "overdue");
  assert.equal(decoded.find(item => item.id === "OVERDUE").sla.overdueAlertedAt, runAt.toISOString());
  assert.equal(decoded.find(item => item.id === "DUE-SOON").sla.state, "due-soon");
  assert.equal(decoded.find(item => item.id === "DUE-SOON").sla.dueSoonAlertedAt, runAt.toISOString());
  assert.equal(decoded.find(item => item.id === "RESOLVED").sla.state, "resolved");

  const unauthorized = responseHarness();
  await handler({ method: "GET", headers: { authorization: "Bearer wrong" } }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body.error.code, "sla/unauthorized");

  const assertion = serviceAccountAssertion({ clientEmail: environment.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: pem }, runAt);
  const payload = JSON.parse(Buffer.from(assertion.split(".")[1], "base64url").toString("utf8"));
  assert.equal(payload.scope, "https://www.googleapis.com/auth/datastore");
  assert.equal(payload.aud, "https://oauth2.googleapis.com/token");

  console.log("SLA monitor tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
