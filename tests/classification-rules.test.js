"use strict";

const assert = require("node:assert/strict");
const rules = require("../assets/js/classification-rules");

const electricity = rules.analyse({
  title: "Exposed electrical wire near school",
  description: "An exposed wire is hanging near the school entrance and may cause electric shock.",
  location: "Ward 12, Coimbatore"
});
assert.equal(electricity.category, "Electricity & Streetlights");
assert.equal(electricity.department, "Electricity Department");
assert.equal(electricity.priority, "High");
assert.equal(electricity.source, "rules");
assert.equal(electricity.reviewRequired, false);

const drainage = rules.analyse({
  title: "Dirty water beside houses",
  description: "Sewage is overflowing for three days and there is a bad smell.",
  location: "Ward 5"
});
assert.equal(drainage.category, "Drainage & Sewage");
assert.equal(drainage.priority, "Medium");

const unknown = rules.analyse({
  title: "General ward request",
  description: "Residents request an inspection of this public service issue.",
  location: "Ward 7"
});
assert.equal(unknown.category, "General Civic Issue");
assert.equal(unknown.department, "General Administration");
assert.equal(unknown.reviewRequired, true);
assert.equal(unknown.confidence, 35);

assert.equal(rules.CATEGORIES.includes("Roads & Potholes"), true);
assert.equal(rules.DEPARTMENTS.includes("General Administration"), true);
assert.equal(rules.validCategory("Invented Department"), false);
assert.equal(rules.validPriority("Critical"), false);

console.log("Classification rule tests passed.");
