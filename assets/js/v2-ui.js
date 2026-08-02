(() => {
  const THEME_KEY = "civicresolve_v2_theme";
  let enhancedShell = null;

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    const button = document.getElementById("v2ThemeToggle");
    if (button) {
      button.textContent = theme === "dark" ? "☀" : "☾";
      button.title = theme === "dark" ? "Use light theme" : "Use dark theme";
    }
  }

  function openGlobalSearch() {
    const modal = document.createElement("div");
    modal.className = "v2-command-backdrop";
    modal.innerHTML = `
      <section class="v2-command" role="dialog" aria-modal="true" aria-label="Search complaints">
        <div class="v2-command-input"><span>⌕</span><input id="v2CommandInput" placeholder="Search by grievance ID, citizen, title or location" autofocus><kbd>Esc</kbd></div>
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

  function enhanceShell() {
    const shell = document.querySelector(".app-shell");
    if (!shell || shell === enhancedShell) return;
    enhancedShell = shell;
    shell.classList.add("v2-shell");

    const topbar = document.querySelector(".topbar");
    const adminChip = document.querySelector(".admin-chip");
    if (topbar && adminChip && !document.getElementById("v2Toolbar")) {
      const toolbar = document.createElement("div");
      toolbar.id = "v2Toolbar";
      toolbar.className = "v2-toolbar";
      toolbar.innerHTML = `
        <button type="button" id="v2GlobalSearch" class="v2-search-trigger"><span>⌕</span><span>Search complaints</span><kbd>Ctrl K</kbd></button>
        <button type="button" id="v2ThemeToggle" class="v2-icon-button" aria-label="Toggle colour theme"></button>
        <button type="button" class="v2-icon-button v2-notification" aria-label="Notifications">♢<i></i></button>`;
      topbar.insertBefore(toolbar, adminChip);
      toolbar.querySelector("#v2GlobalSearch").addEventListener("click", openGlobalSearch);
      toolbar.querySelector("#v2ThemeToggle").addEventListener("click", () => {
        applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
      });
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
      if (!document.querySelector(".v2-command-backdrop")) openGlobalSearch();
    }
  });

  const observer = new MutationObserver(enhanceShell);
  observer.observe(document.getElementById("app"), { childList: true, subtree: true });
  enhanceShell();
})();
