// src/model.ts
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readActivationType(value) {
  return value === "constant" || value === "keyword" || value === "vector" || value === "sticky" ? value : undefined;
}
function entryActivationType(entry) {
  if (entry.activationType)
    return entry.activationType;
  if (entry.source === "vector")
    return "vector";
  if (entry.constant === true)
    return "constant";
  if (entry.source === "keyword" && entry.constant === false)
    return "keyword";
  return "unknown";
}
async function hydrateActivationTypes(entries, fetchBookEntries) {
  const bookIds = [...new Set(entries.filter((entry) => entryActivationType(entry) === "unknown" && entry.source === "keyword").map((entry) => entry.bookId).filter((id) => Boolean(id)))];
  const flags = new Map;
  await Promise.all(bookIds.map(async (bookId) => {
    try {
      const rows = await fetchBookEntries(bookId);
      const bookFlags = new Map;
      for (const value of rows) {
        const row = record(value);
        if (row && typeof row.id === "string" && typeof row.constant === "boolean")
          bookFlags.set(row.id, row.constant);
      }
      flags.set(bookId, bookFlags);
    } catch {}
  }));
  return entries.map((entry) => {
    const constant = entry.bookId ? flags.get(entry.bookId)?.get(entry.id) : undefined;
    return entryActivationType(entry) === "unknown" && entry.source === "keyword" && constant !== undefined ? { ...entry, constant } : entry;
  });
}
function readEntries(value) {
  if (!Array.isArray(value))
    return null;
  const entries = [];
  for (const item of value) {
    const row = record(item);
    if (!row || typeof row.id !== "string" || typeof row.comment !== "string")
      return null;
    entries.push({
      id: row.id,
      comment: row.comment,
      bookId: typeof row.bookId === "string" ? row.bookId : undefined,
      bookName: typeof row.bookName === "string" ? row.bookName : undefined,
      activationType: readActivationType(row.activationType) ?? readActivationType(record(row.activationProvenance)?.origin),
      source: row.source === "keyword" || row.source === "vector" ? row.source : undefined,
      constant: typeof row.constant === "boolean" ? row.constant : undefined
    });
  }
  return entries;
}
function entryLabel(entry) {
  return entry.comment.trim() ? entry.comment : `Untitled entry (${entry.id})`;
}
function groupEntries(entries) {
  const groups = new Map;
  for (const entry of entries) {
    const key = entry.bookId ? `id:${entry.bookId}` : entry.bookName ? `name:${entry.bookName}` : "unknown";
    let group = groups.get(key);
    if (!group) {
      group = { key, name: entry.bookName?.trim() ? entry.bookName : entry.bookId ? `Unnamed lorebook (${entry.bookId})` : "Unknown lorebook", entries: [] };
      groups.set(key, group);
    }
    group.entries.push(entry);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key, "en"));
}

class ActivationModel {
  chatId = null;
  entries = [];
  pending = null;
  switchChat(chatId) {
    if (this.chatId === chatId)
      return false;
    this.chatId = chatId;
    this.entries = [];
    this.pending = null;
    return true;
  }
  event(name, value) {
    const payload = record(value);
    if (!payload || !this.chatId || payload.chatId !== this.chatId)
      return false;
    if (name === "WORLD_INFO_ACTIVATED") {
      const entries = readEntries(payload.entries);
      if (!entries)
        return false;
      this.entries = entries;
      if (this.pending)
        this.pending.receivedActivation = true;
      return true;
    }
    if (name === "GENERATION_STARTED") {
      this.pending = {
        generationId: typeof payload.generationId === "string" ? payload.generationId : undefined,
        receivedActivation: false,
        streaming: false
      };
      return false;
    }
    if (!this.pending)
      return false;
    if (this.pending.generationId && payload.generationId !== this.pending.generationId)
      return false;
    if (name === "STREAM_TOKEN_RECEIVED") {
      if (typeof payload.token !== "string" || !payload.token.length || this.pending.streaming)
        return false;
      this.pending.streaming = true;
      if (!this.pending.receivedActivation) {
        this.entries = [];
        return true;
      }
    }
    if (name === "GENERATION_ENDED" || name === "GENERATION_STOPPED") {
      const clear = name === "GENERATION_ENDED" && !payload.error && payload.stopped !== true && payload.aborted !== true && !this.pending.receivedActivation;
      this.pending = null;
      if (clear) {
        this.entries = [];
        return true;
      }
    }
    return false;
  }
}

// src/icons.ts
function svg(shapes) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}
var activationIcons = {
  constant: {
    label: "Always active",
    svg: svg('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>')
  },
  keyword: {
    label: "Keyword",
    svg: svg('<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>')
  },
  vector: {
    label: "Vector",
    svg: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')
  },
  sticky: {
    label: "Sticky — retained from an earlier generation",
    svg: svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')
  },
  unknown: {
    label: "Activation type unavailable",
    svg: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>')
  }
};

// src/styles.ts
var styles = `
.wiv-root { position: relative; width: var(--wiv-size, 52px); height: var(--wiv-size, 52px); color: var(--lumiverse-text, CanvasText); font-family: inherit; --wiv-constant: #60A5FA; --wiv-keyword: #4ADE80; --wiv-vector: #C084FC; }
[data-theme-mode="light"] .wiv-root { --wiv-constant: #2563EB; --wiv-keyword: #15803D; --wiv-vector: #7C3AED; }
.wiv-root [hidden] { display: none !important; }
.wiv-trigger {
  position: relative; display: grid; place-items: center; width: var(--wiv-size, 52px); height: var(--wiv-size, 52px);
  box-sizing: border-box; padding: 0; border: 1px solid var(--lumiverse-border-hover, GrayText);
  border-radius: 50%; background: var(--lumiverse-bg, Canvas);
  color: var(--lumiverse-text, CanvasText); box-shadow: var(--lumiverse-shadow-md, 0 8px 24px #0006);
  cursor: pointer; touch-action: none; user-select: none; transition: background 150ms, border-color 150ms;
}
.wiv-trigger:hover, .wiv-trigger[aria-expanded="true"] { background: var(--lumiverse-bg-hover, Canvas); border-color: var(--lumiverse-primary, Highlight); }
.wiv-trigger:focus-visible { outline: 2px solid var(--lumiverse-primary, Highlight); outline-offset: 3px; }
.wiv-trigger.wiv-dragging { cursor: grabbing; }
.wiv-icon { display: block; width: var(--wiv-globe-size, 26px); height: var(--wiv-globe-size, 26px); pointer-events: none; }
.wiv-badge {
  position: absolute; right: -4px; bottom: -2px; min-width: var(--wiv-badge-size, 21px); height: var(--wiv-badge-size, 21px);
  display: grid; place-items: center; box-sizing: border-box; padding: 0 5px;
  border: 2px solid var(--lumiverse-bg, Canvas); border-radius: 12px;
  background: var(--lumiverse-primary, Highlight); color: var(--lumiverse-primary-contrast, var(--lumiverse-text, HighlightText));
  font-size: var(--wiv-badge-font-size, 11px); font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none;
}
.wiv-panel {
  position: absolute; z-index: 1; display: flex; flex-direction: column;
  width: 340px; max-height: 480px; box-sizing: border-box; overflow: hidden;
  border: 1px solid var(--lumiverse-border-hover, GrayText); border-radius: var(--lumiverse-radius-lg, 12px);
  background: var(--lumiverse-bg-deep, var(--lumiverse-bg, Canvas)); color: var(--lumiverse-text, CanvasText);
  box-shadow: var(--lumiverse-shadow-lg, 0 24px 80px #0008); font-size: calc(14px * var(--lumiverse-font-scale, 1));
  text-align: left; user-select: text; touch-action: auto; cursor: auto;
}
.wiv-panel:focus { outline: none; }
.wiv-list { padding: 14px 16px 16px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--lumiverse-border-hover, GrayText) transparent; }
.wiv-group + .wiv-group { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--lumiverse-border, GrayText); }
.wiv-book { margin: 0 0 8px; font: inherit; font-weight: 600; color: var(--lumiverse-primary-text, var(--lumiverse-text, CanvasText)); white-space: pre-wrap; overflow-wrap: anywhere; }
.wiv-entries { margin: 0; padding: 0; list-style: none; }
.wiv-entry { display: flex; align-items: flex-start; gap: 9px; padding: 4px 0; line-height: 1.5; }
.wiv-entry-name { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.wiv-entry-icon { display: inline-flex; width: 16px; height: 16px; flex: 0 0 16px; margin-top: .18em; color: var(--lumiverse-text-muted, GrayText); }
.wiv-entry-icon svg { width: 16px; height: 16px; }
.wiv-type-constant { color: var(--wiv-constant); }
.wiv-type-keyword { color: var(--wiv-keyword); }
.wiv-type-vector { color: var(--wiv-vector); }
.wiv-empty { display: grid; place-items: center; min-height: 80px; color: var(--lumiverse-text-muted, GrayText); font-size: 24px; }
.wiv-settings { padding: 16px; color: var(--lumiverse-text, CanvasText); background: var(--lumiverse-bg, Canvas); border: 1px solid var(--lumiverse-border, GrayText); border-radius: var(--lumiverse-radius-lg, 12px); }
.wiv-settings h3 { margin: 0 0 16px; font: inherit; font-weight: 600; }
.wiv-setting-status { margin: 8px 0 0; color: var(--lumiverse-text-muted, GrayText); font-size: 12px; }
.wiv-setting-status:empty { display: none; }
.wiv-size-setting[hidden] { display: none !important; }
.wiv-placement-setting { margin-bottom: 16px; }
.wiv-setting-label { margin-bottom: 8px; font-size: calc(13px * var(--lumiverse-font-scale, 1)); }
.wiv-root.wiv-toolbar { display: inline-flex !important; align-items: center; width: auto !important; height: 28px; min-width: 0 !important; flex: 0 0 auto !important; order: -1; --wiv-size: 28px; --wiv-globe-size: 14px; --wiv-badge-size: 14px; --wiv-badge-font-size: 9px; }
.wiv-root.wiv-toolbar[hidden] { display: none !important; }
.wiv-toolbar .wiv-trigger { border-radius: 6px; background: transparent; border-color: transparent; box-shadow: none; color: var(--lumiverse-text-muted, GrayText); touch-action: auto; }
.wiv-toolbar .wiv-trigger:hover, .wiv-toolbar .wiv-trigger[aria-expanded="true"] { background: var(--lumiverse-bg-hover, Canvas); color: var(--lumiverse-primary, Highlight); }
.wiv-toolbar .wiv-badge { right: -4px; bottom: -3px; border-width: 1px; padding: 0 3px; }
.wiv-root.wiv-popup { width: 100%; height: auto; }
.wiv-popup .wiv-panel { position: relative; }
@media (prefers-reduced-motion: reduce) { .wiv-trigger { transition: none; } }
`;

// src/active-chat.ts
function watchActiveChat(ctx, change) {
  let active = true;
  const publish = (value) => {
    if (active)
      change(value);
  };
  if (ctx.state && typeof ctx.state.get === "function" && typeof ctx.state.subscribe === "function") {
    try {
      const initial = ctx.state.get("chat.active");
      const unsubscribe = ctx.state.subscribe("chat.active", publish);
      publish(initial);
      return {
        sync: () => {},
        dispose: () => {
          active = false;
          unsubscribe();
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("PERMISSION_DENIED:spindle_authority_map_unwired") && !message.includes("SELECTOR_UNKNOWN:chat.active"))
        throw error;
    }
  }
  if (typeof ctx.getActiveChat !== "function") {
    throw new Error("World Info Visualizer requires an active-chat API from Lumiverse.");
  }
  const sync = () => {
    if (active)
      publish(ctx.getActiveChat());
  };
  sync();
  const timer = window.setInterval(sync, 250);
  return {
    sync,
    dispose: () => {
      active = false;
      window.clearInterval(timer);
    }
  };
}

// src/placement-settings.ts
var ICON_PLACEMENT_KEY = "ui:icon_placement";
var iconPlacement = (value) => value === "top_bar" ? "top_bar" : "floating";
function mountPlacementSettings(ctx, root, apply) {
  const settings = ctx.settings;
  if (!settings || typeof ctx.components?.mountSelect !== "function")
    return () => {};
  const field = document.createElement("div");
  field.className = "wiv-placement-setting";
  const label = document.createElement("div");
  label.className = "wiv-setting-label";
  label.textContent = "Icon placement";
  const target = document.createElement("div");
  const status = document.createElement("p");
  status.className = "wiv-setting-status";
  status.setAttribute("role", "status");
  field.append(label, target, status);
  root.append(field);
  let disposed = false;
  let revision = 0;
  let pending = 0;
  let writes = Promise.resolve();
  const select = ctx.components.mountSelect(target, {
    ariaLabel: "Icon placement",
    value: "floating",
    options: [{ value: "floating", label: "Floating" }, { value: "top_bar", label: "Top bar" }],
    onChange(value) {
      if (disposed)
        return;
      const placement = iconPlacement(value);
      const writeRevision = ++revision;
      receive(placement);
      pending++;
      status.textContent = "Saving…";
      writes = writes.then(async () => {
        if (disposed)
          return;
        try {
          await settings.set(ICON_PLACEMENT_KEY, placement);
          if (!disposed && revision === writeRevision)
            status.textContent = "";
        } catch (error) {
          if (!disposed && revision === writeRevision)
            status.textContent = "Could not save icon placement. Try again.";
          console.warn("[World Info Visualizer] Could not save icon placement:", error);
        }
      }).finally(() => {
        pending--;
      });
    }
  });
  function receive(value) {
    const placement = iconPlacement(value);
    apply(placement);
    select.update({ value: placement });
  }
  const unwatch = settings.watch(ICON_PLACEMENT_KEY, (value) => {
    if (disposed || pending)
      return;
    revision++;
    receive(value);
  });
  const readRevision = revision;
  settings.get(ICON_PLACEMENT_KEY).then((value) => {
    if (!disposed && revision === readRevision)
      receive(value);
  }).catch((error) => {
    if (!disposed && revision === readRevision)
      status.textContent = "Could not load icon placement. Using Floating.";
    console.warn("[World Info Visualizer] Could not load icon placement:", error);
  });
  return () => {
    disposed = true;
    unwatch();
    select.destroy();
    field.remove();
  };
}

// src/size-settings.ts
var MIN_GLOBE_SIZE = 32;
var MAX_GLOBE_SIZE = 52;
var GLOBE_SIZE_KEY = "ui:globe_size";
function globeSize(value) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(MIN_GLOBE_SIZE, Math.min(MAX_GLOBE_SIZE, Math.round(value))) : MAX_GLOBE_SIZE;
}
function mountSizeSettings(ctx, applySize, applyPlacement) {
  const settings = ctx.settings;
  if (!settings || typeof ctx.ui.mount !== "function" || typeof ctx.components?.mountRangeSlider !== "function") {
    console.warn("[World Info Visualizer] Native size settings are unavailable in this Lumiverse build.");
    return () => {};
  }
  const root = ctx.ui.mount("settings_extensions");
  root.classList.add("wiv-settings");
  root.setAttribute("lang", "en");
  const title = document.createElement("h3");
  title.textContent = "World Info Visualizer";
  const target = document.createElement("div");
  const status = document.createElement("p");
  status.className = "wiv-setting-status";
  status.setAttribute("role", "status");
  const sizeField = document.createElement("div");
  sizeField.className = "wiv-size-setting";
  sizeField.append(target, status);
  root.append(title);
  let disposed = false;
  let revision = 0;
  let dragging = false;
  let topBar = false;
  let committed = MAX_GLOBE_SIZE;
  let pendingWrites = 0;
  let writes = Promise.resolve();
  const slider = ctx.components.mountRangeSlider(target, {
    label: "Floating icon size",
    hint: "Drag to resize the globe. The original size is 52 px.",
    min: MIN_GLOBE_SIZE,
    max: MAX_GLOBE_SIZE,
    step: 1,
    integer: true,
    value: committed,
    format: { suffix: " px" },
    onDragValue(value) {
      if (disposed || topBar)
        return;
      revision++;
      dragging = value !== null;
      applySize(value === null ? committed : globeSize(value));
    },
    onCommit(value) {
      if (disposed || topBar)
        return;
      const size = globeSize(value);
      const writeRevision = ++revision;
      dragging = false;
      committed = size;
      applySize(size);
      pendingWrites++;
      status.textContent = "Saving…";
      writes = writes.then(async () => {
        if (disposed)
          return;
        try {
          await settings.set(GLOBE_SIZE_KEY, size);
          if (!disposed && revision === writeRevision)
            status.textContent = "";
        } catch (error) {
          if (!disposed && revision === writeRevision)
            status.textContent = "Could not save icon size. Try again.";
          console.warn("[World Info Visualizer] Could not save icon size:", error);
        }
      }).finally(() => {
        pendingWrites--;
      });
    }
  });
  const disposePlacement = mountPlacementSettings(ctx, root, (placement) => {
    topBar = placement === "top_bar";
    sizeField.hidden = topBar;
    dragging = false;
    applySize(committed);
    slider.update({ disabled: topBar });
    applyPlacement(placement);
  });
  root.append(sizeField);
  const receive = (value) => {
    committed = globeSize(value);
    applySize(committed);
    slider.update({ value: committed });
  };
  const unwatch = settings.watch(GLOBE_SIZE_KEY, (value) => {
    if (disposed || dragging || pendingWrites)
      return;
    revision++;
    receive(value);
  });
  const readRevision = revision;
  settings.get(GLOBE_SIZE_KEY).then((value) => {
    if (!disposed && revision === readRevision)
      receive(value);
  }).catch((error) => {
    if (!disposed && revision === readRevision)
      status.textContent = "Could not load saved icon size. Using the default size.";
    console.warn("[World Info Visualizer] Could not load icon size:", error);
  });
  return () => {
    disposed = true;
    disposePlacement();
    unwatch();
    slider.destroy();
    root.replaceChildren();
  };
}

// src/frontend.ts
var GLOBE = '<svg class="wiv-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
var EVENTS = ["WORLD_INFO_ACTIVATED", "GENERATION_STARTED", "STREAM_TOKEN_RECEIVED", "GENERATION_ENDED", "GENERATION_STOPPED"];
var PAD = 12;
function setup(ctx) {
  const model = new ActivationModel;
  const disposers = [];
  let disposed = false;
  let open = false;
  let positionFrame = 0;
  let syncActiveChat = () => {};
  let size = MAX_GLOBE_SIZE;
  let placement = "floating";
  let toolbarRoot = null;
  let popup = null;
  let popupRect = "";
  const geometry = ctx.ui.geometry;
  const viewport = () => geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight };
  const layoutPx = (value) => geometry?.toLayoutPx(value) ?? value;
  const rect = (element) => geometry?.layoutElementRect(element) ?? element.getBoundingClientRect();
  const options = {
    width: size,
    height: size,
    chromeless: true,
    snapToEdge: false,
    resizable: false,
    persistGeometry: "world-info-visualizer-globe",
    initialPosition: { x: 20, y: Math.max(PAD, viewport().height - size - 24) },
    tooltip: "World Info — drag to move"
  };
  const widget = ctx.ui.createFloatWidget(options);
  const root = widget.root;
  root.classList.add("wiv-root");
  root.lang = "en";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wiv-trigger";
  button.innerHTML = GLOBE;
  button.setAttribute("aria-expanded", "false");
  const badge = document.createElement("span");
  badge.className = "wiv-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.hidden = true;
  button.append(badge);
  const panel = document.createElement("section");
  panel.className = "wiv-panel";
  panel.id = `wiv-panel-${widget.widgetId}`;
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("aria-label", "Active World Info entries");
  button.setAttribute("aria-controls", panel.id);
  const list = document.createElement("div");
  list.className = "wiv-list";
  panel.append(list);
  root.append(button, panel);
  function listen(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    disposers.push(() => target.removeEventListener(event, handler, options));
  }
  function positionPanel() {
    if (disposed || !open)
      return;
    if (!button.isConnected) {
      setOpen(false);
      return;
    }
    const view = viewport();
    const anchor = rect(button);
    panel.style.width = `${Math.max(1, Math.min(340, view.width - PAD * 2))}px`;
    const availableHeight = placement === "top_bar" ? Math.max(view.height - anchor.y - anchor.height - PAD * 2, anchor.y - PAD * 2) : view.height - PAD * 2;
    const maxHeight = Math.max(1, Math.min(480, availableHeight));
    panel.style.maxHeight = `${maxHeight}px`;
    const measured = rect(panel);
    const width = Math.max(1, Math.min(340, view.width - PAD * 2));
    const height = Math.max(1, Math.min(measured.height, maxHeight));
    const x = Math.max(PAD, Math.min(anchor.x, view.width - width - PAD));
    const above = anchor.y - height - PAD;
    const below = anchor.y + anchor.height + PAD;
    const preferredY = placement === "top_bar" ? below + height <= view.height - PAD ? below : above : above >= PAD ? above : below;
    const y = Math.max(PAD, Math.min(preferredY, view.height - height - PAD));
    if (placement === "top_bar" && popup) {
      const nextRect = `${x},${y},${width},${height}`;
      if (popupRect !== nextRect) {
        popup.setSize(width, height);
        popup.moveTo(x, y);
        popupRect = nextRect;
      }
      positionFrame = requestAnimationFrame(() => {
        if (!button.isConnected)
          setOpen(false);
        else
          positionPanel();
      });
    } else {
      panel.style.left = `${x - anchor.x}px`;
      panel.style.top = `${y - anchor.y}px`;
    }
  }
  function schedulePosition() {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(positionPanel);
  }
  function applySize(next) {
    if (disposed)
      return;
    size = next;
    root.style.setProperty("--wiv-size", `${size}px`);
    root.style.setProperty("--wiv-globe-size", `${size / 2}px`);
    root.style.setProperty("--wiv-badge-size", `${Math.max(16, size * 21 / 52)}px`);
    root.style.setProperty("--wiv-badge-font-size", `${Math.max(9, size * 11 / 52)}px`);
    widget.setSize(size, size);
    const view = viewport();
    const position = widget.getPosition();
    widget.moveTo(Math.max(PAD, Math.min(position.x, view.width - size - PAD)), Math.max(PAD, Math.min(position.y, view.height - size - PAD)));
    if (open)
      schedulePosition();
  }
  function setOpen(next, restoreFocus = false) {
    open = next && model.chatId !== null && button.isConnected;
    cancelAnimationFrame(positionFrame);
    if (open && placement === "top_bar") {
      if (!popup) {
        const popupOptions = {
          width: 340,
          height: 120,
          chromeless: true,
          snapToEdge: false,
          persistGeometry: false,
          resizable: false
        };
        popup = ctx.ui.createFloatWidget(popupOptions);
        popup.root.classList.add("wiv-root", "wiv-popup");
        popup.root.lang = "en";
      }
      panel.style.left = "0px";
      panel.style.top = "0px";
      popup.root.append(panel);
      popupRect = "";
    }
    popup?.setVisible(open && placement === "top_bar");
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      if (placement === "floating")
        positionPanel();
      schedulePosition();
      panel.focus({ preventScroll: true });
    } else if (restoreFocus && button.isConnected)
      button.focus({ preventScroll: true });
  }
  function applyPlacement(next) {
    if (disposed || placement === next)
      return;
    setOpen(false);
    if (drag && button.hasPointerCapture?.(drag.pointerId))
      button.releasePointerCapture(drag.pointerId);
    drag = null;
    suppressClickUntil = 0;
    button.classList.remove("wiv-dragging");
    if (next === "top_bar") {
      if (!toolbarRoot) {
        toolbarRoot = ctx.ui.mount("chat_top_dock");
        toolbarRoot.classList.add("wiv-root", "wiv-toolbar");
        toolbarRoot.lang = "en";
      }
      toolbarRoot.append(button);
    } else {
      root.append(button, panel);
    }
    placement = next;
    render();
  }
  function render() {
    const count = model.entries.length;
    badge.hidden = count === 0;
    badge.textContent = count ? String(count) : "";
    const label = count ? `World Info: ${count} active ${count === 1 ? "entry" : "entries"}` : "World Info";
    button.setAttribute("aria-label", label);
    button.title = `${label} — click to view${placement === "floating" ? ", drag to move" : ""}`;
    list.replaceChildren();
    if (!count) {
      const empty = document.createElement("div");
      empty.className = "wiv-empty";
      empty.textContent = "?";
      empty.setAttribute("aria-label", "No active entries recorded");
      list.append(empty);
    } else {
      for (const group of groupEntries(model.entries)) {
        const section = document.createElement("section");
        section.className = "wiv-group";
        const title = document.createElement("h2");
        title.className = "wiv-book";
        title.textContent = group.name;
        const entries = document.createElement("ul");
        entries.className = "wiv-entries";
        for (const entry of group.entries) {
          const row = document.createElement("li");
          row.className = "wiv-entry";
          const type = entryActivationType(entry);
          const icon = document.createElement("span");
          icon.className = `wiv-entry-icon wiv-type-${type}`;
          icon.title = activationIcons[type].label;
          icon.setAttribute("role", "img");
          icon.setAttribute("aria-label", activationIcons[type].label);
          icon.innerHTML = activationIcons[type].svg;
          const name = document.createElement("span");
          name.className = "wiv-entry-name";
          name.textContent = entryLabel(entry);
          row.append(icon, name);
          row.title = entryLabel(entry);
          entries.append(row);
        }
        section.append(title, entries);
        list.append(section);
      }
    }
    widget.setVisible(model.chatId !== null && placement === "floating");
    if (toolbarRoot)
      toolbarRoot.hidden = model.chatId === null || placement !== "top_bar";
    if (!model.chatId)
      setOpen(false);
    if (open)
      schedulePosition();
  }
  let drag = null;
  let suppressClickUntil = 0;
  listen(button, "pointerdown", (event) => {
    const pointer = event;
    event.stopPropagation();
    if (pointer.button !== 0 || placement !== "floating")
      return;
    const origin = widget.getPosition();
    drag = { pointerId: pointer.pointerId, x: layoutPx(pointer.clientX), y: layoutPx(pointer.clientY), originX: origin.x, originY: origin.y, moved: false };
    button.setPointerCapture?.(pointer.pointerId);
  });
  listen(button, "pointermove", (event) => {
    const pointer = event;
    event.stopPropagation();
    if (!drag || pointer.pointerId !== drag.pointerId)
      return;
    const dx = layoutPx(pointer.clientX) - drag.x;
    const dy = layoutPx(pointer.clientY) - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5)
      return;
    drag.moved = true;
    button.classList.add("wiv-dragging");
    setOpen(false);
    event.preventDefault();
    const view = viewport();
    widget.moveTo(Math.max(PAD, Math.min(drag.originX + dx, view.width - size - PAD)), Math.max(PAD, Math.min(drag.originY + dy, view.height - size - PAD)));
  });
  const endDrag = (event) => {
    const pointer = event;
    event.stopPropagation();
    if (!drag || pointer.pointerId !== drag.pointerId)
      return;
    if (drag.moved || event.type === "pointercancel")
      suppressClickUntil = Date.now() + 350;
    drag = null;
    button.classList.remove("wiv-dragging");
    if (button.hasPointerCapture?.(pointer.pointerId))
      button.releasePointerCapture(pointer.pointerId);
  };
  listen(button, "pointerup", endDrag);
  listen(button, "pointercancel", endDrag);
  listen(button, "lostpointercapture", endDrag);
  listen(button, "click", (event) => {
    event.stopPropagation();
    if (event.detail > 0 && Date.now() < suppressClickUntil)
      return;
    syncActiveChat();
    setOpen(!open);
  });
  listen(panel, "pointerdown", (event) => event.stopPropagation());
  listen(panel, "pointerup", (event) => event.stopPropagation());
  listen(panel, "click", (event) => event.stopPropagation());
  listen(document, "pointerdown", (event) => {
    const path = event.composedPath();
    if (open && !path.includes(button) && !path.includes(panel))
      setOpen(false);
  }, { capture: true });
  listen(document, "keydown", (event) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false, true);
    }
  }, { capture: true });
  listen(window, "resize", schedulePosition);
  if (window.visualViewport) {
    listen(window.visualViewport, "resize", schedulePosition);
    listen(window.visualViewport, "scroll", schedulePosition);
  }
  const cleanup = () => {
    if (disposed)
      return;
    disposed = true;
    cancelAnimationFrame(positionFrame);
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch {}
    }
    root.replaceChildren();
    toolbarRoot?.replaceChildren();
    toolbarRoot?.classList.remove("wiv-root", "wiv-toolbar");
    if (toolbarRoot)
      toolbarRoot.hidden = false;
    popup?.root.replaceChildren();
    popup?.destroy();
    widget.destroy();
  };
  try {
    disposers.push(ctx.dom.addStyle(styles));
    applySize(MAX_GLOBE_SIZE);
    disposers.push(mountSizeSettings(ctx, applySize, applyPlacement));
    const changeChat = (value) => {
      const chatId = value && typeof value === "object" ? value.chatId : null;
      if (model.switchChat(typeof chatId === "string" ? chatId : null)) {
        setOpen(false);
        render();
      }
    };
    const activeChat = watchActiveChat(ctx, changeChat);
    syncActiveChat = activeChat.sync;
    disposers.push(activeChat.dispose);
    for (const event of EVENTS) {
      disposers.push(ctx.events.on(event, (payload) => {
        if (disposed)
          return;
        syncActiveChat();
        if (!model.event(event, payload))
          return;
        render();
        const entriesApi = ctx.worldBooks?.entries;
        if (event === "WORLD_INFO_ACTIVATED" && typeof entriesApi === "function") {
          const snapshot = model.entries;
          const fetchEntries = entriesApi;
          hydrateActivationTypes(snapshot, (bookId) => fetchEntries.call(ctx.worldBooks, bookId)).then((enriched) => {
            if (disposed || model.entries !== snapshot || !enriched.some((entry, index) => entry !== snapshot[index]))
              return;
            model.entries = enriched;
            render();
          }).catch(() => {});
        }
      }));
    }
    const teardown = ctx.onTeardown?.(cleanup);
    if (teardown)
      disposers.push(teardown);
    render();
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
export {
  setup
};
