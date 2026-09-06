/*
 * LocalBot demo bridge for @animated-color-icons/lucide-wc.
 *
 * The preferred path is the native ES-module loader in index.html. This small
 * classic-script fallback keeps the prototype animated in embedded WebViews
 * that do not execute module scripts. Production/Tauri should bundle the
 * pinned package locally instead of evaluating CDN source at runtime.
 */
(() => {
  const iconModules = [
    "Activity", "ArrowRight", "Brain", "Check", "Ellipsis", "House", "List", "ListPlus",
    "Menu", "Moon", "Music2", "Pause", "Play", "Plus", "Power", "Repeat2", "Search",
    "Server", "Settings", "ShieldCheck", "Shuffle", "SkipBack", "SkipForward",
    "SlidersHorizontal", "Sun", "SunMoon", "Trash2", "Users", "Volume2", "X",
  ];

  const tagNameFor = (moduleName) => moduleName
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();

  const runModuleSource = (source) => {
    const executableSource = source
      .replace(/export\s*\{[\s\S]*?\};?\s*$/m, "")
      .replace(/export\s+default\s+[A-Za-z_$][\w$]*;?\s*$/m, "");
    new Function(executableSource)();
  };

  const loadModule = async (moduleName) => {
    const tagName = `animated-lucide-${tagNameFor(moduleName)}`;
    if (window.customElements?.get(tagName)) return { name: moduleName, status: "already-defined" };

    const response = await fetch(`https://cdn.jsdelivr.net/npm/@animated-color-icons/lucide-wc@1.0.0/${moduleName}.js`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    runModuleSource(await response.text());
    if (!window.customElements?.get(tagName)) throw new Error(`Chưa đăng ký ${tagName}`);
    return { name: moduleName, status: "loaded" };
  };

  const settle = (moduleName) => loadModule(moduleName)
    .then((result) => ({ name: moduleName, status: result.status, reason: "" }))
    .catch((reason) => ({ name: moduleName, status: "rejected", reason: String(reason?.message || reason) }));

  Promise.all(iconModules.map(settle)).then(() => window.dispatchEvent(new Event("localbot-icons-ready")));
})();
