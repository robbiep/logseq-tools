import '@logseq/libs'
import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'
import { DomObserver, type ObserverRuntimeOptions } from './host/domObserver'
import { PageIndex } from './host/pageIndex'
import { normalizeLogseqStartOfWeek } from './markdown/dateUtils'
import { sanitizeImageFilename } from './markdown/imageUtils'
import { createEmptyTable, serializeTable } from './markdown/tableParser'
import { STYLES } from './styles'

const SETTINGS_SCHEMA: SettingSchemaDesc[] = [
  {
    key: 'defaultColumns',
    type: 'number',
    default: 3,
    title: 'Default columns for new tables',
    description: 'Number of columns inserted by /Table or /Notion Table.',
  },
  {
    key: 'defaultRows',
    type: 'number',
    default: 3,
    title: 'Default rows for new tables',
    description: 'Total number of rows (including header) inserted by /Table.',
  },
  {
    key: 'autoSaveDelayMs',
    type: 'number',
    default: 350,
    title: 'Auto-save delay (ms)',
    description: 'Debounce delay while typing inside a table cell before saving to Markdown.',
  },
  {
    key: 'fullWidthByDefault',
    type: 'boolean',
    default: false,
    title: 'Full-width tables by default',
    description: 'Stretch newly mounted tables to fill the block width.',
  },
  {
    key: 'monospaceRawSource',
    type: 'boolean',
    default: true,
    title: 'Monospace font when editing raw table markdown',
    description: 'Uses a monospace font in Logseq’s textarea when editing a table block directly.',
  },
  {
    key: 'defaultImageMaxWidth',
    type: 'number',
    default: 220,
    title: 'Default max image width in cells (px)',
    description: 'Maximum initial width when dropping or pasting an image into a cell.',
  },
  {
    key: 'defaultImageMaxHeight',
    type: 'number',
    default: 160,
    title: 'Default max image height in cells (px)',
    description: 'Maximum initial height when dropping or pasting an image into a cell.',
  },
]

function getHostDocument(): Document | null {
  try {
    const hostDoc = (window.top || window.parent)?.document
    if (hostDoc) return hostDoc
  } catch {
    // Cross-origin fallback handled below
  }
  return null
}

let cachedDateFormat = 'MMM do, yyyy'
let cachedStartOfWeek = 0

async function refreshUserDateConfig(): Promise<void> {
  try {
    const configs = await logseq.App.getUserConfigs()
    if (configs?.preferredDateFormat) {
      cachedDateFormat = configs.preferredDateFormat
    }
    if (configs && configs.preferredStartOfWeek !== undefined) {
      cachedStartOfWeek = normalizeLogseqStartOfWeek(configs.preferredStartOfWeek)
    }
  } catch {
    // Keep defaults if getUserConfigs is unavailable
  }
}

function readRuntimeOptions(): ObserverRuntimeOptions {
  const s = (logseq.settings || {}) as Record<string, unknown>
  const delay = Number(s.autoSaveDelayMs)
  const imgW = Number(s.defaultImageMaxWidth)
  const imgH = Number(s.defaultImageMaxHeight)
  return {
    autoSaveDelayMs: Number.isFinite(delay) && delay >= 0 ? delay : 350,
    fullWidthByDefault: s.fullWidthByDefault === true,
    monospaceRawSource: s.monospaceRawSource !== false,
    defaultImageMaxWidth: Number.isFinite(imgW) && imgW >= 48 ? Math.floor(imgW) : 220,
    defaultImageMaxHeight: Number.isFinite(imgH) && imgH >= 48 ? Math.floor(imgH) : 160,
    preferredDateFormat: cachedDateFormat,
    preferredStartOfWeek: cachedStartOfWeek,
  }
}

function readTableDimensions(): { cols: number; rows: number } {
  const s = (logseq.settings || {}) as Record<string, unknown>
  const cols = Number(s.defaultColumns)
  const rows = Number(s.defaultRows)
  return {
    cols: Number.isFinite(cols) && cols >= 1 ? Math.min(20, Math.floor(cols)) : 3,
    rows: Number.isFinite(rows) && rows >= 2 ? Math.min(50, Math.floor(rows)) : 3,
  }
}

async function main(): Promise<void> {
  logseq.useSettingsSchema(SETTINGS_SCHEMA)
  logseq.provideStyle(STYLES)

  const hostDoc = getHostDocument()
  if (!hostDoc) {
    console.error('[logseq-notion-table] Cannot access host document')
    return
  }

  await refreshUserDateConfig()

  const pageIndex = new PageIndex(() => logseq.Editor.getAllPages())
  const assetUrlCache = new Map<string, string>()

  const resolveAssetUrl = async (rawSrc: string): Promise<string> => {
    if (
      rawSrc.startsWith('http://') ||
      rawSrc.startsWith('https://') ||
      rawSrc.startsWith('data:') ||
      rawSrc.startsWith('blob:') ||
      rawSrc.startsWith('assets://')
    ) {
      return rawSrc
    }
    const cached = assetUrlCache.get(rawSrc)
    if (cached) return cached
    const url = await logseq.Assets.makeUrl(rawSrc)
    if (url) {
      assetUrlCache.set(rawSrc, url)
      return url
    }
    return rawSrc
  }

  const saveImageAsset = async (file: File): Promise<{ markdownPath: string }> => {
    const fileName = sanitizeImageFilename(file.name, file.type)
    const storage = logseq.Assets.makeSandboxStorage()
    const buffer = await file.arrayBuffer()
    await storage.setItem(fileName, buffer as unknown as string)
    const pluginId = logseq.baseInfo?.id || 'logseq-notion-table'
    return { markdownPath: `../assets/storages/${pluginId}/${fileName}` }
  }

  const observer = new DomObserver(
    hostDoc,
    {
      getBlock: (uuid) => logseq.Editor.getBlock(uuid),
      updateBlock: (uuid, content) => logseq.Editor.updateBlock(uuid, content),
      editBlock: (uuid) => logseq.Editor.editBlock(uuid),
      openPage: (pageName, shiftKey) => {
        if (shiftKey) {
          void logseq.Editor.getPage(pageName).then((page) => {
            if (page?.uuid) {
              logseq.Editor.openInRightSidebar(page.uuid)
            } else {
              logseq.App.pushState('page', { name: pageName })
            }
          })
        } else {
          logseq.App.pushState('page', { name: pageName })
        }
      },
      openExternalLink: (url) => {
        void logseq.App.openExternalLink(url)
      },
      showToast: (msg, status = 'info') => {
        void logseq.UI.showMsg(msg, status)
      },
      searchPages: (query) => pageIndex.search(query),
      saveImageAsset,
      resolveAssetUrl,
    },
    readRuntimeOptions
  )

  const insertTableAtBlock = async (blockUuid?: string) => {
    try {
      const targetBlock = blockUuid
        ? await logseq.Editor.getBlock(blockUuid)
        : await logseq.Editor.getCurrentBlock()

      if (!targetBlock?.uuid) {
        void logseq.UI.showMsg('Place cursor inside a block to insert a table.', 'warning')
        return
      }
      if (targetBlock.format && targetBlock.format !== 'markdown') {
        void logseq.UI.showMsg('Notion Table only supports Markdown blocks.', 'warning')
        return
      }

      const { cols, rows } = readTableDimensions()
      const markdown = serializeTable(createEmptyTable(cols, rows))
      const existing = (targetBlock.content || '').trim()
      const nextContent = existing ? `${existing}\n\n${markdown}` : markdown

      observer.requestFocusAfterMount(targetBlock.uuid, 0, 0)
      await logseq.Editor.updateBlock(targetBlock.uuid, nextContent)
      try {
        await logseq.Editor.exitEditingMode()
      } catch {
        // Ignore if not currently in editing mode
      }
      observer.scheduleScan(30)
    } catch (err) {
      console.error('[logseq-notion-table] Failed to insert table:', err)
    }
  }

  logseq.Editor.registerSlashCommand('Table', async (e) => {
    await insertTableAtBlock(e?.uuid)
  })
  logseq.Editor.registerSlashCommand('Notion Table', async (e) => {
    await insertTableAtBlock(e?.uuid)
  })

  logseq.App.registerCommandPalette(
    { key: 'notion-table-insert', label: 'Notion Table: Insert Table' },
    () => void insertTableAtBlock()
  )

  logseq.App.registerCommandPalette(
    { key: 'notion-table-edit-raw', label: 'Notion Table: Edit Focused Table as Markdown' },
    async () => {
      const active = hostDoc.activeElement as HTMLElement | null
      const host = active?.closest('.nt-host') as HTMLElement | null
      const uuid = host?.dataset.ntBlockUuid
      if (uuid) {
        await logseq.Editor.editBlock(uuid)
        return
      }
      const cur = await logseq.Editor.getCurrentBlock()
      if (cur?.uuid) {
        await logseq.Editor.editBlock(cur.uuid)
      }
    }
  )

  logseq.App.registerCommandPalette(
    { key: 'notion-table-undo', label: 'Notion Table: Undo' },
    () => {
      observer.undoLastActive()
    }
  )

  logseq.App.registerCommandPalette(
    { key: 'notion-table-redo', label: 'Notion Table: Redo' },
    () => {
      observer.redoLastActive()
    }
  )

  const offRoute = logseq.App.onRouteChanged(() => {
    observer.clearLastActive()
    observer.scheduleScan(80)
  })
  const offDb = logseq.DB.onChanged(() => {
    pageIndex.invalidate()
    observer.scheduleScan(60)
  })
  const offGraph = logseq.App.onCurrentGraphChanged(() => {
    pageIndex.invalidate()
    assetUrlCache.clear()
    void refreshUserDateConfig().then(() => observer.scheduleScan(100))
  })

  observer.start()

  logseq.beforeunload(async () => {
    offRoute?.()
    offDb?.()
    offGraph?.()
    observer.destroy()
  })
}

logseq.ready(main).catch((err) => {
  console.error('[logseq-notion-table] failed to initialize:', err)
})
