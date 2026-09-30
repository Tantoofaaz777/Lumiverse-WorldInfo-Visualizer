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
.wiv-root { position: relative; width: 52px; height: 52px; color: var(--lumiverse-text, #eee); font-family: inherit; --wiv-constant: #60A5FA; --wiv-keyword: #4ADE80; --wiv-vector: #C084FC; }
[data-theme-mode="light"] .wiv-root { --wiv-constant: #2563EB; --wiv-keyword: #15803D; --wiv-vector: #7C3AED; }
.wiv-root [hidden] { display: none !important; }
.wiv-trigger {
  position: relative; display: grid; place-items: center; width: 52px; height: 52px;
  box-sizing: border-box; padding: 0; border: 1px solid var(--lumiverse-border-hover, #685685);
  border-radius: 50%; background: var(--lumiverse-bg-opaque, #1c1826);
  color: var(--lumiverse-icon, #eee); box-shadow: var(--lumiverse-shadow-md, 0 8px 24px #0006);
  cursor: pointer; touch-action: none; user-select: none; transition: background 150ms, border-color 150ms;
}
.wiv-trigger:hover, .wiv-trigger[aria-expanded="true"] { background: var(--lumiverse-bg-hover, #2d283a); border-color: var(--lumiverse-primary, #9370db); }
.wiv-trigger:focus-visible { outline: 2px solid var(--lumiverse-primary, #9370db); outline-offset: 3px; }
.wiv-trigger.wiv-dragging { cursor: grabbing; }
.wiv-icon { display: block; width: 26px; height: 26px; pointer-events: none; }
.wiv-badge {
  position: absolute; right: -4px; bottom: -2px; min-width: 21px; height: 21px;
  display: grid; place-items: center; box-sizing: border-box; padding: 0 5px;
  border: 2px solid var(--lumiverse-bg-opaque, #1c1826); border-radius: 12px;
  background: var(--lumiverse-primary, #9370db); color: var(--lumiverse-text, #fff);
  font-size: 11px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; pointer-events: none;
}
.wiv-panel {
  position: absolute; z-index: 1; display: flex; flex-direction: column;
  width: 340px; max-height: 480px; box-sizing: border-box; overflow: hidden;
  border: 1px solid var(--lumiverse-border-hover, #685685); border-radius: var(--lumiverse-radius-lg, 12px);
  background: var(--lumiverse-bg-opaque, #1c1826); color: var(--lumiverse-text, #eee);
  box-shadow: var(--lumiverse-shadow-lg, 0 24px 80px #0008); font-size: calc(14px * var(--lumiverse-font-scale, 1));
  text-align: left; user-select: text; touch-action: auto; cursor: auto;
}
.wiv-panel:focus { outline: none; }
.wiv-list { padding: 14px 16px 16px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--lumiverse-border-hover, #685685) transparent; }
.wiv-group + .wiv-group { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--lumiverse-border, #3a3049); }
.wiv-book { margin: 0 0 8px; font: inherit; font-weight: 600; color: var(--lumiverse-primary-text, #ba87ff); white-space: pre-wrap; overflow-wrap: anywhere; }
.wiv-entries { margin: 0; padding: 0; list-style: none; }
.wiv-entry { display: flex; align-items: flex-start; gap: 9px; padding: 4px 0; line-height: 1.5; }
.wiv-entry-name { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.wiv-entry-icon { display: inline-flex; width: 16px; height: 16px; flex: 0 0 16px; margin-top: .18em; color: var(--lumiverse-text-muted, #aaa); }
.wiv-entry-icon svg { width: 16px; height: 16px; }
.wiv-type-constant { color: var(--wiv-constant); }
.wiv-type-keyword { color: var(--wiv-keyword); }
.wiv-type-vector { color: var(--wiv-vector); }
.wiv-empty { display: grid; place-items: center; min-height: 80px; color: var(--lumiverse-text-muted, #aaa); font-size: 24px; }
@media (prefers-reduced-motion: reduce) { .wiv-trigger { transition: none; } }
`;

// src/frontend.ts
var GLOBE = '<svg class="wiv-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>';
var EVENTS = ["WORLD_INFO_ACTIVATED", "GENERATION_STARTED", "STREAM_TOKEN_RECEIVED", "GENERATION_ENDED", "GENERATION_STOPPED"];
var SIZE = 52;
var PAD = 12;
function setup(ctx) {
  if (!ctx.state)
    throw new Error("World Info Visualizer requires Lumiverse state selectors.");
  const model = new ActivationModel;
  const disposers = [];
  let disposed = false;
  let open = false;
  let positionFrame = 0;
  const geometry = ctx.ui.geometry;
  const viewport = () => geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight };
  const layoutPx = (value) => geometry?.toLayoutPx(value) ?? value;
  const rect = (element) => geometry?.layoutElementRect(element) ?? element.getBoundingClientRect();
  const options = {
    width: SIZE,
    height: SIZE,
    chromeless: true,
    snapToEdge: false,
    resizable: false,
    persistGeometry: "world-info-visualizer-globe",
    initialPosition: { x: 20, y: Math.max(PAD, viewport().height - SIZE - 24) },
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
    if (disposed || !open || !button.isConnected)
      return;
    const view = viewport();
    const anchor = rect(button);
    panel.style.width = `${Math.max(1, Math.min(340, view.width - PAD * 2))}px`;
    panel.style.maxHeight = `${Math.max(1, Math.min(480, view.height - PAD * 2))}px`;
    const size = rect(panel);
    const x = Math.max(PAD, Math.min(anchor.x, view.width - size.width - PAD));
    const preferredY = anchor.y - size.height - 12;
    const y = Math.max(PAD, Math.min(preferredY >= PAD ? preferredY : anchor.bottom + 12, view.height - size.height - PAD));
    panel.style.left = `${x - anchor.x}px`;
    panel.style.top = `${y - anchor.y}px`;
  }
  function schedulePosition() {
    cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(positionPanel);
  }
  function setOpen(next, restoreFocus = false) {
    open = next && model.chatId !== null;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      positionPanel();
      schedulePosition();
      panel.focus({ preventScroll: true });
    } else if (restoreFocus && button.isConnected)
      button.focus({ preventScroll: true });
  }
  function render() {
    const count = model.entries.length;
    badge.hidden = count === 0;
    badge.textContent = count ? String(count) : "";
    const label = count ? `World Info: ${count} active ${count === 1 ? "entry" : "entries"}` : "World Info";
    button.setAttribute("aria-label", label);
    button.title = `${label} — click to view, drag to move`;
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
    widget.setVisible(model.chatId !== null);
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
    if (pointer.button !== 0)
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
    widget.moveTo(Math.max(PAD, Math.min(drag.originX + dx, view.width - SIZE - PAD)), Math.max(PAD, Math.min(drag.originY + dy, view.height - SIZE - PAD)));
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
    setOpen(!open);
  });
  listen(panel, "pointerdown", (event) => event.stopPropagation());
  listen(panel, "pointerup", (event) => event.stopPropagation());
  listen(panel, "click", (event) => event.stopPropagation());
  listen(document, "pointerdown", (event) => {
    if (open && !event.composedPath().includes(root))
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
    widget.destroy();
  };
  try {
    disposers.push(ctx.dom.addStyle(styles));
    const changeChat = (value) => {
      const chatId = value && typeof value === "object" ? value.chatId : null;
      if (model.switchChat(typeof chatId === "string" ? chatId : null)) {
        setOpen(false);
        render();
      }
    };
    changeChat(ctx.state.get("chat.active"));
    disposers.push(ctx.state.subscribe("chat.active", changeChat));
    for (const event of EVENTS) {
      disposers.push(ctx.events.on(event, (payload) => {
        if (disposed || !model.event(event, payload))
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
