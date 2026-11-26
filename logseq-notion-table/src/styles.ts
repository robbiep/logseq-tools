export const STYLES = `
.table-wrapper[data-nt-hidden="true"] {
  display: none !important;
}

.nt-host {
  --nt-border: var(--ls-border-color, rgba(127, 127, 127, 0.25));
  --nt-bg: var(--ls-primary-background-color, #ffffff);
  --nt-header-bg: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.08));
  --nt-hover-bg: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.06));
  --nt-accent: var(--ls-active-primary-color, #2383e2);
  --nt-text: var(--ls-primary-text-color, inherit);
  --nt-muted: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.78));
  --nt-danger: var(--ls-error-text-color, #e03e3e);

  position: relative;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin: 2px 0 4px 0;
  box-sizing: border-box;
  color: var(--nt-text);
  font-family: inherit;
  font-size: 0.94em;
  line-height: 1.4;
  user-select: text;
}

/* Hover floating toolbar positioned completely above the table & column handles */
.nt-toolbar {
  position: absolute;
  bottom: calc(100% + 4px);
  right: 0;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border-radius: 6px;
  border: 1px solid var(--nt-border);
  background: var(--nt-bg);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
  opacity: 0;
  pointer-events: none;
  transform: translateY(2px);
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.nt-toolbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 18px;
}

.nt-host:hover .nt-toolbar,
.nt-host:focus-within .nt-toolbar,
.nt-toolbar:hover {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.nt-tb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  min-width: 24px;
  padding: 0 5px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nt-muted);
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.nt-tb-btn:hover {
  background: var(--nt-hover-bg);
  color: var(--nt-text);
}

.nt-tb-btn:disabled {
  opacity: 0.32;
  cursor: default;
  pointer-events: none;
}

.nt-tb-btn.nt-active {
  color: var(--nt-accent);
  background: rgba(35, 131, 226, 0.12);
}

.nt-tb-btn.nt-tb-calc-btn {
  font-weight: 400;
}

.nt-tb-btn.nt-tb-calc-btn.nt-active {
  font-weight: 700;
}

.nt-tb-sep {
  width: 1px;
  height: 14px;
  margin: 0 2px;
  background: var(--nt-border);
}

/* Floating Notion-style bulk action dialog when row checkboxes are checked */
.nt-bulk-bar {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  z-index: 32;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  padding: 2px 5px;
  border-radius: 6px;
  border: 1px solid var(--nt-border);
  background: var(--nt-bg);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
}

.nt-host.nt-has-row-selection:not(.nt-locked) .nt-toolbar {
  opacity: 0;
  pointer-events: none;
}

.nt-host.nt-maximized .nt-bulk-bar {
  position: fixed;
  top: 12px;
  bottom: auto;
  left: 20px;
}

.nt-bulk-count {
  padding: 0 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--nt-accent);
  white-space: nowrap;
}

.nt-bulk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  padding: 0 7px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nt-text);
  cursor: pointer;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.nt-bulk-btn:hover {
  background: var(--nt-hover-bg);
}

.nt-bulk-btn.nt-bulk-delete {
  padding: 0 6px;
  color: var(--nt-muted);
}

.nt-bulk-btn.nt-bulk-delete:hover {
  background: rgba(224, 62, 62, 0.12);
  color: var(--nt-danger);
}

/* Scroll container with breathing room for handles & + bars (without overlapping outliner bullet) */
.nt-scroll-wrap {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.nt-lock-badge {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid var(--nt-border);
  border-radius: 4px;
  background: var(--nt-bg);
  color: var(--nt-accent);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}

.nt-lock-badge:hover {
  background: var(--nt-accent);
  border-color: var(--nt-accent);
  color: #ffffff;
}

.nt-host.nt-maximized .nt-lock-badge {
  top: 6px;
  left: 8px;
}

.nt-host.nt-locked table.nt-table th,
.nt-host.nt-locked table.nt-table td,
.nt-host.nt-locked .nt-checkbox-cell,
.nt-host.nt-locked .nt-select-cell,
.nt-host.nt-locked .nt-col-checkbox,
.nt-host.nt-locked .nt-checkbox,
.nt-host.nt-locked table.nt-table tfoot td.nt-calc-cell,
.nt-host.nt-locked .nt-calc-btn {
  cursor: default;
}

.nt-scroll {
  position: relative;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: auto;
  max-height: 75vh;
  padding: 10px 16px 8px 26px;
  margin: 0;
  box-sizing: border-box;
}

.nt-scroll:focus {
  outline: none;
}

.nt-scroll:focus-visible {
  outline: 2px solid var(--nt-accent);
  outline-offset: -2px;
  border-radius: 6px;
}

.nt-table-col-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
  width: max-content;
  max-width: none;
}

.nt-host.nt-full-width .nt-table-col-wrap {
  display: flex;
  width: max-content;
  min-width: 100%;
}

.nt-table-row-wrap {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
  width: 100%;
}

.nt-host.nt-full-width .nt-table-row-wrap {
  width: 100%;
}

/* Core table */
table.nt-table {
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid var(--nt-border);
  border-radius: 6px;
  background: var(--nt-bg);
  margin: 0 !important;
  width: auto !important;
  max-width: none !important;
  table-layout: auto;
}

.nt-host.nt-full-width table.nt-table {
  width: 100% !important;
  flex: 1 1 auto;
}

table.nt-table th,
table.nt-table td {
  position: relative;
  min-width: 72px;
  padding: 4px 7px !important;
  border-right: 1px solid var(--nt-border) !important;
  border-bottom: 1px solid var(--nt-border) !important;
  border-top: none !important;
  border-left: none !important;
  vertical-align: top !important;
  text-align: left;
  background: transparent;
  box-sizing: border-box;
  word-break: break-word;
  cursor: text;
  transition: background-color 0.1s ease;
}

table.nt-table th:last-child,
table.nt-table td:last-child {
  border-right: none !important;
}

table.nt-table tbody tr:last-child td {
  border-bottom: none !important;
}

/* Rounded outer cell corners */
table.nt-table thead tr:first-child th:first-child {
  border-top-left-radius: 5px;
}
table.nt-table thead tr:first-child th:last-child {
  border-top-right-radius: 5px;
}
table.nt-table tbody tr:last-child td:first-child {
  border-bottom-left-radius: 5px;
}
table.nt-table tbody tr:last-child td:last-child {
  border-bottom-right-radius: 5px;
}

/* Header row */
table.nt-table thead th {
  background: var(--nt-header-bg) !important;
  font-weight: 600;
}

/* Sticky column headers when scrolling vertically */
.nt-scroll table.nt-table thead th {
  position: sticky;
  top: 0;
  z-index: 8;
  background: linear-gradient(var(--nt-header-bg), var(--nt-header-bg)), var(--nt-bg) !important;
}

.nt-scroll table.nt-table thead th:hover,
.nt-scroll table.nt-table thead th.nt-cell-active {
  z-index: 9;
}

table.nt-table tbody tr:hover td {
  background-color: var(--nt-hover-bg);
}

table.nt-table th.nt-cell-active,
table.nt-table td.nt-cell-active {
  box-shadow: inset 0 0 0 2px var(--nt-accent) !important;
  background: var(--nt-bg) !important;
  z-index: 2;
}

.nt-host.nt-selecting {
  user-select: none;
}

table.nt-table tbody tr.nt-row-selected td {
  background-color: rgba(35, 131, 226, 0.11) !important;
}

table.nt-table tbody tr.nt-row-selected:hover td {
  background-color: rgba(35, 131, 226, 0.16) !important;
}

table.nt-table th.nt-cell-selected,
table.nt-table td.nt-cell-selected {
  background-color: rgba(35, 131, 226, 0.12) !important;
}

table.nt-table th.nt-align-left,
table.nt-table td.nt-align-left {
  text-align: left;
}
table.nt-table th.nt-align-center,
table.nt-table td.nt-align-center {
  text-align: center;
}
table.nt-table th.nt-align-right,
table.nt-table td.nt-align-right {
  text-align: right;
}

/* Cell display & inline editor */
table.nt-table th > .nt-cell-display,
table.nt-table td > .nt-cell-display,
table.nt-table th > .nt-header-inner {
  max-width: var(--nt-cell-max-w, 360px);
}

table.nt-table td:not(.nt-col-resized) > .nt-cell-display:has(.nt-img-wrap) {
  max-width: none;
}

.nt-cell-display {
  min-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}

.nt-cell-display:empty::after {
  content: '\\00a0';
  opacity: 0;
}

.nt-cell-editor {
  display: block;
  width: 100%;
  min-height: 20px;
  padding: 0;
  margin: 0;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  background: transparent !important;
  color: var(--nt-text) !important;
  font: inherit !important;
  line-height: inherit !important;
  text-align: inherit;
  resize: none;
  overflow: hidden;
  box-sizing: border-box;
}

/* Inline rich markdown tokens inside cells */
.nt-inline-code {
  font-family: var(--ls-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.88em;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--nt-header-bg);
}

.nt-highlight {
  background: rgba(250, 204, 21, 0.35);
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.nt-page-ref {
  color: var(--ls-link-text-color, var(--nt-accent));
  text-decoration: none;
  cursor: pointer;
}
.nt-page-ref:hover {
  text-decoration: underline;
}

.nt-tag {
  color: var(--ls-tag-text-color, var(--nt-accent));
  opacity: 0.85;
  text-decoration: none;
  cursor: pointer;
}
.nt-tag:hover {
  opacity: 1;
  text-decoration: underline;
}

.nt-ext-link {
  color: var(--ls-external-link-color, var(--nt-accent));
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.nt-checkbox {
  vertical-align: middle;
  margin: 0 4px 2px 0;
  cursor: pointer;
  accent-color: var(--nt-accent);
}

/* Column resize handle on right border of TH */
.nt-col-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}

.nt-col-resizer::after {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: background-color 0.12s ease;
}

.nt-col-resizer:hover::after,
.nt-col-resizer.nt-resizing::after {
  background: var(--nt-accent);
}

/* Row & Column drag/menu handles */
.nt-col-handle,
.nt-row-handle {
  position: absolute;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--nt-border);
  border-radius: 4px;
  background: var(--nt-bg);
  color: var(--nt-muted);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  cursor: grab;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;
  padding: 0;
}

.nt-col-handle {
  top: -11px;
  left: 50%;
  transform: translateX(-50%) rotate(90deg);
  width: 14px;
  height: 22px;
}

/* Continuous left gutter per row so hover never drops between cell edge, handle, and checkbox */
.nt-row-gutter {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -25px;
  width: 25px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding-right: 3px;
  box-sizing: border-box;
  pointer-events: auto;
}

.nt-row-handle {
  position: relative;
  top: auto;
  left: auto;
  transform: none;
  width: 13px;
  height: 19px;
  flex: 0 0 13px;
  margin-right: -9px;
  box-sizing: border-box;
}

.nt-calc-row-handle {
  position: absolute;
  top: 50%;
  left: -7px;
  transform: translateY(-50%);
  width: 13px;
  height: 19px;
  margin-right: 0;
}

.nt-calc-row-handle::after {
  content: '';
  position: absolute;
  top: -4px;
  bottom: -4px;
  left: -3px;
  right: -3px;
}

/* Notion-style row selection checkbox in left gutter */
.nt-row-select {
  --nt-check-icon: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2.3' stroke-linecap='round' stroke-linejoin='round'><path d='M3.5 8.5l3 3 6-7'/></svg>");
  --nt-dash-icon: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='2.3' stroke-linecap='round'><path d='M3.5 8h9'/></svg>");

  appearance: none;
  -webkit-appearance: none;
  position: relative;
  flex: 0 0 14px;
  z-index: 6;
  display: inline-grid;
  place-content: center;
  inline-size: 14px;
  block-size: 14px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  border: 1.5px solid var(--nt-border);
  border-radius: 3.5px;
  background: var(--nt-bg);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease, background-color 0.12s ease, border-color 0.12s ease;
}

.nt-row-select::before {
  content: '';
  inline-size: 10px;
  block-size: 10px;
  background-color: #ffffff;
  scale: 0;
  transition: scale 0.1s ease;
}

.nt-row-select:checked {
  background: var(--nt-accent);
  border-color: var(--nt-accent);
  opacity: 1;
  pointer-events: auto;
}

.nt-row-select:checked::before {
  -webkit-mask: var(--nt-check-icon) no-repeat center / contain;
  mask: var(--nt-check-icon) no-repeat center / contain;
  scale: 1;
}

.nt-row-select:indeterminate {
  background: var(--nt-accent);
  border-color: var(--nt-accent);
  opacity: 1;
  pointer-events: auto;
}

.nt-row-select:indeterminate::before {
  -webkit-mask: var(--nt-dash-icon) no-repeat center / contain;
  mask: var(--nt-dash-icon) no-repeat center / contain;
  scale: 1;
}

.nt-row-select:focus-visible {
  outline: 2px solid var(--nt-accent);
  outline-offset: 2px;
  opacity: 1;
  pointer-events: auto;
}

table.nt-table tr:hover .nt-row-gutter .nt-row-select,
.nt-row-gutter:hover .nt-row-select,
.nt-row-select:hover,
.nt-host.nt-has-row-selection .nt-row-select {
  opacity: 1;
  pointer-events: auto;
}

.nt-row-select:hover {
  border-color: var(--nt-accent);
}

table.nt-table thead th:hover .nt-col-handle,
.nt-col-handle:hover,
.nt-col-handle.nt-handle-open {
  opacity: 1;
  pointer-events: auto;
}

table.nt-table tr:hover .nt-row-gutter .nt-row-handle,
table.nt-table tr:hover .nt-row-handle,
.nt-row-gutter:hover .nt-row-handle,
.nt-row-handle:hover,
.nt-row-handle.nt-handle-open {
  opacity: 1;
  pointer-events: auto;
}

.nt-col-handle:hover,
.nt-row-handle:hover {
  background: var(--nt-accent);
  border-color: var(--nt-accent);
  color: #ffffff;
}

.nt-col-handle:active,
.nt-row-handle:active {
  cursor: grabbing;
}

/* Hover + bars to append row / column */
.nt-add-row-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  margin-top: 3px;
  border: none;
  border-radius: 4px;
  background: var(--nt-hover-bg);
  color: var(--nt-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease;
  padding: 0;
}

.nt-add-col-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  margin-left: 3px;
  border: none;
  border-radius: 4px;
  background: var(--nt-hover-bg);
  color: var(--nt-muted);
  cursor: pointer;
  opacity: 0;
  flex: 0 0 16px;
  transition: opacity 0.14s ease, background-color 0.14s ease, color 0.14s ease;
  padding: 0;
}

.nt-host:hover .nt-add-row-bar,
.nt-host:hover .nt-add-col-bar,
.nt-host:focus-within .nt-add-row-bar,
.nt-host:focus-within .nt-add-col-bar {
  opacity: 0.72;
}

.nt-add-row-bar:hover,
.nt-add-col-bar:hover {
  opacity: 1 !important;
  background: var(--nt-header-bg);
  color: var(--nt-text);
}

/* Drag-reorder indicators */
body.nt-dragging {
  cursor: grabbing !important;
  user-select: none !important;
}

.nt-drag-source {
  opacity: 0.45;
}

.nt-drag-ghost {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  opacity: 0.82;
  max-width: min(560px, 80vw);
  border-radius: 6px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  font-size: 0.94em;
  line-height: 1.4;
}

.nt-drag-ghost-table {
  width: 100% !important;
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  margin: 0 !important;
}

.nt-drag-ghost-table td {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nt-drag-ghost-more {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.85));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.08));
  border-top: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.22));
  text-align: center;
}

.nt-drag-ghost-badge {
  position: absolute;
  top: 4px;
  right: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ls-active-primary-color, #2383e2);
  color: #ffffff;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.nt-drop-indicator {
  position: fixed;
  z-index: 2147483645;
  background: var(--nt-accent);
  pointer-events: none;
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(35, 131, 226, 0.25);
}

/* Notion-style popover menu */
.nt-popover {
  position: fixed;
  z-index: 2147483647;
  min-width: 196px;
  max-width: 260px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--nt-border, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
  font-size: 13px;
  line-height: 1.35;
  user-select: none;
}

.nt-popover-header {
  padding: 4px 10px 3px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.8));
}

.nt-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nt-popover-item:hover:not(:disabled) {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.12));
}

.nt-popover-item.nt-danger {
  color: var(--ls-error-text-color, #e03e3e);
}

.nt-popover-item.nt-danger:hover:not(:disabled) {
  background: rgba(224, 62, 62, 0.12);
}

.nt-popover-item.nt-active {
  color: var(--ls-active-primary-color, #2383e2);
  font-weight: 500;
}

.nt-popover-item:disabled {
  opacity: 0.4;
  cursor: default;
}

.nt-popover-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 16px;
  opacity: 0.85;
}

.nt-popover-label {
  flex: 1 1 auto;
}

.nt-popover-shortcut {
  margin-left: 12px;
  font-size: 11px;
  opacity: 0.55;
  font-family: var(--ls-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.nt-popover-switch {
  position: relative;
  flex: 0 0 26px;
  width: 26px;
  height: 15px;
  margin-left: 12px;
  border-radius: 999px;
  background: var(--ls-border-color, rgba(127, 127, 127, 0.35));
  transition: background-color 0.14s ease;
}

.nt-popover-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.14s ease;
}

.nt-popover-switch.nt-on {
  background: var(--ls-active-primary-color, #2383e2);
}

.nt-popover-switch.nt-on::after {
  transform: translateX(11px);
}

.nt-popover-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--ls-border-color, rgba(127, 127, 127, 0.22));
}

/* Add Column dialog */
.nt-add-col-dialog {
  position: fixed;
  z-index: 2147483647;
  width: 224px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  font-size: 13px;
  line-height: 1.35;
  user-select: none;
}

.nt-acd-top {
  padding: 8px;
  border-bottom: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.18));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
}

.nt-acd-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-primary-background-color, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
}

.nt-acd-input:focus {
  outline: none;
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-acd-list {
  padding: 4px;
}

/* Maximized full-viewport mode */
.nt-host.nt-maximized {
  position: fixed;
  inset: 0;
  z-index: 2147483640;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 36px 40px 40px 40px;
  background: var(--nt-bg);
  overflow: hidden;
  box-sizing: border-box;
}

.nt-host.nt-maximized .nt-scroll-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.nt-host.nt-maximized .nt-toolbar {
  position: fixed;
  top: 12px;
  bottom: auto;
  right: 20px;
  opacity: 1;
  pointer-events: auto;
}

.nt-host.nt-maximized .nt-toolbar::after {
  display: none;
}

.nt-host.nt-maximized .nt-scroll {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-x: auto;
  overflow-y: auto;
  padding: 20px 24px 28px 30px;
  margin: 0;
}

/* Optional monospace raw source editor when editing table markdown */
textarea.nt-mono-source {
  font-family: var(--ls-font-family-mono, 'Fira Code', Menlo, Monaco, Consolas, monospace) !important;
  font-size: 0.92em !important;
}

/* [[Page]] / #tag autocomplete popup inside cell editor */
.nt-autocomplete {
  position: fixed;
  z-index: 2147483647;
  width: 290px;
  max-width: calc(100vw - 24px);
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  user-select: none;
}

.nt-ac-header {
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.8));
  border-bottom: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.16));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
}

.nt-ac-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.nt-ac-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nt-ac-item:hover,
.nt-ac-item.nt-ac-selected {
  background: var(--ls-tertiary-background-color, rgba(35, 131, 226, 0.12));
}

.nt-ac-item.nt-ac-selected {
  box-shadow: inset 2px 0 0 0 var(--ls-active-primary-color, #2383e2);
}

.nt-ac-main {
  min-width: 0;
  flex: 1 1 auto;
}

.nt-ac-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nt-ac-match {
  background: rgba(35, 131, 226, 0.2);
  color: inherit;
  font-weight: 600;
  border-radius: 2px;
  padding: 0 1px;
}

.nt-ac-new-prefix {
  color: var(--ls-active-primary-color, #2383e2);
  font-weight: 500;
}

.nt-ac-alias {
  font-size: 11px;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.8));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nt-ac-badge {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.14));
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.85));
}

.nt-ac-badge-new {
  background: rgba(35, 131, 226, 0.15);
  color: var(--ls-active-primary-color, #2383e2);
}

/* Drag-and-drop target highlight & inline image sizing */
th.nt-cell-drop-target,
td.nt-cell-drop-target {
  box-shadow: inset 0 0 0 2px var(--nt-accent) !important;
  background: rgba(35, 131, 226, 0.08) !important;
}

.nt-img-wrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
  margin: 2px 2px 2px 0;
  border-radius: 4px;
  line-height: 0;
}

.nt-cell-img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  object-fit: contain;
  border: 1px solid var(--nt-border);
  background: var(--nt-header-bg);
}

.nt-img-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 5px;
  background: rgba(20, 20, 22, 0.78);
  color: #ffffff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.nt-img-wrap:hover .nt-img-actions,
.nt-img-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

.nt-img-act-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
}

.nt-img-act-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.nt-img-act-danger:hover {
  background: rgba(224, 62, 62, 0.85);
}

.nt-img-resizer {
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 12px;
  height: 12px;
  z-index: 8;
  cursor: nwse-resize;
  border-radius: 2px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.nt-img-resizer::after {
  content: '';
  position: absolute;
  right: 2px;
  bottom: 2px;
  width: 7px;
  height: 7px;
  border-right: 2px solid #ffffff;
  border-bottom: 2px solid #ffffff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
}

.nt-img-wrap:hover .nt-img-resizer,
.nt-img-wrap.nt-img-resizing .nt-img-resizer {
  opacity: 1;
}

.nt-img-size-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 9;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(20, 20, 22, 0.82);
  color: #ffffff;
  font-size: 11px;
  line-height: 1.3;
  font-family: var(--ls-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  pointer-events: none;
}

/* Image dimension customization popover */
.nt-img-popover {
  position: fixed;
  z-index: 2147483647;
  width: 244px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  font-size: 12px;
  line-height: 1.4;
}

.nt-img-pop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}

.nt-img-pop-natural {
  font-size: 11px;
  font-weight: 400;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.8));
}

.nt-img-pop-fields {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  margin-bottom: 8px;
}

.nt-img-pop-field {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.85));
}

.nt-img-pop-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-secondary-background-color, transparent);
  color: var(--ls-primary-text-color, inherit);
  font: inherit;
}

.nt-img-lock-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: transparent;
  color: var(--ls-secondary-text-color, inherit);
  cursor: pointer;
}

.nt-img-lock-btn.nt-active {
  color: var(--ls-active-primary-color, #2383e2);
  border-color: var(--ls-active-primary-color, #2383e2);
  background: rgba(35, 131, 226, 0.1);
}

.nt-img-pop-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.nt-img-preset-btn {
  flex: 1 1 auto;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.08));
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}

.nt-img-preset-btn:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.16));
}

.nt-img-pop-footer {
  display: flex;
  justify-content: flex-end;
}

.nt-img-apply-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 5px;
  background: var(--ls-active-primary-color, #2383e2);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.nt-img-apply-btn:hover {
  opacity: 0.92;
}

/* Lightbox preview */
.nt-img-lightbox {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  background: rgba(0, 0, 0, 0.78);
}

.nt-img-lightbox-img {
  max-width: 92vw;
  max-height: 90vh;
  border-radius: 6px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
  background: #ffffff;
}

.nt-img-lightbox-close {
  position: fixed;
  top: 16px;
  right: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  cursor: pointer;
}

.nt-img-lightbox-close:hover {
  background: rgba(255, 255, 255, 0.28);
}

/* Header column type icon */
.nt-header-inner {
  display: flex;
  align-items: flex-start;
  gap: 5px;
}

.nt-col-type-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  height: 1.33em;
  color: var(--nt-muted);
  opacity: 0.78;
}

.nt-header-inner .nt-cell-display,
.nt-header-inner .nt-cell-editor {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 1.4em;
}

/* Typed cells */
.nt-checkbox-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  cursor: pointer;
}

.nt-col-checkbox {
  width: 15px;
  height: 15px;
  margin: 0;
  cursor: pointer;
  accent-color: var(--nt-accent);
}

.nt-date-cell,
.nt-url-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 20px;
}

.nt-timestamp-cell {
  display: flex;
  align-items: center;
  min-height: 20px;
  cursor: default;
  color: var(--nt-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

td:has(> .nt-timestamp-cell) {
  cursor: default;
}

.nt-date-main,
.nt-url-main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  flex: 1 1 auto;
}

.nt-cell-muted-icon {
  flex: 0 0 auto;
  color: var(--nt-muted);
  opacity: 0.72;
}

.nt-cell-placeholder {
  color: var(--nt-muted);
  opacity: 0.48;
  font-size: 0.9em;
}

.nt-url-link {
  color: var(--ls-external-link-color, var(--nt-accent));
  text-decoration: underline;
  text-underline-offset: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.nt-cell-edit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nt-muted);
  cursor: pointer;
  opacity: 0;
  flex: 0 0 auto;
  transition: opacity 0.12s ease, background-color 0.12s ease;
}

td:hover .nt-cell-edit-btn,
.nt-cell-edit-btn:focus {
  opacity: 1;
}

.nt-cell-edit-btn:hover {
  background: var(--nt-header-bg);
  color: var(--nt-text);
}

/* Select / Multi-select pills */
.nt-select-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  min-height: 20px;
  cursor: pointer;
}

.nt-select-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.9em;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.nt-pill-page {
  cursor: pointer;
}

.nt-pill-page-icon {
  opacity: 0.75;
  flex: 0 0 auto;
}

.nt-color-gray { background: rgba(145, 145, 142, 0.22); color: inherit; }
.nt-color-brown { background: rgba(147, 114, 100, 0.24); color: inherit; }
.nt-color-orange { background: rgba(217, 115, 13, 0.22); color: inherit; }
.nt-color-yellow { background: rgba(223, 171, 1, 0.25); color: inherit; }
.nt-color-green { background: rgba(15, 123, 108, 0.22); color: inherit; }
.nt-color-blue { background: rgba(35, 131, 226, 0.22); color: inherit; }
.nt-color-purple { background: rgba(144, 101, 176, 0.24); color: inherit; }
.nt-color-pink { background: rgba(226, 85, 161, 0.22); color: inherit; }
.nt-color-red { background: rgba(224, 62, 62, 0.22); color: inherit; }

/* Date Picker Popover */
.nt-date-popover {
  position: fixed;
  z-index: 2147483647;
  width: 264px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  font-size: 12px;
  user-select: none;
}

.nt-dp-input-wrap {
  margin-bottom: 8px;
}

.nt-dp-input {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
  color: inherit;
  font: inherit;
}

.nt-dp-input:focus {
  outline: none;
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-dp-preview {
  margin-top: 4px;
  font-size: 11px;
  min-height: 15px;
}

.nt-dp-preview-valid {
  color: var(--ls-active-primary-color, #2383e2);
  font-weight: 500;
}

.nt-dp-preview-muted {
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.78));
}

.nt-dp-preview-warn {
  color: var(--ls-error-text-color, #d97706);
}

.nt-dp-cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.nt-dp-month-title {
  font-weight: 600;
  font-size: 12.5px;
}

.nt-dp-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.nt-dp-nav-btn:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.14));
}

.nt-dp-weekdays,
.nt-dp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.nt-dp-weekday {
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.75));
  padding: 2px 0;
}

.nt-dp-day {
  height: 28px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.nt-dp-day:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.15));
}

.nt-dp-day.nt-dp-outside {
  opacity: 0.4;
}

.nt-dp-day.nt-dp-today {
  box-shadow: inset 0 0 0 1px var(--ls-active-primary-color, #2383e2);
  font-weight: 600;
}

.nt-dp-day.nt-dp-selected {
  background: var(--ls-active-primary-color, #2383e2) !important;
  color: #ffffff !important;
  font-weight: 600;
}

.nt-dp-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.18));
}

.nt-dp-quick-btn {
  flex: 1 1 auto;
  padding: 4px 6px;
  border-radius: 5px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.08));
  color: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.nt-dp-quick-btn:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.16));
}

.nt-dp-quick-btn.nt-active {
  border-color: var(--ls-active-primary-color, #2383e2);
  background: rgba(35, 131, 226, 0.14);
  color: var(--ls-active-primary-color, #2383e2);
  font-weight: 600;
}

.nt-dp-quick-btn.nt-danger {
  color: var(--ls-error-text-color, #e03e3e);
}

/* Select / Multi-select Popover */
.nt-select-popover {
  position: fixed;
  z-index: 2147483647;
  width: 284px;
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  font-size: 12.5px;
  overflow: hidden;
  user-select: none;
}

.nt-sp-top {
  padding: 8px;
  border-bottom: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.18));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
}

.nt-sp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.nt-sp-chip-rm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin-left: 2px;
  border: none;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
}

.nt-sp-chip-rm:hover {
  opacity: 1;
}

.nt-sp-input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.nt-sp-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}

.nt-sp-section-label {
  padding: 4px 8px 2px 8px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.78));
}

.nt-sp-row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 5px;
}

.nt-sp-row:hover,
.nt-sp-row.nt-sp-row-active,
.nt-sp-create-btn:hover,
.nt-sp-create-btn.nt-sp-row-active {
  background: var(--ls-tertiary-background-color, rgba(35, 131, 226, 0.12));
}

.nt-sp-row-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1 1 auto;
  min-width: 0;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.nt-sp-check {
  color: var(--ls-active-primary-color, #2383e2);
}

.nt-sp-opt-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ls-secondary-text-color, inherit);
  cursor: pointer;
  opacity: 0.65;
}

.nt-sp-opt-edit:hover {
  opacity: 1;
  background: rgba(127, 127, 127, 0.15);
}

.nt-sp-opt-editor {
  margin: 2px 4px 6px 4px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.2));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
}

.nt-sp-rename-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
}

.nt-sp-rename-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-primary-background-color, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.nt-sp-rename-input:focus {
  outline: none;
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-sp-rename-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  border-radius: 4px;
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-active-primary-color, #2383e2);
  cursor: pointer;
  flex: 0 0 auto;
}

.nt-sp-rename-btn:hover {
  background: rgba(35, 131, 226, 0.12);
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-sp-rename-err {
  margin: -2px 0 6px 0;
  font-size: 11px;
  color: var(--ls-error-text-color, #e03e3e);
}

.nt-sp-color-dots {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 6px;
}

.nt-sp-color-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  color: #ffffff;
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.nt-sp-color-dot:hover {
  transform: scale(1.1);
}

.nt-sp-color-dot.nt-color-gray { background: #787774; }
.nt-sp-color-dot.nt-color-brown { background: #9f6b53; }
.nt-sp-color-dot.nt-color-orange { background: #d9730d; }
.nt-sp-color-dot.nt-color-yellow { background: #cb912f; }
.nt-sp-color-dot.nt-color-green { background: #0f7b6c; }
.nt-sp-color-dot.nt-color-blue { background: #2383e2; }
.nt-sp-color-dot.nt-color-purple { background: #9065b0; }
.nt-sp-color-dot.nt-color-pink { background: #e255a1; }
.nt-sp-color-dot.nt-color-red { background: #e03e3e; }

.nt-sp-color-dot.nt-dot-active {
  box-shadow: 0 0 0 2px var(--ls-primary-background-color, #ffffff), 0 0 0 3.5px var(--ls-active-primary-color, #2383e2);
}

.nt-sp-opt-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.nt-sp-mini-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}

.nt-sp-mini-btn.nt-active {
  color: var(--ls-active-primary-color, #2383e2);
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-sp-mini-btn.nt-danger {
  color: var(--ls-error-text-color, #e03e3e);
}

.nt-sp-create-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.nt-sp-empty {
  padding: 10px 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.78));
}

/* Ephemeral quick search bar */
.nt-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--nt-border);
  background: var(--nt-header-bg);
  font-size: 12px;
}

.nt-search-icon {
  display: inline-flex;
  align-items: center;
  color: var(--nt-muted);
  flex: 0 0 auto;
}

.nt-search-input {
  flex: 1 1 auto;
  min-width: 80px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--nt-text);
  font: inherit;
  padding: 2px 0;
}

.nt-search-input::placeholder {
  color: var(--nt-muted);
  opacity: 0.75;
}

.nt-search-count {
  font-size: 11.5px;
  color: var(--nt-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.nt-search-clear-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nt-muted);
  cursor: pointer;
  flex: 0 0 auto;
}

.nt-search-clear-btn:hover {
  background: var(--nt-hover-bg);
  color: var(--nt-text);
}

.nt-search-clear-btn:focus-visible {
  outline: 2px solid var(--nt-accent);
  outline-offset: 1px;
}

/* Filter bar, chips, header indicator, empty state, and filter popover */
.nt-filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid var(--nt-border);
  background: var(--nt-header-bg);
  font-size: 12px;
}

.nt-filter-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1 1 auto;
}

.nt-filter-chip {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  min-height: 24px;
  border-radius: 999px;
  border: 1px solid rgba(35, 131, 226, 0.35);
  background: var(--nt-bg);
  overflow: hidden;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.nt-filter-chip:hover {
  border-color: var(--nt-accent);
}

.nt-filter-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  min-height: 24px;
  padding: 2px 6px 2px 8px;
  border: none;
  background: transparent;
  color: var(--nt-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.nt-filter-chip-btn:hover {
  background: var(--nt-hover-bg);
}

.nt-filter-chip-btn:focus-visible,
.nt-filter-chip-rm:focus-visible,
.nt-filter-add-btn:focus-visible,
.nt-filter-clear-btn:focus-visible,
.nt-col-filter-indicator:focus-visible,
.nt-empty-filter-clear-btn:focus-visible,
.nt-fp-op-select:focus-visible,
.nt-fp-del-btn:focus-visible,
.nt-fp-input:focus-visible,
.nt-fp-bool-btn:focus-visible,
.nt-fp-opt-btn:focus-visible {
  outline: 2px solid var(--nt-accent);
  outline-offset: 1px;
}

.nt-filter-chip-icon {
  display: inline-flex;
  align-items: center;
  color: var(--nt-muted);
  flex: 0 0 auto;
}

.nt-filter-chip-col {
  font-weight: 600;
  white-space: nowrap;
}

.nt-filter-chip-op {
  color: var(--nt-muted);
  white-space: nowrap;
}

.nt-filter-chip-val {
  color: var(--nt-accent);
  font-weight: 500;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nt-filter-chip-val.nt-filter-chip-empty {
  color: var(--nt-muted);
  font-weight: 400;
  font-style: italic;
}

.nt-filter-chip-val.nt-filter-chip-dynamic {
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}

.nt-filter-chip-pill {
  padding: 0 5px;
  font-size: 11px;
  line-height: 1.4;
}

.nt-filter-chip-more {
  font-size: 11px;
  color: var(--nt-muted);
  font-weight: 500;
}

.nt-filter-chip-rm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 6px 0 4px;
  border: none;
  border-left: 1px solid var(--nt-border);
  background: transparent;
  color: var(--nt-muted);
  cursor: pointer;
}

.nt-filter-chip-rm:hover {
  background: rgba(224, 62, 62, 0.12);
  color: var(--nt-danger);
}

.nt-filter-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px dashed var(--nt-border);
  background: transparent;
  color: var(--nt-muted);
  font: inherit;
  cursor: pointer;
}

.nt-filter-add-btn:hover {
  border-color: var(--nt-accent);
  color: var(--nt-text);
  background: var(--nt-bg);
}

.nt-filter-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.nt-filter-count {
  font-size: 11.5px;
  color: var(--nt-muted);
  white-space: nowrap;
}

.nt-filter-clear-btn {
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--nt-muted);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.nt-filter-clear-btn:hover {
  color: var(--nt-danger);
  background: rgba(224, 62, 62, 0.1);
}

.nt-col-filter-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(35, 131, 226, 0.14);
  color: var(--nt-accent);
  cursor: pointer;
}

.nt-col-filter-indicator:hover {
  background: rgba(35, 131, 226, 0.24);
}

.nt-empty-filter-row td {
  text-align: center !important;
  padding: 18px 12px !important;
  cursor: default !important;
  background: transparent !important;
}

.nt-empty-filter-inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--nt-muted);
  font-size: 12.5px;
}

.nt-empty-filter-clear-btn {
  min-height: 24px;
  padding: 3px 10px;
  border-radius: 5px;
  border: 1px solid var(--nt-border);
  background: var(--nt-header-bg);
  color: var(--nt-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.nt-empty-filter-clear-btn:hover {
  border-color: var(--nt-accent);
  color: var(--nt-accent);
}

/* Filter configuration popover */
.nt-filter-popover {
  position: fixed;
  z-index: 2147483647;
  width: 276px;
  max-width: calc(100vw - 16px);
  border-radius: 8px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: var(--ls-primary-background-color, #ffffff);
  color: var(--ls-primary-text-color, #1f2328);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  font-size: 12.5px;
  overflow: hidden;
  user-select: none;
}

.nt-fp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.18));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
}

.nt-fp-col {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
  font-weight: 600;
}

.nt-fp-col-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nt-fp-op-select {
  max-width: 126px;
  min-height: 24px;
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-primary-background-color, #ffffff);
  color: inherit;
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.nt-fp-del-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ls-secondary-text-color, rgba(127, 127, 127, 0.8));
  cursor: pointer;
  flex: 0 0 auto;
}

.nt-fp-del-btn:hover {
  background: rgba(224, 62, 62, 0.12);
  color: var(--ls-error-text-color, #e03e3e);
}

.nt-fp-body {
  padding: 10px;
}

.nt-fp-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 28px;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.3));
  background: var(--ls-secondary-background-color, rgba(127, 127, 127, 0.06));
  color: inherit;
  font: inherit;
}

.nt-fp-input:focus {
  outline: none;
  border-color: var(--ls-active-primary-color, #2383e2);
}

.nt-fp-bool-row {
  display: flex;
  gap: 6px;
}

.nt-fp-bool-btn {
  flex: 1 1 0;
  min-height: 28px;
  padding: 4px 8px;
  border-radius: 5px;
  border: 1px solid var(--ls-border-color, rgba(127, 127, 127, 0.25));
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.nt-fp-bool-btn:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.12));
}

.nt-fp-bool-btn.nt-active {
  border-color: var(--ls-active-primary-color, #2383e2);
  background: rgba(35, 131, 226, 0.14);
  color: var(--ls-active-primary-color, #2383e2);
  font-weight: 600;
}

.nt-fp-opt-list {
  margin-top: 6px;
  max-height: 210px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nt-fp-opt-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 26px;
  padding: 4px 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.nt-fp-opt-btn:hover {
  background: var(--ls-tertiary-background-color, rgba(127, 127, 127, 0.12));
}

.nt-fp-opt-btn.nt-active {
  background: rgba(35, 131, 226, 0.1);
}

/* Column aggregation footer (Calculate row) */
table.nt-table tfoot {
  display: none;
}

.nt-host.nt-show-calc table.nt-table tfoot {
  display: table-footer-group;
}

table.nt-table tfoot td.nt-calc-cell {
  padding: 2px 4px !important;
  border-top: 1px solid var(--nt-border) !important;
  border-bottom: none !important;
  background: var(--nt-header-bg);
  vertical-align: middle !important;
  cursor: pointer;
}

.nt-host.nt-show-calc table.nt-table tbody tr:last-child td {
  border-bottom-left-radius: 0 !important;
  border-bottom-right-radius: 0 !important;
}

table.nt-table tfoot tr:last-child td:first-child {
  border-bottom-left-radius: 5px;
}

table.nt-table tfoot tr:last-child td:last-child {
  border-bottom-right-radius: 5px;
}

.nt-calc-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  min-height: 24px;
  padding: 2px 6px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--nt-muted);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  text-align: inherit;
  justify-content: flex-start;
}

td.nt-calc-cell.nt-align-right .nt-calc-btn {
  justify-content: flex-end;
}

td.nt-calc-cell.nt-align-center .nt-calc-btn {
  justify-content: center;
}

.nt-calc-btn:hover {
  background: var(--nt-hover-bg);
  color: var(--nt-text);
}

.nt-calc-btn:focus-visible {
  outline: 2px solid var(--nt-accent);
  outline-offset: 1px;
}

.nt-calc-placeholder {
  opacity: 0.72;
  transition: opacity 0.12s ease;
}

table.nt-table tfoot td.nt-calc-cell:hover .nt-calc-placeholder,
.nt-calc-btn:focus-visible .nt-calc-placeholder {
  opacity: 1;
}

.nt-calc-label {
  font-size: 11px;
  color: var(--nt-muted);
}

.nt-calc-val {
  font-weight: 600;
  color: var(--nt-text);
  font-variant-numeric: tabular-nums;
}
`
