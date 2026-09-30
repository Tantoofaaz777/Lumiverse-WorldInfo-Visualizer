export const styles = `
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
`
