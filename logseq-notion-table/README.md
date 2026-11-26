# Logseq Notion Table (`logseq-notion-table`)

A first-class, Notion-like interactive table experience for **Logseq OG** (`github.com/logseq/og`), backed cleanly by standard GitHub Flavored Markdown (GFM) tables.

## Why a new plugin?

`VictorVow/logseq-plugin-advanced-markdown-table` relies on `logseq.Experiments.registerBlockRenderer`, an experimental API that exists only in newer Logseq DB builds (`@logseq/libs` 0.3.3+) and does not exist in Logseq OG (`@logseq/libs` 0.0.17).

`logseq-notion-table` targets **Logseq OG** directly by enhancing rendered `.table-wrapper` elements in the host DOM without mutating Logseq's React-owned DOM nodes, and persists every edit back to standard GFM Markdown via `logseq.Editor.updateBlock`.

## Features

- **Standard GFM Markdown source of truth**: Works anywhere in Logseq (pages, journals, nested blocks, right sidebar) with zero custom syntax. Preserves surrounding block text, properties, and multiple tables per block.
- **Click any cell to edit**: Smooth auto-growing `<textarea>` inline editor (no `contentEditable` caret jumping).
- **In-cell `[[` Page & `#` Tag search**: Type `[[` (or `#`) inside any cell to open a keyboard- and mouse-navigable autocomplete dropdown backed by your Logseq graph's pages and aliases.
- **Drag-and-drop & paste images**: Drop or paste an image directly into any cell to save it into graph storage and auto-size it to fit cleanly (`![alt](path){:width W, :height H}`). Customize dimensions anytime by dragging the bottom-right corner handle (`Shift` for freeform) or using the hover size popover (exact `W`/`H`, aspect lock, S/M/L/Original presets, full-size preview, and remove).
- **Column types** (via column handle menu or cell right-click):
  - **Text** (default): Full Markdown, `[[Page]]` links, `#tags`, images, and inline checkboxes.
  - **Date**: Calendar picker + plaintext date input (e.g., `tomorrow`, `Nov 25, 2026`, `2026-11-25`) that auto-maps to your Logseq graph's `preferredDateFormat` journal link (`[[Nov 25th, 2026]]`).
  - **Created time**: Automatically stamps the date and time when a row is created (even if empty), stored as plain text without linking to a date page.
  - **Edited Time**: Automatically updates the date and time anytime any cell in that row changes, stored as plain text without linking to a date page.
  - **Select / Multi-select**: Colored Notion-style option pills with custom colors, option creation, and optional **Logseq Page-backed options** (`[[Page]]`). Clicking any cell opens the option picker.
  - **Checkbox**: 1-click `[ ]` / `[x]` toggle per cell.
  - **URL**: Plaintext URLs and domains automatically render as clickable hyperlinks.
  *(Non-default column schemas are persisted silently right below the table via `<!-- nt-schema: ... -->` HTML comments.)*
- **Rich cell rendering**: Displays `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``, `==highlight==`, clickable `[[Page Links]]` (Shift+Click opens in right sidebar), `#tags`, `[links](url)`, bare URLs, multiline `<br>` breaks, and interactive `[ ]` / `[x]` checkboxes.
- **Hover `+` bars**: Full-width `+` bar at the bottom to add a row and full-height `+` bar on the right to add a column.
- **Row & Column handles (`⋮⋮`)**:
  - **Click** a handle (or right-click any cell) for a Notion-style menu: insert above/below or left/right, duplicate, align left/center/right, sort A→Z / Z→A (natural & numeric), move, clear contents, or delete.
  - **Drag** a handle to reorder rows or columns with a live drop indicator.
- **Resizable columns**: Drag column header borders to resize (double-click to reset).
- **Table toolbar**: Undo/Redo, Filter, Copy Markdown, Copy CSV, Focus/Maximize mode (`Esc` to exit), Edit Raw Markdown (`</>`), and Lock/Unlock table.
- **Spreadsheet-friendly keyboard & paste**:
  - `Tab` / `Shift+Tab` moves across cells (`Tab` on the final cell appends a new row)
  - `Enter` commits and moves down (`Cmd/Ctrl+Enter` inserts row below; `Shift+Enter` adds a line break)
  - `Escape` commits and exits cell edit mode
  - `Alt+Arrow` (and `ArrowUp`/`ArrowDown` at first/last line) moves between cells
  - `Alt+Shift+Arrow` moves the active row or column
  - `Ctrl+Alt+Shift+Arrow` inserts a row or column
  - Pasting TSV data (from Notion, Excel, Google Sheets) auto-populates across cells and expands rows/columns as needed.
- **Slash commands**: Type `/Table` or `/Notion Table` in any block.

## Build & Install in Logseq OG

```bash
cd logseq-notion-table
npm install
npm run build
```

Then in Logseq OG:
1. Enable **Developer mode** under **Settings → Advanced**.
2. Open **Plugins → Load unpacked plugin**.
3. Select the `logseq-notion-table/` folder (which points to `dist/index.html`).

## Development & Tests

```bash
npm run typecheck
npm test
npm run build
```
