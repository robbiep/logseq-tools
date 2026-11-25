import "@logseq/libs";
/**
 * Nodes of This Type
 * ---------------------------------------------------------------------------
 * Automatically ensures every page has a "Nodes of This Type" query block
 * sitting at the bottom of the page, right above Linked References.
 *
 * WHY A BLOCK, NOT A CSS/DOM INJECTION:
 * Logseq's plugin API does not expose an official "slot" for the
 * Linked References area, and the DOM class names there (and the exact
 * behavior of the `property` query rule your original query relies on)
 * change between Logseq versions and between file-graphs and DB-graphs.
 * Rather than guess at CSS selectors or re-implement your query's rule
 * resolution by hand (both of which are fragile and could silently
 * return wrong results), this plugin re-uses Logseq's own, already-working
 * query engine: it inserts the exact query you validated manually, as a
 * collapsed block, automatically. That gets you correct results, correct
 * sorting, correct live-reactivity, and correct table rendering for free.
 *
 * WHAT IT INSERTS
 * A single top-level block per page, tagged with a plugin marker property
 * so it's never duplicated:
 *
 *   query-table:: true
 *   query-properties:: [:page]
 *   logseq-nodes-of-this-type-plugin:: true
 *   collapsed:: true
 *   #+BEGIN_QUERY
 *   { :title "Nodes of This Type"
 *     :inputs [:current-page]
 *     :query [:find (pull ?b [*])
 *              :in $ ?current-page
 *              :where
 *              [?page :block/name ?current-page]
 *              [?page :block/original-name ?name]
 *              (property ?b :<your-property> ?name)]
 *     :table-view? true
 *     :result-transform (fn [result]
 *                        (sort-by (fn [h]
 *                          (get-in h [:block/page :block/name])) result)) }
 *   #+END_QUERY
 *
 * CONFIGURE the property name in the plugin settings (gear icon in the
 * plugins panel) before relying on it — see "propertyName" below.
 */

const MARKER_PROPERTY_LINE = "logseq-nodes-of-this-type-plugin:: true";
const MARKER_PROPERTY_KEY = "logseqNodesOfThisTypePlugin"; // camelCase form Logseq exposes on block.properties

const SETTINGS_SCHEMA = [
  {
    key: "propertyName",
    type: "string",
    default: "type",
    title: "Type property name",
    description:
      'The block/page property whose value should equal the current page\'s name. ' +
      'This fills in the ":propertyName" placeholder from your original query — ' +
      'e.g. if your blocks use "type:: Book", enter "type" here (no colons).',
  },
  {
    key: "sectionTitle",
    type: "string",
    default: "Nodes of This Type",
    title: "Section title",
    description: "Shown as the query block's collapsible header.",
  },
  {
    key: "collapsedByDefault",
    type: "boolean",
    default: true,
    title: "Collapse the section by default",
    description: "Mirrors how Linked References/Unlinked References start collapsed.",
  },
  {
    key: "restrictToTag",
    type: "string",
    default: "",
    title: "Only add to pages tagged with (optional)",
    description:
      "Leave blank to add the section to every page. Enter a tag/page name " +
      "(no #) to restrict this to e.g. your type-definition pages only. " +
      "Best-effort: relies on the page's 'tags' property being readable.",
  },
];

function escapeForEdnString(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildQueryBlockContent({ propertyName, title, collapsed }) {
  const lines = [
    "query-table:: true",
    "query-properties:: [:page]",
    MARKER_PROPERTY_LINE,
    `collapsed:: ${collapsed ? "true" : "false"}`,
    "#+BEGIN_QUERY",
    "{",
    ` :title "${escapeForEdnString(title)}"`,
    " :inputs [:current-page]",
    " :query [:find (pull ?b [*])",
    "          :in $ ?current-page",
    "          :where",
    "          [?page :block/name ?current-page]",
    "          [?page :block/original-name ?name]",
    `          (property ?b :${propertyName} ?name)`,
    "          ]",
    " :table-view? true",
    " :result-transform (fn [result]",
    "                    (sort-by (fn [h]",
    "                      (get-in h [:block/page :block/name])) result))",
    "}",
    "#+END_QUERY",
  ];
  return lines.join("\n");
}

function findMarkerBlock(blocks) {
  if (!Array.isArray(blocks)) return null;
  for (const b of blocks) {
    if (!b) continue;
    if (b.properties && b.properties[MARKER_PROPERTY_KEY]) return b;
    if (typeof b.content === "string" && b.content.includes(MARKER_PROPERTY_LINE)) return b;
  }
  return null;
}

function currentSettings() {
  const s = logseq.settings || {};
  return {
    propertyName: (s.propertyName || "type").trim(),
    sectionTitle: (s.sectionTitle || "Nodes of This Type").trim(),
    collapsedByDefault: s.collapsedByDefault !== false,
    restrictToTag: (s.restrictToTag || "").trim(),
  };
}

function pageMatchesRestriction(page, restrictToTag) {
  if (!restrictToTag) return true;
  const wanted = restrictToTag.toLowerCase();
  const tags = (page && page.properties && page.properties.tags) || [];
  if (Array.isArray(tags)) {
    return tags.some((t) => String(t).toLowerCase() === wanted);
  }
  if (typeof tags === "string") {
    return tags.toLowerCase() === wanted;
  }
  return false;
}

function isRealPageRoute(page) {
  // Skip null pages (home/all-pages/graph/settings routes) and whiteboards.
  if (!page || !page.name) return false;
  if (page["type"] === "whiteboard" || page.type === "whiteboard") return false;
  return true;
}

/**
 * Add the section if it's missing. Never touches an existing block, so any
 * manual edits you make to it afterwards are preserved.
 */
async function ensureSectionOnPage(page) {
  if (!isRealPageRoute(page)) return "skipped";

  const settings = currentSettings();
  if (!pageMatchesRestriction(page, settings.restrictToTag)) return "restricted";

  const blocks = await logseq.Editor.getPageBlocksTree(page.uuid);
  if (findMarkerBlock(blocks)) return "already-present";

  const content = buildQueryBlockContent({
    propertyName: settings.propertyName,
    title: settings.sectionTitle,
    collapsed: settings.collapsedByDefault,
  });

  await logseq.Editor.appendBlockInPage(page.uuid, content);
  return "inserted";
}

/**
 * Overwrite the marker block's content with a freshly built one, based on
 * current settings. Used by the explicit "force update" command only —
 * this is destructive to any manual edits made to that specific block.
 */
async function forceUpdateSectionOnPage(page) {
  if (!isRealPageRoute(page)) return "skipped";

  const settings = currentSettings();
  if (!pageMatchesRestriction(page, settings.restrictToTag)) return "restricted";

  const blocks = await logseq.Editor.getPageBlocksTree(page.uuid);
  const existing = findMarkerBlock(blocks);

  const content = buildQueryBlockContent({
    propertyName: settings.propertyName,
    title: settings.sectionTitle,
    collapsed: settings.collapsedByDefault,
  });

  if (existing) {
    await logseq.Editor.updateBlock(existing.uuid, content);
    return "updated";
  }
  await logseq.Editor.appendBlockInPage(page.uuid, content);
  return "inserted";
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function ensureSectionOnCurrentPage() {
  try {
    const page = await logseq.Editor.getCurrentPage();
    await ensureSectionOnPage(page);
  } catch (err) {
    console.error("[nodes-of-this-type] failed to ensure section on current page:", err);
  }
}

async function runOnAllPages(fn, verb) {
  logseq.UI.showMsg(`Nodes of This Type: ${verb} started…`, "info");
  try {
    const pages = await logseq.Editor.getAllPages();
    let count = 0;
    for (const page of pages || []) {
      const result = await fn(page);
      if (result === "inserted" || result === "updated") count += 1;
    }
    logseq.UI.showMsg(
      `Nodes of This Type: ${verb} complete — ${count} page(s) affected out of ${(pages || []).length}.`,
      "success"
    );
  } catch (err) {
    console.error(`[nodes-of-this-type] ${verb} failed:`, err);
    logseq.UI.showMsg(`Nodes of This Type: ${verb} failed — see console for details.`, "error");
  }
}

function main() {
  logseq.useSettingsSchema(SETTINGS_SCHEMA);

  const debouncedEnsure = debounce(ensureSectionOnCurrentPage, 400);

  // Add the section automatically as pages are visited.
  logseq.App.onRouteChanged(debouncedEnsure);
  debouncedEnsure();

  // Manual trigger for the current page (useful right after install, or if
  // auto-insertion didn't fire for some reason).
  logseq.Editor.registerSlashCommand("Nodes of this type", async () => {
    await ensureSectionOnCurrentPage();
  });

  // Backfill: add the section to every existing page that doesn't have it
  // yet, without touching pages that already do.
  logseq.App.registerCommandPalette(
    { key: "nodes-of-this-type-backfill", label: "Nodes of This Type: Add to all pages" },
    () => runOnAllPages(ensureSectionOnPage, "Add to all pages")
  );

  // Force-update: overwrite the section on every page that already has it,
  // using current settings (property name / title / collapsed state).
  // Use this after changing settings. Destructive to manual edits of that
  // specific block.
  logseq.App.registerCommandPalette(
    { key: "nodes-of-this-type-force-update", label: "Nodes of This Type: Force-update on all pages" },
    () => runOnAllPages(forceUpdateSectionOnPage, "Force-update on all pages")
  );

  console.log("[nodes-of-this-type] plugin loaded");
}

logseq.ready(main).catch((err) => {
  console.error("[nodes-of-this-type] failed to start:", err);
});