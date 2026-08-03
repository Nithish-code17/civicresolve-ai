(() => {
  "use strict";

  const ENDPOINT = "/api/classify-complaint";
  const CLIENT_TIMEOUT_MS = 10_000;

  class AiClassificationError extends Error {
    constructor(code, message, status = 0) {
      super(message);
      this.name = "AiClassificationError";
      this.code = code;
      this.status = status;
    }
  }

  function rulesService() {
    if (!window.CivicClassificationRules) throw new Error("Complaint classification rules are unavailable.");
    return window.CivicClassificationRules;
  }

  function concise(value, maximum, fallback = "") {
    const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    return (text || fallback).slice(0, maximum);
  }

  function safeInput(input = {}) {
    return {
      title: concise(input.title, 160),
      description: concise(input.description, 5000),
      location: concise(input.location, 500)
    };
  }

  function fallback(input, error = null) {
    const result = rulesService().analyse(safeInput(input));
    return {
      ...result,
      available: false,
      fallbackReason: error?.code || "ai/not-requested"
    };
  }

  function normalise(result, input) {
    const rules = rulesService();
    if (!result || result.source !== "gemini" || !rules.validCategory(result.category) || !rules.validPriority(result.priority)) {
      throw new AiClassificationError("ai/invalid-response", "The AI service returned an unsupported classification.");
    }
    const route = rules.ruleForCategory(result.category);
    return {
      category: route.category,
      department: route.department,
      days: route.days,
      priority: result.priority,
      source: "gemini",
      model: concise(result.model, 80, "gemini"),
      confidence: Math.max(0, Math.min(100, Math.round(Number(result.confidence) || 0))),
      summary: concise(result.summary, 220, input.title),
      reasoning: concise(result.reasoning, 300, "AI context analysis selected this service route."),
      safetyAdvice: result.priority === "High" ? concise(result.safetyAdvice, 260) : "",
      reviewRequired: Boolean(result.reviewRequired),
      safetyOverride: Boolean(result.safetyOverride),
      available: true,
      fallbackReason: ""
    };
  }

  async function firebaseToken() {
    const services = window.CivicAuth?.getFirebaseServices();
    const user = services?.auth?.currentUser;
    if (!user?.getIdToken) {
      throw new AiClassificationError("ai/unauthenticated", "Sign in before using AI classification.", 401);
    }
    return user.getIdToken();
  }

  async function errorFromResponse(response) {
    let payload = null;
    try { payload = await response.json(); } catch { /* use safe fallback below */ }
    return new AiClassificationError(
      payload?.error?.code || "ai/request-failed",
      payload?.error?.message || "AI classification could not be completed.",
      response.status
    );
  }

  async function classify(input, { signal } = {}) {
    const complaint = safeInput(input);
    if (window.CivicAuth?.isDemoMode()) return fallback(complaint);
    const token = await firebaseToken();
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify(complaint)
      });
      if (!response.ok) throw await errorFromResponse(response);
      const payload = await response.json();
      return normalise(payload.classification, complaint);
    } catch (error) {
      if (error?.name === "AbortError") {
        if (signal?.aborted) throw error;
        throw new AiClassificationError("ai/timeout", "AI classification took too long.", 504);
      }
      if (error instanceof AiClassificationError) throw error;
      throw new AiClassificationError("ai/network-error", "The AI classification service could not be reached.");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  async function classifyWithFallback(input, options = {}) {
    try {
      return await classify(input, options);
    } catch (error) {
      if (error?.name === "AbortError" && options.signal?.aborted) throw error;
      console.warn("Gemini classification unavailable; deterministic rules were used.", error?.code || error?.message || error);
      return fallback(input, error);
    }
  }

  function toMetadata(classification) {
    const value = classification || {};
    return {
      source: value.source === "gemini" ? "gemini" : "rules",
      model: concise(value.model, 80, value.source === "gemini" ? "gemini" : "keyword-rules-v1"),
      confidence: Math.max(0, Math.min(100, Math.round(Number(value.confidence) || 0))),
      summary: concise(value.summary, 220),
      reasoning: concise(value.reasoning, 300),
      reviewRequired: Boolean(value.reviewRequired),
      safetyOverride: Boolean(value.safetyOverride)
    };
  }

  window.CivicAI = Object.freeze({
    ENDPOINT,
    AiClassificationError,
    classify,
    classifyWithFallback,
    fallback,
    toMetadata
  });
})();
