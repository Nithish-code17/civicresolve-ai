"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const classificationRules = require("../assets/js/classification-rules");
const slaPolicy = require("../assets/js/sla-policy");

const root = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const v2Source = fs.readFileSync(path.join(root, "assets/js/v2-ui.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "assets/css/v2.css"), "utf8");
const never = new Promise(() => {});
const citizen = { uid: "citizen-1", displayName: "Citizen One", role: "citizen", department: "" };

const window = {
  CivicClassificationRules: classificationRules,
  CivicSlaPolicy: slaPolicy,
  CivicEvidence: {
    MAX_FILES: 3,
    isImage: () => true
  },
  CivicAuth: {
    ROLES: { CITIZEN: "citizen", OFFICER: "department-officer", ADMIN: "administrator" },
    ready: () => never,
    getProfile: () => citizen,
    getRole: () => citizen.role,
    ownsComplaint: item => item.createdByUid === citizen.uid,
    canManageComplaint: () => false,
    canDeleteComplaint: () => false,
    canAccess: () => true,
    getRoleLabel: () => "Citizen",
    isAuthenticated: () => true,
    isDemoMode: () => false
  }
};
const document = { addEventListener() {} };
const context = vm.createContext({
  window,
  document,
  console,
  Date,
  Intl,
  Math,
  Number,
  String,
  Array,
  Object,
  Set,
  Map,
  Promise,
  FormData: class {},
  URL: { revokeObjectURL() {} },
  setTimeout,
  clearTimeout,
  confirm: () => true
});
vm.runInContext(appSource, context, { filename: "app.js" });

const now = Date.now();
const overdue = {
  id: "GRV-2026-OVERDUE",
  createdByUid: citizen.uid,
  citizenName: citizen.displayName,
  title: "Overflowing waste bin",
  description: "The public waste bin has been overflowing for several days.",
  location: "Ward 10",
  category: "Waste Management",
  department: "Municipal Waste Department",
  priority: "Medium",
  status: "In Progress",
  evidence: [],
  statusHistory: [],
  sla: {
    ...slaPolicy.createRecord({ category: "Waste Management", priority: "Medium" }, new Date(now - 3 * slaPolicy.DAY_MS)),
    deadlineAt: new Date(now - slaPolicy.DAY_MS).toISOString()
  }
};

const badge = context.slaBadge(overdue);
assert.match(badge, /sla-overdue/);
assert.match(badge, /Overdue/);

const banner = context.renderSlaAlertBanner([overdue]);
assert.match(banner, /Automatic SLA alert/);
assert.match(banner, /Review most urgent/);
assert.match(banner, /GRV-2026-OVERDUE/);

const table = context.complaintTable([overdue]);
assert.match(table, /<th>SLA<\/th>/);
assert.match(table, /sla-overdue/);

const tracking = context.renderTrackingResult(overdue);
assert.match(tracking, /SLA deadline/);
assert.match(tracking, /requires immediate official attention/);

const resolved = { ...overdue, status: "Resolved" };
assert.match(context.renderComplaintSlaNotice(resolved), /no further overdue alerts/);

assert.match(v2Source, /openSlaNotifications/);
assert.match(v2Source, /data-notification-id/);
assert.match(v2Source, /window\.CivicSlaAlerts\?\.open/);
assert.match(cssSource, /\.v2-notification-panel/);
assert.match(cssSource, /\.sla-alert-banner/);
assert.match(cssSource, /\.sla-case-notice/);

console.log("SLA interface contract tests passed.");
