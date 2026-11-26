import {
  looksLikeMarkdownTable,
  parseBlockSegments,
  serializeBlockSegments,
  type TableData,
} from '../markdown/tableParser'
import { getUndoRedoAction, TableHistory } from '../ui/tableHistory'
import { TableView } from '../ui/tableView'
import { type PageSearchResult } from './pageIndex'

export interface HostBridgeApi {
  getBlock: (uuid: string) => Promise<{ uuid?: string; content?: string; format?: string } | null>
  updateBlock: (uuid: string, content: string) => Promise<void>
  editBlock: (uuid: string) => Promise<void>
  openPage: (pageName: string, shiftKey: boolean) => void
  openExternalLink?: (url: string) => void
  showToast?: (message: string, status?: 'success' | 'info' | 'warning' | 'error') => void
  searchPages?: (query: string) => Promise<PageSearchResult[]>
  saveImageAsset?: (file: File) => Promise<{ markdownPath: string }>
  resolveAssetUrl?: (rawSrc: string) => Promise<string>
}

export interface ObserverRuntimeOptions {
  autoSaveDelayMs: number
  fullWidthByDefault: boolean
  monospaceRawSource: boolean
  defaultImageMaxWidth?: number
  defaultImageMaxHeight?: number
  preferredDateFormat?: string
  preferredStartOfWeek?: number
}

interface MountedEntry {
  wrapper: HTMLElement
  hostEl: HTMLElement
  blockUuid: string
  tableIndex: number
  view: TableView
}

interface PendingFocus {
  row: number
  col: number
  expiresAt: number
}

const PLUGIN_OWNED_SELECTOR =
  '.nt-host, .nt-popover, .nt-add-col-dialog, .nt-filter-popover, .nt-date-popover, .nt-select-popover, .nt-img-popover, .nt-autocomplete, .nt-drop-indicator, .nt-drag-ghost, .nt-img-lightbox'

function isPluginOnlyMutation(mut: MutationRecord): boolean {
  const targetEl =
    mut.target instanceof Element ? mut.target : mut.target.parentElement
  if (targetEl?.closest(PLUGIN_OWNED_SELECTOR)) {
    return true
  }
  const isPluginNode = (node: Node): boolean =>
    node instanceof Element && node.matches(PLUGIN_OWNED_SELECTOR)
  const added = Array.from(mut.addedNodes)
  const removed = Array.from(mut.removedNodes)
  return added.every(isPluginNode) && removed.every(isPluginNode)
}

export class DomObserver {
  private doc: Document
  private api: HostBridgeApi
  private getOptions: () => ObserverRuntimeOptions

  private mounted = new WeakMap<HTMLElement, MountedEntry>()
  private entries = new Set<MountedEntry>()
  private histories = new Map<string, TableHistory>()
  private lastActiveView: TableView | null = null
  private saveQueues = new Map<string, Promise<void>>()
  private pendingSaves = new Map<string, number>()
  private recentWrites = new Map<string, Array<{ content: string; expiresAt: number }>>()
  private pendingFocus = new Map<string, PendingFocus>()

  private observer: MutationObserver | null = null
  private scanTimer: ReturnType<typeof setTimeout> | null = null
  private scanning = false
  private rescanRequested = false
  private destroyed = false

  private onFocusInBound: (e: Event) => void
  private onInputBound: (e: Event) => void
  private onKeyDownBound: (e: KeyboardEvent) => void

  constructor(
    doc: Document,
    api: HostBridgeApi,
    getOptions: () => ObserverRuntimeOptions
  ) {
    this.doc = doc
    this.api = api
    this.getOptions = getOptions

    this.onFocusInBound = (e: Event) => this.handleTextareaEvent(e.target)
    this.onInputBound = (e: Event) => this.handleTextareaEvent(e.target)
    this.onKeyDownBound = (e: KeyboardEvent) => this.handleDocumentKeyDown(e)
  }

  public start(): void {
    if (this.destroyed) return

    const WinMutationObserver =
      this.doc.defaultView?.MutationObserver || globalThis.MutationObserver
    if (WinMutationObserver && this.doc.body) {
      this.observer = new WinMutationObserver((mutations) => {
        if (mutations.every(isPluginOnlyMutation)) return
        this.scheduleScan(30)
      })
      this.observer.observe(this.doc.body, {
        childList: true,
        subtree: true,
      })
    }

    this.doc.addEventListener('focusin', this.onFocusInBound, true)
    this.doc.addEventListener('input', this.onInputBound, true)
    this.doc.addEventListener('keydown', this.onKeyDownBound, true)

    void this.scan()
  }

  public clearLastActive(): void {
    this.lastActiveView = null
  }

  public undoLastActive(): boolean {
    const view = this.resolveActiveView()
    return view ? view.undo() : false
  }

  public redoLastActive(): boolean {
    const view = this.resolveActiveView()
    return view ? view.redo() : false
  }

  private resolveActiveView(): TableView | null {
    if (!this.lastActiveView) return null
    for (const entry of this.entries) {
      if (entry.view === this.lastActiveView) return this.lastActiveView
    }
    return null
  }

  private getOrCreateHistory(blockUuid: string, tableIndex: number): TableHistory {
    const key = `${blockUuid}:${tableIndex}`
    let hist = this.histories.get(key)
    if (!hist) {
      hist = new TableHistory()
      this.histories.set(key, hist)
    }
    return hist
  }

  private handleDocumentKeyDown(e: KeyboardEvent): void {
    if (this.destroyed) return
    const action = getUndoRedoAction(e)
    if (!action) return

    const target = e.target as HTMLElement | null
    if (
      target?.closest(
        '.nt-add-col-dialog, .nt-date-popover, .nt-select-popover, .nt-img-popover, .nt-filter-popover, .nt-search-bar'
      )
    ) {
      return
    }

    let view: TableView | null = null
    const hostEl = target?.closest('.nt-host') as HTMLElement | null
    if (hostEl) {
      for (const entry of this.entries) {
        if (entry.hostEl === hostEl) {
          view = entry.view
          break
        }
      }
    } else {
      if (
        target?.closest(
          '.editor-wrapper, .block-editor, .editor-inner, textarea, input, select, [contenteditable="true"]'
        )
      ) {
        return
      }
      view = this.resolveActiveView()
    }

    if (!view) return
    const handled = action === 'undo' ? view.undo() : view.redo()
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
  }

  public scheduleScan(delayMs = 40): void {
    if (this.destroyed) return
    if (this.scanTimer) clearTimeout(this.scanTimer)
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null
      void this.scan()
    }, delayMs)
  }

  public requestFocusAfterMount(blockUuid: string, row = 0, col = 0): void {
    this.pendingFocus.set(blockUuid, {
      row,
      col,
      expiresAt: Date.now() + 4000,
    })
    this.scheduleScan(20)
  }

  public getMountedViewsForBlock(blockUuid: string): TableView[] {
    const result: TableView[] = []
    for (const entry of this.entries) {
      if (entry.blockUuid === blockUuid) {
        result.push(entry.view)
      }
    }
    return result
  }

  public async scan(): Promise<void> {
    if (this.destroyed) return
    if (this.scanning) {
      this.rescanRequested = true
      return
    }
    this.scanning = true

    try {
      this.cleanupOrphans()

      const wrappersByBlock = new Map<string, HTMLElement[]>()
      const allWrappers = this.doc.querySelectorAll('.block-content[blockid] .table-wrapper')

      allWrappers.forEach((node) => {
        const wrapper = node as HTMLElement
        if (wrapper.closest('.query-table, .logbook-table, .tippy-popper, .block-ref')) {
          return
        }
        const blockEl = wrapper.closest('.block-content[blockid]') as HTMLElement | null
        if (!blockEl) return
        const uuid = blockEl.getAttribute('blockid')
        if (!uuid) return

        let list = wrappersByBlock.get(uuid)
        if (!list) {
          list = []
          wrappersByBlock.set(uuid, list)
        }
        list.push(wrapper)
      })

      const opts = this.getOptions()

      for (const [uuid, wrappers] of wrappersByBlock.entries()) {
        if (this.destroyed) break

        let block: { uuid?: string; content?: string; format?: string } | null = null
        try {
          block = await this.api.getBlock(uuid)
        } catch {
          continue
        }
        if (!block || typeof block.content !== 'string') continue
        if (block.format && block.format !== 'markdown') continue

        const segments = parseBlockSegments(block.content)
        const tableSegments = segments.filter(
          (s): s is Extract<typeof s, { type: 'table' }> => s.type === 'table'
        )
        if (tableSegments.length === 0) continue

        for (let idx = 0; idx < wrappers.length; idx++) {
          const wrapper = wrappers[idx]
          const seg = tableSegments[idx]
          if (!seg) continue

          const existing = this.mounted.get(wrapper)
          if (existing && existing.hostEl.isConnected && wrapper.nextElementSibling === existing.hostEl) {
            existing.tableIndex = idx
            const hasPendingSave =
              (this.pendingSaves.get(uuid) ?? 0) > 0 || existing.view.hasPendingLocalChanges()
            const isRecentEcho = this.isRecentWrite(uuid, block.content)
            if (!hasPendingSave && !isRecentEcho) {
              existing.view.updateFromExternal(seg.table)
            }
            continue
          }

          if (existing) {
            this.unmountEntry(existing)
          }

          wrapper.setAttribute('data-nt-hidden', 'true')
          const hostEl = this.doc.createElement('div')
          hostEl.className = 'nt-host forbid-edit'
          hostEl.dataset.ntBlockUuid = uuid
          hostEl.dataset.ntTableIndex = String(idx)

          wrapper.insertAdjacentElement('afterend', hostEl)

          const view: TableView = new TableView({
            doc: this.doc,
            hostEl,
            blockUuid: uuid,
            tableIndex: idx,
            initialTable: seg.table,
            autoSaveDelayMs: opts.autoSaveDelayMs,
            fullWidthByDefault: opts.fullWidthByDefault,
            defaultImageMaxWidth: opts.defaultImageMaxWidth,
            defaultImageMaxHeight: opts.defaultImageMaxHeight,
            preferredDateFormat: opts.preferredDateFormat,
            preferredStartOfWeek: opts.preferredStartOfWeek,
            history: this.getOrCreateHistory(uuid, idx),
            onInteract: () => {
              this.lastActiveView = view
            },
            callbacks: {
              onCommit: (nextTable) => this.commitTableChange(uuid, idx, nextTable, view),
              onPageClick: (pageName, shiftKey) => this.api.openPage(pageName, shiftKey),
              onExternalLinkClick: this.api.openExternalLink,
              onEditRawMarkdown: () => {
                void this.api.editBlock(uuid)
              },
              onCopyToast: (msg) => this.api.showToast?.(msg, 'success'),
              onSearchPages: this.api.searchPages,
              onSaveImageAsset: this.api.saveImageAsset,
              onResolveAssetUrl: this.api.resolveAssetUrl,
            },
          })

          const entry: MountedEntry = {
            wrapper,
            hostEl,
            blockUuid: uuid,
            tableIndex: idx,
            view,
          }
          this.mounted.set(wrapper, entry)
          this.entries.add(entry)
        }

        const pending = this.pendingFocus.get(uuid)
        if (pending) {
          this.pendingFocus.delete(uuid)
          if (Date.now() <= pending.expiresAt) {
            const firstView = this.getMountedViewsForBlock(uuid)[0]
            firstView?.focusCell(pending.row, pending.col)
          }
        }
      }
    } finally {
      this.scanning = false
      if (this.rescanRequested && !this.destroyed) {
        this.rescanRequested = false
        this.scheduleScan(20)
      }
    }
  }

  private recordWrite(blockUuid: string, content: string): void {
    const now = Date.now()
    const list = (this.recentWrites.get(blockUuid) || []).filter((item) => item.expiresAt > now)
    list.push({ content, expiresAt: now + 1500 })
    if (list.length > 8) list.shift()
    this.recentWrites.set(blockUuid, list)
  }

  private isRecentWrite(blockUuid: string, content: string): boolean {
    const now = Date.now()
    const list = this.recentWrites.get(blockUuid)
    if (!list || list.length === 0) return false
    const active = list.filter((item) => item.expiresAt > now)
    if (active.length !== list.length) {
      if (active.length === 0) {
        this.recentWrites.delete(blockUuid)
      } else {
        this.recentWrites.set(blockUuid, active)
      }
    }
    return active.some((item) => item.content === content)
  }

  private commitTableChange(
    blockUuid: string,
    tableIndex: number,
    nextTable: TableData,
    sourceView: TableView
  ): Promise<void> {
    this.pendingSaves.set(blockUuid, (this.pendingSaves.get(blockUuid) ?? 0) + 1)
    const prev = this.saveQueues.get(blockUuid) || Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        if (this.destroyed) return
        const block = await this.api.getBlock(blockUuid)
        if (!block || typeof block.content !== 'string') return

        const segments = parseBlockSegments(block.content)
        let seenTables = 0
        let replaced = false
        const updatedSegments = segments.map((seg) => {
          if (seg.type !== 'table') return seg
          if (seenTables++ === tableIndex) {
            replaced = true
            return { ...seg, table: nextTable }
          }
          return seg
        })

        if (!replaced) return
        const nextContent = serializeBlockSegments(updatedSegments)
        if (nextContent === block.content) return

        this.recordWrite(blockUuid, nextContent)
        await this.api.updateBlock(blockUuid, nextContent)

        // Sync any sibling instances showing the same block (e.g., right sidebar)
        for (const entry of this.entries) {
          if (
            entry.blockUuid === blockUuid &&
            entry.tableIndex === tableIndex &&
            entry.view !== sourceView
          ) {
            entry.view.updateFromExternal(nextTable)
          }
        }
      })
      .finally(() => {
        const cur = this.pendingSaves.get(blockUuid) ?? 0
        if (cur <= 1) {
          this.pendingSaves.delete(blockUuid)
        } else {
          this.pendingSaves.set(blockUuid, cur - 1)
        }
      })

    this.saveQueues.set(blockUuid, next)
    return next
  }

  private cleanupOrphans(): void {
    for (const entry of Array.from(this.entries)) {
      const valid =
        entry.wrapper.isConnected &&
        entry.hostEl.isConnected &&
        entry.wrapper.nextElementSibling === entry.hostEl
      if (!valid) {
        this.unmountEntry(entry)
      }
    }
  }

  private unmountEntry(entry: MountedEntry): void {
    if (this.lastActiveView === entry.view) {
      this.lastActiveView = null
    }
    entry.view.destroy()
    if (entry.wrapper.isConnected) {
      entry.wrapper.removeAttribute('data-nt-hidden')
    }
    this.mounted.delete(entry.wrapper)
    this.entries.delete(entry)
  }

  private handleTextareaEvent(target: EventTarget | null): void {
    const el = target as HTMLElement | null
    if (!el || el.tagName !== 'TEXTAREA') return
    if (el.closest('.nt-host')) return
    if (!el.closest('.editor-inner, .block-editor, .editor-wrapper, .ls-block')) return

    this.lastActiveView = null
    const ta = el as HTMLTextAreaElement
    const enabled = this.getOptions().monospaceRawSource
    ta.classList.toggle('nt-mono-source', enabled && looksLikeMarkdownTable(ta.value))
  }

  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }

    this.doc.removeEventListener('focusin', this.onFocusInBound, true)
    this.doc.removeEventListener('input', this.onInputBound, true)
    this.doc.removeEventListener('keydown', this.onKeyDownBound, true)

    for (const entry of Array.from(this.entries)) {
      this.unmountEntry(entry)
    }

    this.doc.querySelectorAll('.table-wrapper[data-nt-hidden="true"]').forEach((el) => {
      el.removeAttribute('data-nt-hidden')
    })

    this.saveQueues.clear()
    this.pendingSaves.clear()
    this.recentWrites.clear()
    this.histories.clear()
    this.lastActiveView = null
    this.pendingFocus.clear()
  }
}
