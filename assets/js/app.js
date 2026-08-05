const STATUS_FLOW = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved"];
const COLORS = ["#1664d9", "#6941c6", "#d17a00", "#c3343d", "#15805d", "#3973a8", "#8b5d9e"];
const CLASSIFICATION_RULES = window.CivicClassificationRules;
const CATEGORY_RULES = CLASSIFICATION_RULES.CATEGORY_RULES;
const DEPARTMENTS = [...CLASSIFICATION_RULES.DEPARTMENTS];

let complaints = [];
let activePage = "dashboard";
let lastSubmitted = null;
let trackingResult = null;
let trackingError = "";
let selectedComplaintId = null;
let complaintDataReady = false;
let complaintDataError = "";
let complaintUnsubscribe = null;
let complaintSyncKey = "";
const migrationChecks = new Set();
let roleAccounts = [];
let roleAccountsReady = false;
let roleAccountsError = "";
let roleAccountsUnsubscribe = null;
let selectedEvidenceFiles = [];
let selectedEvidencePreviewUrls = [];
let evidenceUploadWarning = "";
let activeAnalysis = null;
let activeAnalysisKey = "";
let activeAnalysisStatus = "idle";
let aiAnalysisTimer = null;
let aiAnalysisController = null;
let aiAnalysisPromise = null;
let aiAnalysisPromiseKey = "";

function authProfile() { return window.CivicAuth?.getProfile() || null; }
function currentRole() { return window.CivicAuth?.getRole() || "citizen"; }
function isCitizen() { return currentRole() === window.CivicAuth?.ROLES.CITIZEN; }
function isOfficer() { return currentRole() === window.CivicAuth?.ROLES.OFFICER; }
function isAdministrator() { return currentRole() === window.CivicAuth?.ROLES.ADMIN; }

function visibleComplaints() {
  if (isAdministrator()) return complaints;
  if (isOfficer()) return complaints.filter(item => window.CivicAuth.canManageComplaint(item));
  return complaints.filter(item => window.CivicAuth.ownsComplaint(item));
}

function canViewComplaint(item) {
  if (isAdministrator()) return true;
  if (isOfficer()) return window.CivicAuth.canManageComplaint(item);
  return window.CivicAuth.ownsComplaint(item);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, className = "", size = 18) {
  return window.CivicIcons?.render(name, className, size) || "";
}

function analyseComplaint(title, description, location = "") {
  return CLASSIFICATION_RULES.analyse({ title, description, location });
}

function analysisInput(input = {}) {
  return {
    title: String(input.title || "").trim(),
    description: String(input.description || "").trim(),
    location: String(input.location || "").trim()
  };
}

function analysisKey(input = {}) {
  const value = analysisInput(input);
  return `${value.title}\u241f${value.description}\u241f${value.location}`;
}

function analysisCanUseAi(input = {}) {
  const value = analysisInput(input);
  return value.title.length >= 3 && value.description.length >= 15 && value.location.length >= 3;
}

function resetAiAnalysis(clearResult = true) {
  clearTimeout(aiAnalysisTimer);
  aiAnalysisTimer = null;
  aiAnalysisController?.abort();
  aiAnalysisController = null;
  aiAnalysisPromise = null;
  aiAnalysisPromiseKey = "";
  if (clearResult) {
    activeAnalysis = null;
    activeAnalysisKey = "";
    activeAnalysisStatus = "idle";
  }
}

function updateAnalysisCard() {
  const card = document.getElementById("analysisCard");
  if (!card) return;
  card.innerHTML = activeAnalysis
    ? renderAnalysis(activeAnalysis, activeAnalysisStatus)
    : renderEmptyAnalysis();
}

async function requestAiAnalysis(input) {
  const value = analysisInput(input);
  const key = analysisKey(value);
  if (activeAnalysisKey === key && ["ready", "fallback"].includes(activeAnalysisStatus)) return activeAnalysis;
  if (aiAnalysisPromise && aiAnalysisPromiseKey === key) return aiAnalysisPromise;

  aiAnalysisController?.abort();
  const controller = new AbortController();
  aiAnalysisController = controller;
  aiAnalysisPromiseKey = key;
  activeAnalysis = analyseComplaint(value.title, value.description, value.location);
  activeAnalysisKey = key;
  activeAnalysisStatus = "analysing";
  updateAnalysisCard();

  const promise = window.CivicAI.classifyWithFallback(value, { signal: controller.signal })
    .then(result => {
      if (controller.signal.aborted || activeAnalysisKey !== key) return result;
      activeAnalysis = result;
      activeAnalysisStatus = result.source === "gemini" ? "ready" : "fallback";
      updateAnalysisCard();
      return result;
    })
    .finally(() => {
      if (aiAnalysisPromise === promise) {
        aiAnalysisPromise = null;
        aiAnalysisPromiseKey = "";
        if (aiAnalysisController === controller) aiAnalysisController = null;
      }
    });
  aiAnalysisPromise = promise;
  return promise;
}

function previewComplaintAnalysis(input) {
  const value = analysisInput(input);
  const key = analysisKey(value);
  clearTimeout(aiAnalysisTimer);
  aiAnalysisTimer = null;
  if (aiAnalysisPromiseKey && aiAnalysisPromiseKey !== key) aiAnalysisController?.abort();
  activeAnalysis = analyseComplaint(value.title, value.description, value.location);
  activeAnalysisKey = key;
  activeAnalysisStatus = analysisCanUseAi(value) ? "waiting" : "preview";
  updateAnalysisCard();
  if (!analysisCanUseAi(value)) return;
  aiAnalysisTimer = setTimeout(() => {
    requestAiAnalysis(value).catch(error => {
      if (error?.name !== "AbortError") console.warn("AI preview could not complete.", error);
    });
  }, 900);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "—";
  const value = typeof dateString.toDate === "function" ? dateString.toDate() : dateString;
  const date = value instanceof Date
    ? value
    : new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    .format(date);
}

function formatDateTime(dateString) {
  if (!dateString) return "Time unavailable";
  const value = typeof dateString.toDate === "function" ? dateString.toDate() : dateString;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(dateString);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}

function statusSlug(status) { return status.toLowerCase().replaceAll(" ", "-"); }
function priorityBadge(priority) { return `<span class="badge priority-${priority.toLowerCase()}">${escapeHtml(priority)}</span>`; }
function statusBadge(status) { return `<span class="badge status-${statusSlug(status)}">${escapeHtml(status)}</span>`; }

function slaAssessment(item, now = new Date()) {
  if (!window.CivicSlaPolicy) {
    return { state: "on-track", label: "SLA pending", deadlineAt: "", remainingMs: null };
  }
  return window.CivicSlaPolicy.assess(item, now);
}

function slaStateLabel(state) {
  return {
    "on-track": "On track",
    "due-soon": "Due soon",
    overdue: "Overdue",
    resolved: "Resolved"
  }[state] || "On track";
}

function slaBadge(item) {
  const assessment = slaAssessment(item);
  const title = assessment.deadlineAt ? `Deadline ${formatDateTime(assessment.deadlineAt)}` : "Deadline pending";
  return `<span class="sla-badge sla-${assessment.state}" title="${escapeHtml(title)}">${escapeHtml(slaStateLabel(assessment.state))} · ${escapeHtml(assessment.label)}</span>`;
}

function slaAlerts(items = visibleComplaints()) {
  return items
    .map(item => ({ item, assessment: slaAssessment(item) }))
    .filter(entry => ["due-soon", "overdue"].includes(entry.assessment.state))
    .sort((left, right) => {
      if (left.assessment.state !== right.assessment.state) return left.assessment.state === "overdue" ? -1 : 1;
      return new Date(left.assessment.deadlineAt).getTime() - new Date(right.assessment.deadlineAt).getTime();
    });
}

function renderSlaAlertBanner(items = visibleComplaints()) {
  const alerts = slaAlerts(items);
  if (!alerts.length) return "";
  const overdue = alerts.filter(entry => entry.assessment.state === "overdue");
  const urgent = alerts[0];
  const countLabel = `${alerts.length} complaint${alerts.length === 1 ? "" : "s"}`;
  const summary = overdue.length
    ? `${overdue.length} overdue and ${alerts.length - overdue.length} due soon.`
    : `${countLabel} due within 24 hours.`;
  return `<section class="sla-alert-banner ${overdue.length ? "has-overdue" : ""}">
    <div class="sla-alert-icon">${icon(overdue.length ? "alert-triangle" : "clock", "", 17)}</div>
    <div><p class="eyebrow">Automatic SLA alert</p><h2>${escapeHtml(summary)}</h2><p>Review most urgent: <strong>${escapeHtml(urgent.item.id)}</strong> · ${escapeHtml(urgent.item.title)} · ${escapeHtml(urgent.assessment.label)}.</p></div>
    <button class="secondary-button small" type="button" data-sla-open="${escapeHtml(urgent.item.id)}">Review most urgent</button>
  </section>`;
}

function renderComplaintSlaNotice(item) {
  const assessment = slaAssessment(item);
  const deadline = assessment.deadlineAt ? formatDateTime(assessment.deadlineAt) : "not available";
  const messages = {
    "on-track": `The case is within its service window and currently has ${assessment.label.toLowerCase()}.`,
    "due-soon": `The SLA deadline is approaching. The assigned department should provide an update before ${deadline}.`,
    overdue: "This unresolved complaint has passed its SLA deadline and requires immediate official attention.",
    resolved: "This complaint is resolved and will produce no further overdue alerts."
  };
  const stateIcon = assessment.state === "overdue" ? "alert-triangle" : assessment.state === "due-soon" ? "clock" : "check-circle";
  return `<div class="sla-case-notice sla-${assessment.state}"><span>${icon(stateIcon, "", 17)}</span><div><strong>SLA deadline: ${escapeHtml(deadline)}</strong><p>${escapeHtml(messages[assessment.state] || messages["on-track"])}</p></div>${slaBadge(item)}</div>`;
}

window.CivicSlaAlerts = Object.freeze({
  list() {
    return slaAlerts().map(({ item, assessment }) => ({
      id: item.id,
      title: item.title,
      department: item.department,
      state: assessment.state,
      label: assessment.label,
      deadlineAt: assessment.deadlineAt
    }));
  },
  open(id) {
    const item = visibleComplaints().find(complaint => complaint.id === id);
    if (!item || !canViewComplaint(item)) return;
    trackingResult = item;
    trackingError = "";
    navigate("track");
  }
});

function getStats(items = complaints) {
  const total = items.length;
  const resolved = items.filter(item => item.status === "Resolved").length;
  const pending = items.filter(item => ["Submitted", "Under Review"].includes(item.status)).length;
  const inProgress = items.filter(item => ["Assigned", "In Progress"].includes(item.status)).length;
  const highPriority = items.filter(item => item.priority === "High").length;
  return { total, resolved, pending, inProgress, highPriority, resolutionRate: total ? Math.round(resolved / total * 100) : 0 };
}

function countBy(key, items = complaints) {
  const map = {};
  items.forEach(item => { map[item[key] || "Unknown"] = (map[item[key] || "Unknown"] || 0) + 1; });
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function showToast(message, tone = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function pageTitle(page) {
  const profile = authProfile();
  return {
    dashboard: isCitizen() ? "My Civic Dashboard" : isOfficer() ? `${profile?.department || "Department"} Dashboard` : "Civic Operations Dashboard",
    submit: "Submit a Complaint",
    track: "Track a Complaint",
    admin: isOfficer() ? "Department Complaint Management" : "Admin Complaint Management",
    analytics: "Analytics & Insights",
    accounts: "Role Accounts"
  }[page];
}

function appShell() {
  const profile = authProfile();
  const initials = (profile?.displayName || "User").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const roleLabel = window.CivicAuth.getRoleLabel();
  const navItems = [
    ["dashboard", "layout-dashboard", "Dashboard"],
    ["submit", "file-plus", "Submit Complaint"],
    ["track", "search", "Track Complaint"],
    ["admin", "clipboard-list", isOfficer() ? "Department Work" : "Admin Management"],
    ["analytics", "bar-chart", "Analytics"],
    ["accounts", "users", "Role Accounts"]
  ].filter(([page]) => window.CivicAuth.canAccess(page));
  return `
    <div class="app-shell">
      <button id="sidebarBackdrop" class="sidebar-backdrop hidden" aria-label="Close menu"></button>
      <aside id="sidebar" class="sidebar">
        <div class="brand-row">
          <div class="brand-icon">${icon("shield-check", "", 22)}</div>
          <div><strong>CivicResolve</strong><span>Public Grievance System</span></div>
          <button id="sidebarClose" class="icon-button sidebar-close" aria-label="Close menu">${icon("x", "", 18)}</button>
        </div>
        <nav class="sidebar-nav">
          ${navItems.map(item => navLink(...item)).join("")}
        </nav>
        <div class="sidebar-card sidebar-role-card">${icon(isCitizen() ? "user" : isOfficer() ? "building" : "shield-check", "", 20)}<strong>${escapeHtml(roleLabel)} access</strong><p>${isOfficer() ? `Assigned to ${escapeHtml(profile?.department || "your department")}.` : isAdministrator() ? "Full municipal oversight and complaint administration." : "Submit grievances and follow your personal cases securely."}</p></div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <button id="menuButton" class="icon-button menu-button" aria-label="Open menu">${icon("menu", "", 19)}</button>
          <div><p class="eyebrow">Municipal service operations</p><h1>${pageTitle(activePage)}</h1></div>
          <div class="admin-chip"><div class="admin-avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(profile?.displayName || "CivicResolve User")}</strong><span class="role-badge">${escapeHtml(roleLabel)}</span></div><button id="signOutButton" class="v2-icon-button signout-button" type="button" aria-label="Sign out" title="Sign out">${icon("log-out", "", 17)}</button></div>
        </header>
        <div id="pageContent" class="content-wrap"></div>
      </main>
      <div id="modalRoot"></div>
    </div>`;
}

function navLink(id, iconName, label) {
  return `<button class="nav-link ${activePage === id ? "active" : ""}" data-page="${id}"><span class="nav-symbol">${icon(iconName, "", 17)}</span><span>${label}</span>${activePage === id ? `<span class="nav-arrow">${icon("chevron-right", "", 14)}</span>` : ""}</button>`;
}

function renderApp() {
  if (!window.CivicAuth?.isAuthenticated()) {
    window.CivicAuth?.renderAuthScreen();
    return;
  }
  if (!window.CivicAuth.canAccess(activePage)) activePage = "dashboard";
  window.CivicMaps?.destroyAll();
  document.getElementById("app").innerHTML = appShell();
  document.getElementById("pageContent").innerHTML = renderPage();
  attachShellEvents();
  attachPageEvents();
}

function renderPage() {
  if (activePage === "accounts") return renderRoleAccountsPage();
  if (!complaintDataReady) return renderComplaintDataState();
  if (activePage === "submit") return renderSubmitPage();
  if (activePage === "track") return renderTrackPage();
  if (activePage === "admin") return renderAdminPage();
  if (activePage === "analytics") return renderAnalyticsPage();
  return renderDashboard();
}

function renderComplaintDataState() {
  if (complaintDataError) return `<section class="data-state-card error-state">
    <div class="data-state-icon">${icon("alert-triangle", "", 24)}</div><p class="eyebrow">Secure data connection</p>
    <h2>Complaints could not be loaded</h2><p>${escapeHtml(complaintDataError)}</p>
    <button id="retryComplaintSync" class="primary-button" type="button">Retry Firestore connection</button>
  </section>`;
  return `<section class="data-state-card"><div class="data-spinner" aria-hidden="true"></div>
    <p class="eyebrow">Secure data connection</p><h2>Loading authorised complaints…</h2>
    <p>CivicResolve is opening the real-time complaint view permitted for your account.</p>
  </section>`;
}

function stopComplaintSync() {
  complaintUnsubscribe?.();
  complaintUnsubscribe = null;
  complaintSyncKey = "";
  complaints = [];
  complaintDataReady = false;
  complaintDataError = "";
}

function complaintConnectionError(error) {
  const messages = {
    "permission-denied": "Your account is signed in, but Firestore denied this complaint view. Check the account role and published security rules.",
    "complaint/unauthenticated": "Your sign-in session expired. Sign in again before submitting the complaint.",
    "complaint/unauthorized": "Only a verified citizen account can submit complaints.",
    "complaint/profile-missing": "Your citizen profile is missing. Sign out, sign in again and retry.",
    "complaint/server-not-configured": "Secure complaint submission is being activated. Try again shortly.",
    "complaint/firebase-unavailable": "The secure complaint service is temporarily unavailable. Try again shortly.",
    "complaint/firestore-write-failed": "The complaint could not be stored securely. Try again.",
    "complaint/network-error": "The secure complaint service could not be reached. Check your connection and try again.",
    "unavailable": "Firestore is temporarily unavailable. Check your internet connection and try again.",
    "failed-precondition": "Firestore needs an index for this complaint view. Review the Firebase console message and create the suggested index.",
    "evidence/unauthorized": "Your signed-in role cannot access this complaint evidence.",
    "evidence/unauthenticated": "Sign in again before accessing complaint evidence.",
    "evidence/object-not-found": "This evidence file is no longer available.",
    "evidence/provider-not-configured": "Evidence storage is being activated. The complaint is safe, but its files were not uploaded.",
    "evidence/provider-upload-failed": "The evidence provider could not store this file. Check your connection and try again.",
    "evidence/network-error": "The evidence service could not be reached. Check your connection and try again.",
    "evidence/window-closed": "Evidence can be added only before department work begins.",
    "evidence/too-many-files": "A complaint can contain a maximum of three evidence files."
  };
  return messages[error?.code] || error?.message || "The real-time complaint connection failed.";
}

function handleComplaintSnapshot(items) {
  const wasReady = complaintDataReady;
  complaints = items;
  complaintDataReady = true;
  complaintDataError = "";

  if (trackingResult) {
    const updatedTrackingResult = complaints.find(item => item.id === trackingResult.id) || null;
    if (!updatedTrackingResult) trackingError = "This complaint is no longer available to your account.";
    trackingResult = updatedTrackingResult;
  }
  if (lastSubmitted) lastSubmitted = complaints.find(item => item.id === lastSubmitted.id) || lastSubmitted;

  const current = authProfile();
  if (current?.role === "citizen" && !migrationChecks.has(current.uid)) {
    migrationChecks.add(current.uid);
    window.CivicComplaints.migrateLegacyCitizenComplaints(complaints.map(item => item.id))
      .then(count => { if (count) showToast(`${count} local complaint${count === 1 ? "" : "s"} migrated to Firestore.`); })
      .catch(error => console.warn("Local complaint migration could not complete.", error));
  }

  if (!wasReady || ["dashboard", "track", "admin", "analytics"].includes(activePage) || lastSubmitted) renderApp();
}

function startComplaintSync(force = false) {
  if (!window.CivicAuth?.isAuthenticated()) return;
  const current = authProfile();
  const nextKey = `${current?.uid || ""}:${current?.role || ""}:${current?.department || ""}`;
  if (!force && complaintUnsubscribe && complaintSyncKey === nextKey) return;

  complaintUnsubscribe?.();
  complaintUnsubscribe = null;
  complaintSyncKey = nextKey;
  complaints = [];
  complaintDataReady = false;
  complaintDataError = "";
  renderApp();

  try {
    complaintUnsubscribe = window.CivicComplaints.subscribe(handleComplaintSnapshot, error => {
      console.error("Firestore complaint listener failed.", error);
      complaintDataReady = false;
      complaintDataError = complaintConnectionError(error);
      renderApp();
    });
  } catch (error) {
    console.error("Firestore complaint connection could not start.", error);
    complaintDataReady = false;
    complaintDataError = complaintConnectionError(error);
    renderApp();
  }
}

function attachShellEvents() {
  document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  document.getElementById("menuButton").addEventListener("click", () => { sidebar.classList.add("sidebar-open"); backdrop.classList.remove("hidden"); });
  const close = () => { sidebar.classList.remove("sidebar-open"); backdrop.classList.add("hidden"); };
  document.getElementById("sidebarClose").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.getElementById("signOutButton")?.addEventListener("click", () => window.CivicAuth.signOut());
}

function navigate(page) {
  if (!window.CivicAuth.canAccess(page)) {
    showToast("Your role does not have access to that page.");
    return;
  }
  activePage = page;
  resetAiAnalysis();
  if (page !== "submit") clearSelectedEvidence();
  lastSubmitted = null;
  selectedComplaintId = null;
  trackingError = "";
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function statCard(label, value, iconName, hint = "", tone = "") {
  return `<article class="stat-card ${tone}"><div class="stat-icon">${icon(iconName, "", 19)}</div><div><span>${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ""}</div></article>`;
}

function panel(title, subtitle, content, action = "") {
  return `<section class="panel"><div class="panel-header"><div><h3>${title}</h3><p>${subtitle}</p></div>${action}</div>${content}</section>`;
}

function dashboardHero() {
  const profile = authProfile();
  if (isCitizen()) return `<section class="hero-panel">
    <div>
      <span class="hero-kicker">Citizen grievance services</span>
      <h2>Welcome, ${escapeHtml(profile?.displayName?.split(" ")[0] || "Citizen")}.</h2>
      <p>Report a civic issue, receive a grievance ID and follow every official update from one secure account.</p>
      <div class="hero-actions"><button class="primary-button" data-go="submit">${icon("file-plus", "", 16)} Submit complaint</button><button class="secondary-button" data-go="track">${icon("search", "", 16)} Track my complaint</button></div>
    </div>
    <div class="product-hero-status"><div><span class="status-icon">${icon("shield-check", "", 16)}</span><p><strong>Account protected</strong><span>Your case data is visible only to authorised roles.</span></p></div><div><span class="status-icon">${icon("sparkles", "", 16)}</span><p><strong>Automatic routing</strong><span>AI and service rules select the responsible department.</span></p></div><div><span class="status-icon">${icon("clock", "", 16)}</span><p><strong>Deadline monitored</strong><span>SLA status remains visible through resolution.</span></p></div></div>
  </section>`;

  return `<section class="hero-panel">
    <div>
      <span class="hero-kicker">${isOfficer() ? "Department operations" : "Municipal oversight"}</span>
      <h2>${isOfficer() ? `Manage ${escapeHtml(profile?.department || "department")} grievances.` : "Resolve public issues faster and more transparently."}</h2>
      <p>${isOfficer() ? "Review assigned cases, update progress and complete resolution work within the expected service window." : "Monitor every department, manage routing and priority, and maintain accountable grievance resolution."}</p>
      <div class="hero-actions"><button class="primary-button" data-go="admin">${icon("clipboard-list", "", 16)} Open complaint management</button><button class="secondary-button" data-go="analytics">${icon("bar-chart", "", 16)} View analytics</button></div>
    </div>
    <div class="product-hero-status"><div><span class="status-icon">${icon("shield-check", "", 16)}</span><p><strong>Role-scoped workspace</strong><span>Only authorised cases and actions are available.</span></p></div><div><span class="status-icon">${icon("activity", "", 16)}</span><p><strong>Operational visibility</strong><span>Workload, urgency and progress remain measurable.</span></p></div><div><span class="status-icon">${icon("clock", "", 16)}</span><p><strong>SLA accountability</strong><span>Due-soon and overdue cases are highlighted automatically.</span></p></div></div>
  </section>`;
}

function renderDashboard() {
  const scopedComplaints = visibleComplaints();
  const stats = getStats(scopedComplaints);
  const scopeLabel = isCitizen() ? "Your registered issues" : isOfficer() ? `Assigned to ${authProfile()?.department || "your department"}` : "All registered issues";
  return `<div class="page-stack">
    ${dashboardHero()}
    ${renderSlaAlertBanner(scopedComplaints)}
    <section class="stats-grid">
      ${statCard("Total Complaints", stats.total, "clipboard-list", scopeLabel)}
      ${statCard("Pending", stats.pending, "clock", "Submitted or under review", "warning")}
      ${statCard("In Progress", stats.inProgress, "activity", "Assigned and being handled", "info")}
      ${statCard("Resolved", stats.resolved, "check-circle", `${stats.resolutionRate}% resolution rate`, "success")}
    </section>
    <section class="two-column-grid">
      ${panel("Complaints by category", "Distribution within your permitted complaint scope", renderDonut(countBy("category", scopedComplaints)))}
      ${panel("Complaint status", "Current workload in your permitted scope", renderBars(countBy("status", scopedComplaints), "#1664d9"))}
    </section>
    ${panel("Recent complaints", isCitizen() ? "Your latest registered grievances" : "Latest complaints available to your role", complaintTable(scopedComplaints.slice(0, 5), true), `<button class="text-button" data-go="${isCitizen() ? "track" : "admin"}">${isCitizen() ? "Track grievance" : "Manage all"} ›</button>`)}
  </div>`;
}

function renderDonut(data) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let cursor = 0;
  const stops = [];
  data.forEach((item, index) => {
    const start = cursor;
    const end = cursor + item.value / total * 100;
    stops.push(`${COLORS[index % COLORS.length]} ${start}% ${end}%`);
    cursor = end;
  });
  const legend = data.map((item, index) => `<div class="legend-item"><span class="legend-dot" style="background:${COLORS[index % COLORS.length]}"></span><span>${escapeHtml(item.name)}</span><strong>${item.value}</strong></div>`).join("");
  return `<div class="chart-box"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops.join(",")})"><div class="donut-center"><div><strong>${total}</strong><span>complaints</span></div></div></div><div class="legend-list">${legend}</div></div></div>`;
}

function renderBars(data, fixedColor = null) {
  const max = Math.max(...data.map(item => item.value), 1);
  const rows = data.map((item, index) => `<div class="bar-row"><span title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, item.value / max * 100)}%;background:${fixedColor || COLORS[index % COLORS.length]}"></div></div><span class="bar-value">${item.value}</span></div>`).join("");
  return `<div class="chart-box"><div class="bar-list">${rows || '<div class="empty-table">No data available.</div>'}</div></div>`;
}

function complaintTable(items, compact = false) {
  if (!items.length) return `<div class="empty-table">${icon("inbox", "", 24)}<p>No complaints match the selected filters.</p></div>`;
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>ID</th><th>Complaint</th><th>Category</th><th>Priority</th><th>Status</th><th>SLA</th>${compact ? "" : "<th>Actions</th>"}</tr></thead><tbody>${items.map(item => `<tr>
    <td><strong>${escapeHtml(item.id)}</strong><span class="table-subtext">${formatDate(item.createdAt)}</span></td>
    <td><strong>${escapeHtml(item.title)}</strong><span class="table-subtext">${escapeHtml(item.location)}${item.evidence?.length ? ` · ${item.evidence.length} evidence file${item.evidence.length === 1 ? "" : "s"}` : ""}</span></td>
    <td>${escapeHtml(item.category)}</td><td>${priorityBadge(item.priority)}</td><td>${statusBadge(item.status)}</td><td>${slaBadge(item)}</td>
    ${compact ? "" : `<td><div class="table-actions">${window.CivicAuth.canManageComplaint(item) ? `<button class="table-button" data-manage="${item.id}">Manage</button>` : ""}${window.CivicAuth.canDeleteComplaint() ? `<button class="delete-button" data-delete="${item.id}" title="Delete complaint" aria-label="Delete complaint">${icon("trash", "", 14)}</button>` : ""}</div></td>`}
  </tr>`).join("")}</tbody></table></div>`;
}

function renderSubmitPage() {
  if (lastSubmitted) return renderSubmissionSuccess(lastSubmitted);
  const profile = authProfile();
  return `<div class="form-layout">
    <form id="complaintForm" class="form-card">
      <div class="section-heading"><div class="section-icon">${icon("file-plus", "", 19)}</div><div><h2>Report a public issue</h2><p>Provide clear details so the correct department can respond quickly.</p></div></div>
      <div class="form-grid two">
        ${field("Full name", "citizenName", "Enter citizen name", true, "text", `value="${escapeHtml(profile?.displayName || "")}" readonly`)}
        ${field("Phone number", "phone", "10-digit mobile number", true, "tel", `pattern="[0-9]{10}" value="${escapeHtml(profile?.phone || "")}"`)}
      </div>
      ${field("Email address", "email", "name@example.com", true, "email", `value="${escapeHtml(profile?.email || "")}" readonly`)}
      ${field("Complaint title", "title", "Example: Streetlight not working", true)}
      <label class="field-label"><span>Detailed description</span><textarea id="description" name="description" placeholder="Describe the problem, how long it has existed and whether it creates danger." required minlength="15" rows="6"></textarea></label>
      ${renderLocationPicker()}
      ${renderInitialEvidenceUploader()}
      <div class="form-note">${icon("shield-check", "", 16)} This complaint will be securely linked to your signed-in citizen account.</div>
      <button class="primary-button full-width" type="submit">${icon("sparkles", "", 16)} Analyse and submit complaint</button>
    </form>
    <aside id="analysisCard" class="analysis-card">${renderEmptyAnalysis()}</aside>
  </div>`;
}

function renderLocationPicker() {
  return `<section class="location-picker" aria-labelledby="locationPickerTitle">
    <div class="location-picker-heading"><div><strong id="locationPickerTitle">Exact complaint location</strong><small>Search an Indian address, detect your position, or click the map to place the pin.</small></div><span class="required-field-badge">Required</span></div>
    <div class="location-search-row">
      <form id="locationSearchForm" class="location-search-form" role="search">
        <div class="search-box">${icon("search", "", 16)}<input id="locationSearchInput" type="search" autocomplete="street-address" placeholder="Search landmark, street, area or postcode" aria-label="Search for complaint location"></div>
        <button class="secondary-button" type="submit">Search map</button>
      </form>
      <button id="useCurrentLocation" class="secondary-button location-device-button" type="button">${icon("crosshair", "", 16)} Use current location</button>
    </div>
    <div id="locationSearchResults" class="location-search-results" hidden></div>
    <div class="complaint-map-shell">
      <div id="complaintLocationMap" class="complaint-location-map" aria-label="Interactive map for selecting complaint location"></div>
      <div class="map-pin-guidance">${icon("map-pin", "", 15)} Click the map or drag the pin</div>
    </div>
    <label class="field-label selected-address-field"><span>Selected address</span><input id="location" name="location" placeholder="Choose a point on the map" required readonly></label>
    <input id="locationLatitude" name="locationLatitude" type="hidden">
    <input id="locationLongitude" name="locationLongitude" type="hidden">
    <input id="locationWard" name="locationWard" type="hidden">
    <input id="locationSource" name="locationSource" type="hidden">
    <input id="locationAccuracy" name="locationAccuracy" type="hidden">
    <div class="location-selection-footer"><div><p id="locationMapStatus" class="location-map-status" aria-live="polite"></p><small id="selectedWard" hidden></small></div><button id="clearMapLocation" class="text-button" type="button" hidden>Clear location</button></div>
    <p class="map-privacy-note">${icon("shield-check", "", 14)} Address search uses OpenStreetMap. Only search when you are ready to identify the public issue location.</p>
  </section>`;
}

function field(label, name, placeholder, required = false, type = "text", extra = "") {
  return `<label class="field-label"><span>${label}</span><input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" ${required ? "required" : ""} ${extra}></label>`;
}

function renderInitialEvidenceUploader() {
  return `<section class="evidence-field" aria-labelledby="evidenceLabel">
    <div class="evidence-field-heading"><div><strong id="evidenceLabel">Photo or document evidence <span>Optional</span></strong><small>Up to 3 JPG, PNG, WebP, or PDF files · 5 MB each</small></div><span class="secure-file-badge">${icon("lock", "", 12)} Secure upload</span></div>
    <label id="evidenceDropZone" class="evidence-dropzone" for="evidenceFiles" tabindex="0">
      <input id="evidenceFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden>
      <span class="evidence-upload-icon">${icon("upload", "", 20)}</span><span><strong>Drop evidence here or browse files</strong><small>Clear photos and supporting documents help departments verify the issue.</small></span>
    </label>
    <div id="evidenceSelection" class="evidence-selection"></div>
  </section>`;
}

function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clearSelectedEvidence() {
  selectedEvidencePreviewUrls.forEach(url => URL.revokeObjectURL(url));
  selectedEvidencePreviewUrls = [];
  selectedEvidenceFiles = [];
}

function selectedEvidenceMarkup() {
  selectedEvidencePreviewUrls.forEach(url => URL.revokeObjectURL(url));
  selectedEvidencePreviewUrls = [];
  if (!selectedEvidenceFiles.length) return "";
  return `<div class="selected-evidence-grid">${selectedEvidenceFiles.map((file, index) => {
    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : "";
    if (previewUrl) selectedEvidencePreviewUrls.push(previewUrl);
    return `<article class="selected-evidence-card">${isImage ? `<img src="${previewUrl}" alt="Selected evidence preview">` : '<span class="pdf-evidence-icon">PDF</span>'}<div><strong>${escapeHtml(file.name)}</strong><small>${formatFileSize(file.size)}</small></div><button type="button" data-remove-evidence="${index}" aria-label="Remove ${escapeHtml(file.name)}">${icon("x", "", 14)}</button></article>`;
  }).join("")}</div>`;
}

function refreshSelectedEvidence() {
  const root = document.getElementById("evidenceSelection");
  if (!root) return;
  root.innerHTML = selectedEvidenceMarkup();
  root.querySelectorAll("[data-remove-evidence]").forEach(button => button.addEventListener("click", () => {
    selectedEvidenceFiles.splice(Number(button.dataset.removeEvidence), 1);
    refreshSelectedEvidence();
  }));
}

function setSelectedEvidence(fileList) {
  try {
    selectedEvidenceFiles = window.CivicEvidence.validateFiles(fileList);
    refreshSelectedEvidence();
  } catch (error) {
    clearSelectedEvidence();
    refreshSelectedEvidence();
    showToast(complaintConnectionError(error), "error");
  }
}

function attachInitialEvidenceEvents() {
  const input = document.getElementById("evidenceFiles");
  const dropZone = document.getElementById("evidenceDropZone");
  if (!input || !dropZone) return;
  input.addEventListener("change", () => setSelectedEvidence(input.files));
  dropZone.addEventListener("keydown", event => {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      input.click();
    }
  });
  ["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.add("drag-active");
  }));
  ["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.remove("drag-active");
  }));
  dropZone.addEventListener("drop", event => setSelectedEvidence(event.dataTransfer.files));
  refreshSelectedEvidence();
}

function renderEmptyAnalysis() {
  return `<div class="section-heading compact"><div class="section-icon purple">${icon("sparkles", "", 18)}</div><div><h3>Assisted complaint routing</h3><p>Gemini with secure service-rule fallback</p></div></div><div class="empty-analysis"><div class="big-icon empty-icon">${icon("search", "", 24)}</div><h3>Waiting for complaint details</h3><p>Enter the title, description and location to receive automatic category, department and priority suggestions.</p></div>`;
}

function analysisStatus(status, analysis) {
  if (status === "analysing") return { label: "Gemini analysing", className: "loading", note: "Understanding context and selecting an official service route…" };
  if (status === "ready") return { label: "Gemini AI", className: "ready", note: `${analysis.confidence}% confidence · Server-validated route` };
  if (status === "fallback") return { label: "Smart rules fallback", className: "fallback", note: "The complaint remains routable even when AI is unavailable." };
  if (status === "waiting") return { label: "Instant rules preview", className: "waiting", note: "Gemini analysis starts after you pause typing." };
  return { label: "Instant rules preview", className: "preview", note: "Complete all complaint fields to start Gemini analysis." };
}

function renderAnalysis(analysis, status = "preview") {
  const state = analysisStatus(status, analysis);
  const advice = analysis.safetyAdvice || smartAdvice(analysis.category, analysis.priority);
  return `<div class="section-heading compact"><div class="section-icon purple">${icon("sparkles", "", 18)}</div><div><h3>Assisted complaint routing</h3><p>Category, routing and urgency</p></div></div>
    <div class="analysis-source-row"><span class="analysis-source ${state.className}">${status === "analysing" ? '<i class="analysis-spinner"></i>' : icon("sparkles", "", 13)} ${state.label}</span><small>${escapeHtml(state.note)}</small></div>
    <div class="analysis-results">
      ${analysisItem("Detected category", analysis.category)}
      ${analysisItem("Assigned department", analysis.department)}
      ${analysisItem("Priority level", priorityBadge(analysis.priority), true)}
      ${analysisItem("Estimated resolution", `${analysis.days} working day${analysis.days === 1 ? "" : "s"}`)}
      ${Number.isFinite(analysis.confidence) ? analysisItem("Classification confidence", `${analysis.confidence}%${analysis.reviewRequired ? " · Review recommended" : ""}`) : ""}
      ${analysis.reasoning ? `<div class="analysis-reason"><span>Why this route?</span><p>${escapeHtml(analysis.reasoning)}</p></div>` : ""}
      <div class="smart-message">${icon("shield-check", "", 16)}<p>${escapeHtml(advice)}</p></div>
    </div>`;
}

function analysisItem(label, value, raw = false) {
  return `<div class="analysis-item"><span>${label}</span><strong>${raw ? value : escapeHtml(value)}</strong></div>`;
}

function smartAdvice(category, priority) {
  if (priority === "High") return "Safety-related language was detected. This complaint will be highlighted for urgent administrative review.";
  if (category.includes("Electricity")) return "Avoid touching exposed wires or damaged equipment. Maintain a safe distance until officials arrive.";
  if (category.includes("Water")) return "The issue will be directed to the water supply department with an estimated two-day response window.";
  return "The complaint will be routed automatically to the most relevant department.";
}

function renderSubmissionSuccess(item) {
  const classificationLabel = item.classification?.source === "gemini"
    ? `Gemini AI · ${item.classification.confidence}% confidence`
    : "Smart rules fallback";
  return `<div class="success-page"><div class="success-icon">${icon("check-circle", "", 28)}</div><p class="eyebrow">Complaint registered successfully</p><h2>${item.id}</h2><p>Save this grievance ID. It is required to track the complaint.</p>
    <div class="result-card">${resultRow("Classification", classificationLabel)}${resultRow("Category", item.category)}${resultRow("Department", item.department)}${resultRow("Priority", item.priority)}${resultRow("Mapped location", item.locationData ? (item.locationData.ward || "Exact pin saved") : "Address saved")}${resultRow("Evidence", `${item.evidence?.length || 0} file${item.evidence?.length === 1 ? "" : "s"}`)}${resultRow("SLA deadline", formatDateTime(slaAssessment(item).deadlineAt || item.expectedResolutionDate))}</div>
    ${item.duplicateId ? `<div class="alert warning">${icon("alert-triangle", "", 17)} <span>A similar unresolved complaint may already exist: <strong>${item.duplicateId}</strong>.</span></div>` : ""}
    ${evidenceUploadWarning ? `<div class="alert warning evidence-warning">${icon("alert-triangle", "", 17)} <span><strong>Complaint saved without evidence.</strong> ${escapeHtml(evidenceUploadWarning)} You can add the files later from Track Complaint while the case is awaiting review.</span></div>` : ""}
    <div class="button-row center"><button class="primary-button" data-success-go="track">${icon("search", "", 16)} Track complaint</button><button class="secondary-button" id="submitAnother">Submit another</button></div></div>`;
}

function resultRow(label, value) { return `<div class="result-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`; }

function renderTrackPage() {
  return `<div class="page-stack">
    <section class="track-hero"><div class="track-icon">${icon("search", "", 24)}</div><p class="eyebrow">Protected progress tracking</p><h2>Track ${isCitizen() ? "your" : "an authorised"} grievance</h2><p>Enter a complaint ID available to your signed-in role.</p>
      <form id="trackForm" class="track-search"><input id="trackId" placeholder="Example: GRV-2026-001" required><button class="primary-button" type="submit">${icon("search", "", 16)} Track</button></form>
      ${window.CivicAuth.isDemoMode() ? '<button id="demoTrack" class="sample-link">Try permitted demo ID: GRV-2026-001</button>' : ""}
    </section>
    <div id="trackResult">${trackingResult ? renderTrackingResult(trackingResult) : ""}</div>
  </div>`;
}

function renderTrackingResult(item) {
  if (!item) return `<div class="alert error">${icon("alert-circle", "", 17)} <span>${escapeHtml(trackingError || "No complaint was found. Check the grievance ID and try again.")}</span></div>`;
  const currentIndex = STATUS_FLOW.indexOf(item.status);
  return `<section class="tracking-result">
    <div class="tracking-header"><div><p class="eyebrow">${escapeHtml(item.id)}</p><h2>${escapeHtml(item.title)}</h2>${statusBadge(item.status)}</div>${priorityBadge(item.priority + " priority").replace(`priority-${item.priority.toLowerCase()} priority`, `priority-${item.priority.toLowerCase()}`)}</div>
    <div class="details-grid">
      ${detailCard("user", "Citizen", item.citizenName)}${detailCard("map-pin", "Location", item.location)}${detailCard("building", "Department", item.department)}${detailCard("clock", "SLA deadline", formatDateTime(slaAssessment(item).deadlineAt || item.expectedResolutionDate))}
    </div>
    ${renderComplaintSlaNotice(item)}
    <div class="description-block"><strong>Complaint description</strong><p>${escapeHtml(item.description)}</p></div>
    ${renderEvidenceSection(item)}
    <div class="timeline-card"><h3>Status timeline</h3><div class="timeline">${STATUS_FLOW.map((status, index) => `<div class="timeline-step ${index <= currentIndex ? "complete" : ""} ${index === currentIndex ? "current" : ""}"><div class="timeline-marker">${index <= currentIndex ? icon("check", "", 13) : ""}</div><span>${status}</span></div>`).join("")}</div></div>
    ${renderStatusHistory(item)}
    ${item.resolutionNote ? `<div class="resolution-note">${icon("check-circle", "", 18)}<div><strong>Department update</strong><p>${escapeHtml(item.resolutionNote)}</p></div></div>` : ""}
    ${item.status === "Resolved" && isCitizen() && window.CivicAuth.ownsComplaint(item) ? renderFeedback(item) : ""}
  </section>`;
}

function renderStatusHistory(item) {
  const history = Array.isArray(item.statusHistory) ? [...item.statusHistory].reverse() : [];
  if (!history.length) return "";
  return `<section class="status-history"><div class="status-history-heading"><h3>Recorded update history</h3><span>${history.length} event${history.length === 1 ? "" : "s"}</span></div>
    <div class="history-list">${history.map(entry => `<article class="history-entry"><div class="history-dot"></div><div><div class="history-entry-top"><strong>${escapeHtml(entry.status || "Update")}</strong><time>${escapeHtml(formatDateTime(entry.changedAt))}</time></div><p>${escapeHtml(entry.note || "Complaint status updated.")}</p><small>${escapeHtml(entry.changedByName || "CivicResolve user")} · ${escapeHtml(entry.changedByRole || "user")}</small></div></article>`).join("")}</div>
  </section>`;
}

function detailCard(iconName, label, value) { return `<article class="detail-card"><span class="detail-icon">${icon(iconName, "", 17)}</span><div><span>${label}</span><strong>${escapeHtml(value)}</strong></div></article>`; }

function canAddEvidence(item) {
  return isCitizen()
    && window.CivicAuth.ownsComplaint(item)
    && ["Submitted", "Under Review"].includes(item.status)
    && (item.evidence?.length || 0) < window.CivicEvidence.MAX_FILES;
}

function renderEvidenceSection(item, includeCitizenUpload = true) {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const remaining = Math.max(0, window.CivicEvidence.MAX_FILES - evidence.length);
  const cards = evidence.length
    ? `<div class="evidence-grid">${evidence.map((file, index) => `<article class="evidence-card"><span class="evidence-type-icon ${window.CivicEvidence.isImage(file) ? "image-file" : "pdf-file"}">${window.CivicEvidence.isImage(file) ? icon("file-text", "", 18) : "PDF"}</span><div><strong>${escapeHtml(file.originalName)}</strong><small>${formatFileSize(file.size)} · Uploaded ${formatDate(file.uploadedAt)}</small></div><button type="button" class="table-button" data-evidence-index="${index}">View file</button></article>`).join("")}</div>`
    : '<div class="empty-evidence">No photo or document evidence was attached.</div>';
  const addFiles = includeCitizenUpload && canAddEvidence(item)
    ? `<div class="additional-evidence"><div><strong>Add supporting evidence</strong><small>${remaining} file slot${remaining === 1 ? "" : "s"} remaining · Added files cannot be edited after department work begins.</small></div><div class="additional-evidence-actions"><input id="additionalEvidenceFiles" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple><button id="uploadAdditionalEvidence" type="button" class="secondary-button small" disabled>Upload evidence</button></div><div id="additionalEvidenceStatus" class="evidence-upload-status"></div></div>`
    : "";
  return `<section class="complaint-evidence"><div class="complaint-evidence-heading"><div><h3>Complaint evidence</h3><p>Files are protected by complaint ownership and department access.</p></div><span>${evidence.length}/${window.CivicEvidence.MAX_FILES} files</span></div>${cards}${addFiles}</section>`;
}

function attachEvidenceOpenEvents(root, item) {
  root?.querySelectorAll("[data-evidence-index]").forEach(button => button.addEventListener("click", async () => {
    const evidence = item.evidence?.[Number(button.dataset.evidenceIndex)];
    if (!evidence) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Opening…";
    try {
      await window.CivicEvidence.open(evidence);
      button.disabled = false;
      button.textContent = original;
    } catch (error) {
      console.error("Evidence file could not be opened.", error);
      showToast(complaintConnectionError(error), "error");
      button.disabled = false;
      button.textContent = original;
    }
  }));
}

function attachAdditionalEvidenceEvents(item) {
  if (!canAddEvidence(item)) return;
  const input = document.getElementById("additionalEvidenceFiles");
  const button = document.getElementById("uploadAdditionalEvidence");
  const status = document.getElementById("additionalEvidenceStatus");
  if (!input || !button || !status) return;
  let files = [];
  input.addEventListener("change", () => {
    try {
      files = window.CivicEvidence.validateFiles(input.files, item.evidence?.length || 0);
      status.textContent = `${files.length} file${files.length === 1 ? "" : "s"} ready · ${formatFileSize(files.reduce((sum, file) => sum + file.size, 0))}`;
      status.dataset.tone = "ready";
      button.disabled = false;
    } catch (error) {
      files = [];
      status.textContent = complaintConnectionError(error);
      status.dataset.tone = "error";
      button.disabled = true;
    }
  });
  button.addEventListener("click", async () => {
    if (!files.length) return;
    button.disabled = true;
    const original = button.textContent;
    let uploaded = [];
    try {
      uploaded = await window.CivicEvidence.upload(item.id, files, item.evidence?.length || 0, percent => {
        button.textContent = `Uploading ${percent}%`;
      });
      const combined = await window.CivicComplaints.attachEvidence(item.id, uploaded);
      trackingResult = { ...item, evidence: combined };
      showToast(`${uploaded.length} evidence file${uploaded.length === 1 ? "" : "s"} uploaded securely.`);
      document.getElementById("trackResult").innerHTML = renderTrackingResult(trackingResult);
      attachTrackingEvents();
    } catch (error) {
      if (uploaded.length) {
        try { await window.CivicEvidence.removeMany(uploaded); } catch (cleanupError) { console.warn("Uploaded evidence cleanup failed.", cleanupError); }
      }
      console.error("Additional evidence upload failed.", error);
      status.textContent = complaintConnectionError(error);
      status.dataset.tone = "error";
      button.disabled = false;
      button.textContent = original;
    }
  });
}

function renderFeedback(item) {
  const rating = item.rating || 5;
  return `<div class="feedback-card"><h3>Rate the resolution</h3><div id="stars" class="stars">${[1,2,3,4,5].map(value => `<button type="button" class="star ${value <= rating ? "active" : ""}" data-rating="${value}">★</button>`).join("")}</div><textarea id="feedbackText" rows="3" placeholder="Share your feedback about the resolution.">${escapeHtml(item.feedback || "")}</textarea><button id="saveFeedback" class="primary-button" data-id="${item.id}" data-rating="${rating}">Save Feedback</button></div>`;
}

function renderAdminPage() {
  const managedComplaints = visibleComplaints();
  const stats = getStats(managedComplaints);
  const subtitle = isOfficer() ? `Showing complaints assigned to ${authProfile()?.department || "your department"}` : "Search, assign and update citizen grievances";
  const categories = [...new Set(managedComplaints.map(item => item.category).filter(Boolean))].sort();
  const departments = [...new Set(managedComplaints.map(item => item.department).filter(Boolean))].sort();
  return `<div class="page-stack">
    <section class="stats-grid compact-stats">${statCard("Total", stats.total, "clipboard-list")}${statCard("High Priority", stats.highPriority, "alert-triangle", "", "danger")}${statCard("Active Work", stats.inProgress, "activity", "", "info")}${statCard("Resolved", stats.resolved, "check-circle", "", "success")}</section>
    ${renderSlaAlertBanner(managedComplaints)}
    ${panel("Complaint management", subtitle, `<div class="filter-row map-filter-row"><div class="search-box">${icon("search", "", 16)}<input id="adminSearch" placeholder="Search ID, title, citizen or location"></div><select id="statusFilter" aria-label="Filter by complaint status"><option>All</option>${STATUS_FLOW.map(s => `<option>${s}</option>`).join("")}</select><select id="priorityFilter" aria-label="Filter by priority"><option>All</option><option>High</option><option>Medium</option><option>Low</option></select><select id="slaFilter" aria-label="Filter by SLA state"><option value="All">All SLA states</option><option value="overdue">Overdue</option><option value="due-soon">Due soon</option><option value="on-track">On track</option><option value="resolved">Resolved</option></select><select id="categoryFilter" aria-label="Filter by complaint category"><option value="All">All categories</option>${categories.map(category => `<option>${escapeHtml(category)}</option>`).join("")}</select><select id="departmentFilter" aria-label="Filter by assigned department"><option value="All">All departments</option>${departments.map(department => `<option>${escapeHtml(department)}</option>`).join("")}</select></div>
      <section class="operations-map-section" aria-labelledby="operationsMapTitle"><div class="operations-map-heading"><div><h4 id="operationsMapTitle">Complaint location map</h4><p>View exact issue pins and nearby complaint groups within your authorised scope.</p></div><label><span>Marker colour</span><select id="mapColourMode"><option value="priority">Priority</option><option value="status">Status</option></select></label></div>
        <div class="operations-map-meta"><span>${icon("map-pin", "", 15)} <strong id="mapVisibleCount">0</strong> mapped</span><span>${icon("alert-circle", "", 15)} <strong id="mapMissingCount">0</strong> legacy records without pins</span><span class="map-legend"><i class="map-dot high"></i> High <i class="map-dot medium"></i> Medium <i class="map-dot low"></i> Low</span></div>
        <div class="complaint-map-shell"><div id="complaintOperationsMap" class="complaint-operations-map" aria-label="Map of authorised civic complaints"></div><div id="complaintMapEmpty" class="map-empty-overlay" hidden>${icon("map-pin", "", 22)}<strong>No mapped complaints in this view</strong><span>Change the filters or wait for a new map-based report.</span></div></div>
      </section>
      <div class="complaint-table-heading"><div><h4>Complaint records</h4><p>The table and map use the same filters.</p></div><span id="filteredComplaintCount">${managedComplaints.length} record${managedComplaints.length === 1 ? "" : "s"}</span></div><div id="adminTable">${complaintTable(managedComplaints)}</div>`, window.CivicComplaints.isDemoMode() && isAdministrator() ? '<button id="resetDemo" class="secondary-button small">Reset demo data</button>' : '<span class="role-badge">Live Firestore</span>')}
  </div>`;
}

function renderAnalyticsPage() {
  const scopedComplaints = visibleComplaints();
  const stats = getStats(scopedComplaints);
  const departments = countBy("department", scopedComplaints);
  const rated = scopedComplaints.filter(item => item.rating);
  const avg = rated.length ? (rated.reduce((sum, item) => sum + Number(item.rating), 0) / rated.length).toFixed(1) : "—";
  const categories = countBy("category", scopedComplaints);
  const top = categories[0];
  return `<div class="page-stack">
    <section class="insight-banner"><div class="section-icon purple">${icon("activity", "", 18)}</div><div><p class="eyebrow">Operational intelligence</p><h2>Service performance overview</h2><p>${top ? `${escapeHtml(top.name)} currently has the highest workload with ${top.value} complaint${top.value === 1 ? "" : "s"}. The overall resolution rate is ${stats.resolutionRate}%.` : "No complaint data is available yet."}</p></div></section>
    <section class="stats-grid compact-stats">${statCard("Resolution Rate", `${stats.resolutionRate}%`, "check-circle", "", "success")}${statCard("High Priority", stats.highPriority, "alert-triangle", "", "danger")}${statCard("Departments", departments.length, "building")}${statCard("Citizen Rating", avg === "—" ? avg : `${avg}/5`, "activity", "", "warning")}</section>
    <section class="two-column-grid">${panel("Category distribution", "Most reported civic issue types", renderDonut(categories))}${panel("Priority mix", "Urgency distribution of registered complaints", renderBars(countBy("priority", scopedComplaints), "#6941c6"))}</section>
    ${panel("Department workload", "Number of complaints assigned to each department", renderBars(departments, "#1664d9"))}
  </div>`;
}

function roleAccountErrorMessage(error) {
  const messages = {
    "permission-denied": "Firestore denied role management. Confirm this profile is an administrator and publish the latest security rules.",
    "unavailable": "Role accounts are temporarily unavailable. Check your connection and try again."
  };
  return messages[error?.code] || error?.message || "The role account connection failed.";
}

function stopRoleAccountSync() {
  roleAccountsUnsubscribe?.();
  roleAccountsUnsubscribe = null;
  roleAccounts = [];
  roleAccountsReady = false;
  roleAccountsError = "";
}

function startRoleAccountSync(force = false) {
  if (!isAdministrator() || !window.CivicRoleAccounts) return;
  if (!force && roleAccountsUnsubscribe) return;
  roleAccountsUnsubscribe?.();
  roleAccountsUnsubscribe = null;
  roleAccountsReady = false;
  roleAccountsError = "";
  try {
    roleAccountsUnsubscribe = window.CivicRoleAccounts.subscribe(accounts => {
      roleAccounts = accounts;
      roleAccountsReady = true;
      roleAccountsError = "";
      if (activePage === "accounts") renderApp();
    }, error => {
      console.error("Role account listener failed.", error);
      roleAccountsReady = false;
      roleAccountsError = roleAccountErrorMessage(error);
      if (activePage === "accounts") renderApp();
    });
  } catch (error) {
    console.error("Role account connection could not start.", error);
    roleAccountsReady = false;
    roleAccountsError = roleAccountErrorMessage(error);
    renderApp();
  }
}

function roleLabel(role) {
  return {
    citizen: "Citizen",
    "department-officer": "Department Officer",
    administrator: "Administrator"
  }[role] || "Citizen";
}

function roleAccountTable(accounts) {
  if (!accounts.length) return '<div class="empty-table">No role accounts match these filters.</div>';
  const currentUid = authProfile()?.uid;
  return `<div class="table-wrap"><table class="data-table role-account-table"><thead><tr><th>User</th><th>Contact</th><th>Access</th><th>Department</th><th>Role history</th><th>Actions</th></tr></thead><tbody>${accounts.map(account => {
    const initials = account.displayName.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    const ownAccount = account.uid === currentUid;
    const roleChanged = account.roleUpdatedAt
      ? `${formatDateTime(account.roleUpdatedAt)}${account.roleUpdatedByName ? ` by ${escapeHtml(account.roleUpdatedByName)}` : ""}`
      : "Initial account role";
    return `<tr>
      <td><div class="role-user"><span class="role-user-avatar">${escapeHtml(initials)}</span><div><strong>${escapeHtml(account.displayName)}</strong><span class="table-subtext">UID: ${escapeHtml(account.uid.slice(0, 12))}…</span></div></div></td>
      <td><strong>${escapeHtml(account.email)}</strong><span class="table-subtext">${escapeHtml(account.phone || "No phone added")}</span></td>
      <td><span class="account-role role-${escapeHtml(account.role)}">${escapeHtml(roleLabel(account.role))}</span></td>
      <td>${escapeHtml(account.department || "Not assigned")}</td>
      <td><span class="table-subtext">${roleChanged}</span></td>
      <td><div class="role-actions"><button class="table-button" data-role-edit="${escapeHtml(account.uid)}" ${ownAccount ? "disabled" : ""}>${ownAccount ? "Current account" : "Change role"}</button><button class="text-button role-reset" data-role-reset="${escapeHtml(account.uid)}">Reset password</button></div></td>
    </tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderRoleAccountsPage() {
  if (!isAdministrator()) return `<section class="data-state-card error-state"><div class="data-state-icon">${icon("alert-triangle", "", 24)}</div><h2>Administrator access required</h2><p>This workspace is available only to verified CivicResolve administrators.</p></section>`;
  if (roleAccountsError) return `<section class="data-state-card error-state"><div class="data-state-icon">${icon("alert-triangle", "", 24)}</div><p class="eyebrow">Secure role management</p><h2>Role accounts could not be loaded</h2><p>${escapeHtml(roleAccountsError)}</p><button id="retryRoleAccounts" class="primary-button" type="button">Retry connection</button></section>`;
  if (!roleAccountsReady) return `<section class="data-state-card"><div class="data-spinner" aria-hidden="true"></div><p class="eyebrow">Secure role management</p><h2>Loading authorised accounts…</h2><p>CivicResolve is opening the administrator-only user directory.</p></section>`;

  const citizenCount = roleAccounts.filter(account => account.role === "citizen").length;
  const officerCount = roleAccounts.filter(account => account.role === "department-officer").length;
  const adminCount = roleAccounts.filter(account => account.role === "administrator").length;
  return `<div class="page-stack">
    <section class="role-onboarding">
      <div><p class="eyebrow">Safe account onboarding</p><h2>Create first, then assign official access</h2><p>The account owner signs up with email or Google. Their profile appears here as a Citizen, and an administrator assigns the verified role and department.</p></div>
      <div class="role-onboarding-steps"><span><b>1</b> User registers</span><span><b>2</b> Admin verifies</span><span><b>3</b> Role activates live</span></div>
      <button id="copyOnboarding" class="secondary-button small" type="button">Copy onboarding steps</button>
    </section>
    <section class="stats-grid compact-stats">${statCard("All Accounts", roleAccounts.length, "users")}${statCard("Citizens", citizenCount, "user", "", "info")}${statCard("Officers", officerCount, "building", "", "warning")}${statCard("Administrators", adminCount, "shield-check", "", "success")}</section>
    ${panel("User role management", "Only administrators can assign or change official access", `<div class="role-filter-row"><div class="search-box">${icon("search", "", 16)}<input id="roleSearch" placeholder="Search name, email or department"></div><select id="roleFilter"><option value="All">All roles</option><option value="citizen">Citizens</option><option value="department-officer">Department officers</option><option value="administrator">Administrators</option></select></div><div id="roleAccountTable">${roleAccountTable(roleAccounts)}</div>`, '<span class="role-badge">Live Firestore</span>')}
  </div>`;
}

function attachPageEvents() {
  document.getElementById("retryComplaintSync")?.addEventListener("click", () => startComplaintSync(true));
  document.querySelectorAll("[data-sla-open]").forEach(button => button.addEventListener("click", () => window.CivicSlaAlerts.open(button.dataset.slaOpen)));
  document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));

  if (activePage === "accounts") {
    attachRoleAccountEvents();
    return;
  }

  if (!complaintDataReady) return;

  if (activePage === "submit") {
    if (lastSubmitted) {
      document.querySelector("[data-success-go]")?.addEventListener("click", () => { trackingResult = lastSubmitted; navigate("track"); });
      document.getElementById("submitAnother")?.addEventListener("click", () => { lastSubmitted = null; evidenceUploadWarning = ""; resetAiAnalysis(); clearSelectedEvidence(); renderApp(); });
      return;
    }
    const title = document.getElementById("title");
    const description = document.getElementById("description");
    const location = document.getElementById("location");
    const updateAnalysis = () => {
      const combined = `${title.value}${description.value}${location.value}`.trim();
      if (combined.length < 8) {
        resetAiAnalysis();
        updateAnalysisCard();
        return;
      }
      previewComplaintAnalysis({ title: title.value, description: description.value, location: location.value });
    };
    title.addEventListener("input", updateAnalysis);
    description.addEventListener("input", updateAnalysis);
    location.addEventListener("input", updateAnalysis);
    window.CivicMaps?.initComplaintPicker({ onChange: updateAnalysis });
    attachInitialEvidenceEvents();
    document.getElementById("complaintForm").addEventListener("submit", submitComplaint);
  }

  if (activePage === "track") {
    document.getElementById("trackForm").addEventListener("submit", event => {
      event.preventDefault();
      const id = document.getElementById("trackId").value.trim().toLowerCase();
      const found = complaints.find(item => item.id.toLowerCase() === id) || null;
      trackingResult = found && canViewComplaint(found) ? found : null;
      trackingError = found && !trackingResult
        ? "This grievance is not linked to your account or assigned role."
        : "No complaint was found. Check the grievance ID and try again.";
      document.getElementById("trackResult").innerHTML = renderTrackingResult(trackingResult);
      attachTrackingEvents();
    });
    document.getElementById("demoTrack")?.addEventListener("click", () => {
      document.getElementById("trackId").value = "GRV-2026-001";
      const found = complaints.find(item => item.id === "GRV-2026-001") || null;
      trackingResult = found && canViewComplaint(found) ? found : null;
      trackingError = found && !trackingResult ? "This demo grievance is outside your assigned role." : "The demo grievance could not be found.";
      document.getElementById("trackResult").innerHTML = renderTrackingResult(trackingResult);
      attachTrackingEvents();
    });
    attachTrackingEvents();
  }

  if (activePage === "admin") attachAdminEvents();
}

function attachRoleAccountEvents() {
  document.getElementById("retryRoleAccounts")?.addEventListener("click", () => startRoleAccountSync(true));
  if (!roleAccountsReady && !roleAccountsError) {
    startRoleAccountSync();
    return;
  }
  if (!roleAccountsReady) return;

  const search = document.getElementById("roleSearch");
  const filter = document.getElementById("roleFilter");
  const refresh = () => {
    const query = search.value.trim().toLowerCase();
    const matches = roleAccounts.filter(account => `${account.displayName} ${account.email} ${account.department}`.toLowerCase().includes(query)
      && (filter.value === "All" || account.role === filter.value));
    document.getElementById("roleAccountTable").innerHTML = roleAccountTable(matches);
    attachRoleAccountTableEvents();
  };
  search.addEventListener("input", refresh);
  filter.addEventListener("change", refresh);
  document.getElementById("copyOnboarding")?.addEventListener("click", async () => {
    const steps = "CivicResolve role account setup: 1) Register at the CivicResolve sign-in page using email/password or Google. 2) Tell the municipal administrator the registered email address and required department. 3) The administrator verifies the person and assigns Department Officer or Administrator access.";
    try {
      await navigator.clipboard.writeText(steps);
      showToast("Account onboarding steps copied.");
    } catch {
      showToast("The onboarding steps could not be copied in this browser.", "error");
    }
  });
  attachRoleAccountTableEvents();
}

function attachRoleAccountTableEvents() {
  document.querySelectorAll("[data-role-edit]").forEach(button => button.addEventListener("click", () => openRoleAccountModal(button.dataset.roleEdit)));
  document.querySelectorAll("[data-role-reset]").forEach(button => button.addEventListener("click", async () => {
    const account = roleAccounts.find(item => item.uid === button.dataset.roleReset);
    if (!account || !confirm(`Send a password reset email to ${account.email}?`)) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Sending…";
    try {
      await window.CivicRoleAccounts.sendPasswordReset(account.email);
      showToast(`Password reset email sent to ${account.email}.`);
    } catch (error) {
      console.error("Password reset email failed.", error);
      showToast(roleAccountErrorMessage(error), "error");
      button.disabled = false;
      button.textContent = original;
    }
  }));
}

function openRoleAccountModal(uid) {
  const account = roleAccounts.find(item => item.uid === uid);
  if (!account || account.uid === authProfile()?.uid) {
    showToast("You cannot change your own administrator role.", "error");
    return;
  }
  document.getElementById("modalRoot").innerHTML = `<div id="modalBackdrop" class="modal-backdrop"><div class="modal role-account-modal" role="dialog" aria-modal="true" aria-labelledby="roleModalTitle">
    <div class="modal-header"><div><p class="eyebrow">Verified access control</p><h2 id="roleModalTitle">Change role account</h2></div><button id="closeModal" class="icon-button" aria-label="Close">${icon("x", "", 17)}</button></div>
    <div class="modal-summary"><strong>${escapeHtml(account.displayName)}</strong><span>${escapeHtml(account.email)}</span></div>
    <div class="role-security-note"><span>${icon("shield-check", "", 18)}</span><p><strong>Security check</strong>Verify the person's identity and department before granting official access. The change is recorded in the role audit trail.</p></div>
    <label class="field-label"><span>Account role</span><select id="accountRole"><option value="citizen" ${account.role === "citizen" ? "selected" : ""}>Citizen</option><option value="department-officer" ${account.role === "department-officer" ? "selected" : ""}>Department Officer</option><option value="administrator" ${account.role === "administrator" ? "selected" : ""}>Administrator</option></select></label>
    <label class="field-label"><span>Assigned department</span><select id="accountDepartment">${DEPARTMENTS.map(department => `<option ${department === account.department ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}</select><small id="departmentHelp">Required for department officers.</small></label>
    <div class="button-row end"><button id="cancelModal" class="secondary-button">Cancel</button><button id="saveRoleAccount" class="primary-button">Save Role</button></div>
  </div></div>`;
  const close = () => { document.getElementById("modalRoot").innerHTML = ""; };
  const role = document.getElementById("accountRole");
  const department = document.getElementById("accountDepartment");
  const help = document.getElementById("departmentHelp");
  const syncDepartment = () => {
    if (role.value === "citizen") {
      department.disabled = true;
      help.textContent = "Citizen accounts are not assigned to a department.";
    } else if (role.value === "administrator") {
      department.value = "General Administration";
      department.disabled = true;
      help.textContent = "Administrators receive municipal-wide access.";
    } else {
      department.disabled = false;
      if (!DEPARTMENTS.includes(department.value)) department.value = DEPARTMENTS[0];
      help.textContent = "The officer will see complaints assigned only to this department.";
    }
  };
  syncDepartment();
  role.addEventListener("change", syncDepartment);
  document.getElementById("closeModal").addEventListener("click", close);
  document.getElementById("cancelModal").addEventListener("click", close);
  document.getElementById("modalBackdrop").addEventListener("click", event => { if (event.target.id === "modalBackdrop") close(); });
  document.getElementById("saveRoleAccount").addEventListener("click", async event => {
    const nextRole = role.value;
    const nextDepartment = nextRole === "department-officer" ? department.value : "";
    if (nextRole === "administrator" && !confirm(`Grant full administrator access to ${account.email}?`)) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving securely…";
    try {
      await window.CivicRoleAccounts.updateRole(account.uid, nextRole, nextDepartment);
      showToast(`${account.displayName} is now ${roleLabel(nextRole)}.`);
      close();
    } catch (error) {
      console.error("Role account update failed.", error);
      showToast(roleAccountErrorMessage(error), "error");
      button.disabled = false;
      button.textContent = "Save Role";
    }
  });
}

async function submitComplaint(event) {
  event.preventDefault();
  if (!isCitizen()) {
    showToast("Only citizen accounts can submit complaints.");
    return;
  }
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const locationData = window.CivicMaps?.readFormLocation();
  if (!locationData) {
    showToast("Select the exact complaint location on the map before submitting.", "error");
    document.getElementById("complaintLocationMap")?.focus?.();
    return;
  }
  data.locationData = locationData;
  const profile = authProfile();
  data.citizenName = profile?.displayName || data.citizenName;
  data.email = profile?.email || data.email;
  const today = new Date().toISOString().slice(0, 10);
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  const originalLabel = submitButton.textContent;
  const files = [...selectedEvidenceFiles];
  submitButton.disabled = true;
  submitButton.textContent = "Classifying with Gemini AI…";
  try {
    let analysis;
    try {
      analysis = await requestAiAnalysis(data);
    } catch (error) {
      if (error?.name !== "AbortError") console.warn("Submission AI analysis failed safely.", error);
      analysis = window.CivicAI.fallback(data, error);
    }
    const location = data.location.toLowerCase();
    const duplicate = complaints.find(item => item.status !== "Resolved" && item.category === analysis.category && (item.location.toLowerCase().includes(location) || location.includes(item.location.toLowerCase())));
    submitButton.textContent = "Submitting securely…";
    let complaint = await window.CivicComplaints.create({
      ...data,
      category: analysis.category,
      department: analysis.department,
      priority: analysis.priority,
      classification: window.CivicAI.toMetadata(analysis),
      expectedResolutionDate: addDays(today, analysis.days),
      duplicateId: duplicate?.id || ""
    });
    evidenceUploadWarning = "";
    if (files.length) {
      let uploaded = [];
      try {
        uploaded = await window.CivicEvidence.upload(complaint.id, files, 0, percent => {
          submitButton.textContent = `Uploading evidence ${percent}%`;
        });
        const evidence = await window.CivicComplaints.attachEvidence(complaint.id, uploaded);
        complaint = { ...complaint, evidence };
      } catch (error) {
        if (uploaded.length) {
          try { await window.CivicEvidence.removeMany(uploaded); } catch (cleanupError) { console.warn("Uploaded evidence cleanup failed.", cleanupError); }
        }
        console.error("Complaint evidence upload failed.", error);
        evidenceUploadWarning = complaintConnectionError(error);
      }
    }
    resetAiAnalysis();
    clearSelectedEvidence();
    lastSubmitted = complaint;
    showToast(evidenceUploadWarning
      ? `Complaint ${complaint.id} was saved. Evidence needs attention.`
      : `Complaint ${complaint.id} submitted successfully.`, evidenceUploadWarning ? "error" : "success");
    renderApp();
  } catch (error) {
    console.error("Complaint submission failed.", error);
    showToast(complaintConnectionError(error), "error");
    submitButton.disabled = false;
    submitButton.textContent = originalLabel;
  }
}

function attachTrackingEvents() {
  if (!trackingResult) return;
  const root = document.getElementById("trackResult");
  attachEvidenceOpenEvents(root, trackingResult);
  attachAdditionalEvidenceEvents(trackingResult);
  if (!isCitizen() || !window.CivicAuth.ownsComplaint(trackingResult)) return;
  let currentRating = trackingResult?.rating || 5;
  document.querySelectorAll("[data-rating]").forEach(button => button.addEventListener("click", () => {
    currentRating = Number(button.dataset.rating);
    document.querySelectorAll("[data-rating]").forEach(star => star.classList.toggle("active", Number(star.dataset.rating) <= currentRating));
    const saveButton = document.getElementById("saveFeedback");
    if (saveButton) saveButton.dataset.rating = currentRating;
  }));
  document.getElementById("saveFeedback")?.addEventListener("click", async event => {
    const id = event.currentTarget.dataset.id;
    const rating = Number(event.currentTarget.dataset.rating || currentRating);
    const feedback = document.getElementById("feedbackText").value.trim();
    const item = complaints.find(complaint => complaint.id === id);
    if (!item) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await window.CivicComplaints.saveFeedback(id, rating, feedback);
      trackingResult = { ...item, rating, feedback };
      showToast("Feedback saved successfully.");
    } catch (error) {
      console.error("Feedback could not be saved.", error);
      showToast(complaintConnectionError(error), "error");
      button.disabled = false;
      button.textContent = "Save Feedback";
    }
  });
}

function attachAdminEvents() {
  if (!window.CivicAuth.canAccess("admin")) return;
  const search = document.getElementById("adminSearch");
  const status = document.getElementById("statusFilter");
  const priority = document.getElementById("priorityFilter");
  const sla = document.getElementById("slaFilter");
  const category = document.getElementById("categoryFilter");
  const department = document.getElementById("departmentFilter");
  const colourMode = document.getElementById("mapColourMode");
  const refresh = () => {
    const text = search.value.toLowerCase();
    const filtered = visibleComplaints().filter(item => `${item.id} ${item.title} ${item.citizenName} ${item.location}`.toLowerCase().includes(text)
      && (status.value === "All" || item.status === status.value)
      && (priority.value === "All" || item.priority === priority.value)
      && (!sla || sla.value === "All" || slaAssessment(item).state === sla.value)
      && (!category || category.value === "All" || item.category === category.value)
      && (!department || department.value === "All" || item.department === department.value));
    document.getElementById("adminTable").innerHTML = complaintTable(filtered);
    const count = document.getElementById("filteredComplaintCount");
    if (count) count.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    window.CivicMaps?.updateOperationsMap(filtered, { colourMode: colourMode?.value || "priority" });
    attachTableEvents();
  };
  window.CivicMaps?.initOperationsMap(visibleComplaints(), {
    colourMode: colourMode?.value || "priority",
    onSelect: id => openManageModal(id)
  });
  search.addEventListener("input", refresh);
  status.addEventListener("change", refresh);
  priority.addEventListener("change", refresh);
  sla?.addEventListener("change", refresh);
  category?.addEventListener("change", refresh);
  department?.addEventListener("change", refresh);
  colourMode?.addEventListener("change", refresh);
  document.getElementById("resetDemo")?.addEventListener("click", () => {
    if (!isAdministrator()) return;
    if (!confirm("Reset all data to the original demo complaints?")) return;
    try {
      window.CivicComplaints.resetDemoData();
      showToast("Demo data restored.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
  attachTableEvents();
}

function attachTableEvents() {
  document.querySelectorAll("[data-manage]").forEach(button => button.addEventListener("click", () => openManageModal(button.dataset.manage)));
  document.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", async () => {
    if (!window.CivicAuth.canDeleteComplaint()) {
      showToast("Only administrators can delete complaints.");
      return;
    }
    const id = button.dataset.delete;
    if (!confirm(`Delete complaint ${id}?`)) return;
    button.disabled = true;
    try {
      await window.CivicComplaints.delete(id);
      showToast(`Complaint ${id} deleted.`);
    } catch (error) {
      console.error("Complaint deletion failed.", error);
      showToast(complaintConnectionError(error), "error");
      button.disabled = false;
    }
  }));
}

function openManageModal(id) {
  const item = complaints.find(complaint => complaint.id === id);
  if (!item) return;
  if (!window.CivicAuth.canManageComplaint(item)) {
    showToast("This complaint is outside your assigned role.");
    return;
  }
  selectedComplaintId = id;
  const adminOnly = !isAdministrator() ? "disabled" : "";
  document.getElementById("modalRoot").innerHTML = `<div id="modalBackdrop" class="modal-backdrop"><div class="modal">
    <div class="modal-header"><div><p class="eyebrow">${item.id}</p><h2>Update complaint</h2></div><button id="closeModal" class="icon-button" aria-label="Close">${icon("x", "", 17)}</button></div>
    <div class="modal-summary"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.location)}</span></div>
    ${renderEvidenceSection(item, false)}
    <label class="field-label"><span>Status</span><select id="modalStatus">${STATUS_FLOW.map(status => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label class="field-label"><span>Priority ${isOfficer() ? "(administrator controlled)" : ""}</span><select id="modalPriority" ${adminOnly}>${["High","Medium","Low"].map(priority => `<option ${priority === item.priority ? "selected" : ""}>${priority}</option>`).join("")}</select></label>
    <label class="field-label"><span>Assigned department ${isOfficer() ? "(fixed to your department)" : ""}</span><select id="modalDepartment" ${adminOnly}>${DEPARTMENTS.map(department => `<option ${department === item.department ? "selected" : ""}>${escapeHtml(department)}</option>`).join("")}</select></label>
    <label class="field-label"><span>Resolution / progress note</span><textarea id="modalNote" rows="5" placeholder="Add an official progress update.">${escapeHtml(item.resolutionNote || "")}</textarea></label>
    <div class="button-row end"><button id="cancelModal" class="secondary-button">Cancel</button><button id="saveModal" class="primary-button">Save Changes</button></div>
  </div></div>`;
  const close = () => { document.getElementById("modalRoot").innerHTML = ""; selectedComplaintId = null; };
  attachEvidenceOpenEvents(document.getElementById("modalRoot"), item);
  document.getElementById("closeModal").addEventListener("click", close);
  document.getElementById("cancelModal").addEventListener("click", close);
  document.getElementById("modalBackdrop").addEventListener("click", event => { if (event.target.id === "modalBackdrop") close(); });
  document.getElementById("saveModal").addEventListener("click", async event => {
    if (!window.CivicAuth.canManageComplaint(item)) {
      showToast("Your role can no longer update this complaint.");
      close();
      return;
    }
    const changes = {
      status: document.getElementById("modalStatus").value,
      resolutionNote: document.getElementById("modalNote").value.trim()
    };
    if (isAdministrator()) {
      changes.priority = document.getElementById("modalPriority").value;
      changes.department = document.getElementById("modalDepartment").value.trim();
    }
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await window.CivicComplaints.updateOfficial(id, changes);
      showToast(`Complaint ${id} updated.`);
      close();
    } catch (error) {
      console.error("Complaint update failed.", error);
      showToast(complaintConnectionError(error), "error");
      button.disabled = false;
      button.textContent = "Save Changes";
    }
  });
}

window.CivicAuth.ready().then(() => {
  if (window.CivicAuth.isAuthenticated()) startComplaintSync();
  else window.CivicAuth.renderAuthScreen();
});

document.addEventListener("civic-auth-changed", event => {
  resetAiAnalysis();
  clearSelectedEvidence();
  evidenceUploadWarning = "";
  lastSubmitted = null;
  trackingResult = null;
  trackingError = "";
  selectedComplaintId = null;
  activePage = "dashboard";
  stopRoleAccountSync();
  if (event.detail.authenticated) startComplaintSync();
  else stopComplaintSync();
});
