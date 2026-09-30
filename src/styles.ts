export const styles = `
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
.wiv-root.wiv-toolbar { display: inline-flex !important; align-items: center; width: auto !important; height: 28px; min-width: 0 !important; flex: 0 0 auto !important; order: -1; margin-inline-start: 0 !important; margin-inline-end: auto !important; --wiv-size: 28px; --wiv-globe-size: 14px; --wiv-badge-size: 14px; --wiv-badge-font-size: 9px; }
.wiv-root.wiv-toolbar[hidden] { display: none !important; }
.wiv-toolbar .wiv-trigger { border-radius: 6px; background: transparent; border-color: transparent; box-shadow: none; color: var(--lumiverse-text-muted, GrayText); touch-action: auto; }
.wiv-toolbar .wiv-trigger:hover, .wiv-toolbar .wiv-trigger[aria-expanded="true"] { background: var(--lumiverse-bg-hover, Canvas); color: var(--lumiverse-primary, Highlight); }
.wiv-toolbar .wiv-badge { right: -4px; bottom: -3px; border-width: 1px; padding: 0 3px; }
.wiv-root.wiv-popup { width: 100%; height: auto; }
.wiv-popup .wiv-panel { position: relative; }
@media (prefers-reduced-motion: reduce) { .wiv-trigger { transition: none; } }
`
