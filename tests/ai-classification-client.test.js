"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rulesSource = fs.readFileSync(path.join(__dirname, "../assets/js/classification-rules.js"), "utf8");
const clientSource = fs.readFileSync(path.join(__dirname, "../assets/js/ai-classification.js"), "utf8");

function createHarness(fetchImpl) {
  const window = {
    CivicAuth: {
      isDemoMode: () => false,
      getFirebaseServices: () => ({
        auth: { currentUser: { getIdToken: async () => "firebase-id-token" } }
      })
    }
  };
  const context = vm.createContext({
    window,
    fetch: fetchImpl,
    AbortController,
    DOMException,
    setTimeout,
    clearTimeout,
    console: { warn() {}, error() {}, log() {} },
    structuredClone,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Promise,
    Set,
    Map
  });
  vm.runInContext(rulesSource, context, { filename: "classification-rules.js" });
  vm.runInContext(clientSource, context, { filename: "ai-classification.js" });
  return window.CivicAI;
}

async function run() {
  const requests = [];
  const ai = createHarness(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        classification: {
          category: "Water Supply",
          department: "Untrusted Department Value",
          days: 99,
          priority: "Medium",
          source: "gemini",
          model: "gemini-3.5-flash-lite",
          confidence: 87,
          summary: "A public water pipeline is leaking.",
          reasoning: "The complaint describes water-distribution infrastructure.",
          safetyAdvice: "",
          reviewRequired: false,
          safetyOverride: false
        }
      })
    };
  });
  const input = {
    title: "Water pipe leakage",
    description: "A public water pipe has been leaking continuously near the market.",
    location: "Town Hall, Coimbatore",
    citizenName: "Private Citizen",
    email: "private@example.com",
    phone: "9876543210"
  };
  const result = await ai.classifyWithFallback(input);
  assert.equal(result.source, "gemini");
  assert.equal(result.department, "Water Supply Department", "The browser must derive departments from approved routes.");
  assert.equal(result.days, 2);
  assert.equal(requests[0].url, "/api/classify-complaint");
  assert.equal(requests[0].options.headers.Authorization, "Bearer firebase-id-token");
  const sent = JSON.parse(requests[0].options.body);
  assert.deepEqual(Object.keys(sent).sort(), ["description", "location", "title"]);
  assert.equal(JSON.stringify(sent).includes("private@example.com"), false);
  assert.equal(ai.toMetadata(result).confidence, 87);

  const fallbackAi = createHarness(async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: { code: "ai/provider-not-configured", message: "Not configured" } })
  }));
  const fallback = await fallbackAi.classifyWithFallback(input);
  assert.equal(fallback.source, "rules");
  assert.equal(fallback.category, "Water Supply");
  assert.equal(fallback.fallbackReason, "ai/provider-not-configured");
  assert.equal(fallback.available, false);

  console.log("AI classification browser client tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
