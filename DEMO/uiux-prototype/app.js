const root = document.documentElement;
const navigationStage = document.querySelector("#navigationStage");
const menuZone = document.querySelector("#menuZone");
const menuTrigger = document.querySelector("#menuTrigger");
const primaryMenu = document.querySelector("#primaryMenu");
const contextNav = document.querySelector("#contextNav");
const pageArea = document.querySelector("#pageArea");
const themeToggle = document.querySelector("#themeToggle");
const settingsQuick = document.querySelector("#settingsQuick");
const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toastMessage");
const toastClose = document.querySelector("#toastClose");
const themeStorageKey = "localbot-prototype-theme-v2";
const savedTheme = localStorage.getItem(themeStorageKey) ?? localStorage.getItem("localbot-prototype-theme");
const initialTheme = savedTheme === "default" && !localStorage.getItem(themeStorageKey) ? "dark" : savedTheme || "dark";

const lucideNames = {
  menu: "menu",
  sunmoon: "sun-moon",
  moon: "moon",
  sun: "sun",
  search: "search",
  music: "music-2",
  play: "play",
  pause: "pause",
  "skip-back": "skip-back",
  "skip-forward": "skip-forward",
  volume: "volume-2",
  repeat: "repeat-2",
  "repeat-one": "repeat-1",
  shuffle: "shuffle",
  list: "list",
  plus: "plus",
  more: "ellipsis",
  check: "check",
  x: "x",
  trash: "trash-2",
  arrow: "arrow-right",
  home: "house",
  server: "server",
  users: "users",
  shield: "shield-check",
  activity: "activity",
  settings: "settings",
  sliders: "sliders-horizontal",
  playlist: "list-plus",
  brain: "brain",
  power: "power",
};

const animatedLucideNames = new Set(Object.keys(lucideNames));

const icon = (name, className = "icon") => {
  const lucideName = lucideNames[name] || "";
  const lucideAttribute = lucideName ? ` data-lucide="${lucideName}"` : "";
  const animated = lucideName && animatedLucideNames.has(name) ? ` data-animated-lucide="${lucideName}"` : "";
  return `<i class="${className} icon-host al-icon-wrapper"${lucideAttribute} data-icon-name="${name}"${animated} aria-hidden="true"><svg class="icon-fallback" aria-hidden="true"><use href="#icon-${name}"></use></svg></i>`;
};

const motionRuntime = { animate: null, stagger: null };
import("https://cdn.jsdelivr.net/npm/motion@13.1.1/+esm")
  .then((module) => {
    motionRuntime.animate = module.animate;
    motionRuntime.stagger = module.stagger;
  })
  .catch(() => {});

const escapeHTML = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const state = {
  primary: "overview",
  musicTab: "now",
  theme: initialTheme,
  outputTargets: ["discord"],
  playing: true,
  progress: 42,
  volume: 64,
  muted: false,
  shuffleMode: "off",
  repeatMode: "off",
  menuOpen: false,
  queue: [
    { title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", duration: "04:09", source: "YouTube" },
    { title: "Lạc Trôi", artist: "Sơn Tùng M-TP", duration: "04:20", source: "YouTube" },
    { title: "Muộn Rồi Mà Sao Còn", artist: "Sơn Tùng M-TP", duration: "04:26", source: "SoundCloud" },
    { title: "Có Chắc Yêu Là Đây", artist: "Sơn Tùng M-TP", duration: "03:44", source: "YouTube" },
    { title: "Chúng Ta Của Hiện Tại", artist: "Sơn Tùng M-TP", duration: "05:01", source: "SoundCloud" },
  ],
  playlists: [
    { name: "Chill Vibes", count: 12, description: "Nhạc nhẹ để tập trung và thư giãn." },
    { name: "Tối nay nghe gì", count: 8, description: "Danh sách riêng cho những buổi tối yên." },
  ],
};

const outputMeta = {
  discord: { label: "Discord", icon: "server", detail: "Voice channel · chính" },
  windows: { label: "Windows", icon: "volume", detail: "Loa local · phụ" },
};

const repeatMeta = {
  off: { icon: "repeat-off", label: "Lặp tắt", toast: "Đã tắt lặp" },
  all: { icon: "repeat", label: "Lặp hàng đợi", toast: "Đang lặp toàn bộ hàng đợi" },
  one: { icon: "repeat-one", label: "Lặp một bài", toast: "Đang lặp một bài" },
};

function outputLabel() {
  return state.outputTargets.map((target) => outputMeta[target].label).join(" + ");
}

const contexts = {
  music: [
    ["discover", "Khám phá", "search"],
    ["now", "Đang phát", "play"],
    ["queue", "Hàng đợi", "list"],
    ["playlists", "Danh sách phát", "playlist"],
    ["equalizer", "Equalizer", "sliders"],
  ],
  overview: [["home", "Tổng quan", "home"]],
  community: [["community", "Cộng đồng", "users"]],
  safety: [["safety", "An toàn", "shield"]],
  settings: [
    ["settings", "Cài đặt chung", "settings"],
    ["permissions", "Quyền sử dụng lệnh", "users"],
    ["ai", "AI & Brain", "brain"],
  ],
};

function appendAnimatedIconStyles(iconName, sourceStyles) {
  const cleanedStyles = sourceStyles
    .replaceAll(":host { display: inline-flex; }", "")
    .replaceAll(".animated-lucide-icon:hover", ".animated-lucide-icon:is(:hover, .is-action-hover)")
    .replaceAll(".al-icon-wrapper:hover", ".al-icon-wrapper:is(:hover, .is-action-hover)")
    .trim();
  if (!cleanedStyles) return;

  let animatedStyles = document.querySelector("style[data-animated-icon-styles]");
  if (!animatedStyles) {
    animatedStyles = document.createElement("style");
    animatedStyles.dataset.animatedIconStyles = "true";
    animatedStyles.dataset.loadedSources = "";
    document.head.append(animatedStyles);
  }

  const loadedSources = new Set((animatedStyles.dataset.loadedSources || "").split(" ").filter(Boolean));
  if (loadedSources.has(iconName)) return;
  if (!animatedStyles.textContent.includes(cleanedStyles)) animatedStyles.append(`\n/* ${iconName} */\n${cleanedStyles}\n`);
  loadedSources.add(iconName);
  animatedStyles.dataset.loadedSources = [...loadedSources].join(" ");
}

function bindIconMotionTargets() {
  document.querySelectorAll("button, a").forEach((control) => {
    const host = control.querySelector(".icon-host");
    if (!host || host.dataset.motionBound === "true") return;

    const enter = () => {
      if (!prefersReducedMotion()) host.classList.add("is-action-hover");
    };
    const leave = () => host.classList.remove("is-action-hover");
    control.addEventListener("pointerenter", enter, { passive: true });
    control.addEventListener("pointerleave", leave, { passive: true });
    control.addEventListener("focusin", enter);
    control.addEventListener("focusout", leave);
    host.dataset.motionBound = "true";
  });
}

function hydrateIcons() {
  document.querySelectorAll("[data-lucide]:not([data-animated-promoted]), [data-animated-lucide]:not([data-animated-promoted])").forEach((host) => {
    const semanticName = host.dataset.iconName || "";
    const iconName = host.dataset.animatedLucide || (
      animatedLucideNames.has(semanticName) ? host.dataset.lucide : ""
    );
    if (!iconName) return;
    const tagName = `animated-lucide-${iconName}`;
    if (!window.customElements?.get(tagName)) return;

    const animatedIcon = document.createElement(tagName);
    animatedIcon.setAttribute("size", "20");
    animatedIcon.setAttribute("stroke-width", "1.8");
    animatedIcon.setAttribute("aria-hidden", "true");
    const sourceSvg = animatedIcon.shadowRoot?.querySelector("svg");
    if (!sourceSvg) return;

    const sourceStyles = animatedIcon.shadowRoot.querySelector("style")?.textContent || "";
    appendAnimatedIconStyles(iconName, sourceStyles);

    const wrapper = document.createElement("span");
    wrapper.setAttribute("class", host.getAttribute("class") || "icon icon-host al-icon-wrapper");
    wrapper.classList.add("icon-host", "al-icon-wrapper");
    wrapper.dataset.animatedLucide = iconName;
    wrapper.dataset.animatedPromoted = "true";
    wrapper.dataset.iconName = host.dataset.iconName || "";
    wrapper.setAttribute("aria-hidden", "true");
    const clonedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    [...sourceSvg.attributes].forEach((attribute) => clonedSvg.setAttribute(attribute.name, attribute.value));
    sourceSvg.querySelectorAll("path,circle,rect,line,polyline,polygon,ellipse").forEach((shape) => {
      const clonedShape = document.createElementNS("http://www.w3.org/2000/svg", shape.localName);
      [...shape.attributes].forEach((attribute) => clonedShape.setAttribute(attribute.name, attribute.value));
      clonedSvg.append(clonedShape);
    });
    clonedSvg.classList.add("icon");
    if (host.classList?.contains("icon-menu")) clonedSvg.classList.add("icon-menu");
    clonedSvg.setAttribute("aria-hidden", "true");
    wrapper.append(clonedSvg);
    host.replaceWith(wrapper);
  });

  const iconHosts = document.querySelectorAll("[data-lucide]:not(iconify-icon)");
  if (!iconHosts.length) {
    bindIconMotionTargets();
    return;
  }

  if (window.lucide?.createIcons) {
    try {
      window.lucide.createIcons({ attrs: { "stroke-width": "1.8", "aria-hidden": "true" } });
      document.querySelectorAll("svg.lucide").forEach((svg) => {
        svg.classList.add("icon");
        svg.setAttribute("aria-hidden", "true");
      });
    } catch {
      // The inline sprite below remains the deterministic fallback.
    }
  }

  if (document.querySelectorAll("[data-lucide]:not(iconify-icon)").length && window.customElements?.get("iconify-icon")) {
    document.querySelectorAll("[data-lucide]:not(iconify-icon)").forEach((host) => {
      const iconifyIcon = document.createElement("iconify-icon");
      iconifyIcon.setAttribute("icon", `lucide:${host.dataset.lucide}`);
      iconifyIcon.setAttribute("class", host.getAttribute("class") || "icon icon-host al-icon-wrapper");
      iconifyIcon.classList.add("icon-host", "al-icon-wrapper");
      iconifyIcon.setAttribute("aria-hidden", "true");
      iconifyIcon.dataset.iconName = host.dataset.iconName || "";
      const animatedName = host.dataset.animatedLucide || (
        animatedLucideNames.has(host.dataset.iconName || "") ? host.dataset.lucide : ""
      );
      if (animatedName) iconifyIcon.dataset.animatedLucide = animatedName;
      host.replaceWith(iconifyIcon);
    });
  }

  bindIconMotionTargets();
}

function setTheme(theme) {
  state.theme = theme;
  root.dataset.theme = theme;
  localStorage.setItem(themeStorageKey, theme);
  themeToggle.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
  });
  document.querySelectorAll("[data-theme]").forEach((button) => {
    const active = button.dataset.theme === theme;
    button.classList.toggle("primary", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.classList.add("is-visible");
  toast.setAttribute("aria-hidden", "false");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(hideToast, 3200);
}

function hideToast() {
  toast.classList.remove("is-visible");
  toast.setAttribute("aria-hidden", "true");
}

function openMenu() {
  window.clearTimeout(scheduleClose.timer);
  state.menuOpen = true;
  navigationStage.classList.add("is-open");
  menuTrigger.setAttribute("aria-expanded", "true");
  syncNavigationOffset();
}

function closeMenu() {
  window.clearTimeout(scheduleClose.timer);
  state.menuOpen = false;
  navigationStage.classList.remove("is-open");
  menuTrigger.setAttribute("aria-expanded", "false");
  navigationStage.style.setProperty("--nav-open-offset", "0px");
}

function syncNavigationOffset() {
  if (!state.menuOpen) return;
  const stageRect = navigationStage.getBoundingClientRect();
  const menuStyle = getComputedStyle(primaryMenu);
  const menuTop = stageRect.top + (Number.parseFloat(menuStyle.top) || 0);
  const menuBottom = menuTop + primaryMenu.offsetHeight;
  const contextRect = contextNav.getBoundingClientRect();
  const currentOffset = Number.parseFloat(getComputedStyle(navigationStage).getPropertyValue("--nav-open-offset")) || 0;
  const untransformedContextTop = contextRect.top - currentOffset;
  const overlap = Math.max(0, menuBottom - untransformedContextTop + 12);
  navigationStage.style.setProperty("--nav-open-offset", `${Math.ceil(overlap)}px`);
}

function scheduleClose() {
  window.clearTimeout(scheduleClose.timer);
  scheduleClose.timer = window.setTimeout(() => {
    const focusIsInsideNavigation = navigationStage.contains(document.activeElement);
    if (!navigationStage.matches(":hover") && !focusIsInsideNavigation) closeMenu();
  }, 120);
}

function renderContextNav() {
  const items = contexts[state.primary] || contexts.overview;
  const active = state.primary === "music" ? state.musicTab : items[0][0];
  contextNav.setAttribute("aria-label", `Điều hướng ${state.primary}`);
  contextNav.innerHTML = items.map(([key, label, iconName]) => `
    <button type="button" class="context-item ${active === key ? "is-active" : ""}" data-context="${key}" aria-current="${active === key ? "page" : "false"}">
      ${icon(iconName)}<span>${label}</span>
    </button>
  `).join("");
}

function pageHeader(title, subtitle, action = "") {
  return `
    <div class="page-header">
      <div class="page-heading">
        <p class="eyebrow">${state.primary === "music" ? "Âm nhạc" : "LocalBot"}</p>
        <h1>${title}</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      <div class="server-picker" role="button" tabindex="0" aria-label="Máy chủ đang chọn: Local Community">
        <span class="server-avatar">${icon("server")}</span>
        <span class="server-picker-copy"><strong>Local Community</strong><span>128 thành viên · local</span></span>
        ${icon("more")}
      </div>
      ${action}
    </div>
  `;
}

function sourceBadge(source, compact = false) {
  const label = escapeHTML(source);
  return `<span class="source-tag${compact ? " source-tag-compact" : ""}" data-source="${label}"><span class="source-mark" aria-hidden="true"></span>${label}</span>`;
}

function sourceBadges(sources) {
  const uniqueSources = [...new Set(sources.filter(Boolean))];
  return `<span class="source-tags" aria-label="Nguồn: ${escapeHTML(uniqueSources.join(", "))}">${uniqueSources.map((source) => sourceBadge(source)).join("")}</span>`;
}

function queueItem(item, index, options = {}) {
  const controls = options.compact
    ? `${icon("more")}`
    : `<button type="button" class="drag-handle" data-action="remove-queue" data-index="${index}" aria-label="Xóa ${escapeHTML(item.title)} khỏi hàng đợi" title="Xóa khỏi hàng đợi">${icon("x")}</button>`;
  return `
    <div class="queue-item" data-queue-index="${index}">
      <span class="queue-index">${String(index + 1).padStart(2, "0")}</span>
      <div class="queue-track"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.artist)} · ${escapeHTML(item.duration)} · ${sourceBadge(item.source || "YouTube", true)}</span></div>
      <span class="queue-duration">${escapeHTML(item.duration)}</span>
      ${controls}
    </div>
  `;
}

function targetButtons() {
  return `
    <div class="target-row" role="group" aria-labelledby="targetHeading">
      <div class="target-heading">
        <div><strong id="targetHeading">Phát đến</strong><span>Có thể bật một hoặc cả hai đích cùng lúc.</span></div>
        <span class="target-count">${state.outputTargets.length}/2</span>
      </div>
      <div class="target-options">
        ${Object.entries(outputMeta).map(([key, target]) => `
          <button type="button" class="target-button ${state.outputTargets.includes(key) ? "is-active" : ""} ${key === "windows" ? "is-secondary" : ""}" data-action="set-output" data-output="${key}" aria-pressed="${state.outputTargets.includes(key)}">
            <span class="target-icon">${icon(target.icon)}</span>
            <span class="target-copy"><strong>${target.label}</strong><small>${target.detail}</small></span>
            <span class="target-check" aria-hidden="true">${icon("check")}</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function nowPlayingScreen() {
  const volumeValue = state.muted ? 0 : state.volume;
  const volumeLabel = state.muted ? "Bật âm lượng" : `Âm lượng ${state.volume} phần trăm`;
  const repeat = repeatMeta[state.repeatMode];
  const shuffleActive = state.shuffleMode !== "off";
  const shuffleLabel = shuffleActive ? "Phát ngẫu nhiên: bật" : "Phát ngẫu nhiên: tắt";
  return `
    ${pageHeader("Đang phát", "Điều khiển nhạc và theo dõi hàng đợi trong một nơi.")}
    <div class="screen-grid two-column">
      <article class="card player-card">
        <header class="card-header"><h2>${icon("play")} Đang phát</h2><span class="chip">Phát: ${outputLabel()}</span></header>
        <div class="card-body">
          <div class="player-layout">
            <div class="artwork" aria-label="Artwork mẫu của Nơi Này Có Anh"><span class="artwork-mark">${icon("music")}</span></div>
            <div class="track-copy">
              <h3>Nơi Này Có Anh</h3>
              <p>Sơn Tùng M-TP</p>
              <p>Nơi Này Có Anh · Single · ${sourceBadge("YouTube", true)}</p>
              <div class="track-meta"><span class="chip">MP3</span><span class="chip">320 kbps</span><span class="chip">44.1 kHz</span><span class="chip">Stereo</span></div>
            </div>
          </div>
          <div class="progress-wrap"><div class="progress-labels"><span>${formatTime(Math.round(249 * state.progress / 100))}</span><span>04:09</span></div><div class="progress-track" style="--progress: ${state.progress}%;" role="progressbar" aria-label="Tiến trình phát Nơi Này Có Anh" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.progress}"></div></div>
          <div class="player-controls">
            <div class="control-group"><button type="button" class="control-button ${shuffleActive ? "is-active" : ""}" data-action="shuffle" aria-label="${shuffleLabel}" aria-pressed="${shuffleActive}" aria-keyshortcuts="S" title="${shuffleLabel} · S">${icon("shuffle")}</button><button type="button" class="control-button" data-action="previous" aria-label="Bài trước" aria-keyshortcuts="P ArrowLeft" title="Bài trước · P">${icon("skip-back")}</button><button type="button" class="control-button primary" data-action="play-pause" aria-label="${state.playing ? "Tạm dừng" : "Phát"}" aria-keyshortcuts="Space K" title="${state.playing ? "Tạm dừng" : "Phát"} · Space/K">${icon(state.playing ? "pause" : "play")}</button><button type="button" class="control-button" data-action="next" aria-label="Bài tiếp theo" aria-keyshortcuts="N ArrowRight" title="Bài tiếp theo · N">${icon("skip-forward")}</button><button type="button" class="control-button ${state.repeatMode !== "off" ? "is-active" : ""}" data-action="repeat" data-repeat-mode="${state.repeatMode}" aria-label="${repeat.label}" aria-pressed="${state.repeatMode !== "off"}" aria-keyshortcuts="R" title="${repeat.label} · R">${icon(repeat.icon)}</button></div>
            <div class="volume-control" style="--volume-level: ${volumeValue}%;">
              <button type="button" class="volume-button" data-action="toggle-mute" aria-label="${volumeLabel}" aria-keyshortcuts="M" title="${volumeLabel} · M">${icon("volume")}</button>
              <div class="volume-panel" role="group" aria-label="Điều chỉnh âm lượng">
                <span class="volume-panel-label">Âm lượng</span>
                <div class="volume-range-shell"><input class="volume-range" type="range" min="0" max="100" value="${volumeValue}" aria-label="Âm lượng" /><output>${state.muted ? "Tắt" : `${state.volume}%`}</output></div>
              </div>
            </div>
          </div>
          ${targetButtons()}
        </div>
      </article>
      ${queueCard()}
    </div>
    ${activityCard()}
  `;
}

function queueCard() {
  return `
    <article class="card">
      <header class="card-header"><h2>${icon("list")} Hàng đợi <span class="chip">${state.queue.length}</span></h2><button type="button" class="header-action" data-action="clear-queue">${icon("trash")} Xóa hàng đợi</button></header>
      <div class="card-body">
        <div class="queue-list">${state.queue.length ? state.queue.map((item, index) => queueItem(item, index)).join("") : emptyQueue()}</div>
        <div class="queue-footer"><span>${state.queue.length} bài mẫu · Dữ liệu UI</span><span>Kéo để sắp xếp</span></div>
      </div>
    </article>
  `;
}

function emptyQueue() {
  return `<div class="empty-state"><div><div class="icon-wrap">${icon("list")}</div><h3>Hàng đợi đang trống</h3><p>Hãy tìm một bài hát để thêm vào hàng đợi.</p><button type="button" class="button primary" data-action="go-discover">${icon("search")} Khám phá nhạc</button></div></div>`;
}

function activityCard() {
  const events = [
    ["play", "Đã phát Nơi Này Có Anh", "vài giây trước"],
    ["plus", "Đã thêm 3 bài vào hàng đợi", "1 phút trước"],
    ["playlist", "Đã tạo danh sách Chill Vibes", "15 phút trước"],
  ];
  return `
    <article class="card activity-card"><header class="card-header"><h2>${icon("activity")} Hoạt động gần đây</h2><button type="button" class="header-action" data-action="go-logs">Xem tất cả ${icon("arrow")}</button></header><div class="card-body"><div class="activity-list">${events.map(([name, text, time]) => `<div class="activity-row"><span class="activity-icon">${icon(name)}</span><div><strong>${text}</strong><span>Chỉ hiển thị trong prototype</span></div><span class="activity-time">${time}</span></div>`).join("")}</div></div></article>
  `;
}

function discoverScreen() {
  const results = [
    ["Nơi Này Có Anh", "Sơn Tùng M-TP", "04:09", ["YouTube", "SoundCloud"], "orbit"],
    ["Lạc Trôi", "Sơn Tùng M-TP", "04:20", ["YouTube"], "grid"],
    ["Muộn Rồi Mà Sao Còn", "Sơn Tùng M-TP", "04:26", ["SoundCloud"], "moon"],
    ["Có Chắc Yêu Là Đây", "Sơn Tùng M-TP", "03:44", ["YouTube"], "frame"],
  ];
  return `
    <div class="music-discover discovery-compact">
      <header class="compact-discover-header">
        <div class="compact-discover-heading"><p class="eyebrow">ÂM NHẠC / DISCOVERY</p><h1>Khám phá</h1><p class="page-subtitle">Tìm và gom nhạc từ YouTube và SoundCloud trong một không gian local-first.</p></div>
        <div class="compact-discover-meta"><div class="compact-discover-sources"><span class="filter-label">Nguồn đang bật</span>${sourceBadges(["YouTube", "SoundCloud"])}</div><div class="server-picker compact-server-picker" role="button" tabindex="0" aria-label="Máy chủ đang chọn: Local Community"><span class="server-avatar">${icon("server")}</span><span class="server-picker-copy"><strong>Local Community</strong><span>128 thành viên · local</span></span>${icon("more")}</div></div>
      </header>

      <section class="compact-discover-panel" aria-labelledby="discoverResultsHeading">
        <div class="compact-discover-panel-heading"><div><p class="eyebrow">TÌM KIẾM</p><h2 id="discoverResultsHeading">Tìm bài hát</h2></div><span class="chip">${results.length} kết quả · đã gộp trùng</span></div>
        <form class="compact-discover-search" id="searchForm"><label class="sr-only" for="searchInput">Tìm bài hát, nghệ sĩ hoặc dán liên kết</label><span class="discovery-search-icon">${icon("search")}</span><input id="searchInput" name="query" placeholder="Tìm bài hát, nghệ sĩ hoặc dán liên kết..." value="Sơn Tùng M-TP" /><button type="submit" class="button primary">${icon("search")} Tìm nhạc</button></form>
        <div class="discover-result-list" role="list">${results.map(([title, artist, duration, sources, art], index) => `<div class="discover-result-row" role="listitem"><span class="discover-result-art discovery-artwork artwork-${art}" aria-hidden="true"><span>${index === 0 ? "ST" : "♪"}</span></span><div class="discover-result-copy"><div class="discover-result-titleline"><strong>${escapeHTML(title)}</strong><span class="discover-result-duration">${duration}</span></div><span class="discover-result-artist">${escapeHTML(artist)}</span>${sourceBadges(sources)}</div><button type="button" class="button discover-add-button" data-action="add-result" data-title="${escapeHTML(title)}" data-artist="${escapeHTML(artist)}" data-duration="${duration}" data-source="${escapeHTML(sources[0])}">${icon("plus")}<span>Thêm</span></button></div>`).join("")}</div>
      </section>

      <section class="compact-discover-strip" aria-label="Lối tắt âm nhạc"><div class="compact-discover-strip-item"><span class="support-icon">${icon("server")}</span><span><strong>Local-first</strong><small>Discord là đích chính; Windows có thể bật song song.</small></span></div><div class="compact-discover-strip-item"><span class="support-icon">${icon("playlist")}</span><span><strong>Playlist local</strong><small>Lưu nhanh lựa chọn để nghe lại không cần kết nối backend.</small></span></div><div class="compact-discover-actions"><button type="button" class="text-button" data-action="go-now">Mở player ${icon("arrow")}</button><button type="button" class="text-button" data-action="go-playlists">Quản lý playlist ${icon("arrow")}</button></div></section>
    </div>
  `;
}

function playlistsScreen() {
  return `
    ${pageHeader("Danh sách phát", "Lưu playlist local, chỉnh sửa nhanh, và giữ trải nghiệm native nhẹ.")}
    <div class="screen-grid two-column">
      <article class="card"><header class="card-header"><h2>${icon("playlist")} Playlist local</h2><span class="chip">JSON mock</span></header><div class="card-body"><div class="search-results">${state.playlists.map((playlist, index) => `<div class="result-row"><span class="result-art">${icon("playlist")}</span><div><strong>${escapeHTML(playlist.name)}</strong><span>${playlist.count} bài · ${escapeHTML(playlist.description)}</span></div><button type="button" class="button" data-action="delete-playlist" data-index="${index}" aria-label="Xóa ${escapeHTML(playlist.name)}">${icon("trash")}</button></div>`).join("")}</div></div></article>
      <article class="card"><header class="card-header"><h2>${icon("plus")} Tạo playlist</h2></header><div class="card-body"><form id="playlistForm" class="settings-grid"><div class="form-field"><label for="playlistName">Tên playlist</label><input class="field-input" id="playlistName" required placeholder="Ví dụ: Làm việc buổi tối" /></div><div class="form-field"><label for="playlistDescription">Mô tả ngắn</label><textarea class="field-textarea" id="playlistDescription" placeholder="Playlist này dùng cho... "></textarea></div><button type="submit" class="button primary">${icon("check")} Lưu playlist</button></form></div></article>
    </div>
  `;
}

function equalizerScreen() {
  return `
    ${pageHeader("Equalizer", "Tinh chỉnh trải nghiệm nghe theo thiết bị và gu của bạn.")}
    <div class="screen-grid two-column">
      <article class="card"><header class="card-header"><h2>${icon("sliders")} Cấu hình âm thanh</h2><span class="chip">Local preview</span></header><div class="card-body"><div class="settings-grid"><div class="form-field"><div class="field-label-row"><label for="eqBass">Bass</label><span class="muted">+4 dB</span></div><input id="eqBass" type="range" min="-12" max="12" value="4" /></div><div class="form-field"><div class="field-label-row"><label for="eqMid">Mid</label><span class="muted">0 dB</span></div><input id="eqMid" type="range" min="-12" max="12" value="0" /></div><div class="form-field"><div class="field-label-row"><label for="eqTreble">Treble</label><span class="muted">+2 dB</span></div><input id="eqTreble" type="range" min="-12" max="12" value="2" /></div><div class="button-row"><button type="button" class="button" data-action="eq-reset">Đặt lại</button><button type="button" class="button primary" data-action="eq-save">Lưu cấu hình</button></div></div></div></article>
      <article class="card"><header class="card-header"><h2>${icon("activity")} Preset</h2></header><div class="card-body"><div class="search-results"><button type="button" class="result-row" data-action="eq-preset" data-preset="Flat"><span class="result-art">${icon("music")}</span><div><strong>Flat</strong><span>Âm thanh cân bằng, giữ nguyên bản gốc.</span></div>${icon("arrow")}</button><button type="button" class="result-row" data-action="eq-preset" data-preset="Focus"><span class="result-art">${icon("music")}</span><div><strong>Focus</strong><span>Rõ giọng và chi tiết khi làm việc.</span></div>${icon("arrow")}</button><button type="button" class="result-row" data-action="eq-preset" data-preset="Warm"><span class="result-art">${icon("music")}</span><div><strong>Warm</strong><span>Âm trầm mềm cho nghe thư giãn.</span></div>${icon("arrow")}</button></div></div></article>
    </div>
  `;
}

function overviewScreen() {
  const recentTracks = [
    { title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", duration: "04:09", art: "orbit", sources: ["YouTube", "SoundCloud"] },
    { title: "Lạc Trôi", artist: "Sơn Tùng M-TP", duration: "04:20", art: "grid", sources: ["YouTube"] },
    { title: "Muộn Rồi Mà Sao Còn", artist: "Sơn Tùng M-TP", duration: "04:26", art: "moon", sources: ["SoundCloud"] },
    { title: "Có Chắc Yêu Là Đây", artist: "Sơn Tùng M-TP", duration: "03:44", art: "frame", sources: ["YouTube"] },
    { title: "Chúng Ta Của Hiện Tại", artist: "Sơn Tùng M-TP", duration: "05:01", art: "signal", sources: ["YouTube", "SoundCloud"] },
  ];
  const trendingTracks = [
    { title: "Nơi Này Có Anh", artist: "Sơn Tùng M-TP", duration: "04:09", sources: ["YouTube", "SoundCloud"] },
    { title: "Chạy Ngay Đi", artist: "Sơn Tùng M-TP", duration: "04:05", sources: ["YouTube"] },
    { title: "Hãy Trao Cho Anh", artist: "Sơn Tùng M-TP", duration: "04:25", sources: ["SoundCloud"] },
    { title: "Muộn Rồi Mà Sao Còn", artist: "Sơn Tùng M-TP", duration: "04:26", sources: ["YouTube", "SoundCloud"] },
  ];
  const playlists = [
    { name: "Sơn Tùng M-TP essentials", detail: "12 bài · local playlist", art: "playlist-one" },
    { name: "Đêm nay nghe gì", detail: "8 bài · YouTube + SoundCloud", art: "playlist-two" },
    { name: "Tập trung thật lâu", detail: "10 bài · instrumental", art: "playlist-three" },
  ];
  return `
    <div class="overview-home discovery-home">
      <header class="discovery-header">
        <div class="discovery-heading">
          <p class="eyebrow">LOCALBOT / MUSIC DISCOVERY</p>
          <h1>Khám phá thế giới âm nhạc</h1>
          <p class="page-subtitle">Tìm, gom và phát nhạc từ nhiều nguồn trong một không gian local-first.</p>
        </div>
        <div class="discovery-header-meta">
          <span class="overview-local-state"><span class="status-dot" aria-hidden="true"></span> Local runtime</span>
          <div class="server-picker" role="button" tabindex="0" aria-label="Máy chủ đang chọn: Local Community">
            <span class="server-avatar">${icon("server")}</span>
            <span class="server-picker-copy"><strong>Local Community</strong><span>128 thành viên · local</span></span>
            ${icon("more")}
          </div>
        </div>
      </header>

      <section class="discovery-search-row" aria-label="Tìm kiếm âm nhạc">
        <form class="discovery-search" id="searchForm">
          <label class="sr-only" for="discoverySearchInput">Tìm bài hát, nghệ sĩ hoặc playlist</label>
          <span class="discovery-search-icon">${icon("search")}</span>
          <input id="discoverySearchInput" name="query" placeholder="Tìm bài hát, nghệ sĩ hoặc playlist..." value="Sơn Tùng M-TP" />
          <button type="submit" class="button primary">${icon("search")} Tìm nhạc</button>
        </form>
        <div class="discovery-source-filter" aria-label="Nguồn đang bật">
          <span class="filter-label">Nguồn</span>
          ${sourceBadge("YouTube")}
          ${sourceBadge("SoundCloud")}
        </div>
      </section>

      <section class="discovery-section discovery-recent" aria-labelledby="recentHeading">
        <div class="discovery-section-heading">
          <div><p class="eyebrow">LỊCH SỬ NGHE</p><h2 id="recentHeading">Nghe gần đây</h2></div>
          <button type="button" class="text-button" data-action="go-now">Mở player ${icon("arrow")}</button>
        </div>
        <div class="recent-track-grid">
          ${recentTracks.map((track, index) => `
            <button type="button" class="recent-track-card" data-action="play-discovery" data-title="${escapeHTML(track.title)}" style="--card-index: ${index};">
              <span class="discovery-artwork artwork-${track.art}" aria-hidden="true"><span>${index === 0 ? "ST" : "♪"}</span><i></i><b></b></span>
              <span class="recent-track-copy"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span>${sourceBadges(track.sources)}</span>
              <span class="card-play-indicator" aria-hidden="true">${icon("play")}</span>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="discovery-bento" aria-label="Gợi ý âm nhạc">
        <article class="discovery-panel trending-panel">
          <div class="discovery-panel-heading"><div><p class="eyebrow">ĐANG ĐƯỢC NGHE</p><h2>Trending</h2></div><span class="chip">Dữ liệu mẫu</span></div>
          <div class="trending-list">
            ${trendingTracks.map((track, index) => `
              <button type="button" class="trending-row" data-action="play-discovery" data-title="${escapeHTML(track.title)}">
                <span class="trending-rank">${String(index + 1).padStart(2, "0")}</span>
                <span class="trending-art artwork-${recentTracks[index]?.art || "signal"}" aria-hidden="true"><span>${index === 0 ? "ST" : "♪"}</span></span>
                <span class="trending-copy"><strong>${escapeHTML(track.title)}</strong><span>${escapeHTML(track.artist)}</span>${sourceBadges(track.sources)}</span>
                <span class="trending-duration">${track.duration}</span>
                <span class="trending-play" aria-hidden="true">${icon("play")}</span>
              </button>
            `).join("")}
          </div>
        </article>

        <article class="discovery-panel featured-panel">
          <div class="featured-art artwork-orbit" aria-label="Artwork mẫu của Nơi Này Có Anh" role="img"><span>ST</span><i></i><b></b><em></em></div>
          <div class="featured-copy"><p class="eyebrow">ĐỀ XUẤT HÔM NAY</p><h2>Nơi Này Có Anh</h2><p>Sơn Tùng M-TP · Single</p>${sourceBadges(["YouTube", "SoundCloud"])}<div class="featured-actions"><button type="button" class="button primary" data-action="play-discovery" data-title="Nơi Này Có Anh">${icon("play")} Phát ngay</button><button type="button" class="button" data-action="add-result" data-title="Nơi Này Có Anh" data-artist="Sơn Tùng M-TP" data-duration="04:09" data-source="YouTube">${icon("plus")} Hàng đợi</button></div></div>
        </article>
      </section>

      <section class="discovery-section playlist-section" aria-labelledby="playlistHeading">
        <div class="discovery-section-heading"><div><p class="eyebrow">BỘ SƯU TẬP LOCAL</p><h2 id="playlistHeading">Playlist dành cho bạn</h2></div><button type="button" class="text-button" data-action="go-playlists">Xem tất cả ${icon("arrow")}</button></div>
        <div class="playlist-card-grid">
          ${playlists.map((playlist) => `<button type="button" class="playlist-card" data-action="go-playlists"><span class="playlist-art ${playlist.art}" aria-hidden="true"><i></i><b></b><em></em></span><span class="playlist-card-copy"><strong>${escapeHTML(playlist.name)}</strong><span>${escapeHTML(playlist.detail)}</span></span><span class="playlist-card-arrow" aria-hidden="true">${icon("arrow")}</span></button>`).join("")}
        </div>
      </section>

      <section class="discovery-bottom-strip" aria-label="Trạng thái hệ thống">
        <span><span class="status-dot" aria-hidden="true"></span> Music engine sẵn sàng</span>
        <span>${outputLabel()} · Local only</span>
        <button type="button" class="text-button" data-action="go-settings">Cấu hình nguồn ${icon("arrow")}</button>
      </section>
    </div>
  `;
}

function modulePlaceholder(title, description, iconName) {
  return `
    ${pageHeader(title, description)}
    <article class="card"><div class="empty-state"><div><div class="icon-wrap">${icon(iconName)}</div><h3>Module đang ở chế độ preview</h3><p>Đây là vùng UI base để kiểm tra bố cục. Backend và dữ liệu thật sẽ được Claude nối ở phase tương ứng.</p><button type="button" class="button primary" data-action="go-overview">${icon("home")} Về tổng quan</button></div></div></article>
  `;
}

function settingsScreen(tab = "settings") {
  if (tab === "ai") {
    return `${pageHeader("AI & Brain", "Tùy chỉnh bộ não cục bộ hoặc kết nối API bên thứ ba khi bạn muốn.")}
      <div class="settings-grid"><article class="settings-section"><div class="settings-section-header"><div><h2>${icon("brain")} AI provider</h2><p>AI là tuỳ chọn nhỏ trong Cài đặt. LocalBot vẫn hoạt động bình thường khi AI tắt hoặc Ollama offline.</p></div><label class="switch" title="Bật AI"><input type="checkbox" checked /><span class="switch-track"></span></label></div><div class="form-grid"><div class="form-field"><label for="ollamaUrl">Ollama local URL</label><input class="field-input" id="ollamaUrl" value="http://127.0.0.1:11434" /></div><div class="form-field"><label for="ollamaModel">Model</label><input class="field-input" id="ollamaModel" value="llama3.2" /></div><div class="form-field full"><label for="thirdPartyApi">API bên thứ ba (tuỳ chọn)</label><input class="field-input" id="thirdPartyApi" placeholder="Không lưu key trong prototype" /></div><div class="form-field full"><label for="aiPurpose">AI được phép hỗ trợ</label><textarea class="field-textarea" id="aiPurpose">Gợi ý lệnh, giải thích log, tóm tắt hoạt động. Không tự ban/xoá/chỉnh quyền.</textarea></div></div><div class="button-row" style="margin-top: 16px;"><button type="button" class="button" data-action="test-ai">${icon("activity")} Test kết nối</button><button type="button" class="button primary" data-action="save-settings">${icon("check")} Lưu cấu hình</button></div></article></div>`;
  }
  if (tab === "permissions") {
    return `${pageHeader("Quyền sử dụng lệnh", "Mặc định quản lý tại native app; chỉ user được cấp mới dùng lệnh.")}
      <div class="settings-grid"><article class="settings-section"><div class="settings-section-header"><div><h2>${icon("users")} Danh sách được phép</h2><p>Nhập Discord user ID, mỗi ID một dòng. User ngoài danh sách sẽ nhận hướng dẫn liên hệ admin.</p></div><label class="switch" title="Cho phép tất cả user"><input id="allowAll" type="checkbox" /><span class="switch-track"></span></label></div><div class="form-field"><label for="allowedUsers">Allowed user IDs</label><textarea class="field-textarea" id="allowedUsers" placeholder="123456789012345678\n234567890123456789"></textarea></div><div class="button-row" style="margin-top: 16px;"><button type="button" class="button primary" data-action="save-settings">${icon("check")} Lưu quyền</button></div></article></div>`;
  }
  return `${pageHeader("Cài đặt", "Thiết lập native app, theme, quyền và kết nối AI.")}
    <div class="settings-grid"><article class="settings-section"><div class="settings-section-header"><div><h2>${icon("sunmoon")} Giao diện</h2><p>Default là split-tone độc lập; Dark và Light là hai lựa chọn hoàn toàn riêng.</p></div></div><div class="button-row theme-choice-row"><button type="button" class="button ${state.theme === "default" ? "primary" : ""}" data-action="set-theme-direct" data-theme="default">${icon("sunmoon")} Default</button><button type="button" class="button ${state.theme === "dark" ? "primary" : ""}" data-action="set-theme-direct" data-theme="dark">${icon("moon")} Dark</button><button type="button" class="button ${state.theme === "light" ? "primary" : ""}" data-action="set-theme-direct" data-theme="light">${icon("sun")} Light</button></div></article><article class="settings-section"><div class="settings-section-header"><div><h2>${icon("brain")} AI & Brain</h2><p>Ollama local và API bên thứ ba được cấu hình như một phần nhỏ trong Cài đặt.</p></div></div><div class="button-row"><button type="button" class="button" data-action="go-ai">Mở AI & Brain ${icon("arrow")}</button></div></article><article class="settings-section"><div class="settings-section-header"><div><h2>${icon("users")} Quyền sử dụng lệnh</h2><p>Giới hạn theo Discord user ID hoặc bật cho phép tất cả.</p></div></div><div class="button-row"><button type="button" class="button" data-action="go-permissions">Quản lý quyền ${icon("arrow")}</button></div></article></div>`;
}

function renderScreen() {
  if (state.primary === "overview") pageArea.innerHTML = overviewScreen();
  else if (state.primary === "music") {
    if (state.musicTab === "discover") pageArea.innerHTML = discoverScreen();
    else if (state.musicTab === "queue") pageArea.innerHTML = `${pageHeader("Hàng đợi", "Thêm, xoá và sắp xếp nhạc cho phiên nghe hiện tại.")}${queueCard()}`;
    else if (state.musicTab === "playlists") pageArea.innerHTML = playlistsScreen();
    else if (state.musicTab === "equalizer") pageArea.innerHTML = equalizerScreen();
    else pageArea.innerHTML = nowPlayingScreen();
  } else if (state.primary === "community") pageArea.innerHTML = modulePlaceholder("Cộng đồng", "XP, Level, Rank và Leaderboard sẽ được quản lý theo từng máy chủ.", "users");
  else if (state.primary === "safety") pageArea.innerHTML = modulePlaceholder("An toàn", "AutoMod, anti-spam, anti-raid và anti-nuke cần policy rõ ràng trước khi bật enforcement.", "shield");
  else pageArea.innerHTML = settingsScreen(state.settingsTab || "settings");
}

let lastViewKey = "";
let renderVersion = 0;
let viewTransitionTimer = 0;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function currentViewKey() {
  if (state.primary === "music") return `music:${state.musicTab}`;
  if (state.primary === "settings") return `settings:${state.settingsTab || "settings"}`;
  return state.primary;
}

function paintScreen() {
  renderScreen();
  hydrateIcons();
  syncRangeFills();
  if (state.menuOpen) requestAnimationFrame(syncNavigationOffset);
}

function syncNowPlayingUI({ syncPlayButton = false } = {}) {
  if (state.primary !== "music" || state.musicTab !== "now") return;

  const outputChip = pageArea.querySelector(".player-card .card-header .chip");
  if (outputChip) outputChip.textContent = `Phát: ${outputLabel()}`;

  const targetCount = pageArea.querySelector(".target-count");
  if (targetCount) targetCount.textContent = `${state.outputTargets.length}/2`;

  pageArea.querySelectorAll('[data-action="set-output"]').forEach((button) => {
    const active = state.outputTargets.includes(button.dataset.output);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  const playButton = pageArea.querySelector('[data-action="play-pause"]');
  if (syncPlayButton && playButton) {
    const label = state.playing ? "Tạm dừng" : "Phát";
    playButton.setAttribute("aria-label", label);
    playButton.setAttribute("title", label);
    playButton.replaceChildren();
    playButton.insertAdjacentHTML("afterbegin", icon(state.playing ? "pause" : "play"));
    hydrateIcons();
  }

  syncProgressUI();
  syncVolumeUI();
}

function syncPlaybackModeUI() {
  if (!isNowPlayingView()) return;

  const shuffleButton = pageArea.querySelector('[data-action="shuffle"]');
  const repeatButton = pageArea.querySelector('[data-action="repeat"]');
  const shuffleActive = state.shuffleMode !== "off";
  const repeat = repeatMeta[state.repeatMode];

  if (shuffleButton) {
    shuffleButton.classList.toggle("is-active", shuffleActive);
    shuffleButton.setAttribute("aria-pressed", String(shuffleActive));
    shuffleButton.setAttribute("aria-label", shuffleActive ? "Phát ngẫu nhiên: bật" : "Phát ngẫu nhiên: tắt");
    shuffleButton.setAttribute("title", `${shuffleActive ? "Phát ngẫu nhiên: bật" : "Phát ngẫu nhiên: tắt"} · S`);
  }

  if (repeatButton) {
    repeatButton.classList.toggle("is-active", state.repeatMode !== "off");
    repeatButton.dataset.repeatMode = state.repeatMode;
    repeatButton.setAttribute("aria-pressed", String(state.repeatMode !== "off"));
    repeatButton.setAttribute("aria-label", repeat.label);
    repeatButton.setAttribute("title", `${repeat.label} · R`);
    repeatButton.replaceChildren();
    repeatButton.insertAdjacentHTML("afterbegin", icon(repeat.icon));
    hydrateIcons();
  }
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncProgressUI() {
  if (state.primary !== "music" || state.musicTab !== "now") return;
  const track = pageArea.querySelector(".progress-track");
  const currentLabel = pageArea.querySelector(".progress-labels span");
  if (track) {
    track.style.setProperty("--progress", `${state.progress}%`);
    track.setAttribute("aria-valuenow", String(state.progress));
  }
  if (currentLabel) currentLabel.textContent = formatTime(Math.round(249 * state.progress / 100));
}

function syncVolumeUI() {
  if (state.primary !== "music" || state.musicTab !== "now") return;

  const value = state.muted ? 0 : state.volume;
  const volumeControl = pageArea.querySelector(".volume-control");
  const volumeInput = pageArea.querySelector(".volume-range");
  const volumeOutput = pageArea.querySelector(".volume-range-shell output");
  const volumeButton = pageArea.querySelector('[data-action="toggle-mute"]');
  if (volumeControl) volumeControl.style.setProperty("--volume-level", `${value}%`);
  if (volumeInput) volumeInput.value = String(value);
  if (volumeOutput) volumeOutput.textContent = state.muted ? "Tắt" : `${state.volume}%`;
  if (volumeButton) {
    const label = state.muted ? "Bật âm lượng" : `Âm lượng ${state.volume} phần trăm`;
    volumeButton.setAttribute("aria-label", label);
    volumeButton.setAttribute("title", `${label} · M`);
  }
}

function playViewEntrance() {
  if (prefersReducedMotion() || !pageArea.children.length) return;
  const items = [...pageArea.children];
  if (motionRuntime.animate) {
    try {
      motionRuntime.animate(items, { opacity: [0, 1], y: [10, 0] }, {
        duration: 0.28,
        ease: "easeOut",
        delay: motionRuntime.stagger ? motionRuntime.stagger(0.04) : 0,
      });
      return;
    } catch {
      // CSS motion below keeps the prototype usable when the optional CDN is unavailable.
    }
  }
  items.forEach((item, index) => {
    item.style.setProperty("--entry-delay", `${Math.min(index, 5) * 40}ms`);
    item.classList.add("motion-item");
  });
  pageArea.classList.remove("motion-play");
  requestAnimationFrame(() => pageArea.classList.add("motion-play"));
  window.clearTimeout(playViewEntrance.timer);
  playViewEntrance.timer = window.setTimeout(() => {
    pageArea.classList.remove("motion-play");
    items.forEach((item) => {
      item.classList.remove("motion-item");
      item.style.removeProperty("--entry-delay");
    });
  }, 480);
}

function syncRangeFill(input) {
  if (!input || input.matches(".volume-range")) return;
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value || 0);
  const percentage = max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  input.style.setProperty("--range-fill", `${percentage}%`);
}

function syncRangeFills() {
  document.querySelectorAll('input[type="range"]:not(.volume-range)').forEach(syncRangeFill);
}

function playInteractionMotion(target) {
  if (!target || target.closest(".player-controls, .no-icon-motion") || prefersReducedMotion()) return;
  if (motionRuntime.animate) {
    try {
      motionRuntime.animate(target, { scale: [1, 1.035, 1], y: [0, -1, 0] }, { duration: 0.2, ease: "easeOut" });
      return;
    } catch {
      // CSS motion below keeps local interactions responsive without the optional CDN.
    }
  }
  target.classList.remove("is-interacted");
  requestAnimationFrame(() => {
    target.classList.add("is-interacted");
    window.clearTimeout(target.interactionTimer);
    target.interactionTimer = window.setTimeout(() => target.classList.remove("is-interacted"), 260);
  });
}

function playIconInteractionMotion(target) {
  if (!target || target.closest(".player-controls, .no-icon-motion") || prefersReducedMotion()) return;
  target.querySelectorAll(".icon-host").forEach((host) => {
    host.classList.remove("is-action-interact");
    window.clearTimeout(host.iconInteractionTimer);
    requestAnimationFrame(() => {
      host.classList.add("is-action-interact");
      host.iconInteractionTimer = window.setTimeout(() => host.classList.remove("is-action-interact"), 460);
    });
  });
}

function playPlayerControlMotion(target, motionName = target?.dataset.action) {
  if (!target || !target.closest(".player-controls") || prefersReducedMotion()) return;
  const motionClasses = [
    "is-player-clicked",
    "is-player-play-pause",
    "is-player-previous",
    "is-player-next",
    "is-player-shuffle",
    "is-player-repeat",
    "is-player-toggle-mute",
  ];
  target.classList.remove(...motionClasses);
  void target.offsetWidth;
  target.classList.add("is-player-clicked", `is-player-${motionName}`);
  window.clearTimeout(target.playerMotionTimer);
  target.playerMotionTimer = window.setTimeout(() => target.classList.remove(...motionClasses), 360);
}

function render() {
  setTheme(state.theme);
  renderContextNav();
  hydrateIcons();
  document.querySelectorAll(".primary-item").forEach((button) => button.classList.toggle("is-active", button.dataset.primary === state.primary));
  const nextViewKey = currentViewKey();
  const hasExistingView = pageArea.childElementCount > 0;
  const viewChanged = hasExistingView && lastViewKey && lastViewKey !== nextViewKey;
  lastViewKey = nextViewKey;
  window.clearTimeout(viewTransitionTimer);
  const currentVersion = ++renderVersion;

  if (viewChanged && !prefersReducedMotion()) {
    pageArea.classList.add("is-exiting");
    viewTransitionTimer = window.setTimeout(() => {
      if (currentVersion !== renderVersion) return;
      paintScreen();
      pageArea.classList.remove("is-exiting");
      playViewEntrance();
    }, 110);
    return;
  }

  pageArea.classList.remove("is-exiting");
  paintScreen();
  if (viewChanged || !hasExistingView) playViewEntrance();
}

function goToMusic(tab = "now") {
  state.primary = "music";
  state.musicTab = tab;
  render();
}

function goToSettings(tab = "settings") {
  state.primary = "settings";
  state.settingsTab = tab;
  render();
}

function handleAction(actionElement) {
  const action = actionElement.dataset.action;
  if (action === "play-discovery") {
    state.playing = true;
    showToast(`Đang phát “${actionElement.dataset.title || "bài hát"}”`);
    return;
  }
  if (action === "set-theme-direct") {
    setTheme(actionElement.dataset.theme);
    showToast(`Đã chuyển sang giao diện ${actionElement.dataset.theme}`);
    return;
  }
  if (action === "go-music") return goToMusic("now");
  if (action === "go-discover") return goToMusic("discover");
  if (action === "go-now") return goToMusic("now");
  if (action === "go-playlists") return goToMusic("playlists");
  if (action === "go-equalizer") return goToMusic("equalizer");
  if (action === "go-settings") return goToSettings();
  if (action === "go-ai") return goToSettings("ai");
  if (action === "go-permissions") return goToSettings("permissions");
  if (action === "go-overview") {
    state.primary = "overview";
    render();
    return;
  }
  if (action === "go-logs") {
    state.primary = "safety";
    render();
    showToast("Logs sẽ là module Activity riêng ở phase sau");
    return;
  }
  if (action === "play-pause") {
    state.playing = !state.playing;
    syncNowPlayingUI({ syncPlayButton: true });
    playPlayerControlMotion(actionElement, "play-pause");
    showToast(state.playing ? "Đang phát" : "Đã tạm dừng");
    return;
  }
  if (action === "toggle-mute") {
    state.muted = !state.muted;
    syncVolumeUI();
    playPlayerControlMotion(actionElement, "toggle-mute");
    showToast(state.muted ? "Đã tắt tiếng" : `Âm lượng ${state.volume}%`);
    return;
  }
  if (action === "shuffle") {
    state.shuffleMode = state.shuffleMode === "off" ? "on" : "off";
    syncPlaybackModeUI();
    playPlayerControlMotion(actionElement, "shuffle");
    showToast(state.shuffleMode === "on" ? "Đã bật phát ngẫu nhiên" : "Đã tắt phát ngẫu nhiên");
    return;
  }
  if (action === "repeat") {
    const modes = ["off", "all", "one"];
    const nextMode = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
    state.repeatMode = nextMode;
    syncPlaybackModeUI();
    playPlayerControlMotion(actionElement, "repeat");
    showToast(repeatMeta[nextMode].toast);
    return;
  }
  if (["previous", "next"].includes(action)) {
    playPlayerControlMotion(actionElement, action);
    showToast(action === "next" ? "Đang chuyển bài tiếp theo" : "Đang quay lại bài trước");
    return;
  }
  if (action === "set-output") {
    const output = actionElement.dataset.output;
    const isActive = state.outputTargets.includes(output);
    if (isActive && state.outputTargets.length === 1) {
      showToast("Giữ lại ít nhất một đầu ra để tiếp tục phát");
      return;
    }
    state.outputTargets = isActive
      ? state.outputTargets.filter((target) => target !== output)
      : [...state.outputTargets, output];
    syncNowPlayingUI();
    showToast(`Đầu ra: ${outputLabel()}`);
    return;
  }
  if (action === "clear-queue") {
    state.queue = [];
    render();
    showToast("Đã xóa hàng đợi mẫu");
    return;
  }
  if (action === "remove-queue") {
    const index = Number(actionElement.dataset.index);
    const [removed] = state.queue.splice(index, 1);
    render();
    if (removed) showToast(`Đã xóa “${removed.title}” khỏi hàng đợi`);
    return;
  }
  if (action === "add-result") {
    state.queue.push({ title: actionElement.dataset.title, artist: actionElement.dataset.artist, duration: actionElement.dataset.duration, source: actionElement.dataset.source || "YouTube" });
    showToast(`Đã thêm “${actionElement.dataset.title}” vào hàng đợi`);
    return;
  }
  if (action === "delete-playlist") {
    const index = Number(actionElement.dataset.index);
    const [removed] = state.playlists.splice(index, 1);
    render();
    if (removed) showToast(`Đã xóa playlist “${removed.name}”`);
    return;
  }
  if (action === "save-settings") {
    showToast("Đã lưu cấu hình mẫu");
    return;
  }
  if (action === "test-ai") {
    showToast("Prototype: mô phỏng kết nối Ollama thành công");
    return;
  }
  if (action === "eq-reset") {
    document.querySelectorAll('input[type="range"]:not(.volume-range)').forEach((input) => { input.value = 0; });
    syncRangeFills();
    showToast("Đã đặt lại Equalizer");
    return;
  }
  if (action === "eq-save") {
    showToast("Đã lưu cấu hình âm thanh mẫu");
    return;
  }
  if (action === "eq-preset") {
    showToast(`Đã chọn preset ${actionElement.dataset.preset}`);
  }
}

function isEditableTarget(target) {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element?.tagName));
}

function isNowPlayingView() {
  return state.primary === "music" && state.musicTab === "now";
}

function triggerKeyboardControl(action) {
  if (!isNowPlayingView()) return false;
  const control = pageArea.querySelector(`[data-action="${action}"]`);
  if (!control) return false;
  handleAction(control);
  playInteractionMotion(control);
  playIconInteractionMotion(control);
  return true;
}

function seekBy(seconds) {
  state.progress = Math.min(100, Math.max(0, state.progress + seconds / 2.49));
  syncProgressUI();
  showToast(`${seconds > 0 ? "Tua tới" : "Lùi"} ${Math.abs(seconds)} giây`);
}

function changeVolumeBy(amount) {
  state.muted = false;
  state.volume = Math.min(100, Math.max(0, state.volume + amount));
  syncVolumeUI();
  showToast(`Âm lượng ${state.volume}%`);
  playIconInteractionMotion(pageArea.querySelector('[data-action="toggle-mute"]'));
}

function handlePlayerShortcut(event) {
  if (!isNowPlayingView() || isEditableTarget(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  const repeatableKeys = new Set(["arrowleft", "arrowright", "[", "]"]);
  if (event.repeat && !repeatableKeys.has(key)) return;

  if (event.code === "Space" || key === "k") {
    event.preventDefault();
    triggerKeyboardControl("play-pause");
    return;
  }
  if (key === "n") {
    event.preventDefault();
    triggerKeyboardControl("next");
    return;
  }
  if (key === "p") {
    event.preventDefault();
    triggerKeyboardControl("previous");
    return;
  }
  if (key === "s") {
    event.preventDefault();
    triggerKeyboardControl("shuffle");
    return;
  }
  if (key === "r") {
    event.preventDefault();
    triggerKeyboardControl("repeat");
    return;
  }
  if (key === "m") {
    event.preventDefault();
    triggerKeyboardControl("toggle-mute");
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    seekBy(-5);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    seekBy(5);
    return;
  }
  if (event.key === "[") {
    event.preventDefault();
    changeVolumeBy(-5);
    return;
  }
  if (event.key === "]") {
    event.preventDefault();
    changeVolumeBy(5);
    return;
  }
  if (event.key === "?") {
    event.preventDefault();
    showToast("Phím tắt: Space/K phát · N/P bài · ←/→ tua · M tiếng · [/ ] âm lượng · S shuffle · R repeat");
  }
}

menuZone.addEventListener("mouseenter", openMenu);
menuZone.addEventListener("mouseleave", scheduleClose);
menuZone.addEventListener("focusin", openMenu);
primaryMenu.addEventListener("mouseenter", openMenu);
primaryMenu.addEventListener("mouseleave", scheduleClose);
menuTrigger.addEventListener("click", (event) => {
  event.stopPropagation();
  openMenu();
});
window.addEventListener("resize", syncNavigationOffset);
document.addEventListener("click", (event) => {
  if (!navigationStage.contains(event.target)) closeMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
    menuTrigger.focus();
    return;
  }
  handlePlayerShortcut(event);
});

primaryMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-primary]");
  if (!button) return;
  state.primary = button.dataset.primary;
  if (state.primary === "settings") state.settingsTab = "settings";
  closeMenu();
  render();
});

contextNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-context]");
  if (!button) return;
  if (state.primary === "music") state.musicTab = button.dataset.context;
  else if (state.primary === "settings") state.settingsTab = button.dataset.context;
  render();
});

themeToggle.addEventListener("click", (event) => {
  const button = event.target.closest("[data-theme-choice]");
  if (!button) return;
  setTheme(button.dataset.themeChoice);
  playInteractionMotion(button);
  showToast(`Đã chuyển sang giao diện ${button.dataset.themeChoice}`);
});

settingsQuick.addEventListener("click", () => goToSettings());
toastClose.addEventListener("click", hideToast);

pageArea.addEventListener("click", (event) => {
  const actionElement = event.target.closest("[data-action]");
  if (actionElement) {
    const clickedButton = event.target.closest("button");
    handleAction(actionElement);
    if (clickedButton?.isConnected) {
      playInteractionMotion(clickedButton);
      playIconInteractionMotion(clickedButton);
    }
  }
});

pageArea.addEventListener("input", (event) => {
  const volumeInput = event.target.closest(".volume-range");
  if (volumeInput) {
    const volumeControl = volumeInput.closest(".volume-control");
    const value = Number(volumeInput.value);
    state.volume = value;
    state.muted = value === 0;
    volumeControl.style.setProperty("--volume-level", `${value}%`);
    const output = volumeControl.querySelector("output");
    if (output) output.textContent = state.muted ? "Tắt" : `${value}%`;
    const volumeButton = volumeControl.querySelector('[data-action="toggle-mute"]');
    if (volumeButton) {
      const label = state.muted ? "Bật âm lượng" : `Âm lượng ${value} phần trăm`;
      volumeButton.setAttribute("aria-label", label);
      volumeButton.setAttribute("title", `${label} · M`);
    }
    return;
  }
  const rangeInput = event.target.closest('input[type="range"]:not(.volume-range)');
  if (rangeInput) syncRangeFill(rangeInput);
});

pageArea.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "searchForm") {
    showToast("Đã tìm kiếm dữ liệu mẫu trên YouTube + SoundCloud");
    return;
  }
  if (event.target.id === "playlistForm") {
    const name = document.querySelector("#playlistName").value.trim();
    const description = document.querySelector("#playlistDescription").value.trim() || "Chưa có mô tả.";
    if (!name) return;
    state.playlists.unshift({ name, description, count: 0 });
    render();
    showToast(`Đã tạo playlist “${name}”`);
  }
});

window.addEventListener("load", hydrateIcons);
window.addEventListener("localbot-icons-ready", hydrateIcons);
root.dataset.theme = state.theme;
render();
