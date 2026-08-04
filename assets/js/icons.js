(() => {
  const paths = Object.freeze({
    "activity": '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    "alert-circle": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    "alert-triangle": '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
    "arrow-right": '<path d="M5 12h14M13 6l6 6-6 6"/>',
    "bar-chart": '<path d="M3 3v18h18M7 16v-3M12 16V8M17 16V5"/>',
    "bell": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    "building": '<path d="M3 21h18M6 21V7l6-4 6 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
    "calendar": '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    "check": '<path d="m5 12 4 4L19 6"/>',
    "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    "clipboard-list": '<rect width="16" height="18" x="4" y="3" rx="2"/><path d="M9 3V2h6v1M8 8h.01M12 8h4M8 12h.01M12 12h4M8 16h.01M12 16h4"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    "file-plus": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
    "file-text": '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
    "flag": '<path d="M4 22V4M4 4h11l-1 4 1 4H4"/>',
    "inbox": '<path d="M4 4h16l2 11h-6l-2 3h-4l-2-3H2Z"/><path d="M4 4 2 15v5h20v-5L20 4"/>',
    "layout-dashboard": '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
    "lock": '<rect width="18" height="12" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/>',
    "log-out": '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    "map-pin": '<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    "menu": '<path d="M4 6h16M4 12h16M4 18h16"/>',
    "moon": '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
    "refresh": '<path d="M20 6v5h-5M4 18v-5h5"/><path d="M18.4 9A7 7 0 0 0 6 6.6L4 11M20 13l-2 4.4A7 7 0 0 1 5.6 15"/>',
    "search": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    "shield-check": '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-5"/>',
    "sparkles": '<path d="m12 3-1.8 4.2L6 9l4.2 1.8L12 15l1.8-4.2L18 9l-4.2-1.8ZM5 16l-.8 1.8L2.5 19l1.7.8L5 22l.8-2.2 1.7-.8-1.7-1.2ZM19 14l-1 2.3-2 .7 2 1 1 2 1-2 2-1-2-.7Z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "trash": '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
    "upload": '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M20 15v5H4v-5"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    "x": '<path d="M18 6 6 18M6 6l12 12"/>',
    "zap": '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>'
  });

  function render(name, className = "", size = 20) {
    const body = paths[name] || paths["alert-circle"];
    const safeClass = String(className).replace(/[^a-zA-Z0-9_ -]/g, "");
    const safeSize = Math.max(12, Math.min(48, Number(size) || 20));
    return `<svg class="civic-icon ${safeClass}" width="${safeSize}" height="${safeSize}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  window.CivicIcons = Object.freeze({ render, names: Object.freeze(Object.keys(paths)) });
})();
