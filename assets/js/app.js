const STORAGE_KEY = "civicresolve_complaints_v1";
const STATUS_FLOW = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved"];
const COLORS = ["#1f6f5f", "#7b4bb7", "#e5a53a", "#d15c5c", "#3f7cac", "#6e9f5f", "#b56a96"];

const CATEGORY_RULES = [
  { category: "Roads & Potholes", department: "Public Works Department", days: 5, keywords: ["road", "pothole", "footpath", "bridge", "traffic sign", "speed breaker"] },
  { category: "Waste Management", department: "Municipal Waste Department", days: 2, keywords: ["garbage", "waste", "dustbin", "trash", "dump", "unclean"] },
  { category: "Water Supply", department: "Water Supply Department", days: 2, keywords: ["water", "pipeline", "pipe", "leak", "tap", "drinking water"] },
  { category: "Electricity & Streetlights", department: "Electricity Department", days: 2, keywords: ["electric", "wire", "power", "streetlight", "street light", "transformer", "shock"] },
  { category: "Drainage & Sewage", department: "Sanitation Department", days: 3, keywords: ["drain", "drainage", "sewage", "sewer", "overflow", "stagnant water"] },
  { category: "Public Transport", department: "Transport Department", days: 4, keywords: ["bus", "transport", "bus stop", "route", "conductor", "ticket"] },
  { category: "Parks & Public Spaces", department: "Municipal Corporation", days: 4, keywords: ["park", "playground", "bench", "public toilet", "garden"] }
];

const HIGH_PRIORITY_WORDS = ["danger", "accident", "fire", "emergency", "electric shock", "exposed wire", "hospital", "school", "fallen tree", "blocked road", "burst"];
const MEDIUM_PRIORITY_WORDS = ["overflow", "not working", "three days", "many days", "bad smell", "leakage"];

const SAMPLE_COMPLAINTS = [
  {
    id: "GRV-2026-001", citizenName: "Arun Kumar", email: "arun@example.com", phone: "9876543210",
    title: "Large pothole near bus stand", description: "A large pothole is causing accidents near the main bus stand.",
    location: "Gandhipuram Bus Stand, Coimbatore", category: "Roads & Potholes", department: "Public Works Department",
    priority: "High", status: "In Progress", createdAt: "2026-07-30", expectedResolutionDate: "2026-08-04",
    resolutionNote: "Repair team has inspected the location and work has started.", rating: null, feedback: ""
  },
  {
    id: "GRV-2026-002", citizenName: "Meena S", email: "meena@example.com", phone: "9876501234",
    title: "Garbage not collected", description: "Garbage has not been collected for three days and there is a bad smell.",
    location: "RS Puram, Coimbatore", category: "Waste Management", department: "Municipal Waste Department",
    priority: "Medium", status: "Assigned", createdAt: "2026-07-31", expectedResolutionDate: "2026-08-02",
    resolutionNote: "Assigned to Ward 23 sanitation team.", rating: null, feedback: ""
  },
  {
    id: "GRV-2026-003", citizenName: "Rahul P", email: "rahul@example.com", phone: "9876511111",
    title: "Streetlight not working", description: "The streetlight near the school is not working and the road is dark at night.",
    location: "Saibaba Colony, Coimbatore", category: "Electricity & Streetlights", department: "Electricity Department",
    priority: "High", status: "Resolved", createdAt: "2026-07-28", expectedResolutionDate: "2026-07-30",
    resolutionNote: "Faulty light unit replaced and tested successfully.", rating: 5, feedback: "Resolved quickly. Thank you."
  },
  {
    id: "GRV-2026-004", citizenName: "Divya R", email: "divya@example.com", phone: "9876522222",
    title: "Water pipeline leakage", description: "A water pipe is leaking continuously near the market.",
    location: "Town Hall, Coimbatore", category: "Water Supply", department: "Water Supply Department",
    priority: "Medium", status: "Submitted", createdAt: "2026-08-01", expectedResolutionDate: "2026-08-03",
    resolutionNote: "", rating: null, feedback: ""
  }
];

let complaints = loadComplaints();
let activePage = "dashboard";
let lastSubmitted = null;
let trackingResult = null;
let trackingError = "";
let selectedComplaintId = null;

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

function loadComplaints() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : structuredClone(SAMPLE_COMPLAINTS);
  } catch {
    return structuredClone(SAMPLE_COMPLAINTS);
  }
}

function saveComplaints() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function analyseComplaint(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const match = CATEGORY_RULES.find(rule => rule.keywords.some(keyword => text.includes(keyword)));
  const priority = HIGH_PRIORITY_WORDS.some(word => text.includes(word))
    ? "High"
    : MEDIUM_PRIORITY_WORDS.some(word => text.includes(word)) ? "Medium" : "Low";
  return {
    category: match?.category || "General Civic Issue",
    department: match?.department || "General Administration",
    days: match?.days || 5,
    priority
  };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateString) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(`${dateString}T12:00:00`));
}

function statusSlug(status) { return status.toLowerCase().replaceAll(" ", "-"); }
function priorityBadge(priority) { return `<span class="badge priority-${priority.toLowerCase()}">${escapeHtml(priority)}</span>`; }
function statusBadge(status) { return `<span class="badge status-${statusSlug(status)}">${escapeHtml(status)}</span>`; }

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

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = `✓ ${message}`;
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
    analytics: "Analytics & Insights"
  }[page];
}

function appShell() {
  const profile = authProfile();
  const initials = (profile?.displayName || "User").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const roleLabel = window.CivicAuth.getRoleLabel();
  const navItems = [
    ["dashboard", "▦", "Dashboard"],
    ["submit", "+", "Submit Complaint"],
    ["track", "⌕", "Track Complaint"],
    ["admin", "☷", isOfficer() ? "Department Work" : "Admin Management"],
    ["analytics", "▥", "Analytics"]
  ].filter(([page]) => window.CivicAuth.canAccess(page));
  return `
    <div class="app-shell">
      <button id="sidebarBackdrop" class="sidebar-backdrop hidden" aria-label="Close menu"></button>
      <aside id="sidebar" class="sidebar">
        <div class="brand-row">
          <div class="brand-icon">✦</div>
          <div><strong>CivicResolve</strong><span>AI Grievance Portal</span></div>
          <button id="sidebarClose" class="icon-button sidebar-close" aria-label="Close menu">✕</button>
        </div>
        <nav class="sidebar-nav">
          ${navItems.map(item => navLink(...item)).join("")}
        </nav>
        <div class="sidebar-card sidebar-role-card"><div style="font-size:22px">◉</div><strong>${escapeHtml(roleLabel)} access</strong><p>${isOfficer() ? `Assigned to ${escapeHtml(profile?.department || "your department")}.` : isAdministrator() ? "Full municipal oversight and complaint administration." : "Submit grievances and follow your personal cases securely."}</p></div>
      </aside>
      <main class="main-area">
        <header class="topbar">
          <button id="menuButton" class="icon-button menu-button" aria-label="Open menu">☰</button>
          <div><p class="eyebrow">Smart civic administration</p><h1>${pageTitle(activePage)}</h1></div>
          <div class="admin-chip"><div class="admin-avatar">${escapeHtml(initials)}</div><div><strong>${escapeHtml(profile?.displayName || "CivicResolve User")}</strong><span class="role-badge">${escapeHtml(roleLabel)}</span></div><button id="signOutButton" class="v2-icon-button signout-button" type="button" aria-label="Sign out" title="Sign out">↪</button></div>
        </header>
        <div id="pageContent" class="content-wrap"></div>
      </main>
      <div id="modalRoot"></div>
    </div>`;
}

function navLink(id, symbol, label) {
  return `<button class="nav-link ${activePage === id ? "active" : ""}" data-page="${id}"><span class="nav-symbol">${symbol}</span><span>${label}</span>${activePage === id ? '<span class="nav-arrow">›</span>' : ""}</button>`;
}

function renderApp() {
  if (!window.CivicAuth?.isAuthenticated()) {
    window.CivicAuth?.renderAuthScreen();
    return;
  }
  if (!window.CivicAuth.canAccess(activePage)) activePage = "dashboard";
  document.getElementById("app").innerHTML = appShell();
  document.getElementById("pageContent").innerHTML = renderPage();
  attachShellEvents();
  attachPageEvents();
}

function renderPage() {
  if (activePage === "submit") return renderSubmitPage();
  if (activePage === "track") return renderTrackPage();
  if (activePage === "admin") return renderAdminPage();
  if (activePage === "analytics") return renderAnalyticsPage();
  return renderDashboard();
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
  lastSubmitted = null;
  selectedComplaintId = null;
  trackingError = "";
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function statCard(label, value, icon, hint = "", tone = "") {
  return `<article class="stat-card ${tone}"><div class="stat-icon">${icon}</div><div><span>${label}</span><strong>${value}</strong>${hint ? `<small>${hint}</small>` : ""}</div></article>`;
}

function panel(title, subtitle, content, action = "") {
  return `<section class="panel"><div class="panel-header"><div><h3>${title}</h3><p>${subtitle}</p></div>${action}</div>${content}</section>`;
}

function dashboardHero() {
  const profile = authProfile();
  if (isCitizen()) return `<section class="hero-panel">
    <div>
      <span class="hero-kicker">✦ Citizen grievance services</span>
      <h2>Welcome, ${escapeHtml(profile?.displayName?.split(" ")[0] || "Citizen")}.</h2>
      <p>Report a civic issue, receive a grievance ID and follow every official update from one secure account.</p>
      <div class="hero-actions"><button class="primary-button" data-go="submit">+ Submit Complaint</button><button class="secondary-button" data-go="track">⌕ Track My Complaint</button></div>
    </div>
    <div class="hero-visual"><div class="pulse-ring">✓</div><div class="floating-card fc-one">✓ Personal case access</div><div class="floating-card fc-two">◷ Live status tracking</div></div>
  </section>`;

  return `<section class="hero-panel">
    <div>
      <span class="hero-kicker">✦ ${isOfficer() ? "Department operations" : "Municipal oversight"}</span>
      <h2>${isOfficer() ? `Manage ${escapeHtml(profile?.department || "department")} grievances.` : "Resolve public issues faster and more transparently."}</h2>
      <p>${isOfficer() ? "Review assigned cases, update progress and complete resolution work within the expected service window." : "Monitor every department, manage routing and priority, and maintain accountable grievance resolution."}</p>
      <div class="hero-actions"><button class="primary-button" data-go="admin">☷ Open Complaint Management</button><button class="secondary-button" data-go="analytics">▥ View Analytics</button></div>
    </div>
    <div class="hero-visual"><div class="pulse-ring">✓</div><div class="floating-card fc-one">✓ Role-protected access</div><div class="floating-card fc-two">⚠ Smart priority</div></div>
  </section>`;
}

function renderDashboard() {
  const scopedComplaints = visibleComplaints();
  const stats = getStats(scopedComplaints);
  const scopeLabel = isCitizen() ? "Your registered issues" : isOfficer() ? `Assigned to ${authProfile()?.department || "your department"}` : "All registered issues";
  return `<div class="page-stack">
    ${dashboardHero()}
    <section class="stats-grid">
      ${statCard("Total Complaints", stats.total, "☷", scopeLabel)}
      ${statCard("Pending", stats.pending, "◷", "Submitted or under review", "warning")}
      ${statCard("In Progress", stats.inProgress, "◉", "Assigned and being handled", "info")}
      ${statCard("Resolved", stats.resolved, "✓", `${stats.resolutionRate}% resolution rate`, "success")}
    </section>
    <section class="two-column-grid">
      ${panel("Complaints by category", "Distribution within your permitted complaint scope", renderDonut(countBy("category", scopedComplaints)))}
      ${panel("Complaint status", "Current workload in your permitted scope", renderBars(countBy("status", scopedComplaints), "#1f6f5f"))}
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
  if (!items.length) return '<div class="empty-table">⌕<p>No complaints match the selected filters.</p></div>';
  return `<div class="table-scroll"><table class="data-table"><thead><tr><th>ID</th><th>Complaint</th><th>Category</th><th>Priority</th><th>Status</th>${compact ? "" : "<th>Actions</th>"}</tr></thead><tbody>${items.map(item => `<tr>
    <td><strong>${escapeHtml(item.id)}</strong><span class="table-subtext">${formatDate(item.createdAt)}</span></td>
    <td><strong>${escapeHtml(item.title)}</strong><span class="table-subtext">${escapeHtml(item.location)}</span></td>
    <td>${escapeHtml(item.category)}</td><td>${priorityBadge(item.priority)}</td><td>${statusBadge(item.status)}</td>
    ${compact ? "" : `<td><div class="table-actions">${window.CivicAuth.canManageComplaint(item) ? `<button class="table-button" data-manage="${item.id}">Manage</button>` : ""}${window.CivicAuth.canDeleteComplaint() ? `<button class="delete-button" data-delete="${item.id}" title="Delete complaint">×</button>` : ""}</div></td>`}
  </tr>`).join("")}</tbody></table></div>`;
}

function renderSubmitPage() {
  if (lastSubmitted) return renderSubmissionSuccess(lastSubmitted);
  const profile = authProfile();
  return `<div class="form-layout">
    <form id="complaintForm" class="form-card">
      <div class="section-heading"><div class="section-icon">+</div><div><h2>Report a public issue</h2><p>Provide clear details so the correct department can respond quickly.</p></div></div>
      <div class="form-grid two">
        ${field("Full name", "citizenName", "Enter citizen name", true, "text", `value="${escapeHtml(profile?.displayName || "")}" readonly`)}
        ${field("Phone number", "phone", "10-digit mobile number", true, "tel", `pattern="[0-9]{10}" value="${escapeHtml(profile?.phone || "")}"`)}
      </div>
      ${field("Email address", "email", "name@example.com", true, "email", `value="${escapeHtml(profile?.email || "")}" readonly`)}
      ${field("Complaint title", "title", "Example: Streetlight not working", true)}
      <label class="field-label"><span>Detailed description</span><textarea id="description" name="description" placeholder="Describe the problem, how long it has existed and whether it creates danger." required minlength="15" rows="6"></textarea></label>
      ${field("Location / landmark", "location", "Example: Near Gandhipuram Bus Stand", true)}
      <div class="form-note">✓ This complaint will be securely linked to your signed-in citizen account.</div>
      <button class="primary-button full-width" type="submit">✦ Analyse and Submit Complaint</button>
    </form>
    <aside id="analysisCard" class="analysis-card">${renderEmptyAnalysis()}</aside>
  </div>`;
}

function field(label, name, placeholder, required = false, type = "text", extra = "") {
  return `<label class="field-label"><span>${label}</span><input id="${name}" name="${name}" type="${type}" placeholder="${placeholder}" ${required ? "required" : ""} ${extra}></label>`;
}

function renderEmptyAnalysis() {
  return `<div class="section-heading compact"><div class="section-icon purple">✦</div><div><h3>Smart analysis</h3><p>Live classification preview</p></div></div><div class="empty-analysis"><div class="big-icon">⌕</div><h3>Waiting for complaint details</h3><p>Start entering the title and description to view automatic classification.</p></div>`;
}

function renderAnalysis(analysis) {
  return `<div class="section-heading compact"><div class="section-icon purple">✦</div><div><h3>Smart analysis</h3><p>Live classification preview</p></div></div>
    <div class="analysis-results">
      ${analysisItem("Detected category", analysis.category)}
      ${analysisItem("Assigned department", analysis.department)}
      ${analysisItem("Priority level", priorityBadge(analysis.priority), true)}
      ${analysisItem("Estimated resolution", `${analysis.days} working day${analysis.days === 1 ? "" : "s"}`)}
      <div class="smart-message">✦<p>${smartAdvice(analysis.category, analysis.priority)}</p></div>
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
  return `<div class="success-page"><div class="success-icon">✓</div><p class="eyebrow">Complaint registered successfully</p><h2>${item.id}</h2><p>Save this grievance ID. It is required to track the complaint.</p>
    <div class="result-card">${resultRow("Category", item.category)}${resultRow("Department", item.department)}${resultRow("Priority", item.priority)}${resultRow("Expected resolution", formatDate(item.expectedResolutionDate))}</div>
    ${item.duplicateId ? `<div class="alert warning">⚠ <span>A similar unresolved complaint may already exist: <strong>${item.duplicateId}</strong>.</span></div>` : ""}
    <div class="button-row center"><button class="primary-button" data-success-go="track">⌕ Track Complaint</button><button class="secondary-button" id="submitAnother">Submit Another</button></div></div>`;
}

function resultRow(label, value) { return `<div class="result-row"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`; }

function renderTrackPage() {
  return `<div class="page-stack">
    <section class="track-hero"><div class="track-icon">⌕</div><p class="eyebrow">Protected progress tracking</p><h2>Track ${isCitizen() ? "your" : "an authorised"} grievance</h2><p>Enter a complaint ID available to your signed-in role.</p>
      <form id="trackForm" class="track-search"><input id="trackId" placeholder="Example: GRV-2026-001" required><button class="primary-button" type="submit">⌕ Track</button></form>
      ${window.CivicAuth.isDemoMode() ? '<button id="demoTrack" class="sample-link">Try permitted demo ID: GRV-2026-001</button>' : ""}
    </section>
    <div id="trackResult">${trackingResult ? renderTrackingResult(trackingResult) : ""}</div>
  </div>`;
}

function renderTrackingResult(item) {
  if (!item) return `<div class="alert error">⚠ <span>${escapeHtml(trackingError || "No complaint was found. Check the grievance ID and try again.")}</span></div>`;
  const currentIndex = STATUS_FLOW.indexOf(item.status);
  return `<section class="tracking-result">
    <div class="tracking-header"><div><p class="eyebrow">${escapeHtml(item.id)}</p><h2>${escapeHtml(item.title)}</h2>${statusBadge(item.status)}</div>${priorityBadge(item.priority + " priority").replace(`priority-${item.priority.toLowerCase()} priority`, `priority-${item.priority.toLowerCase()}`)}</div>
    <div class="details-grid">
      ${detailCard("◉", "Citizen", item.citizenName)}${detailCard("⌖", "Location", item.location)}${detailCard("▤", "Department", item.department)}${detailCard("◷", "Expected resolution", formatDate(item.expectedResolutionDate))}
    </div>
    <div class="description-block"><strong>Complaint description</strong><p>${escapeHtml(item.description)}</p></div>
    <div class="timeline-card"><h3>Status timeline</h3><div class="timeline">${STATUS_FLOW.map((status, index) => `<div class="timeline-step ${index <= currentIndex ? "complete" : ""} ${index === currentIndex ? "current" : ""}"><div class="timeline-marker">${index <= currentIndex ? "✓" : "○"}</div><span>${status}</span></div>`).join("")}</div></div>
    ${item.resolutionNote ? `<div class="resolution-note">✓<div><strong>Department update</strong><p>${escapeHtml(item.resolutionNote)}</p></div></div>` : ""}
    ${item.status === "Resolved" && isCitizen() && window.CivicAuth.ownsComplaint(item) ? renderFeedback(item) : ""}
  </section>`;
}

function detailCard(icon, label, value) { return `<article class="detail-card"><span class="detail-icon">${icon}</span><div><span>${label}</span><strong>${escapeHtml(value)}</strong></div></article>`; }

function renderFeedback(item) {
  const rating = item.rating || 5;
  return `<div class="feedback-card"><h3>Rate the resolution</h3><div id="stars" class="stars">${[1,2,3,4,5].map(value => `<button type="button" class="star ${value <= rating ? "active" : ""}" data-rating="${value}">★</button>`).join("")}</div><textarea id="feedbackText" rows="3" placeholder="Share your feedback about the resolution.">${escapeHtml(item.feedback || "")}</textarea><button id="saveFeedback" class="primary-button" data-id="${item.id}" data-rating="${rating}">Save Feedback</button></div>`;
}

function renderAdminPage() {
  const managedComplaints = visibleComplaints();
  const stats = getStats(managedComplaints);
  const subtitle = isOfficer() ? `Showing complaints assigned to ${authProfile()?.department || "your department"}` : "Search, assign and update citizen grievances";
  return `<div class="page-stack">
    <section class="stats-grid compact-stats">${statCard("Total", stats.total, "☷")}${statCard("High Priority", stats.highPriority, "⚠", "", "danger")}${statCard("Active Work", stats.inProgress, "◉", "", "info")}${statCard("Resolved", stats.resolved, "✓", "", "success")}</section>
    ${panel("Complaint management", subtitle, `<div class="filter-row"><div class="search-box">⌕<input id="adminSearch" placeholder="Search ID, title, citizen or location"></div><select id="statusFilter"><option>All</option>${STATUS_FLOW.map(s => `<option>${s}</option>`).join("")}</select><select id="priorityFilter"><option>All</option><option>High</option><option>Medium</option><option>Low</option></select></div><div id="adminTable">${complaintTable(managedComplaints)}</div>`, isAdministrator() ? '<button id="resetDemo" class="secondary-button small">Reset demo data</button>' : '<span class="role-badge">Department scope</span>')}
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
    <section class="insight-banner"><div class="section-icon purple">✦</div><div><p class="eyebrow">Operational intelligence</p><h2>Service performance overview</h2><p>${top ? `${escapeHtml(top.name)} currently has the highest workload with ${top.value} complaint${top.value === 1 ? "" : "s"}. The overall resolution rate is ${stats.resolutionRate}%.` : "No complaint data is available yet."}</p></div></section>
    <section class="stats-grid compact-stats">${statCard("Resolution Rate", `${stats.resolutionRate}%`, "◉", "", "success")}${statCard("High Priority", stats.highPriority, "⚠", "", "danger")}${statCard("Departments", departments.length, "⌂")}${statCard("Citizen Rating", avg === "—" ? avg : `${avg}/5`, "★", "", "warning")}</section>
    <section class="two-column-grid">${panel("Category distribution", "Most reported civic issue types", renderDonut(categories))}${panel("Priority mix", "Urgency distribution of registered complaints", renderBars(countBy("priority", scopedComplaints), "#7b4bb7"))}</section>
    ${panel("Department workload", "Number of complaints assigned to each department", renderBars(departments, "#1f6f5f"))}
  </div>`;
}

function attachPageEvents() {
  document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.go)));

  if (activePage === "submit") {
    if (lastSubmitted) {
      document.querySelector("[data-success-go]")?.addEventListener("click", () => { trackingResult = lastSubmitted; navigate("track"); });
      document.getElementById("submitAnother")?.addEventListener("click", () => { lastSubmitted = null; renderApp(); });
      return;
    }
    const title = document.getElementById("title");
    const description = document.getElementById("description");
    const updateAnalysis = () => {
      const combined = `${title.value}${description.value}`.trim();
      document.getElementById("analysisCard").innerHTML = combined.length >= 8 ? renderAnalysis(analyseComplaint(title.value, description.value)) : renderEmptyAnalysis();
    };
    title.addEventListener("input", updateAnalysis);
    description.addEventListener("input", updateAnalysis);
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

function submitComplaint(event) {
  event.preventDefault();
  if (!isCitizen()) {
    showToast("Only citizen accounts can submit complaints.");
    return;
  }
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const profile = authProfile();
  data.citizenName = profile?.displayName || data.citizenName;
  data.email = profile?.email || data.email;
  const analysis = analyseComplaint(data.title, data.description);
  const location = data.location.toLowerCase();
  const duplicate = complaints.find(item => item.status !== "Resolved" && item.category === analysis.category && (item.location.toLowerCase().includes(location) || location.includes(item.location.toLowerCase())));
  const maxNumber = complaints.reduce((max, item) => Math.max(max, Number(item.id.split("-").pop()) || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const complaint = {
    id: `GRV-${new Date().getFullYear()}-${String(maxNumber + 1).padStart(3, "0")}`,
    ...data,
    category: analysis.category,
    department: analysis.department,
    priority: analysis.priority,
    status: "Submitted",
    createdAt: today,
    expectedResolutionDate: addDays(today, analysis.days),
    resolutionNote: "",
    rating: null,
    feedback: "",
    duplicateId: duplicate?.id || "",
    createdByUid: profile?.uid || "",
    createdByEmail: profile?.email || ""
  };
  complaints.unshift(complaint);
  saveComplaints();
  lastSubmitted = complaint;
  showToast(`Complaint ${complaint.id} submitted successfully.`);
  renderApp();
}

function attachTrackingEvents() {
  if (!trackingResult || !isCitizen() || !window.CivicAuth.ownsComplaint(trackingResult)) return;
  let currentRating = trackingResult?.rating || 5;
  document.querySelectorAll("[data-rating]").forEach(button => button.addEventListener("click", () => {
    currentRating = Number(button.dataset.rating);
    document.querySelectorAll("[data-rating]").forEach(star => star.classList.toggle("active", Number(star.dataset.rating) <= currentRating));
    const saveButton = document.getElementById("saveFeedback");
    if (saveButton) saveButton.dataset.rating = currentRating;
  }));
  document.getElementById("saveFeedback")?.addEventListener("click", event => {
    const id = event.currentTarget.dataset.id;
    const rating = Number(event.currentTarget.dataset.rating || currentRating);
    const feedback = document.getElementById("feedbackText").value.trim();
    const item = complaints.find(complaint => complaint.id === id);
    if (!item) return;
    item.rating = rating;
    item.feedback = feedback;
    trackingResult = item;
    saveComplaints();
    showToast("Feedback saved successfully.");
  });
}

function attachAdminEvents() {
  if (!window.CivicAuth.canAccess("admin")) return;
  const search = document.getElementById("adminSearch");
  const status = document.getElementById("statusFilter");
  const priority = document.getElementById("priorityFilter");
  const refresh = () => {
    const text = search.value.toLowerCase();
    const filtered = visibleComplaints().filter(item => `${item.id} ${item.title} ${item.citizenName} ${item.location}`.toLowerCase().includes(text)
      && (status.value === "All" || item.status === status.value)
      && (priority.value === "All" || item.priority === priority.value));
    document.getElementById("adminTable").innerHTML = complaintTable(filtered);
    attachTableEvents();
  };
  search.addEventListener("input", refresh);
  status.addEventListener("change", refresh);
  priority.addEventListener("change", refresh);
  document.getElementById("resetDemo")?.addEventListener("click", () => {
    if (!isAdministrator()) return;
    if (!confirm("Reset all data to the original demo complaints?")) return;
    complaints = structuredClone(SAMPLE_COMPLAINTS);
    saveComplaints();
    showToast("Demo data restored.");
    renderApp();
  });
  attachTableEvents();
}

function attachTableEvents() {
  document.querySelectorAll("[data-manage]").forEach(button => button.addEventListener("click", () => openManageModal(button.dataset.manage)));
  document.querySelectorAll("[data-delete]").forEach(button => button.addEventListener("click", () => {
    if (!window.CivicAuth.canDeleteComplaint()) {
      showToast("Only administrators can delete complaints.");
      return;
    }
    const id = button.dataset.delete;
    if (!confirm(`Delete complaint ${id}?`)) return;
    complaints = complaints.filter(item => item.id !== id);
    saveComplaints();
    showToast(`Complaint ${id} deleted.`);
    renderApp();
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
    <div class="modal-header"><div><p class="eyebrow">${item.id}</p><h2>Update complaint</h2></div><button id="closeModal" class="icon-button">✕</button></div>
    <div class="modal-summary"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.location)}</span></div>
    <label class="field-label"><span>Status</span><select id="modalStatus">${STATUS_FLOW.map(status => `<option ${status === item.status ? "selected" : ""}>${status}</option>`).join("")}</select></label>
    <label class="field-label"><span>Priority ${isOfficer() ? "(administrator controlled)" : ""}</span><select id="modalPriority" ${adminOnly}>${["High","Medium","Low"].map(priority => `<option ${priority === item.priority ? "selected" : ""}>${priority}</option>`).join("")}</select></label>
    <label class="field-label"><span>Assigned department ${isOfficer() ? "(fixed to your department)" : ""}</span><input id="modalDepartment" value="${escapeHtml(item.department)}" ${adminOnly}></label>
    <label class="field-label"><span>Resolution / progress note</span><textarea id="modalNote" rows="5" placeholder="Add an official progress update.">${escapeHtml(item.resolutionNote || "")}</textarea></label>
    <div class="button-row end"><button id="cancelModal" class="secondary-button">Cancel</button><button id="saveModal" class="primary-button">Save Changes</button></div>
  </div></div>`;
  const close = () => { document.getElementById("modalRoot").innerHTML = ""; selectedComplaintId = null; };
  document.getElementById("closeModal").addEventListener("click", close);
  document.getElementById("cancelModal").addEventListener("click", close);
  document.getElementById("modalBackdrop").addEventListener("click", event => { if (event.target.id === "modalBackdrop") close(); });
  document.getElementById("saveModal").addEventListener("click", () => {
    if (!window.CivicAuth.canManageComplaint(item)) {
      showToast("Your role can no longer update this complaint.");
      close();
      return;
    }
    item.status = document.getElementById("modalStatus").value;
    if (isAdministrator()) {
      item.priority = document.getElementById("modalPriority").value;
      item.department = document.getElementById("modalDepartment").value.trim();
    }
    item.resolutionNote = document.getElementById("modalNote").value.trim();
    saveComplaints();
    showToast(`Complaint ${id} updated.`);
    close();
    renderApp();
  });
}

window.CivicAuth.ready().then(() => {
  if (window.CivicAuth.isAuthenticated()) renderApp();
  else window.CivicAuth.renderAuthScreen();
});

document.addEventListener("civic-auth-changed", event => {
  lastSubmitted = null;
  trackingResult = null;
  trackingError = "";
  selectedComplaintId = null;
  activePage = "dashboard";
  if (event.detail.authenticated) renderApp();
});
