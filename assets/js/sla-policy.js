(function initialiseSlaPolicy(root, factory) {
  "use strict";

  const service = factory();
  if (typeof module === "object" && module.exports) module.exports = service;
  if (root) root.CivicSlaPolicy = service;
})(typeof window !== "undefined" ? window : null, () => {
  "use strict";

  const POLICY_VERSION = "civicresolve-sla-v1";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DUE_SOON_MS = DAY_MS;
  const STATES = Object.freeze(["on-track", "due-soon", "overdue", "resolved"]);
  const CATEGORY_BASE_DAYS = Object.freeze({
    "Roads & Potholes": 5,
    "Waste Management": 2,
    "Water Supply": 2,
    "Electricity & Streetlights": 2,
    "Drainage & Sewage": 3,
    "Public Transport": 4,
    "Parks & Public Spaces": 4,
    "General Civic Issue": 5
  });

  function dateValue(value) {
    if (!value) return null;
    const date = value instanceof Date
      ? new Date(value.getTime())
      : typeof value.toDate === "function"
        ? value.toDate()
        : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function baseDaysFor(category) {
    return CATEGORY_BASE_DAYS[category] || CATEGORY_BASE_DAYS["General Civic Issue"];
  }

  function daysFor(category, priority) {
    const baseDays = baseDaysFor(category);
    if (priority === "High") return Math.max(1, Math.ceil(baseDays / 2));
    if (priority === "Low") return baseDays + 2;
    return baseDays;
  }

  function deadlineFrom(category, priority, startedAt = new Date()) {
    const start = dateValue(startedAt) || new Date();
    return new Date(start.getTime() + daysFor(category, priority) * DAY_MS);
  }

  function deadlineForComplaint(complaint = {}) {
    const stored = dateValue(complaint.sla?.deadlineAt);
    if (stored) return stored;
    if (complaint.expectedResolutionDate) {
      return dateValue(`${complaint.expectedResolutionDate}T23:59:59.999Z`);
    }
    const startedAt = dateValue(complaint.createdAt);
    return startedAt ? deadlineFrom(complaint.category, complaint.priority, startedAt) : null;
  }

  function stateFor(complaint = {}, now = new Date()) {
    if (complaint.status === "Resolved") return "resolved";
    const deadline = deadlineForComplaint(complaint);
    const current = dateValue(now) || new Date();
    if (!deadline) return "on-track";
    const remaining = deadline.getTime() - current.getTime();
    if (remaining < 0) return "overdue";
    if (remaining <= DUE_SOON_MS) return "due-soon";
    return "on-track";
  }

  function compactDuration(milliseconds) {
    const absolute = Math.abs(milliseconds);
    if (absolute < 60 * 60 * 1000) return `${Math.max(1, Math.ceil(absolute / (60 * 1000)))}m`;
    if (absolute < DAY_MS) return `${Math.ceil(absolute / (60 * 60 * 1000))}h`;
    return `${Math.ceil(absolute / DAY_MS)}d`;
  }

  function assess(complaint = {}, now = new Date()) {
    const deadline = deadlineForComplaint(complaint);
    const state = stateFor(complaint, now);
    const current = dateValue(now) || new Date();
    const remainingMs = deadline ? deadline.getTime() - current.getTime() : null;
    const label = {
      "on-track": remainingMs == null ? "SLA pending" : `${compactDuration(remainingMs)} remaining`,
      "due-soon": `Due in ${compactDuration(remainingMs)}`,
      overdue: `${compactDuration(remainingMs)} overdue`,
      resolved: "Resolved within workflow"
    }[state];
    return {
      state,
      label,
      deadlineAt: deadline ? deadline.toISOString() : "",
      deadlineDate: deadline ? deadline.toISOString().slice(0, 10) : "",
      baseDays: Number(complaint.sla?.baseDays) || baseDaysFor(complaint.category),
      targetDays: Number(complaint.sla?.targetDays) || daysFor(complaint.category, complaint.priority),
      policyVersion: complaint.sla?.policyVersion || "legacy-deadline",
      remainingMs
    };
  }

  function createRecord({ category, priority } = {}, now = new Date()) {
    const startedAt = dateValue(now) || new Date();
    const deadlineAt = deadlineFrom(category, priority, startedAt);
    return {
      policyVersion: POLICY_VERSION,
      baseDays: baseDaysFor(category),
      targetDays: daysFor(category, priority),
      deadlineAt: deadlineAt.toISOString(),
      deadlineDate: deadlineAt.toISOString().slice(0, 10),
      state: "on-track",
      lastEvaluatedAt: startedAt.toISOString(),
      dueSoonAlertedAt: null,
      overdueAlertedAt: null
    };
  }

  function isAlertState(state) {
    return state === "due-soon" || state === "overdue";
  }

  return Object.freeze({
    POLICY_VERSION,
    DAY_MS,
    DUE_SOON_MS,
    STATES,
    CATEGORY_BASE_DAYS,
    assess,
    baseDaysFor,
    createRecord,
    daysFor,
    deadlineForComplaint,
    deadlineFrom,
    isAlertState,
    stateFor
  });
});
