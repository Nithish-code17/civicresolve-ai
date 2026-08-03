(function initialiseClassificationRules(root, factory) {
  "use strict";

  const service = factory();
  if (typeof module === "object" && module.exports) module.exports = service;
  if (root) root.CivicClassificationRules = service;
})(typeof window !== "undefined" ? window : null, () => {
  "use strict";

  const CATEGORY_RULES = Object.freeze([
    Object.freeze({ category: "Roads & Potholes", department: "Public Works Department", days: 5, keywords: Object.freeze(["road", "pothole", "footpath", "bridge", "traffic sign", "speed breaker"]) }),
    Object.freeze({ category: "Waste Management", department: "Municipal Waste Department", days: 2, keywords: Object.freeze(["garbage", "waste", "dustbin", "trash", "dump", "unclean"]) }),
    Object.freeze({ category: "Water Supply", department: "Water Supply Department", days: 2, keywords: Object.freeze(["water", "pipeline", "pipe", "leak", "tap", "drinking water"]) }),
    Object.freeze({ category: "Electricity & Streetlights", department: "Electricity Department", days: 2, keywords: Object.freeze(["electric", "wire", "power", "streetlight", "street light", "transformer", "shock"]) }),
    Object.freeze({ category: "Drainage & Sewage", department: "Sanitation Department", days: 3, keywords: Object.freeze(["drain", "drainage", "sewage", "sewer", "overflow", "stagnant water"]) }),
    Object.freeze({ category: "Public Transport", department: "Transport Department", days: 4, keywords: Object.freeze(["bus", "transport", "bus stop", "route", "conductor", "ticket"]) }),
    Object.freeze({ category: "Parks & Public Spaces", department: "Municipal Corporation", days: 4, keywords: Object.freeze(["park", "playground", "bench", "public toilet", "garden"]) })
  ]);
  const GENERAL_RULE = Object.freeze({
    category: "General Civic Issue",
    department: "General Administration",
    days: 5,
    keywords: Object.freeze([])
  });
  const HIGH_PRIORITY_WORDS = Object.freeze([
    "danger", "accident", "fire", "emergency", "electric shock", "exposed wire",
    "hospital", "school", "fallen tree", "blocked road", "burst"
  ]);
  const MEDIUM_PRIORITY_WORDS = Object.freeze([
    "overflow", "not working", "three days", "many days", "bad smell", "leakage"
  ]);
  const PRIORITIES = Object.freeze(["High", "Medium", "Low"]);
  const CATEGORIES = Object.freeze([...CATEGORY_RULES.map(rule => rule.category), GENERAL_RULE.category]);
  const DEPARTMENTS = Object.freeze([...new Set([...CATEGORY_RULES.map(rule => rule.department), GENERAL_RULE.department])]);

  function textFrom(input = {}) {
    return `${input.title || ""} ${input.description || ""} ${input.location || ""}`.toLowerCase();
  }

  function ruleForCategory(category) {
    return CATEGORY_RULES.find(rule => rule.category === category) || GENERAL_RULE;
  }

  function matchingPriority(text) {
    if (HIGH_PRIORITY_WORDS.some(word => text.includes(word))) return "High";
    if (MEDIUM_PRIORITY_WORDS.some(word => text.includes(word))) return "Medium";
    return "Low";
  }

  function analyse(input = {}) {
    const text = textFrom(input);
    const ranked = CATEGORY_RULES
      .map((rule, index) => ({
        rule,
        index,
        matches: rule.keywords.filter(keyword => text.includes(keyword))
      }))
      .filter(candidate => candidate.matches.length)
      .sort((left, right) => right.matches.length - left.matches.length || left.index - right.index);
    const rule = ranked[0]?.rule || GENERAL_RULE;
    const matchedKeywords = (ranked[0]?.matches || []).slice(0, 3);
    const priority = matchingPriority(text);
    const matched = rule !== GENERAL_RULE;
    return {
      category: rule.category,
      department: rule.department,
      days: rule.days,
      priority,
      source: "rules",
      model: "keyword-rules-v1",
      confidence: matched ? Math.min(88, 68 + matchedKeywords.length * 7) : 35,
      summary: String(input.title || "General civic complaint").trim().slice(0, 220),
      reasoning: matched
        ? `Matched ${matchedKeywords.join(", ")} to the ${rule.category} service route.`
        : "No strong service keyword matched, so administrative review is recommended.",
      safetyAdvice: priority === "High"
        ? "Keep a safe distance from the hazard and contact local emergency services if anyone is in immediate danger."
        : "",
      reviewRequired: !matched,
      safetyOverride: false
    };
  }

  function validCategory(category) {
    return CATEGORIES.includes(category);
  }

  function validPriority(priority) {
    return PRIORITIES.includes(priority);
  }

  return Object.freeze({
    CATEGORY_RULES,
    GENERAL_RULE,
    HIGH_PRIORITY_WORDS,
    MEDIUM_PRIORITY_WORDS,
    CATEGORIES,
    DEPARTMENTS,
    PRIORITIES,
    analyse,
    ruleForCategory,
    validCategory,
    validPriority
  });
});
