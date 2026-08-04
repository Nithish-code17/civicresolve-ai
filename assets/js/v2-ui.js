(() => {
  const THEME_KEY = "civicresolve_v2_theme";
  let enhancedShell = null;
  let closeSlaNotifications = null;

  function icon(name, size = 18) {
    return window.CivicIcons?.render(name, "", size) || "";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const button = document.getElementById("v2ThemeToggle");
    if (button) {
      button.innerHTML = icon(theme === "dark" ? "sun" : "moon", 17);
      button.title = theme === "dark" ? "Use light theme" : "Use dark theme";
    }
  }

  function openGlobalSearch() {
    if (!window.CivicAuth?.canAccess("admin")) return;
    const modal = document.createElement("div");
    modal.className = "v2-command-backdrop";
    modal.innerHTML = `
      <section class="v2-command" role="dialog" aria-modal="true" aria-label="Search complaints">
        <div class="v2-command-input"><span>${icon("search", 19)}</span><input id="v2CommandInput" placeholder="Search by grievance ID, citizen, title or location" autofocus><kbd>Esc</kbd></div>
        <div class="v2-command-help"><span>Press Enter to open complaint management</span><button type="button" id="v2CommandClose">Close</button></div>
      </section>`;
    document.body.appendChild(modal);
    const input = modal.querySelector("#v2CommandInput");
    const close = () => modal.remove();
    modal.addEventListener("click", event => { if (event.target === modal) close(); });
    modal.querySelector("#v2CommandClose").addEventListener("click", close);
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") close();
      if (event.key === "Enter") {
        const query = input.value.trim();
        document.querySelector('[data-page="admin"]')?.click();
        setTimeout(() => {
          const adminSearch = document.getElementById("adminSearch");
          if (adminSearch) {
            adminSearch.value = query;
            adminSearch.dispatchEvent(new Event("input", { bubbles: true }));
            adminSearch.focus();
          }
        }, 80);
        close();
      }
    });
    setTimeout(() => input.focus(), 30);
  }

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function alertDeadline(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Deadline unavailable";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function openSlaNotifications() {
    closeSlaNotifications?.();
    const alerts = window.CivicSlaAlerts?.list() || [];
    const panel = document.createElement("section");
    panel.className = "v2-notification-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "SLA alerts");
    panel.innerHTML = `<div class="v2-notification-heading"><div><span>Automatic SLA alerts</span><strong>${alerts.length ? `${alerts.length} complaint${alerts.length === 1 ? "" : "s"} need attention` : "No urgent deadlines"}</strong></div><button type="button" aria-label="Close alerts">${icon("x", 16)}</button></div>
      <div class="v2-notification-list">${alerts.length ? alerts.map(alert => `<button type="button" class="v2-notification-item sla-${escapeHtml(alert.state)}" data-notification-id="${escapeHtml(alert.id)}"><span>${icon(alert.state === "overdue" ? "alert-triangle" : "clock", 16)}</span><div><strong>${escapeHtml(alert.title)}</strong><small>${escapeHtml(alert.id)} · ${escapeHtml(alert.label)}</small><time>${escapeHtml(alertDeadline(alert.deadlineAt))} · ${escapeHtml(alert.department)}</time></div></button>`).join("") : `<div class="v2-notification-empty">${icon("check-circle", 23)}<strong>Everything is on track</strong><p>No overdue or due-soon complaints are visible to your role.</p></div>`}</div>`;
    document.body.appendChild(panel);
    const onOutsideClick = event => {
      if (panel.contains(event.target) || event.target.closest?.(".v2-notification")) return;
      close();
    };
    const close = () => {
      panel.remove();
      document.removeEventListener("click", onOutsideClick);
      if (closeSlaNotifications === close) closeSlaNotifications = null;
    };
    closeSlaNotifications = close;
    panel.querySelector(".v2-notification-heading button").addEventListener("click", close);
    panel.querySelectorAll("[data-notification-id]").forEach(button => button.addEventListener("click", () => {
      const id = button.dataset.notificationId;
      close();
      window.CivicSlaAlerts?.open(id);
    }));
    setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
  }

  function enhanceShell() {
    const shell = document.querySelector(".app-shell");
    if (!shell || shell === enhancedShell) return;
    enhancedShell = shell;
    shell.classList.add("v2-shell");

    const topbar = document.querySelector(".topbar");
    const adminChip = document.querySelector(".admin-chip");
    if (topbar && adminChip && !document.getElementById("v2Toolbar")) {
      const canSearchComplaints = window.CivicAuth?.canAccess("admin");
      const slaAlertCount = window.CivicSlaAlerts?.list()?.length || 0;
      const toolbar = document.createElement("div");
      toolbar.id = "v2Toolbar";
      toolbar.className = "v2-toolbar";
      toolbar.innerHTML = `
        ${canSearchComplaints ? `<button type="button" id="v2GlobalSearch" class="v2-search-trigger"><span>${icon("search", 15)}</span><span>Search complaints</span><kbd>Ctrl K</kbd></button>` : ""}
        <button type="button" id="v2ThemeToggle" class="v2-icon-button" aria-label="Toggle colour theme"></button>
        <button type="button" class="v2-icon-button v2-notification" aria-label="SLA notifications" title="SLA notifications">${icon("bell", 17)}${slaAlertCount ? `<i>${Math.min(slaAlertCount, 99)}</i>` : ""}</button>`;
      topbar.insertBefore(toolbar, adminChip);
      toolbar.querySelector("#v2GlobalSearch")?.addEventListener("click", openGlobalSearch);
      toolbar.querySelector("#v2ThemeToggle").addEventListener("click", () => {
        applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      });
      toolbar.querySelector(".v2-notification").addEventListener("click", openSlaNotifications);
      applyTheme(localStorage.getItem(THEME_KEY) || "light");
    }

    document.querySelectorAll(".stat-card").forEach((card, index) => card.style.setProperty("--card-index", index));
    document.querySelectorAll(".panel").forEach((panel, index) => panel.style.setProperty("--panel-index", index));

    const pageContent = document.getElementById("pageContent");
    if (pageContent) {
      pageContent.classList.remove("v2-enter");
      requestAnimationFrame(() => pageContent.classList.add("v2-enter"));
    }
  }

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (window.CivicAuth?.canAccess("admin") && !document.querySelector(".v2-command-backdrop")) openGlobalSearch();
    }
  });

  const observer = new MutationObserver(enhanceShell);
  observer.observe(document.getElementById("app"), { childList: true, subtree: true });
  enhanceShell();
})();
