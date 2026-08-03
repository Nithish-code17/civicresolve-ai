"use strict";

const assert = require("node:assert/strict");
const policy = require("../assets/js/sla-policy");

assert.equal(policy.baseDaysFor("Roads & Potholes"), 5);
assert.equal(policy.daysFor("Roads & Potholes", "High"), 3);
assert.equal(policy.daysFor("Roads & Potholes", "Medium"), 5);
assert.equal(policy.daysFor("Roads & Potholes", "Low"), 7);
assert.equal(policy.daysFor("Electricity & Streetlights", "High"), 1);
assert.equal(policy.daysFor("Drainage & Sewage", "High"), 2);
assert.equal(policy.daysFor("Unknown category", "Medium"), 5);

const createdAt = new Date("2026-08-03T06:00:00.000Z");
const record = policy.createRecord({ category: "Water Supply", priority: "High" }, createdAt);
assert.equal(record.policyVersion, "civicresolve-sla-v1");
assert.equal(record.baseDays, 2);
assert.equal(record.targetDays, 1);
assert.equal(record.deadlineAt, "2026-08-04T06:00:00.000Z");
assert.equal(record.deadlineDate, "2026-08-04");

const complaint = {
  status: "In Progress",
  category: "Water Supply",
  priority: "High",
  sla: record
};
assert.equal(policy.stateFor(complaint, new Date("2026-08-03T05:59:59.000Z")), "on-track");
assert.equal(policy.stateFor(complaint, new Date("2026-08-03T06:00:00.000Z")), "due-soon");
assert.equal(policy.stateFor(complaint, new Date("2026-08-04T06:00:01.000Z")), "overdue");
assert.equal(policy.stateFor({ ...complaint, status: "Resolved" }, new Date("2026-08-10T00:00:00.000Z")), "resolved");

const legacy = {
  status: "Submitted",
  category: "Waste Management",
  priority: "Medium",
  expectedResolutionDate: "2026-08-03"
};
assert.equal(policy.stateFor(legacy, new Date("2026-08-04T00:00:00.000Z")), "overdue");
assert.equal(policy.assess(legacy, new Date("2026-08-02T12:00:00.000Z")).policyVersion, "legacy-deadline");

console.log("SLA policy tests passed.");
