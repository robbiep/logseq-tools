import { type PageSearchResult } from '../host/pageIndex'
import {
  COLUMN_TYPE_LABELS,
  computeColumnCalculation,
  formatCheckboxValue,
  getCalculationsForColumnType,
  harvestOptionsFromColumn,
  isCheckboxChecked,
  isTimestampColumnType,
  parseSelectCellValues,
  parseUrlCell,
  type ColumnCalculation,
  type ColumnSchema,
  type ColumnType,
} from '../markdown/columnTypes'
import {
  formatJournalDateLink,
  formatLogseqDate,
  formatRelativeDateLabel,
  normalizeRelativeDateToken,
  parsePlaintextDate,
  parseTimestamp,
} from '../markdown/dateUtils'
import {
  buildPrefilledRowForFilters,
  cloneFilter,
  createDefaultFilter,
  getOperatorLabel,
  getVisibleRowIndices,
  isFilterComplete,
  isValuelessFilterOp,
  type TableFilter,
} from '../markdown/tableFilters'
import {
  computeSmartImageSize,
  extractDroppedImageUrl,
  formatImageMarkdown,
  isImageFile,
  measureImageFile,
  removeImageInRawText,
  updateImageDimensionsInRawText,
} from '../markdown/imageUtils'
import { renderCellContent, toggleCheckboxInRawText } from '../markdown/inlineRenderer'
import {
  applyGridPaste,
  clearAllColumnCalculations,
  clearAllTableFilters,
  clearCellRange,
  clearColumn,
  clearColumnFilters,
  clearRow,
  deleteColumn,
  deleteRow,
  deleteRows,
  duplicateColumn,
  duplicateRow,
  getVisibleTableSlice,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  moveRowsWithMap,
  parseClipboardGrid,
  removeTableFilter,
  renameColumnOption,
  serializeSelectionAsMarkdown,
  setColumnAlignment,
  setColumnCalculation,
  setColumnOptions,
  setColumnType,
  setTableLocked,
  setTableShowCalc,
  sortByColumn,
  tableToCsv,
  updateCell,
  updateColumnInRows,
  upsertTableFilter,
  type ClipboardTablePayload,
} from '../markdown/tableOps'
import {
  serializeTable,
  type Alignment,
  type TableData,
} from '../markdown/tableParser'
import {
  closeActiveAddColumnDialog,
  COLUMN_TYPE_CHOICES,
  COLUMN_TYPE_ICONS,
  openAddColumnDialog,
} from './addColumnDialog'
import { closeActiveDatePicker, openDatePicker } from './datePicker'
import { attachHandleDragReorder } from './dragReorder'
import { closeActiveFilterPopover, openFilterPopover } from './filterPopover'
import { createIcon, type IconName } from './icons'
import { closeActiveImagePopover } from './imageControls'
import { PageAutocompleteController } from './pageAutocomplete'
import { closeActivePopover, openPopoverMenu, type PopoverMenuItem } from './popoverMenu'
import { closeActiveSelectPicker, openSelectPicker } from './selectPicker'
import { cloneTableData, TableHistory, tablesEqual } from './tableHistory'

export interface TableViewCallbacks {
  onCommit: (nextTable: TableData) => Promise<void> | void
  onPageClick: (pageName: string, shiftKey: boolean) => void
  onExternalLinkClick?: (url: string) => void
  onEditRawMarkdown: () => void
  onCopyToast?: (message: string) => void
  onSearchPages?: (query: string) => Promise<PageSearchResult[]>
  onSaveImageAsset?: (file: File) => Promise<{ markdownPath: string }>
  onResolveAssetUrl?: (rawSrc: string) => Promise<string>
}

export interface TableViewOptions {
  doc: Document
  hostEl: HTMLElement
  blockUuid: string
  tableIndex: number
  initialTable: TableData
  autoSaveDelayMs: number
  fullWidthByDefault: boolean
  defaultImageMaxWidth?: number
  defaultImageMaxHeight?: number
  preferredDateFormat?: string
  preferredStartOfWeek?: number
  history?: TableHistory
  onInteract?: () => void
  callbacks: TableViewCallbacks
}

const CLIPBOARD_TABLE_MIME = 'application/x-logseq-notion-table'

interface CellSelectionRange {
  anchorRow: number
  anchorCol: number
  focusRow: number
  focusCol: number
}

interface StoredVisualPrefs {
  colWidths?: Record<number, number>
}

export class TableView {
  private doc: Document
  private hostEl: HTMLElement
  private blockUuid: string
  private tableIndex: number
  private table: TableData
  private autoSaveDelayMs: number
  private defaultImageMaxWidth: number
  private defaultImageMaxHeight: number
  private preferredDateFormat: string
  private preferredStartOfWeek: number
  private history: TableHistory
  private onInteract?: () => void
  private callbacks: TableViewCallbacks

  private fullWidth = false
  private maximized = false
  private colWidths: Record<number, number> = {}

  private activeCell: { row: number; col: number } | null = null
  private activeTextarea: HTMLTextAreaElement | null = null
  private autocomplete: PageAutocompleteController | null = null
  private dirtyValue: string | null = null
  private cellEditCheckpointTable: TableData | null = null
  private lastTypingAt = 0
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private cleanups: Array<() => void> = []

  private scrollEl: HTMLElement | null = null
  private tableEl: HTMLTableElement | null = null
  private colgroupEl: HTMLElement | null = null
  private bulkBarEl: HTMLElement | null = null
  private undoBtnEl: HTMLButtonElement | null = null
  private redoBtnEl: HTMLButtonElement | null = null
  private searchOpen = false
  private searchQuery = ''
  private searchBarEl: HTMLElement | null = null
  private searchInputEl: HTMLInputElement | null = null
  private searchCountEl: HTMLElement | null = null
  private searchBtnEl: HTMLButtonElement | null = null
  private copyMdBtnEl: HTMLButtonElement | null = null
  private copyCsvBtnEl: HTMLButtonElement | null = null
  private visibleBodyIndices: number[] = []
  private selectedBodyRows = new Set<number>()
  private selectionAnchorBodyIdx: number | null = null
  private cellSelection: CellSelectionRange | null = null
  private suppressNextCellClick = false

  constructor(opts: TableViewOptions) {
    this.doc = opts.doc
    this.hostEl = opts.hostEl
    this.blockUuid = opts.blockUuid
    this.tableIndex = opts.tableIndex
    this.table = opts.initialTable
    this.autoSaveDelayMs = opts.autoSaveDelayMs
    this.fullWidth = opts.fullWidthByDefault
    this.defaultImageMaxWidth = opts.defaultImageMaxWidth ?? 220
    this.defaultImageMaxHeight = opts.defaultImageMaxHeight ?? 160
    this.preferredDateFormat = opts.preferredDateFormat || 'MMM do, yyyy'
    this.preferredStartOfWeek = opts.preferredStartOfWeek ?? 0
    this.history = opts.history || new TableHistory()
    this.onInteract = opts.onInteract
    this.callbacks = opts.callbacks

    this.loadPrefs()
    this.bindHostIsolation()
    this.render()
  }

  private get prefsStorageKey(): string {
    return `nt-prefs:${this.blockUuid}:${this.tableIndex}`
  }

  private loadPrefs(): void {
    try {
      const win = this.doc.defaultView || window
      const raw = win.localStorage?.getItem(this.prefsStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as StoredVisualPrefs
      if (parsed.colWidths && typeof parsed.colWidths === 'object') {
        this.colWidths = parsed.colWidths
        this.pruneOutOfBoundsColWidths(false)
      }
    } catch {
      // Ignore storage access failures
    }
  }

  private savePrefs(): void {
    try {
      const win = this.doc.defaultView || window
      const payload: StoredVisualPrefs = {
        colWidths: this.colWidths,
      }
      win.localStorage?.setItem(this.prefsStorageKey, JSON.stringify(payload))
    } catch {
      // Ignore storage access failures
    }
  }

  private bindHostIsolation(): void {
    const stopOnly = (e: Event) => {
      e.stopPropagation()
    }
    const markInteract = () => {
      this.onInteract?.()
    }
    const events = [
      'mousedown',
      'mouseup',
      'click',
      'dblclick',
      'keydown',
      'keyup',
      'keypress',
      'paste',
      'cut',
      'copy',
    ]
    for (const evt of events) {
      this.hostEl.addEventListener(evt, stopOnly)
    }
    this.hostEl.addEventListener('mousedown', markInteract, true)
    this.hostEl.addEventListener('focusin', markInteract, true)

    const onDocKeyDown = (e: KeyboardEvent) => {
      if (
        !e.altKey &&
        !e.shiftKey &&
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'f'
      ) {
        const target = e.target as Node | null
        const active = this.doc.activeElement
        const isInsideHost = this.hostEl.contains(target) || this.hostEl.contains(active)
        const inOverlay =
          target instanceof Element &&
          Boolean(
            target.closest(
              '.nt-popover, .nt-filter-popover, .nt-date-popover, .nt-select-popover, .nt-add-col-dialog, .nt-img-popover'
            )
          )
        if (isInsideHost && !inOverlay) {
          e.preventDefault()
          e.stopPropagation()
          this.flushActiveEdit(true)
          this.openSearchBar()
          return
        }
      }
      if (e.key === 'Escape' && this.maximized && !this.activeTextarea) {
        const target = e.target as Element | null
        if (
          target?.closest(
            '.nt-search-bar, .nt-popover, .nt-filter-popover, .nt-date-popover, .nt-select-popover, .nt-add-col-dialog, .nt-img-popover'
          )
        ) {
          return
        }
        e.preventDefault()
        e.stopPropagation()
        this.maximized = false
        this.syncHostClasses()
        this.render()
        return
      }
      if (this.hasSelection() && !this.activeTextarea) {
        const target = e.target as Node | null
        const active = this.doc.activeElement
        const isInsideHost = this.hostEl.contains(target) || this.hostEl.contains(active)
        const isBodyActive = active === null || active === this.doc.body || active === this.doc.documentElement
        if (isInsideHost || (!this.isEditableTarget(target) && isBodyActive)) {
          this.handleSelectionKeyDown(e)
        }
      }
    }

    const onHostCopy = (e: ClipboardEvent) => {
      this.handleCopyEvent(e)
    }
    const onHostCut = (e: ClipboardEvent) => {
      this.handleCutEvent(e)
    }
    const onHostPaste = (e: ClipboardEvent) => {
      this.handleHostPasteEvent(e)
    }

    const onDocCopy = (e: ClipboardEvent) => {
      if (this.hostEl.contains(e.target as Node)) return
      if (!this.hasSelection() || this.activeTextarea) return
      const active = this.doc.activeElement
      if (active && active !== this.doc.body && active !== this.doc.documentElement && !this.hostEl.contains(active)) {
        return
      }
      const win = this.doc.defaultView || window
      const sel = win.getSelection?.()
      if (sel && !sel.isCollapsed) return
      this.handleCopyEvent(e)
    }

    const onDocCut = (e: ClipboardEvent) => {
      if (this.hostEl.contains(e.target as Node)) return
      if (!this.hasSelection() || this.activeTextarea) return
      const active = this.doc.activeElement
      if (active && active !== this.doc.body && active !== this.doc.documentElement && !this.hostEl.contains(active)) {
        return
      }
      this.handleCutEvent(e)
    }

    const onDocPaste = (e: ClipboardEvent) => {
      if (this.hostEl.contains(e.target as Node)) return
      if (!this.hasSelection() || this.activeTextarea) return
      const active = this.doc.activeElement
      if (active && active !== this.doc.body && active !== this.doc.documentElement && !this.hostEl.contains(active)) {
        return
      }
      this.handleHostPasteEvent(e)
    }

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (
        target &&
        (this.hostEl.contains(target) ||
          target.closest('.nt-popover, .nt-select-popover, .nt-date-popover'))
      ) {
        return
      }
      if (this.hasSelection()) {
        this.clearSelection()
      }
      if (
        e.button === 0 &&
        this.tableEl &&
        target &&
        !target.closest(
          '.nt-host, .nt-popover, a, button, input, textarea, select, [contenteditable="true"], p, span, li, code, pre, h1, h2, h3, h4, h5, h6'
        )
      ) {
        const win = this.doc.defaultView || window
        const startX = e.clientX
        const startY = e.clientY
        let active = false

        const onMove = (moveEv: MouseEvent) => {
          if (!active) {
            if (Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY) < 4) return
            const hostRect = this.hostEl.getBoundingClientRect()
            if (
              moveEv.clientX < hostRect.left ||
              moveEv.clientX > hostRect.right ||
              moveEv.clientY < hostRect.top ||
              moveEv.clientY > hostRect.bottom
            ) {
              return
            }
            active = true
            this.flushActiveEdit(true)
            this.cellSelection = null
            this.hostEl.classList.add('nt-selecting')
          }
          if (active) {
            win.getSelection?.()?.removeAllRanges()
            this.selectRowsIntersectingY(startY, moveEv.clientY)
          }
        }

        const onUp = (upEv: MouseEvent) => {
          win.removeEventListener('mousemove', onMove, true)
          win.removeEventListener('mouseup', onUp, true)
          this.hostEl.classList.remove('nt-selecting')
          if (active) {
            this.selectRowsIntersectingY(startY, upEv.clientY)
            this.suppressNextCellClick = true
            setTimeout(() => {
              this.suppressNextCellClick = false
            }, 0)
            this.focusScrollContainer()
          }
        }

        win.addEventListener('mousemove', onMove, true)
        win.addEventListener('mouseup', onUp, true)
      }
    }

    this.hostEl.addEventListener('copy', onHostCopy)
    this.hostEl.addEventListener('cut', onHostCut)
    this.hostEl.addEventListener('paste', onHostPaste)
    this.doc.addEventListener('keydown', onDocKeyDown, true)
    this.doc.addEventListener('copy', onDocCopy)
    this.doc.addEventListener('cut', onDocCut)
    this.doc.addEventListener('paste', onDocPaste)
    this.doc.addEventListener('mousedown', onDocMouseDown, true)

    this.cleanups.push(() => {
      this.doc.removeEventListener('keydown', onDocKeyDown, true)
      this.doc.removeEventListener('copy', onDocCopy)
      this.doc.removeEventListener('cut', onDocCut)
      this.doc.removeEventListener('paste', onDocPaste)
      this.doc.removeEventListener('mousedown', onDocMouseDown, true)
      this.hostEl.removeEventListener('copy', onHostCopy)
      this.hostEl.removeEventListener('cut', onHostCut)
      this.hostEl.removeEventListener('paste', onHostPaste)
      this.hostEl.removeEventListener('mousedown', markInteract, true)
      this.hostEl.removeEventListener('focusin', markInteract, true)
      for (const evt of events) {
        this.hostEl.removeEventListener(evt, stopOnly)
      }
    })
  }

  private hasAnyCalculation(): boolean {
    return (this.table.columns || []).some((c) => Boolean(c.calc && c.calc !== 'none'))
  }

  private isCalcRowVisible(): boolean {
    if (typeof this.table.showCalc === 'boolean') return this.table.showCalc
    return this.hasAnyCalculation()
  }

  private toggleCalcRow(): void {
    this.applyStructuralOp(setTableShowCalc(this.table, !this.isCalcRowVisible()))
  }

  private isLocked(): boolean {
    return Boolean(this.table.locked)
  }

  private toggleLock(): void {
    this.flushActiveEdit(true)
    closeActivePopover()
    closeActiveAddColumnDialog()
    closeActiveDatePicker()
    closeActiveSelectPicker()
    closeActiveImagePopover()
    closeActiveFilterPopover()
    this.table = setTableLocked(this.table, !this.isLocked())
    this.render()
    void this.callbacks.onCommit(this.table)
  }

  private syncHostClasses(): void {
    this.hostEl.classList.toggle('nt-full-width', this.fullWidth)
    this.hostEl.classList.toggle('nt-maximized', this.maximized)
    this.hostEl.classList.toggle('nt-has-calc', this.hasAnyCalculation())
    this.hostEl.classList.toggle('nt-show-calc', this.isCalcRowVisible())
    this.hostEl.classList.toggle('nt-locked', this.isLocked())
  }

  public hasPendingLocalChanges(): boolean {
    return this.saveTimer !== null
  }

  public updateFromExternal(nextTable: TableData): void {
    if (this.destroyed) return
    if (this.saveTimer !== null) return
    if (tablesEqual(this.table, nextTable)) return

    // Preserve active editing cell text if only another cell or non-structural echo arrived
    if (this.activeCell && this.activeTextarea) {
      const { row, col } = this.activeCell
      const sameShape =
        this.table.headers.length === nextTable.headers.length &&
        this.table.rows.length === nextTable.rows.length
      if (sameShape) {
        const localVal = this.activeTextarea.value
        this.table = updateCell(nextTable, row, col, localVal, { skipAutoTimestamps: true })
        return
      }
    }

    this.table = nextTable
    this.render()
  }

  public focusCell(rowIdx: number, colIdx: number): void {
    if (this.destroyed || this.isLocked()) return
    const clampedRow = Math.max(0, Math.min(this.table.rows.length, rowIdx))
    const clampedCol = Math.max(0, Math.min(this.table.headers.length - 1, colIdx))
    this.activateCell(clampedRow, clampedCol, 'end')
  }

  public getCurrentTable(): TableData {
    return this.table
  }

  public canUndo(): boolean {
    return this.history.canUndo()
  }

  public canRedo(): boolean {
    return this.history.canRedo()
  }

  private recordHistory(
    beforeTable: TableData,
    focusCell: { row: number; col: number } | null = this.activeCell
  ): void {
    this.history.push(beforeTable, focusCell, { ...this.colWidths })
    this.onInteract?.()
    this.updateUndoRedoButtons()
  }

  private updateUndoRedoButtons(): void {
    if (this.undoBtnEl) {
      this.undoBtnEl.disabled = !this.history.canUndo()
    }
    if (this.redoBtnEl) {
      this.redoBtnEl.disabled = !this.history.canRedo()
    }
  }

  public undo(): boolean {
    if (this.isLocked()) return false
    return this.applyHistoryStep('undo')
  }

  public redo(): boolean {
    if (this.isLocked()) return false
    return this.applyHistoryStep('redo')
  }

  private applyHistoryStep(direction: 'undo' | 'redo'): boolean {
    if (this.destroyed) return false
    closeActivePopover()
    closeActiveAddColumnDialog()
    closeActiveDatePicker()
    closeActiveSelectPicker()
    closeActiveImagePopover()
    closeActiveFilterPopover()

    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    const wasEditing = this.activeTextarea !== null
    const curFocus = this.activeCell
    if (wasEditing && this.activeTextarea) {
      const { row, col } = curFocus!
      this.table = updateCell(this.table, row, col, this.activeTextarea.value, this.timestampOpts)
      this.autocomplete?.destroy()
      this.autocomplete = null
      this.activeTextarea = null
      this.activeCell = null
      this.dirtyValue = null
      this.cellEditCheckpointTable = null
      this.lastTypingAt = 0
    }

    const entry =
      direction === 'undo'
        ? this.history.undo(this.table, curFocus, { ...this.colWidths })
        : this.history.redo(this.table, curFocus, { ...this.colWidths })
    if (!entry) return false

    this.onInteract?.()
    this.table = entry.table
    if (entry.colWidths !== undefined) {
      this.colWidths = { ...entry.colWidths }
      this.savePrefs()
    }
    this.render()
    void this.callbacks.onCommit(this.table)

    if (wasEditing && entry.focusCell) {
      const targetRow = Math.min(this.table.rows.length, entry.focusCell.row)
      const targetCol = Math.min(this.table.headers.length - 1, entry.focusCell.col)
      const isVisible = targetRow === 0 || this.visibleBodyIndices.includes(targetRow - 1)
      const colType = this.getColumnSchema(targetCol).type
      if (isVisible && (targetRow === 0 || colType === 'text' || colType === 'url' || colType === 'number')) {
        this.activateCell(targetRow, targetCol, 'end')
      }
    }

    return true
  }

  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    this.autocomplete?.destroy()
    this.autocomplete = null
    closeActivePopover()
    closeActiveAddColumnDialog()
    closeActiveImagePopover()
    closeActiveDatePicker()
    closeActiveSelectPicker()
    closeActiveFilterPopover()
    for (const fn of this.cleanups) fn()
    this.cleanups = []
    this.hostEl.remove()
  }

  private scheduleCommit(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    const snapshot = this.table
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (!this.destroyed) {
        void this.callbacks.onCommit(snapshot)
      }
    }, this.autoSaveDelayMs)
  }

  private flushActiveEdit(commitNow = true): void {
    if (!this.activeCell || !this.activeTextarea) return
    const { row, col } = this.activeCell
    const val = this.activeTextarea.value
    const prevVal = this.getCellValue(row, col)
    const changed = val !== prevVal || this.dirtyValue !== null

    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    if (changed) {
      this.table = updateCell(this.table, row, col, val, this.timestampOpts)
    }

    this.dirtyValue = null
    this.cellEditCheckpointTable = null
    this.lastTypingAt = 0
    this.autocomplete?.destroy()
    this.autocomplete = null
    const tdOrTh = this.activeTextarea.closest('th, td') as HTMLElement | null
    this.activeTextarea = null
    this.activeCell = null

    if (tdOrTh) {
      tdOrTh.classList.remove('nt-cell-active')
      this.renderCellDisplayInto(tdOrTh, row, col)
    }

    if (changed) {
      this.refreshEditedTimeCellsInRow(row)
      this.syncVisibleRowsAfterCellCommit()
      this.refreshCalcFooter()
    }

    if (commitNow && changed && !this.destroyed) {
      void this.callbacks.onCommit(this.table)
    }
  }

  private computeVisibleBodyIndices(): number[] {
    return getVisibleRowIndices(this.table, this.searchQuery, this.preferredDateFormat)
  }

  private isFilteredOrSearched(): boolean {
    return (this.table.filters?.length ?? 0) > 0 || this.searchQuery.trim().length > 0
  }

  private hasVisibleRowChange(): boolean {
    const nextVisible = this.computeVisibleBodyIndices()
    if (nextVisible.length !== this.visibleBodyIndices.length) return true
    for (let i = 0; i < nextVisible.length; i++) {
      if (nextVisible[i] !== this.visibleBodyIndices[i]) return true
    }
    return false
  }

  private syncVisibleRowsAfterCellCommit(): void {
    if (this.hasVisibleRowChange()) {
      this.render()
    }
  }

  private refreshCalcFooter(): void {
    if (!this.tableEl) return
    if (!this.hasAnyCalculation() && !this.isCalcRowVisible()) return
    const oldFoot = this.tableEl.querySelector('tfoot')
    const nextFoot = this.buildCalcFooter()
    if (oldFoot) {
      oldFoot.replaceWith(nextFoot)
    } else {
      this.tableEl.appendChild(nextFoot)
    }
  }

  private applyStructuralOp(
    nextTable: TableData,
    nextFocus: { row: number; col: number } | null = null,
    onBeforeRender?: () => void
  ): void {
    this.flushActiveEdit(false)
    this.recordHistory(this.table, nextFocus ?? this.activeCell)
    onBeforeRender?.()
    this.table = nextTable
    this.render()
    void this.callbacks.onCommit(this.table)
    if (nextFocus) {
      this.focusCell(nextFocus.row, nextFocus.col)
    }
  }

  private getCellValue(rowIdx: number, colIdx: number): string {
    if (rowIdx === 0) return this.table.headers[colIdx] ?? ''
    return this.table.rows[rowIdx - 1]?.[colIdx] ?? ''
  }

  private findCellElement(rowIdx: number, colIdx: number): HTMLElement | null {
    if (!this.tableEl) return null
    return (
      (this.tableEl.querySelector(
        `th[data-row="${rowIdx}"][data-col="${colIdx}"], td[data-row="${rowIdx}"][data-col="${colIdx}"]`
      ) as HTMLElement | null) || null
    )
  }

  private buildTableBody(colgroup: HTMLElement): HTMLElement {
    const tbody = this.doc.createElement('tbody')
    const hasFilters = (this.table.filters?.length ?? 0) > 0
    const hasSearch = this.searchQuery.trim().length > 0

    if (this.visibleBodyIndices.length === 0 && (hasFilters || hasSearch)) {
      const emptyTr = this.doc.createElement('tr')
      emptyTr.className = 'nt-empty-filter-row'
      const emptyTd = this.doc.createElement('td')
      emptyTd.colSpan = Math.max(1, this.table.headers.length)
      const emptyInner = this.doc.createElement('div')
      emptyInner.className = 'nt-empty-filter-inner'
      const msg = this.doc.createElement('span')
      if (hasFilters && hasSearch) {
        msg.textContent = 'No rows match the active filters and search.'
      } else if (hasSearch) {
        msg.textContent = 'No rows match your search.'
      } else {
        msg.textContent = 'No rows match the active filters.'
      }
      emptyInner.appendChild(msg)

      if (hasSearch) {
        const clearSearchBtn = this.doc.createElement('button')
        clearSearchBtn.type = 'button'
        clearSearchBtn.className = 'nt-empty-filter-clear-btn nt-empty-search-clear-btn forbid-edit'
        clearSearchBtn.textContent = 'Clear search'
        clearSearchBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        clearSearchBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.closeSearchBar(true)
        })
        emptyInner.appendChild(clearSearchBtn)
      }

      if (hasFilters) {
        const clearBtn = this.doc.createElement('button')
        clearBtn.type = 'button'
        clearBtn.className = 'nt-empty-filter-clear-btn forbid-edit'
        clearBtn.textContent = 'Clear filters'
        clearBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        clearBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.applyStructuralOp(clearAllTableFilters(this.table))
        })
        emptyInner.appendChild(clearBtn)
      }

      emptyTd.appendChild(emptyInner)
      emptyTr.appendChild(emptyTd)
      tbody.appendChild(emptyTr)
    } else {
      for (const bodyIdx of this.visibleBodyIndices) {
        const tr = this.doc.createElement('tr')
        tr.dataset.row = String(bodyIdx + 1)
        tr.dataset.bodyIdx = String(bodyIdx)
        for (let c = 0; c < this.table.headers.length; c++) {
          tr.appendChild(this.buildCell(bodyIdx + 1, c, false, colgroup))
        }
        tbody.appendChild(tr)
      }
    }
    return tbody
  }

  private pruneStaleSelections(): void {
    const visibleSet = new Set(this.visibleBodyIndices)
    for (const bIdx of Array.from(this.selectedBodyRows)) {
      if (!visibleSet.has(bIdx)) {
        this.selectedBodyRows.delete(bIdx)
      }
    }
    if (this.selectionAnchorBodyIdx !== null && !visibleSet.has(this.selectionAnchorBodyIdx)) {
      this.selectionAnchorBodyIdx = null
    }
    if (this.cellSelection) {
      const maxCol = Math.max(0, this.table.headers.length - 1)
      const validRows = new Set([0, ...this.visibleBodyIndices.map((b) => b + 1)])
      if (!validRows.has(this.cellSelection.anchorRow) || !validRows.has(this.cellSelection.focusRow)) {
        this.cellSelection = null
      } else {
        this.cellSelection.anchorCol = Math.min(maxCol, this.cellSelection.anchorCol)
        this.cellSelection.focusCol = Math.min(maxCol, this.cellSelection.focusCol)
      }
    }
  }

  private render(): void {
    const prevScrollLeft = this.scrollEl?.scrollLeft ?? 0
    this.activeTextarea = null
    this.activeCell = null
    this.searchBarEl = null
    this.searchInputEl = null
    this.searchCountEl = null
    this.searchBtnEl = null
    this.copyMdBtnEl = null
    this.copyCsvBtnEl = null
    this.colgroupEl = null
    this.pruneOutOfBoundsColWidths()
    this.syncHostClasses()

    // Remove previous drag/resize cleanups except host isolation (index 0)
    while (this.cleanups.length > 1) {
      const fn = this.cleanups.pop()
      fn?.()
    }

    this.visibleBodyIndices = this.computeVisibleBodyIndices()
    const hasFilters = (this.table.filters?.length ?? 0) > 0

    this.hostEl.textContent = ''
    this.bulkBarEl = null
    this.hostEl.appendChild(this.buildToolbar())
    if (this.searchOpen) {
      this.hostEl.appendChild(this.buildSearchBar())
    }
    if (hasFilters) {
      this.hostEl.appendChild(this.buildFilterBar())
    }

    const scroll = this.doc.createElement('div')
    scroll.className = 'nt-scroll'
    scroll.tabIndex = 0
    scroll.setAttribute('role', 'region')
    scroll.setAttribute('aria-label', 'Table')
    this.scrollEl = scroll

    const colWrap = this.doc.createElement('div')
    colWrap.className = 'nt-table-col-wrap'

    const rowWrap = this.doc.createElement('div')
    rowWrap.className = 'nt-table-row-wrap'

    const table = this.doc.createElement('table')
    table.className = 'nt-table forbid-edit'
    this.tableEl = table

    // Colgroup for persisted column widths
    const colgroup = this.doc.createElement('colgroup')
    this.colgroupEl = colgroup
    for (let c = 0; c < this.table.headers.length; c++) {
      const col = this.doc.createElement('col')
      const w = this.colWidths[c]
      if (w && w > 40) {
        col.style.width = `${w}px`
      }
      colgroup.appendChild(col)
    }
    table.appendChild(colgroup)

    // Header row
    const thead = this.doc.createElement('thead')
    const headTr = this.doc.createElement('tr')
    for (let c = 0; c < this.table.headers.length; c++) {
      headTr.appendChild(this.buildCell(0, c, true, colgroup))
    }
    thead.appendChild(headTr)
    table.appendChild(thead)

    // Body rows
    const tbody = this.buildTableBody(colgroup)
    table.appendChild(tbody)
    table.appendChild(this.buildCalcFooter())

    rowWrap.appendChild(table)
    if (!this.isLocked()) {
      rowWrap.appendChild(this.buildAddColBar())
    }
    colWrap.appendChild(rowWrap)
    if (!this.isLocked()) {
      colWrap.appendChild(this.buildAddRowBar())
    }
    scroll.appendChild(colWrap)

    const scrollWrap = this.doc.createElement('div')
    scrollWrap.className = 'nt-scroll-wrap'
    scrollWrap.appendChild(scroll)
    if (this.isLocked()) {
      scrollWrap.appendChild(this.buildLockBadge())
    }
    this.hostEl.appendChild(scrollWrap)

    this.attachOutsideRowSelection(scroll)

    if (prevScrollLeft > 0) {
      scroll.scrollLeft = prevScrollLeft
    }

    // Prune stale selection indices after structural changes / filtering
    this.pruneStaleSelections()
    this.syncSelectionUI()
  }

  private hasSelection(): boolean {
    return this.selectedBodyRows.size > 0 || this.cellSelection !== null
  }

  private isEditableTarget(target: Node | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(
      target.closest('textarea, input:not(.nt-row-select), select, [contenteditable="true"]')
    )
  }

  private focusScrollContainer(): void {
    try {
      this.scrollEl?.focus({ preventScroll: true })
    } catch {
      this.scrollEl?.focus()
    }
  }

  private clearSelection(): void {
    if (!this.hasSelection()) return
    this.selectedBodyRows.clear()
    this.selectionAnchorBodyIdx = null
    this.cellSelection = null
    this.syncSelectionUI()
  }

  private getNormalizedCellRange(): {
    rowIndices: number[]
    minRowPos: number
    maxRowPos: number
    minCol: number
    maxCol: number
  } | null {
    if (!this.cellSelection) return null
    const visibleRows = [0, ...this.visibleBodyIndices.map((b) => b + 1)]
    const aPos = visibleRows.indexOf(this.cellSelection.anchorRow)
    const fPos = visibleRows.indexOf(this.cellSelection.focusRow)
    if (aPos === -1 || fPos === -1) return null
    const minRowPos = Math.min(aPos, fPos)
    const maxRowPos = Math.max(aPos, fPos)
    const minCol = Math.min(this.cellSelection.anchorCol, this.cellSelection.focusCol)
    const maxCol = Math.max(this.cellSelection.anchorCol, this.cellSelection.focusCol)
    return {
      rowIndices: visibleRows.slice(minRowPos, maxRowPos + 1),
      minRowPos,
      maxRowPos,
      minCol,
      maxCol,
    }
  }

  private syncSelectionUI(): void {
    const visibleRows = this.visibleBodyIndices
    const selectedVisibleCount = visibleRows.filter((b) => this.selectedBodyRows.has(b)).length
    const hasRowSel = selectedVisibleCount > 0
    this.hostEl.classList.toggle('nt-has-row-selection', hasRowSel)
    this.hostEl.classList.toggle('nt-has-selection', hasRowSel || this.cellSelection !== null)

    if (!this.tableEl) return

    const headCb = this.tableEl.querySelector(
      'thead th[data-col="0"] input.nt-row-select'
    ) as HTMLInputElement | null
    if (headCb) {
      const allSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length
      const partialSelected = selectedVisibleCount > 0 && selectedVisibleCount < visibleRows.length
      headCb.checked = allSelected
      headCb.indeterminate = partialSelected
      headCb.setAttribute(
        'aria-checked',
        partialSelected ? 'mixed' : allSelected ? 'true' : 'false'
      )
    }

    this.tableEl.querySelectorAll('tbody tr[data-body-idx]').forEach((tr) => {
      const bodyIdx = Number((tr as HTMLElement).dataset.bodyIdx)
      const isSelected = this.selectedBodyRows.has(bodyIdx)
      tr.classList.toggle('nt-row-selected', isSelected)
      const cb = tr.querySelector('td[data-col="0"] input.nt-row-select') as HTMLInputElement | null
      if (cb) {
        cb.checked = isSelected
        cb.setAttribute('aria-checked', isSelected ? 'true' : 'false')
      }
    })

    const range = this.getNormalizedCellRange()
    const selectedRowSet = range ? new Set(range.rowIndices) : null
    this.tableEl.querySelectorAll('th[data-row][data-col], td[data-row][data-col]').forEach((cell) => {
      const el = cell as HTMLElement
      const r = Number(el.dataset.row)
      const c = Number(el.dataset.col)
      const inRange =
        Boolean(range) &&
        selectedRowSet!.has(r) &&
        c >= range!.minCol &&
        c <= range!.maxCol
      el.classList.toggle('nt-cell-selected', inRange)
    })

    this.syncBulkBarUI(selectedVisibleCount)
  }

  private syncBulkBarUI(selectedVisibleCount: number): void {
    if (selectedVisibleCount <= 0 || this.isLocked()) {
      if (this.bulkBarEl) {
        this.bulkBarEl.remove()
        this.bulkBarEl = null
      }
      return
    }

    const labelText = `${selectedVisibleCount} selected`
    if (this.bulkBarEl && this.bulkBarEl.isConnected) {
      const countEl = this.bulkBarEl.querySelector('.nt-bulk-count')
      if (countEl) countEl.textContent = labelText
      return
    }

    const bar = this.buildBulkBar(labelText)
    this.bulkBarEl = bar
    this.hostEl.appendChild(bar)
  }

  private buildBulkBar(labelText: string): HTMLElement {
    const bar = this.doc.createElement('div')
    bar.className = 'nt-bulk-bar forbid-edit'
    bar.setAttribute('role', 'dialog')
    bar.setAttribute('aria-label', 'Bulk edit selected rows')

    bar.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    bar.addEventListener('click', (e) => {
      e.stopPropagation()
    })

    const countSpan = this.doc.createElement('span')
    countSpan.className = 'nt-bulk-count'
    countSpan.textContent = labelText
    bar.appendChild(countSpan)

    const addSep = () => {
      const sep = this.doc.createElement('div')
      sep.className = 'nt-tb-sep'
      bar.appendChild(sep)
    }

    const editableColIndices: number[] = []
    for (let c = 0; c < this.table.headers.length; c++) {
      const t = this.getColumnSchema(c).type
      if (t === 'select' || t === 'date' || t === 'checkbox') {
        editableColIndices.push(c)
      }
    }

    if (editableColIndices.length > 0) {
      addSep()
      for (const c of editableColIndices) {
        const schema = this.getColumnSchema(c)
        const colName = (this.table.headers[c] || '').trim() || `Column ${c + 1}`
        const btn = this.doc.createElement('button')
        btn.type = 'button'
        btn.className = 'nt-bulk-btn forbid-edit'
        btn.dataset.col = String(c)
        btn.dataset.colType = schema.type
        btn.title = `Set ${colName} for selected rows`
        btn.setAttribute('aria-label', `Set ${colName} for selected rows`)
        btn.appendChild(createIcon(this.doc, COLUMN_TYPE_ICONS[schema.type], 13))
        const span = this.doc.createElement('span')
        span.textContent = colName
        btn.appendChild(span)

        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.openBulkColumnEditor(c, btn)
        })
        bar.appendChild(btn)
      }
    }

    addSep()
    const delBtn = this.doc.createElement('button')
    delBtn.type = 'button'
    delBtn.className = 'nt-bulk-btn nt-bulk-delete forbid-edit'
    delBtn.title = 'Delete selected rows'
    delBtn.setAttribute('aria-label', 'Delete selected rows')
    delBtn.appendChild(createIcon(this.doc, 'trash', 13))
    delBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const selectedRows = this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
      if (selectedRows.length === 0) return
      this.selectedBodyRows.clear()
      this.selectionAnchorBodyIdx = null
      this.applyStructuralOp(deleteRows(this.table, selectedRows), null)
    })
    bar.appendChild(delBtn)

    return bar
  }

  private openBulkColumnEditor(colIdx: number, anchorEl: HTMLElement): void {
    const selectedRows = this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
    if (selectedRows.length === 0) return

    const schema = this.getColumnSchema(colIdx)
    const colName = (this.table.headers[colIdx] || '').trim() || `Column ${colIdx + 1}`
    const rect = anchorEl.getBoundingClientRect()
    const values = selectedRows.map((b) => this.table.rows[b]?.[colIdx] ?? '')
    const commonRaw = values.every((v) => v === values[0]) ? values[0] : ''

    if (schema.type === 'select') {
      const harvestedOptions = harvestOptionsFromColumn(
        this.table.rows,
        colIdx,
        false,
        schema.options || []
      )
      openSelectPicker(
        this.doc,
        { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        {
          multi: false,
          currentRaw: commonRaw,
          options: harvestedOptions,
          searchPages: this.callbacks.onSearchPages,
          onChangeSelection: (nextRaw, nextOptions) => {
            const withOpts = setColumnOptions(this.table, colIdx, nextOptions)
            const nextTable = updateColumnInRows(
              withOpts,
              selectedRows,
              colIdx,
              nextRaw,
              this.timestampOpts
            )
            this.applyStructuralOp(nextTable, null)
          },
          onUpdateOptions: (nextOptions) => {
            this.applyStructuralOp(setColumnOptions(this.table, colIdx, nextOptions), null)
          },
          onRenameOption: (optionId, oldLabel, nextLabel, nextOptions) => {
            const preRenameOpts = nextOptions.map((o) =>
              o.id === optionId ? { ...o, label: oldLabel } : { ...o }
            )
            const seeded = setColumnOptions(this.table, colIdx, preRenameOpts)
            const renamed = renameColumnOption(
              seeded,
              colIdx,
              optionId,
              nextLabel,
              this.timestampOpts
            )
            this.applyStructuralOp(renamed, null)
          },
        }
      )
      return
    }

    if (schema.type === 'date') {
      openDatePicker(
        this.doc,
        { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        {
          currentRaw: commonRaw,
          dateFormat: this.preferredDateFormat,
          startOfWeek: this.preferredStartOfWeek,
          onSelect: (formatted) => {
            const nextTable = updateColumnInRows(
              this.table,
              selectedRows,
              colIdx,
              formatted,
              this.timestampOpts
            )
            this.applyStructuralOp(nextTable, null)
          },
          onClear: () => {
            const nextTable = updateColumnInRows(
              this.table,
              selectedRows,
              colIdx,
              '',
              this.timestampOpts
            )
            this.applyStructuralOp(nextTable, null)
          },
        }
      )
      return
    }

    if (schema.type === 'checkbox') {
      const allChecked = values.every((v) => isCheckboxChecked(v))
      const allUnchecked = values.every((v) => !isCheckboxChecked(v))
      openPopoverMenu(
        this.doc,
        { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        [
          { type: 'header', label: colName },
          {
            label: 'Checked',
            icon: 'check',
            active: allChecked,
            onSelect: () => {
              const nextTable = updateColumnInRows(
                this.table,
                selectedRows,
                colIdx,
                formatCheckboxValue(true),
                this.timestampOpts
              )
              this.applyStructuralOp(nextTable, null)
            },
          },
          {
            label: 'Unchecked',
            icon: 'x',
            active: allUnchecked,
            onSelect: () => {
              const nextTable = updateColumnInRows(
                this.table,
                selectedRows,
                colIdx,
                formatCheckboxValue(false),
                this.timestampOpts
              )
              this.applyStructuralOp(nextTable, null)
            },
          },
        ]
      )
    }
  }

  private getSelectionPayload(): {
    markdown: string
    payload: ClipboardTablePayload
    rowCount: number
  } | null {
    const allCols = this.table.headers.map((_, idx) => idx)

    if (this.selectedBodyRows.size > 0) {
      const bodyRows = this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
      if (bodyRows.length === 0) return null
      const markdown = serializeSelectionAsMarkdown(this.table, bodyRows, allCols)
      const cells = bodyRows.map((b) => allCols.map((c) => this.table.rows[b]?.[c] ?? ''))
      return {
        markdown,
        payload: { v: 1, cells, includesHeader: false },
        rowCount: bodyRows.length,
      }
    }

    const range = this.getNormalizedCellRange()
    if (range) {
      const cols: number[] = []
      for (let c = range.minCol; c <= range.maxCol; c++) cols.push(c)
      const includesHeader = range.rowIndices.includes(0)
      const bodyRows = range.rowIndices.filter((r) => r >= 1).map((r) => r - 1)
      const markdown = serializeSelectionAsMarkdown(this.table, bodyRows, cols)
      const cells = range.rowIndices.map((r) => cols.map((c) => this.getCellValue(r, c)))
      return {
        markdown,
        payload: { v: 1, cells, includesHeader },
        rowCount: range.rowIndices.length,
      }
    }

    return null
  }

  private getNativeMultiCellSelectionPayload(): {
    markdown: string
    payload: ClipboardTablePayload
    rowCount: number
  } | null {
    if (!this.tableEl) return null
    const win = this.doc.defaultView || window
    const sel = win.getSelection?.()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null

    const allCells = Array.from(
      this.tableEl.querySelectorAll('th[data-row][data-col], td[data-row][data-col]')
    ) as HTMLElement[]
    const touched = allCells.filter((cell) => {
      try {
        return sel.containsNode(cell, true)
      } catch {
        return false
      }
    })
    if (touched.length < 2) return null

    const visibleRows = [0, ...this.visibleBodyIndices.map((b) => b + 1)]
    let minPos = Infinity
    let maxPos = -1
    let minCol = Infinity
    let maxCol = -1
    for (const cell of touched) {
      const r = Number(cell.dataset.row)
      const c = Number(cell.dataset.col)
      const pos = visibleRows.indexOf(r)
      if (pos !== -1) {
        if (pos < minPos) minPos = pos
        if (pos > maxPos) maxPos = pos
      }
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
    }
    if (maxPos < minPos || maxCol < minCol) return null

    const rowIndices = visibleRows.slice(minPos, maxPos + 1)
    const cols: number[] = []
    for (let c = minCol; c <= maxCol; c++) cols.push(c)
    const bodyRows = rowIndices.filter((r) => r >= 1).map((r) => r - 1)
    const markdown = serializeSelectionAsMarkdown(this.table, bodyRows, cols)
    const cells = rowIndices.map((r) => cols.map((c) => this.getCellValue(r, c)))
    return {
      markdown,
      payload: { v: 1, cells, includesHeader: rowIndices.includes(0) },
      rowCount: rowIndices.length,
    }
  }

  private writeClipboardPayload(
    dt: DataTransfer | null | undefined,
    data: { markdown: string; payload: ClipboardTablePayload }
  ): boolean {
    if (!dt) return false
    dt.setData('text/plain', data.markdown)
    dt.setData(CLIPBOARD_TABLE_MIME, JSON.stringify(data.payload))
    return true
  }

  private handleCopyEvent(e: ClipboardEvent): void {
    const target = e.target as Node | null
    if (this.isEditableTarget(target)) return

    const selectionData = this.getSelectionPayload() || this.getNativeMultiCellSelectionPayload()
    if (!selectionData) return

    e.preventDefault()
    e.stopPropagation()
    this.writeClipboardPayload(e.clipboardData, selectionData)
  }

  private handleCutEvent(e: ClipboardEvent): void {
    const target = e.target as Node | null
    if (this.isEditableTarget(target)) return

    const selectionData = this.getSelectionPayload()
    if (!selectionData) return

    e.preventDefault()
    e.stopPropagation()
    this.writeClipboardPayload(e.clipboardData, selectionData)
    if (!this.isLocked()) {
      this.deleteOrClearSelection()
    }
  }

  private handleHostPasteEvent(e: ClipboardEvent): void {
    if (this.isLocked() || this.activeTextarea) return
    const target = e.target as Node | null
    if (this.isEditableTarget(target)) return

    let startRowIdx: number | null = null
    let startColIdx = 0

    const range = this.getNormalizedCellRange()
    if (range) {
      startRowIdx = range.rowIndices[0]
      startColIdx = range.minCol
    } else if (this.selectedBodyRows.size > 0) {
      const firstBody = this.visibleBodyIndices.find((b) => this.selectedBodyRows.has(b))
      if (firstBody !== undefined) {
        startRowIdx = firstBody + 1
        startColIdx = 0
      }
    }

    if (startRowIdx === null) return

    const dt = e.clipboardData
    const parsed = parseClipboardGrid(
      {
        customJson: dt?.getData(CLIPBOARD_TABLE_MIME),
        plainText: dt?.getData('text/plain'),
        htmlText: dt?.getData('text/html'),
      },
      this.table,
      startRowIdx,
      startColIdx,
      this.doc
    )

    const plain = dt?.getData('text/plain')
    const grid = parsed?.grid ?? (plain ? [[plain]] : null)
    if (!grid || grid.length === 0) return

    e.preventDefault()
    e.stopPropagation()
    this.applyStructuralOp(
      applyGridPaste(this.table, startRowIdx, startColIdx, grid, this.timestampOpts),
      null
    )
  }

  private deleteOrClearSelection(): boolean {
    if (this.isLocked()) return false
    if (this.selectedBodyRows.size > 0) {
      const toDelete = this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
      if (toDelete.length === 0) return false
      this.selectedBodyRows.clear()
      this.selectionAnchorBodyIdx = null
      this.applyStructuralOp(deleteRows(this.table, toDelete, this.timestampOpts), null)
      return true
    }
    const range = this.getNormalizedCellRange()
    if (range) {
      const cols: number[] = []
      for (let c = range.minCol; c <= range.maxCol; c++) cols.push(c)
      this.cellSelection = null
      this.applyStructuralOp(
        clearCellRange(this.table, range.rowIndices, cols, this.timestampOpts),
        null
      )
      return true
    }
    return false
  }

  private handleSelectionKeyDown(e: KeyboardEvent): void {
    const target = e.target as Node | null
    if (this.isEditableTarget(target)) return

    if (e.key === 'Escape' && this.hasSelection()) {
      e.preventDefault()
      e.stopPropagation()
      if (this.cellSelection !== null) {
        const range = this.getNormalizedCellRange()
        const bodyRows = range
          ? range.rowIndices.filter((r) => r >= 1).map((r) => r - 1)
          : []
        this.cellSelection = null
        if (bodyRows.length > 0) {
          this.selectedBodyRows = new Set(bodyRows)
          this.selectionAnchorBodyIdx = bodyRows[0]
        }
        this.syncSelectionUI()
        this.focusScrollContainer()
      } else {
        this.clearSelection()
      }
      return
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && this.hasSelection() && !this.isLocked()) {
      if (this.deleteOrClearSelection()) {
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }

    if (
      (e.metaKey || e.ctrlKey) &&
      !e.altKey &&
      !e.shiftKey &&
      e.key.toLowerCase() === 'a' &&
      (this.hasSelection() || this.doc.activeElement === this.scrollEl)
    ) {
      if (this.visibleBodyIndices.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.cellSelection = null
        this.selectedBodyRows = new Set(this.visibleBodyIndices)
        this.selectionAnchorBodyIdx = this.visibleBodyIndices[0]
        this.syncSelectionUI()
      }
    }
  }

  private buildToolbar(): HTMLElement {
    const bar = this.doc.createElement('div')
    bar.className = 'nt-toolbar forbid-edit'

    const makeBtn = (
      icon: IconName,
      title: string,
      onClick: (btn: HTMLButtonElement) => void,
      active = false,
      label?: string
    ): HTMLButtonElement => {
      const btn = this.doc.createElement('button')
      btn.type = 'button'
      btn.className = 'nt-tb-btn forbid-edit'
      if (active) btn.classList.add('nt-active')
      btn.title = title
      btn.setAttribute('aria-label', title)
      btn.appendChild(createIcon(this.doc, icon, 13))
      if (label) {
        const span = this.doc.createElement('span')
        span.textContent = label
        btn.appendChild(span)
      }
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick(btn)
      })
      return btn
    }

    const addSep = () => {
      const sep = this.doc.createElement('div')
      sep.className = 'nt-tb-sep'
      bar.appendChild(sep)
    }

    const locked = this.isLocked()
    const undoBtn = makeBtn('undo', 'Undo (Cmd/Ctrl+Z)', () => {
      this.undo()
    })
    undoBtn.disabled = locked || !this.history.canUndo()
    this.undoBtnEl = undoBtn

    const redoBtn = makeBtn('redo', 'Redo (Cmd/Ctrl+Shift+Z)', () => {
      this.redo()
    })
    redoBtn.disabled = locked || !this.history.canRedo()
    this.redoBtnEl = redoBtn

    bar.append(undoBtn, redoBtn)
    addSep()

    const searchActive = this.searchOpen || this.searchQuery.trim().length > 0
    const searchBtn = makeBtn(
      'search',
      'Search rows (Cmd/Ctrl+F)',
      () => {
        if (this.searchOpen && !this.searchQuery.trim()) {
          this.closeSearchBar(true)
        } else {
          this.openSearchBar()
        }
      },
      searchActive
    )
    searchBtn.classList.add('nt-tb-search-btn')
    searchBtn.setAttribute('aria-pressed', searchActive ? 'true' : 'false')
    this.searchBtnEl = searchBtn
    bar.appendChild(searchBtn)

    const filterCount = this.table.filters?.length ?? 0
    const filterBtn = makeBtn(
      'filter',
      filterCount > 0 ? `Filters (${filterCount})` : 'Filter rows',
      (btn) => {
        this.openAddFilterMenu(btn)
      },
      filterCount > 0,
      filterCount > 0 ? String(filterCount) : undefined
    )
    filterBtn.className = 'nt-tb-btn forbid-edit' + (filterCount > 0 ? ' nt-active' : '')
    filterBtn.classList.add('nt-tb-filter-btn')
    bar.appendChild(filterBtn)

    const calcVisible = this.isCalcRowVisible()
    const calcBtn = makeBtn(
      'hash',
      calcVisible ? 'Hide calculation row' : 'Show calculation row',
      () => {
        this.toggleCalcRow()
      },
      calcVisible,
      'Calc'
    )
    calcBtn.classList.add('nt-tb-calc-btn')
    calcBtn.setAttribute('aria-pressed', calcVisible ? 'true' : 'false')
    bar.appendChild(calcBtn)

    addSep()

    const copyMdBtn = makeBtn(
      'copy',
      'Copy as Markdown',
      () => {
        this.copyMarkdown()
      },
      false,
      'MD'
    )
    this.copyMdBtnEl = copyMdBtn
    bar.appendChild(copyMdBtn)

    const copyCsvBtn = makeBtn(
      'copy',
      'Copy as CSV',
      () => {
        this.copyCsv()
      },
      false,
      'CSV'
    )
    this.copyCsvBtnEl = copyCsvBtn
    bar.appendChild(copyCsvBtn)
    this.syncCopyButtonTitles()

    addSep()

    bar.appendChild(
      makeBtn(
        this.maximized ? 'minimize' : 'maximize',
        this.maximized ? 'Exit focus view (Esc)' : 'Expand table view',
        () => {
          this.maximized = !this.maximized
          this.syncHostClasses()
          this.render()
        },
        this.maximized
      )
    )
    const rawMdBtn = makeBtn('code', 'Edit raw Markdown', () => {
      this.flushActiveEdit(true)
      this.callbacks.onEditRawMarkdown()
    })
    rawMdBtn.disabled = locked
    bar.appendChild(rawMdBtn)

    bar.appendChild(
      makeBtn(
        locked ? 'lock' : 'unlock',
        locked ? 'Unlock table' : 'Lock table',
        () => {
          this.toggleLock()
        },
        locked
      )
    )

    return bar
  }

  private buildLockBadge(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-lock-badge forbid-edit'
    btn.title = 'Table is locked — click to unlock'
    btn.setAttribute('aria-label', 'Unlock table')
    btn.appendChild(createIcon(this.doc, 'lock', 12))
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.toggleLock()
    })
    return btn
  }

  private syncCopyButtonTitles(): void {
    const filtered = this.isFilteredOrSearched()
    const mdTitle = filtered ? 'Copy visible rows as Markdown' : 'Copy as Markdown'
    const csvTitle = filtered ? 'Copy visible rows as CSV' : 'Copy as CSV'
    if (this.copyMdBtnEl) {
      this.copyMdBtnEl.title = mdTitle
      this.copyMdBtnEl.setAttribute('aria-label', mdTitle)
    }
    if (this.copyCsvBtnEl) {
      this.copyCsvBtnEl.title = csvTitle
      this.copyCsvBtnEl.setAttribute('aria-label', csvTitle)
    }
  }

  private copyMarkdown(): void {
    this.flushActiveEdit(true)
    if (this.isFilteredOrSearched()) {
      const slice = getVisibleTableSlice(this.table, this.visibleBodyIndices)
      const count = slice.rows.length
      void this.copyText(
        serializeTable(slice),
        `Copied ${count} filtered ${count === 1 ? 'row' : 'rows'} as Markdown`
      )
    } else {
      void this.copyText(serializeTable(this.table), 'Copied Markdown table')
    }
  }

  private copyCsv(): void {
    this.flushActiveEdit(true)
    if (this.isFilteredOrSearched()) {
      const slice = getVisibleTableSlice(this.table, this.visibleBodyIndices)
      const count = slice.rows.length
      void this.copyText(
        tableToCsv(slice),
        `Copied ${count} filtered ${count === 1 ? 'row' : 'rows'} as CSV`
      )
    } else {
      void this.copyText(tableToCsv(this.table), 'Copied CSV')
    }
  }

  private buildSearchBar(): HTMLElement {
    const bar = this.doc.createElement('div')
    bar.className = 'nt-search-bar forbid-edit'

    const icon = this.doc.createElement('span')
    icon.className = 'nt-search-icon'
    icon.appendChild(createIcon(this.doc, 'search', 13))

    const input = this.doc.createElement('input')
    input.type = 'text'
    input.className = 'nt-search-input forbid-edit'
    input.placeholder = 'Search rows…'
    input.setAttribute('aria-label', 'Search table rows')
    input.value = this.searchQuery

    const countEl = this.doc.createElement('span')
    countEl.className = 'nt-search-count'
    countEl.setAttribute('aria-live', 'polite')

    const clearBtn = this.doc.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'nt-search-clear-btn forbid-edit'
    clearBtn.title = 'Clear search (Esc)'
    clearBtn.setAttribute('aria-label', 'Clear search')
    clearBtn.appendChild(createIcon(this.doc, 'x', 12))

    input.addEventListener('input', () => {
      this.searchQuery = input.value
      this.updateSearchResults()
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        this.closeSearchBar(true)
      }
    })

    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.closeSearchBar(true)
    })

    bar.append(icon, input, countEl, clearBtn)
    this.searchBarEl = bar
    this.searchInputEl = input
    this.searchCountEl = countEl
    this.syncSearchBarUI()
    return bar
  }

  private syncSearchBarUI(): void {
    const hasQuery = this.searchQuery.trim().length > 0
    if (this.searchCountEl) {
      if (hasQuery) {
        const total = this.table.rows.length
        const shown = this.visibleBodyIndices.length
        this.searchCountEl.textContent = `${shown} of ${total} ${total === 1 ? 'row' : 'rows'}`
      } else {
        this.searchCountEl.textContent = ''
      }
    }
    const searchActive = this.searchOpen || hasQuery
    if (this.searchBtnEl) {
      this.searchBtnEl.classList.toggle('nt-active', searchActive)
      this.searchBtnEl.setAttribute('aria-pressed', searchActive ? 'true' : 'false')
    }
  }

  private openSearchBar(): void {
    this.flushActiveEdit(true)
    if (!this.searchOpen) {
      this.searchOpen = true
      const toolbar = this.hostEl.querySelector('.nt-toolbar')
      const bar = this.buildSearchBar()
      if (toolbar) {
        toolbar.insertAdjacentElement('afterend', bar)
      } else {
        this.hostEl.prepend(bar)
      }
      this.syncSearchBarUI()
    }
    if (this.searchInputEl) {
      this.searchInputEl.focus()
      this.searchInputEl.select()
    }
  }

  private closeSearchBar(restoreFocus = false): void {
    if (!this.searchOpen && !this.searchQuery) return
    this.searchQuery = ''
    this.searchOpen = false
    this.render()
    if (restoreFocus) {
      this.focusScrollContainer()
    }
  }

  private updateSearchResults(): void {
    this.visibleBodyIndices = this.computeVisibleBodyIndices()
    if (this.tableEl && this.colgroupEl) {
      const oldBody = this.tableEl.querySelector('tbody')
      const nextBody = this.buildTableBody(this.colgroupEl)
      if (oldBody) {
        oldBody.replaceWith(nextBody)
      } else {
        this.tableEl.appendChild(nextBody)
      }
    }
    this.refreshCalcFooter()
    this.syncSearchBarUI()
    const filterCountEl = this.hostEl.querySelector('.nt-filter-count')
    if (filterCountEl) {
      const total = this.table.rows.length
      filterCountEl.textContent = `${this.visibleBodyIndices.length} of ${total} ${total === 1 ? 'row' : 'rows'}`
    }
    this.syncCopyButtonTitles()
    this.pruneStaleSelections()
    this.syncSelectionUI()
  }

  private refreshFilterBar(): void {
    const existing = this.hostEl.querySelector('.nt-filter-bar')
    if (!existing) return
    if ((this.table.filters?.length ?? 0) === 0) {
      existing.remove()
      return
    }
    existing.replaceWith(this.buildFilterBar())
  }

  private buildFilterBar(): HTMLElement {
    const bar = this.doc.createElement('div')
    bar.className = 'nt-filter-bar forbid-edit'

    const chipsWrap = this.doc.createElement('div')
    chipsWrap.className = 'nt-filter-chips'

    for (const filter of this.table.filters || []) {
      const schema = this.getColumnSchema(filter.col)
      const colName = (this.table.headers[filter.col] || '').trim() || `Column ${filter.col + 1}`

      const chip = this.doc.createElement('div')
      chip.className = 'nt-filter-chip forbid-edit'
      chip.dataset.filterId = filter.id

      const chipBtn = this.doc.createElement('button')
      chipBtn.type = 'button'
      chipBtn.className = 'nt-filter-chip-btn forbid-edit'

      const iconSpan = this.doc.createElement('span')
      iconSpan.className = 'nt-filter-chip-icon'
      iconSpan.appendChild(createIcon(this.doc, COLUMN_TYPE_ICONS[schema.type] || 'typeText', 12))
      chipBtn.appendChild(iconSpan)

      const nameSpan = this.doc.createElement('span')
      nameSpan.className = 'nt-filter-chip-col'
      nameSpan.textContent = colName
      chipBtn.appendChild(nameSpan)

      const opSpan = this.doc.createElement('span')
      opSpan.className = 'nt-filter-chip-op'
      opSpan.textContent = getOperatorLabel(filter.op)
      chipBtn.appendChild(opSpan)

      if (!isValuelessFilterOp(filter.op)) {
        if (schema.type === 'select' || schema.type === 'multi-select') {
          const vals = Array.isArray(filter.value) ? filter.value : []
          if (vals.length === 0) {
            const ph = this.doc.createElement('span')
            ph.className = 'nt-filter-chip-val nt-filter-chip-empty'
            ph.textContent = 'Select…'
            chipBtn.appendChild(ph)
          } else {
            const shown = vals.slice(0, 2)
            for (const label of shown) {
              const opt = schema.options?.find(
                (o) => o.label.toLowerCase() === label.toLowerCase()
              )
              const pill = this.doc.createElement('span')
              pill.className = `nt-select-pill nt-filter-chip-pill nt-color-${opt?.color || 'gray'}`
              pill.textContent = label
              chipBtn.appendChild(pill)
            }
            if (vals.length > 2) {
              const more = this.doc.createElement('span')
              more.className = 'nt-filter-chip-more'
              more.textContent = `+${vals.length - 2}`
              chipBtn.appendChild(more)
            }
          }
        } else if (schema.type === 'date' || isTimestampColumnType(schema.type)) {
          const rawVal = typeof filter.value === 'string' ? filter.value.trim() : ''
          const parsed = rawVal
            ? isTimestampColumnType(schema.type)
              ? parseTimestamp(rawVal)
              : parsePlaintextDate(rawVal)
            : null
          const relToken = normalizeRelativeDateToken(rawVal)
          const valSpan = this.doc.createElement('span')
          valSpan.className = 'nt-filter-chip-val'
          if (relToken) {
            valSpan.textContent = formatRelativeDateLabel(relToken)
            valSpan.classList.add('nt-filter-chip-dynamic')
            if (parsed) {
              chipBtn.title = `Dynamic: ${formatLogseqDate(parsed, this.preferredDateFormat)}`
            }
          } else {
            valSpan.textContent = parsed
              ? formatLogseqDate(parsed, this.preferredDateFormat)
              : rawVal || 'Pick date…'
          }
          if (!rawVal) valSpan.classList.add('nt-filter-chip-empty')
          chipBtn.appendChild(valSpan)
        } else {
          const rawVal = typeof filter.value === 'string' ? filter.value : ''
          const valSpan = this.doc.createElement('span')
          valSpan.className = 'nt-filter-chip-val'
          if (rawVal.trim()) {
            valSpan.textContent = schema.type === 'number' ? rawVal.trim() : `"${rawVal}"`
          } else {
            valSpan.classList.add('nt-filter-chip-empty')
            valSpan.textContent = 'Enter value…'
          }
          chipBtn.appendChild(valSpan)
        }
      }

      chipBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      chipBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.openFilterPopoverForFilter(filter, chipBtn, false)
      })

      const rmBtn = this.doc.createElement('button')
      rmBtn.type = 'button'
      rmBtn.className = 'nt-filter-chip-rm forbid-edit'
      rmBtn.title = `Remove filter on ${colName}`
      rmBtn.setAttribute('aria-label', `Remove filter on ${colName}`)
      rmBtn.appendChild(createIcon(this.doc, 'x', 11))
      rmBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      rmBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        closeActiveFilterPopover()
        this.applyStructuralOp(removeTableFilter(this.table, filter.id))
      })

      chip.append(chipBtn, rmBtn)
      chipsWrap.appendChild(chip)
    }

    const addBtn = this.doc.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'nt-filter-add-btn forbid-edit'
    addBtn.appendChild(createIcon(this.doc, 'plus', 11))
    const addLbl = this.doc.createElement('span')
    addLbl.textContent = 'Filter'
    addBtn.appendChild(addLbl)
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    addBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.openAddFilterMenu(addBtn)
    })
    chipsWrap.appendChild(addBtn)

    const meta = this.doc.createElement('div')
    meta.className = 'nt-filter-meta'

    const count = this.doc.createElement('span')
    count.className = 'nt-filter-count'
    count.setAttribute('aria-live', 'polite')
    const total = this.table.rows.length
    const shown = this.visibleBodyIndices.length
    count.textContent = `${shown} of ${total} ${total === 1 ? 'row' : 'rows'}`

    const clearBtn = this.doc.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'nt-filter-clear-btn forbid-edit'
    clearBtn.textContent = 'Clear all'
    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    clearBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeActiveFilterPopover()
      this.applyStructuralOp(clearAllTableFilters(this.table))
    })

    meta.append(count, clearBtn)
    bar.append(chipsWrap, meta)
    return bar
  }

  private openAddFilterMenu(anchorEl: HTMLElement): void {
    this.flushActiveEdit(true)
    const rect = anchorEl.getBoundingClientRect()
    const activeCols = new Set((this.table.filters || []).map((f) => f.col))
    const items: PopoverMenuItem[] = [
      { type: 'header', label: 'Filter by Column' },
      ...this.table.headers.map((h, colIdx): PopoverMenuItem => {
        const schema = this.getColumnSchema(colIdx)
        const name = (h || '').trim() || `Column ${colIdx + 1}`
        return {
          label: name,
          icon: COLUMN_TYPE_ICONS[schema.type] || 'typeText',
          active: activeCols.has(colIdx),
          onSelect: () => {
            const targetAnchor = this.findCellElement(0, colIdx) || anchorEl
            this.startNewFilterForColumn(colIdx, targetAnchor)
          },
        }
      }),
    ]

    if ((this.table.filters?.length ?? 0) > 0) {
      items.push(
        { type: 'separator' },
        {
          label: 'Clear all filters',
          icon: 'x',
          danger: true,
          onSelect: () => {
            closeActiveFilterPopover()
            this.applyStructuralOp(clearAllTableFilters(this.table))
          },
        }
      )
    }

    openPopoverMenu(
      this.doc,
      { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      items
    )
  }

  private startNewFilterForColumn(colIdx: number, anchorEl: HTMLElement): void {
    const schema = this.getColumnSchema(colIdx)
    const draft = createDefaultFilter(colIdx, schema.type)
    if (schema.type === 'checkbox') {
      this.applyStructuralOp(upsertTableFilter(this.table, draft))
      const chipBtn = this.hostEl.querySelector(
        `.nt-filter-chip[data-filter-id="${draft.id}"] .nt-filter-chip-btn`
      ) as HTMLElement | null
      this.openFilterPopoverForFilter(draft, chipBtn || anchorEl, false)
      return
    }
    this.openFilterPopoverForFilter(draft, anchorEl, true)
  }

  private openFilterPopoverForFilter(
    filter: TableFilter,
    anchorEl: HTMLElement,
    isDraft: boolean
  ): void {
    this.flushActiveEdit(true)
    const anchorRect = anchorEl.isConnected
      ? anchorEl.getBoundingClientRect()
      : this.hostEl.getBoundingClientRect()
    const colIdx = filter.col
    const schema = this.getColumnSchema(colIdx)
    const colName = (this.table.headers[colIdx] || '').trim() || `Column ${colIdx + 1}`
    const columnValues = this.table.rows.map((r) => r[colIdx] ?? '')

    const beforeSessionTable = cloneTableData(this.table)
    let historyRecorded = false
    let committedInTable = !isDraft
    let latestFilter = cloneFilter(filter)
    let hasPendingSave = false

    const ensureHistory = () => {
      if (!historyRecorded) {
        historyRecorded = true
        this.recordHistory(beforeSessionTable, null)
      }
    }

    openFilterPopover(
      this.doc,
      {
        left: anchorRect.left,
        top: anchorRect.top,
        right: anchorRect.right,
        bottom: anchorRect.bottom,
      },
      {
        filter: latestFilter,
        columnName: colName,
        columnSchema: schema,
        columnValues,
        dateFormat: this.preferredDateFormat,
        startOfWeek: this.preferredStartOfWeek,
        returnFocusEl: () =>
          (this.hostEl.querySelector(
            `.nt-filter-chip[data-filter-id="${latestFilter.id}"] .nt-filter-chip-btn`
          ) as HTMLElement | null) ||
          (this.hostEl.querySelector('.nt-tb-filter-btn') as HTMLElement | null),
        onChange: (nextFilter, immediate) => {
          latestFilter = cloneFilter(nextFilter)
          if (!committedInTable && !isFilterComplete(latestFilter)) {
            return
          }
          ensureHistory()
          committedInTable = true
          this.table = upsertTableFilter(this.table, latestFilter)
          this.render()
          if (immediate) {
            if (this.saveTimer) {
              clearTimeout(this.saveTimer)
              this.saveTimer = null
            }
            hasPendingSave = false
            void this.callbacks.onCommit(this.table)
          } else {
            hasPendingSave = true
            this.scheduleCommit()
          }
        },
        onDelete: () => {
          if (this.saveTimer) {
            clearTimeout(this.saveTimer)
            this.saveTimer = null
          }
          hasPendingSave = false
          if (committedInTable) {
            if (!historyRecorded) {
              this.recordHistory(beforeSessionTable, null)
              historyRecorded = true
            }
            this.table = removeTableFilter(this.table, latestFilter.id)
            this.render()
            void this.callbacks.onCommit(this.table)
          }
        },
        onClose: () => {
          if (committedInTable && !isFilterComplete(latestFilter)) {
            if (this.saveTimer) {
              clearTimeout(this.saveTimer)
              this.saveTimer = null
            }
            hasPendingSave = false
            this.table = removeTableFilter(this.table, latestFilter.id)
            this.render()
            void this.callbacks.onCommit(this.table)
            return
          }
          if (hasPendingSave) {
            hasPendingSave = false
            if (this.saveTimer) {
              clearTimeout(this.saveTimer)
              this.saveTimer = null
            }
            if (!this.destroyed) {
              void this.callbacks.onCommit(this.table)
            }
          }
        },
      }
    )
  }

  private async copyText(text: string, toastMsg: string): Promise<void> {
    try {
      const win = this.doc.defaultView || window
      await win.navigator?.clipboard?.writeText(text)
      this.callbacks.onCopyToast?.(toastMsg)
    } catch {
      this.callbacks.onCopyToast?.('Copy failed — clipboard unavailable')
    }
  }

  private buildCell(
    rowIdx: number,
    colIdx: number,
    isHeader: boolean,
    colgroup: HTMLElement
  ): HTMLElement {
    const cell = this.doc.createElement(isHeader ? 'th' : 'td')
    cell.className = 'forbid-edit'
    cell.dataset.row = String(rowIdx)
    cell.dataset.col = String(colIdx)

    const align = this.table.alignments[colIdx]
    const schema = this.getColumnSchema(colIdx)
    if (align) {
      cell.classList.add(`nt-align-${align}`)
    } else if (!isHeader && schema.type === 'number') {
      cell.classList.add('nt-align-right')
    }

    const savedWidth = this.colWidths[colIdx]
    if (savedWidth && savedWidth > 40) {
      this.applyColumnWidthToCell(cell, savedWidth)
    }

    this.renderCellDisplayInto(cell, rowIdx, colIdx)

    // Column handle on header cells + resize grip
    if (isHeader && !this.isLocked()) {
      cell.appendChild(this.buildColHandle(colIdx))
      cell.appendChild(this.buildColResizer(colIdx, colgroup))
    }

    // Row selection checkbox + drag handle inside continuous left gutter on first cell of every row
    if (colIdx === 0) {
      const gutter = this.doc.createElement('div')
      gutter.className = 'nt-row-gutter forbid-edit'
      gutter.appendChild(this.buildRowSelectCheckbox(rowIdx))
      if (!this.isLocked()) {
        gutter.appendChild(this.buildRowHandle(rowIdx))
      }
      cell.appendChild(gutter)
    }

    this.attachCellRangeSelection(cell, rowIdx, colIdx)

    cell.addEventListener('click', (e) => {
      if (this.suppressNextCellClick) {
        this.suppressNextCellClick = false
        return
      }
      if (this.isLocked()) return
      const target = e.target as HTMLElement
      if (
        target.closest(
          'a, input, button, .nt-col-handle, .nt-row-handle, .nt-row-select, .nt-row-gutter, .nt-col-resizer, .nt-img-wrap'
        )
      ) {
        return
      }
      const win = this.doc.defaultView || window
      const sel = win.getSelection?.()?.toString()
      if (sel && sel.length > 0) return

      this.clearSelection()

      if (rowIdx >= 1) {
        const colType = this.getColumnSchema(colIdx).type
        if (isTimestampColumnType(colType)) {
          this.flushActiveEdit(true)
          return
        }
        if (colType === 'checkbox') {
          const nextChecked = !isCheckboxChecked(this.getCellValue(rowIdx, colIdx))
          this.commitSingleCell(rowIdx, colIdx, formatCheckboxValue(nextChecked))
          return
        }
        if (colType === 'date') {
          this.openDatePickerForCell(cell, rowIdx, colIdx)
          return
        }
        if (colType === 'select' || colType === 'multi-select') {
          this.openSelectPickerForCell(cell, rowIdx, colIdx)
          return
        }
      }

      if (this.activeCell?.row === rowIdx && this.activeCell?.col === colIdx) return
      this.activateCell(rowIdx, colIdx, 'end')
    })

    this.attachCellImageDrop(cell, rowIdx, colIdx)

    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.openCellContextMenu(rowIdx, colIdx, {
        left: e.clientX,
        top: e.clientY,
      })
    })

    return cell
  }

  private buildRowSelectCheckbox(rowIdx: number): HTMLInputElement {
    const cb = this.doc.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'nt-row-select forbid-edit'

    const isHeader = rowIdx === 0
    if (isHeader) {
      cb.title = 'Select all rows'
      cb.setAttribute('aria-label', 'Select all rows')
    } else {
      cb.title = 'Click or drag to select rows'
      cb.setAttribute('aria-label', `Select row ${rowIdx}`)
    }

    let skipNextClick = false

    const toggleAll = () => {
      this.flushActiveEdit(true)
      this.cellSelection = null
      const allSelected =
        this.visibleBodyIndices.length > 0 &&
        this.visibleBodyIndices.every((b) => this.selectedBodyRows.has(b))
      if (allSelected) {
        this.selectedBodyRows.clear()
        this.selectionAnchorBodyIdx = null
      } else {
        this.selectedBodyRows = new Set(this.visibleBodyIndices)
        this.selectionAnchorBodyIdx = this.visibleBodyIndices[0] ?? null
      }
      this.syncSelectionUI()
      this.focusScrollContainer()
    }

    const selectVisibleRange = (fromBodyIdx: number, toBodyIdx: number, select: boolean) => {
      const fromPos = this.visibleBodyIndices.indexOf(fromBodyIdx)
      const toPos = this.visibleBodyIndices.indexOf(toBodyIdx)
      if (fromPos === -1 || toPos === -1) return
      const lo = Math.min(fromPos, toPos)
      const hi = Math.max(fromPos, toPos)
      for (let i = lo; i <= hi; i++) {
        const b = this.visibleBodyIndices[i]
        if (select) this.selectedBodyRows.add(b)
        else this.selectedBodyRows.delete(b)
      }
    }

    if (isHeader) {
      cb.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        skipNextClick = true
        toggleAll()
      })
      cb.addEventListener('click', (e) => {
        e.stopPropagation()
        if (skipNextClick) {
          skipNextClick = false
          e.preventDefault()
          return
        }
        toggleAll()
      })
      return cb
    }

    const bodyIdx = rowIdx - 1
    cb.addEventListener('mousedown', (downEv) => {
      if (downEv.button !== 0) return
      downEv.preventDefault()
      downEv.stopPropagation()
      skipNextClick = true

      this.flushActiveEdit(true)
      this.cellSelection = null

      if (downEv.shiftKey && this.selectionAnchorBodyIdx !== null) {
        selectVisibleRange(this.selectionAnchorBodyIdx, bodyIdx, true)
        this.syncSelectionUI()
        this.focusScrollContainer()
        return
      }

      const startVisIdx = this.visibleBodyIndices.indexOf(bodyIdx)
      const willSelect = !this.selectedBodyRows.has(bodyIdx)
      const baseSelected = new Set(this.selectedBodyRows)

      if (willSelect) this.selectedBodyRows.add(bodyIdx)
      else this.selectedBodyRows.delete(bodyIdx)
      this.selectionAnchorBodyIdx = bodyIdx
      this.syncSelectionUI()
      this.focusScrollContainer()

      const win = this.doc.defaultView || window
      const onMove = (moveEv: MouseEvent) => {
        if (!this.tableEl || startVisIdx === -1) return
        const rowEls = Array.from(
          this.tableEl.querySelectorAll('tbody tr[data-body-idx]')
        ) as HTMLElement[]
        if (rowEls.length === 0) return

        let hoverVisIdx = rowEls.length - 1
        for (let i = 0; i < rowEls.length; i++) {
          const rect = rowEls[i].getBoundingClientRect()
          if (moveEv.clientY <= rect.bottom) {
            hoverVisIdx = i
            break
          }
        }

        this.selectedBodyRows = new Set(baseSelected)
        const lo = Math.min(startVisIdx, hoverVisIdx)
        const hi = Math.max(startVisIdx, hoverVisIdx)
        for (let i = lo; i <= hi; i++) {
          const b = this.visibleBodyIndices[i]
          if (b === undefined) continue
          if (willSelect) this.selectedBodyRows.add(b)
          else this.selectedBodyRows.delete(b)
        }
        this.syncSelectionUI()
      }

      const cleanupDrag = () => {
        win.removeEventListener('mousemove', onMove, true)
        win.removeEventListener('mouseup', onUp, true)
      }

      const onUp = () => {
        cleanupDrag()
      }

      win.addEventListener('mousemove', onMove, true)
      win.addEventListener('mouseup', onUp, true)
      this.cleanups.push(cleanupDrag)
    })

    cb.addEventListener('click', (e) => {
      e.stopPropagation()
      if (skipNextClick) {
        skipNextClick = false
        e.preventDefault()
        return
      }
      this.flushActiveEdit(true)
      this.cellSelection = null
      if (e.shiftKey && this.selectionAnchorBodyIdx !== null) {
        selectVisibleRange(this.selectionAnchorBodyIdx, bodyIdx, true)
      } else {
        if (this.selectedBodyRows.has(bodyIdx)) this.selectedBodyRows.delete(bodyIdx)
        else this.selectedBodyRows.add(bodyIdx)
        this.selectionAnchorBodyIdx = bodyIdx
      }
      this.syncSelectionUI()
      this.focusScrollContainer()
    })

    return cb
  }

  private attachCellRangeSelection(cell: HTMLElement, rowIdx: number, colIdx: number): void {
    const onMouseDown = (downEv: MouseEvent) => {
      if (downEv.button !== 0) return
      if (this.activeCell?.row === rowIdx && this.activeCell?.col === colIdx) return
      const target = downEv.target as HTMLElement
      if (
        target.closest(
          'a, input, button, textarea, .nt-col-handle, .nt-row-handle, .nt-row-select, .nt-row-gutter, .nt-col-resizer, .nt-img-wrap'
        )
      ) {
        return
      }

      if (downEv.shiftKey && this.cellSelection) {
        downEv.preventDefault()
        this.cellSelection = { ...this.cellSelection, focusRow: rowIdx, focusCol: colIdx }
        this.suppressNextCellClick = true
        setTimeout(() => {
          this.suppressNextCellClick = false
        }, 0)
        this.syncSelectionUI()
        this.focusScrollContainer()
        return
      }

      const win = this.doc.defaultView || window
      let dragging = false

      const resolveCellAtPoint = (clientX: number, clientY: number): { row: number; col: number } | null => {
        const el = this.doc.elementFromPoint?.(clientX, clientY)
        const hit = el?.closest('th[data-row][data-col], td[data-row][data-col]') as HTMLElement | null
        if (hit && this.tableEl?.contains(hit)) {
          const r = Number(hit.dataset.row)
          const c = Number(hit.dataset.col)
          if (Number.isInteger(r) && Number.isInteger(c)) {
            return { row: r, col: c }
          }
        }
        if (!this.tableEl) return null

        const headCells = Array.from(this.tableEl.querySelectorAll('thead th[data-col]')) as HTMLElement[]
        const rowEls = Array.from(
          this.tableEl.querySelectorAll('thead tr, tbody tr[data-body-idx]')
        ) as HTMLElement[]
        if (headCells.length === 0 || rowEls.length === 0) return null

        let bestCol = Number(headCells[headCells.length - 1].dataset.col)
        for (const hc of headCells) {
          const rect = hc.getBoundingClientRect()
          if (clientX <= rect.right) {
            bestCol = Number(hc.dataset.col)
            break
          }
        }

        let bestRow = 0
        const lastTr = rowEls[rowEls.length - 1]
        bestRow = lastTr.dataset.row ? Number(lastTr.dataset.row) : 0
        for (const tr of rowEls) {
          const rect = tr.getBoundingClientRect()
          if (clientY <= rect.bottom) {
            bestRow = tr.dataset.row ? Number(tr.dataset.row) : 0
            break
          }
        }
        return { row: bestRow, col: bestCol }
      }

      const onMove = (moveEv: MouseEvent) => {
        const hit = resolveCellAtPoint(moveEv.clientX, moveEv.clientY)
        if (!hit) return
        if (!dragging && (hit.row !== rowIdx || hit.col !== colIdx)) {
          dragging = true
          this.flushActiveEdit(true)
          this.selectedBodyRows.clear()
          this.selectionAnchorBodyIdx = null
          this.hostEl.classList.add('nt-selecting')
        }
        if (dragging) {
          win.getSelection?.()?.removeAllRanges()
          this.cellSelection = {
            anchorRow: rowIdx,
            anchorCol: colIdx,
            focusRow: hit.row,
            focusCol: hit.col,
          }
          this.syncSelectionUI()
        }
      }

      const cleanupDrag = () => {
        this.hostEl.classList.remove('nt-selecting')
        win.removeEventListener('mousemove', onMove, true)
        win.removeEventListener('mouseup', onUp, true)
      }

      const onUp = () => {
        cleanupDrag()
        if (dragging) {
          this.suppressNextCellClick = true
          setTimeout(() => {
            this.suppressNextCellClick = false
          }, 0)
          this.focusScrollContainer()
        }
      }

      win.addEventListener('mousemove', onMove, true)
      win.addEventListener('mouseup', onUp, true)
      this.cleanups.push(cleanupDrag)
    }

    cell.addEventListener('mousedown', onMouseDown)
  }

  private selectRowsIntersectingY(startY: number, curY: number): void {
    if (!this.tableEl) return
    const rowEls = Array.from(
      this.tableEl.querySelectorAll('tbody tr[data-body-idx]')
    ) as HTMLElement[]
    const minY = Math.min(startY, curY)
    const maxY = Math.max(startY, curY)
    const nextSelected = new Set<number>()
    for (const tr of rowEls) {
      const rect = tr.getBoundingClientRect()
      if (rect.bottom >= minY && rect.top <= maxY) {
        const b = Number(tr.dataset.bodyIdx)
        if (Number.isInteger(b)) nextSelected.add(b)
      }
    }
    this.cellSelection = null
    this.selectedBodyRows = nextSelected
    this.selectionAnchorBodyIdx =
      this.visibleBodyIndices.find((b) => nextSelected.has(b)) ?? null
    this.syncSelectionUI()
  }

  private attachOutsideRowSelection(scrollEl: HTMLElement): void {
    const onMouseDown = (downEv: MouseEvent) => {
      if (downEv.button !== 0) return
      const target = downEv.target as HTMLElement | null
      if (!target) return
      if (
        target.closest(
          'button, input, a, textarea, .nt-row-handle, .nt-row-select, .nt-col-handle, .nt-col-resizer, .nt-add-row-bar, .nt-add-col-bar, .nt-calc-row'
        )
      ) {
        return
      }
      // If mousedown started inside a table cell (and not in .nt-row-gutter), let cell selection handle it
      if (target.closest('th, td') && !target.closest('.nt-row-gutter')) {
        return
      }

      downEv.preventDefault()
      const win = this.doc.defaultView || window
      const startX = downEv.clientX
      const startY = downEv.clientY
      let dragging = false

      const onMove = (moveEv: MouseEvent) => {
        if (!dragging && Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY) >= 4) {
          dragging = true
          this.flushActiveEdit(true)
          this.cellSelection = null
          this.hostEl.classList.add('nt-selecting')
          win.getSelection?.()?.removeAllRanges()
        }
        if (dragging) {
          win.getSelection?.()?.removeAllRanges()
          this.selectRowsIntersectingY(startY, moveEv.clientY)
        }
      }

      const cleanupDrag = () => {
        this.hostEl.classList.remove('nt-selecting')
        win.removeEventListener('mousemove', onMove, true)
        win.removeEventListener('mouseup', onUp, true)
      }

      const onUp = (upEv: MouseEvent) => {
        cleanupDrag()
        if (dragging) {
          this.selectRowsIntersectingY(startY, upEv.clientY)
          this.suppressNextCellClick = true
          setTimeout(() => {
            this.suppressNextCellClick = false
          }, 0)
          this.focusScrollContainer()
        } else if (!target.closest('.nt-row-gutter')) {
          this.clearSelection()
        }
      }

      win.addEventListener('mousemove', onMove, true)
      win.addEventListener('mouseup', onUp, true)
      this.cleanups.push(cleanupDrag)
    }

    scrollEl.addEventListener('mousedown', onMouseDown)
  }

  private get timestampOpts(): { dateFormat: string } {
    return { dateFormat: this.preferredDateFormat }
  }

  private isTimestampCol(colIdx: number): boolean {
    return isTimestampColumnType(this.getColumnSchema(colIdx).type)
  }

  private findFirstEditableCol(preferredCol = 0): number | null {
    const len = this.table.headers.length
    if (preferredCol >= 0 && preferredCol < len && !this.isTimestampCol(preferredCol)) {
      return preferredCol
    }
    for (let c = 0; c < len; c++) {
      if (!this.isTimestampCol(c)) return c
    }
    return null
  }

  private refreshEditedTimeCellsInRow(rowIdx: number): void {
    if (rowIdx < 1) return
    for (let c = 0; c < this.table.headers.length; c++) {
      if (this.getColumnSchema(c).type === 'edited-time') {
        const td = this.findCellElement(rowIdx, c)
        if (td) {
          this.renderCellDisplayInto(td, rowIdx, c)
        }
      }
    }
  }

  private getColumnSchema(colIdx: number): ColumnSchema {
    return this.table.columns?.[colIdx] ?? { type: 'text' }
  }

  private commitSingleCell(
    rowIdx: number,
    colIdx: number,
    nextVal: string
  ): void {
    if (nextVal === this.getCellValue(rowIdx, colIdx)) return
    this.recordHistory(this.table, { row: rowIdx, col: colIdx })
    this.table = updateCell(this.table, rowIdx, colIdx, nextVal, this.timestampOpts)
    const liveCell = this.findCellElement(rowIdx, colIdx)
    if (liveCell) {
      this.renderCellDisplayInto(liveCell, rowIdx, colIdx)
    }
    this.refreshEditedTimeCellsInRow(rowIdx)
    this.syncVisibleRowsAfterCellCommit()
    this.refreshCalcFooter()
    void this.callbacks.onCommit(this.table)
  }

  private rerenderColumnBodyCells(colIdx: number): void {
    for (const bodyIdx of this.visibleBodyIndices) {
      const liveCell = this.findCellElement(bodyIdx + 1, colIdx)
      if (liveCell) {
        this.renderCellDisplayInto(liveCell, bodyIdx + 1, colIdx)
      }
    }
  }

  private openDatePickerForCell(cell: HTMLElement, rowIdx: number, colIdx: number): void {
    this.flushActiveEdit(true)
    const rect = cell.getBoundingClientRect()
    const currentRaw = this.getCellValue(rowIdx, colIdx)
    openDatePicker(
      this.doc,
      { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      {
        currentRaw,
        dateFormat: this.preferredDateFormat,
        startOfWeek: this.preferredStartOfWeek,
        onSelect: (formatted) => {
          this.commitSingleCell(rowIdx, colIdx, formatted)
        },
        onClear: () => {
          this.commitSingleCell(rowIdx, colIdx, '')
        },
      }
    )
  }

  private openSelectPickerForCell(
    cell: HTMLElement,
    rowIdx: number,
    colIdx: number,
    manageOnly = false
  ): void {
    this.flushActiveEdit(true)
    const rect = cell.getBoundingClientRect()
    const schema = this.getColumnSchema(colIdx)
    const multi = schema.type === 'multi-select'
    const harvestedOptions = harvestOptionsFromColumn(
      this.table.rows,
      colIdx,
      multi,
      schema.options || []
    )
    openSelectPicker(
      this.doc,
      { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      {
        multi,
        manageOnly,
        currentRaw: manageOnly ? '' : this.getCellValue(rowIdx, colIdx),
        options: harvestedOptions,
        searchPages: this.callbacks.onSearchPages,
        onChangeSelection: (nextRaw, nextOptions) => {
          const prevRaw = this.getCellValue(rowIdx, colIdx)
          const curOpts = this.getColumnSchema(colIdx).options || []
          const sameOpts = JSON.stringify(nextOptions) === JSON.stringify(curOpts)
          if (nextRaw === prevRaw && sameOpts) return
          this.recordHistory(this.table, { row: rowIdx, col: colIdx })
          this.table = setColumnOptions(this.table, colIdx, nextOptions)
          this.table = updateCell(this.table, rowIdx, colIdx, nextRaw, this.timestampOpts)
          this.rerenderColumnBodyCells(colIdx)
          this.refreshEditedTimeCellsInRow(rowIdx)
          this.refreshFilterBar()
          this.syncVisibleRowsAfterCellCommit()
          this.refreshCalcFooter()
          void this.callbacks.onCommit(this.table)
        },
        onUpdateOptions: (nextOptions) => {
          this.recordHistory(this.table, { row: rowIdx, col: colIdx })
          this.table = setColumnOptions(this.table, colIdx, nextOptions)
          this.rerenderColumnBodyCells(colIdx)
          this.refreshFilterBar()
          void this.callbacks.onCommit(this.table)
        },
        onRenameOption: (optionId, oldLabel, nextLabel, nextOptions) => {
          this.recordHistory(this.table, { row: rowIdx, col: colIdx })
          const preRenameOpts = nextOptions.map((o) =>
            o.id === optionId ? { ...o, label: oldLabel } : { ...o }
          )
          const seeded = setColumnOptions(this.table, colIdx, preRenameOpts)
          const renamed = renameColumnOption(
            seeded,
            colIdx,
            optionId,
            nextLabel,
            this.timestampOpts
          )
          this.table = renamed
          this.rerenderColumnBodyCells(colIdx)
          for (const bIdx of this.visibleBodyIndices) {
            this.refreshEditedTimeCellsInRow(bIdx + 1)
          }
          this.refreshFilterBar()
          this.syncVisibleRowsAfterCellCommit()
          this.refreshCalcFooter()
          void this.callbacks.onCommit(this.table)
        },
      }
    )
  }

  private buildHeaderInner(colIdx: number, contentEl: HTMLElement): HTMLElement {
    const schema = this.getColumnSchema(colIdx)
    const rawVal = this.getCellValue(0, colIdx)
    const headerInner = this.doc.createElement('div')
    headerInner.className = 'nt-header-inner'

    const iconSpan = this.doc.createElement('span')
    iconSpan.className = 'nt-col-type-icon'
    iconSpan.title = `Type: ${COLUMN_TYPE_LABELS[schema.type]}`
    iconSpan.appendChild(createIcon(this.doc, COLUMN_TYPE_ICONS[schema.type], 12))
    iconSpan.addEventListener('mousedown', (e) => {
      if (this.activeCell?.row === 0 && this.activeCell?.col === colIdx) {
        e.preventDefault()
      }
    })
    headerInner.appendChild(iconSpan)

    headerInner.appendChild(contentEl)

    const colFilters = (this.table.filters || []).filter((f) => f.col === colIdx)
    if (colFilters.length > 0) {
      const colTitle = rawVal.trim() || `Column ${colIdx + 1}`
      const indBtn = this.doc.createElement('button')
      indBtn.type = 'button'
      indBtn.className = 'nt-col-filter-indicator forbid-edit'
      indBtn.title = `Edit filter on ${colTitle}`
      indBtn.setAttribute('aria-label', `Edit filter on ${colTitle}`)
      indBtn.appendChild(createIcon(this.doc, 'filter', 11))
      indBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      indBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.openFilterPopoverForFilter(colFilters[0], indBtn, false)
      })
      headerInner.appendChild(indBtn)
    }

    return headerInner
  }

  private renderCellDisplayInto(cell: HTMLElement, rowIdx: number, colIdx: number): void {
    // Keep handles/resizers intact and replace only display/editor container
    cell.querySelector('.nt-cell-display')?.remove()
    cell.querySelector('.nt-header-inner')?.remove()
    cell.querySelector('.nt-cell-editor')?.remove()

    const schema = this.getColumnSchema(colIdx)
    const rawVal = this.getCellValue(rowIdx, colIdx)

    if (rowIdx === 0) {
      const display = this.doc.createElement('div')
      display.className = 'nt-cell-display'
      display.appendChild(
        renderCellContent(this.doc, rawVal, {
          onPageClick: (p, shift) => this.callbacks.onPageClick(p, shift),
          onExternalLinkClick: this.callbacks.onExternalLinkClick,
        })
      )
      cell.insertBefore(this.buildHeaderInner(colIdx, display), cell.firstChild)
      return
    }

    // Body cells by column type
    if (schema.type === 'checkbox') {
      const boxWrap = this.doc.createElement('div')
      boxWrap.className = 'nt-cell-display nt-checkbox-cell forbid-edit'
      const cb = this.doc.createElement('input')
      cb.type = 'checkbox'
      cb.className = 'nt-col-checkbox forbid-edit'
      cb.checked = isCheckboxChecked(rawVal)
      cb.disabled = this.isLocked()
      cb.addEventListener('mousedown', (e) => e.stopPropagation())
      cb.addEventListener('click', (e) => e.stopPropagation())
      cb.addEventListener('change', (e) => {
        e.stopPropagation()
        if (this.isLocked()) return
        this.commitSingleCell(rowIdx, colIdx, formatCheckboxValue(cb.checked))
      })
      boxWrap.appendChild(cb)
      cell.insertBefore(boxWrap, cell.firstChild)
      return
    }

    if (schema.type === 'date') {
      const wrap = this.doc.createElement('div')
      wrap.className = 'nt-cell-display nt-date-cell forbid-edit'

      const main = this.doc.createElement('span')
      main.className = 'nt-date-main'

      const trimmed = rawVal.trim()
      if (trimmed) {
        const bracketMatch = trimmed.match(/^\[\[(.+)\]\]$/)
        const parsed = parsePlaintextDate(trimmed)
        const pageName = bracketMatch
          ? bracketMatch[1].trim()
          : parsed
            ? formatJournalDateLink(parsed, this.preferredDateFormat).slice(2, -2)
            : trimmed
        const link = this.doc.createElement('a')
        link.className = 'nt-page-ref forbid-edit'
        link.href = `#/page/${encodeURIComponent(pageName.toLowerCase())}`
        link.textContent = pageName
        link.addEventListener('mousedown', (e) => e.stopPropagation())
        link.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.callbacks.onPageClick(pageName, e.shiftKey)
        })
        main.appendChild(link)
      }

      if (this.isLocked()) {
        wrap.append(main)
      } else {
        const editBtn = this.doc.createElement('button')
        editBtn.type = 'button'
        editBtn.className = 'nt-cell-edit-btn forbid-edit'
        editBtn.title = 'Pick date'
        editBtn.setAttribute('aria-label', 'Pick date')
        editBtn.appendChild(createIcon(this.doc, 'edit', 12))
        editBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        editBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.openDatePickerForCell(cell, rowIdx, colIdx)
        })

        wrap.append(main, editBtn)
      }
      cell.insertBefore(wrap, cell.firstChild)
      return
    }

    if (schema.type === 'select' || schema.type === 'multi-select') {
      const wrap = this.doc.createElement('div')
      wrap.className = 'nt-cell-display nt-select-cell forbid-edit'
      const values = parseSelectCellValues(rawVal, schema.type === 'multi-select')

      for (const item of values) {
        const opt = schema.options?.find(
          (o) => o.label.toLowerCase() === item.label.toLowerCase()
        )
        const color = opt?.color || 'gray'
        const isPage = item.isPage || Boolean(opt?.isPage)
        const pill = this.doc.createElement('span')
        pill.className = `nt-select-pill nt-color-${color}`
        if (isPage) {
          pill.classList.add('nt-pill-page')
          pill.title = `${item.label} (Cmd/Shift+Click to open page)`
          const pIcon = createIcon(this.doc, 'file', 11)
          pIcon.classList.add('nt-pill-page-icon')
          pill.appendChild(pIcon)
          pill.addEventListener('click', (e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) {
              e.preventDefault()
              e.stopPropagation()
              this.callbacks.onPageClick(item.label, e.shiftKey)
            }
          })
        }
        const txt = this.doc.createElement('span')
        txt.textContent = item.label
        pill.appendChild(txt)
        wrap.appendChild(pill)
      }

      cell.insertBefore(wrap, cell.firstChild)
      return
    }

    if (schema.type === 'url') {
      const wrap = this.doc.createElement('div')
      wrap.className = 'nt-cell-display nt-url-cell forbid-edit'

      const main = this.doc.createElement('span')
      main.className = 'nt-url-main'
      const parsed = parseUrlCell(rawVal)

      if (parsed) {
        const linkIcon = createIcon(this.doc, 'link', 12)
        linkIcon.classList.add('nt-cell-muted-icon')
        main.appendChild(linkIcon)

        const a = this.doc.createElement('a')
        a.className = 'nt-url-link forbid-edit'
        a.href = parsed.href
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.textContent = parsed.display
        a.addEventListener('mousedown', (e) => e.stopPropagation())
        a.addEventListener('click', (e) => {
          e.stopPropagation()
          if (this.callbacks.onExternalLinkClick) {
            e.preventDefault()
            this.callbacks.onExternalLinkClick(parsed.href)
          }
        })
        main.appendChild(a)
      } else if (rawVal.trim()) {
        main.appendChild(this.doc.createTextNode(rawVal.trim()))
      } else {
        const ph = this.doc.createElement('span')
        ph.className = 'nt-cell-placeholder'
        ph.textContent = 'https://…'
        main.appendChild(ph)
      }

      if (this.isLocked()) {
        wrap.append(main)
      } else {
        const editBtn = this.doc.createElement('button')
        editBtn.type = 'button'
        editBtn.className = 'nt-cell-edit-btn forbid-edit'
        editBtn.title = 'Edit URL'
        editBtn.setAttribute('aria-label', 'Edit URL')
        editBtn.appendChild(createIcon(this.doc, 'edit', 12))
        editBtn.addEventListener('mousedown', (e) => {
          e.preventDefault()
          e.stopPropagation()
        })
        editBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.activateCell(rowIdx, colIdx, 'end')
        })

        wrap.append(main, editBtn)
      }
      cell.insertBefore(wrap, cell.firstChild)
      return
    }

    if (isTimestampColumnType(schema.type)) {
      const wrap = this.doc.createElement('div')
      wrap.className = 'nt-cell-display nt-timestamp-cell forbid-edit'
      const trimmed = rawVal.trim()
      if (trimmed) {
        const span = this.doc.createElement('span')
        span.className = 'nt-timestamp-text'
        span.textContent = trimmed
        wrap.appendChild(span)
      }
      cell.insertBefore(wrap, cell.firstChild)
      return
    }

    // Default: 'text'
    const locked = this.isLocked()
    const display = this.doc.createElement('div')
    display.className = 'nt-cell-display'
    const frag = renderCellContent(this.doc, rawVal, {
      readOnly: locked,
      onPageClick: (pageName, shiftKey) => {
        this.callbacks.onPageClick(pageName, shiftKey)
      },
      onExternalLinkClick: this.callbacks.onExternalLinkClick,
      resolveAssetUrl: this.callbacks.onResolveAssetUrl,
      ...(locked
        ? {}
        : {
            onCheckboxToggle: (cbIdx: number, checked: boolean) => {
              const nextRaw = toggleCheckboxInRawText(
                this.getCellValue(rowIdx, colIdx),
                cbIdx,
                checked
              )
              this.commitSingleCell(rowIdx, colIdx, nextRaw)
            },
            onImageResize: (imageIdx: number, dims: { width?: number; height?: number }) => {
              const nextRaw = updateImageDimensionsInRawText(
                this.getCellValue(rowIdx, colIdx),
                imageIdx,
                dims
              )
              this.commitSingleCell(rowIdx, colIdx, nextRaw)
            },
            onImageRemove: (imageIdx: number) => {
              const nextRaw = removeImageInRawText(this.getCellValue(rowIdx, colIdx), imageIdx)
              this.commitSingleCell(rowIdx, colIdx, nextRaw)
            },
          }),
    })
    display.appendChild(frag)
    cell.insertBefore(display, cell.firstChild)
  }

  private hasPotentialImageDrop(dt: DataTransfer | null | undefined): boolean {
    if (!dt) return false
    const types = Array.from(dt.types || [])
    if (types.includes('Files')) return true
    if (dt.files && dt.files.length > 0) return true
    if (types.includes('text/uri-list') || types.includes('text/html')) return true
    return false
  }

  private canAcceptImageInCell(rowIdx: number, colIdx: number): boolean {
    return !this.isLocked() && rowIdx >= 1 && this.getColumnSchema(colIdx).type === 'text'
  }

  private attachCellImageDrop(cell: HTMLElement, rowIdx: number, colIdx: number): void {
    let dragDepth = 0

    cell.addEventListener('dragenter', (e) => {
      if (!this.hasPotentialImageDrop(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      if (!this.canAcceptImageInCell(rowIdx, colIdx)) return
      dragDepth++
      cell.classList.add('nt-cell-drop-target')
    })

    cell.addEventListener('dragover', (e) => {
      if (!this.hasPotentialImageDrop(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      if (!this.canAcceptImageInCell(rowIdx, colIdx)) {
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'none'
        }
        return
      }
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      cell.classList.add('nt-cell-drop-target')
    })

    cell.addEventListener('dragleave', (e) => {
      if (!cell.classList.contains('nt-cell-drop-target')) return
      e.stopPropagation()
      dragDepth = Math.max(0, dragDepth - 1)
      const related = e.relatedTarget as Node | null
      if (dragDepth === 0 || !related || !cell.contains(related)) {
        dragDepth = 0
        cell.classList.remove('nt-cell-drop-target')
      }
    })

    cell.addEventListener('drop', (e) => {
      if (!this.hasPotentialImageDrop(e.dataTransfer)) return
      e.preventDefault()
      e.stopPropagation()
      dragDepth = 0
      cell.classList.remove('nt-cell-drop-target')
      if (!this.canAcceptImageInCell(rowIdx, colIdx)) return
      void this.handleImageDropData(rowIdx, colIdx, cell, e.dataTransfer)
    })
  }

  private async handleImageDropData(
    rowIdx: number,
    colIdx: number,
    cell: HTMLElement,
    dt: DataTransfer | null | undefined
  ): Promise<void> {
    if (!dt) return
    const files = Array.from(dt.files || []).filter(isImageFile)
    const snippets: string[] = []
    const cellRect = cell.getBoundingClientRect()
    const cellWidth = cellRect.width > 0 ? cellRect.width : undefined

    if (files.length > 0) {
      if (!this.callbacks.onSaveImageAsset) {
        this.callbacks.onCopyToast?.('Image storage is unavailable in this environment')
        return
      }
      for (const file of files) {
        try {
          const [measured, saved] = await Promise.all([
            measureImageFile(file),
            this.callbacks.onSaveImageAsset(file),
          ])
          const dims = computeSmartImageSize({
            naturalWidth: measured?.width ?? 0,
            naturalHeight: measured?.height ?? 0,
            maxWidth: this.defaultImageMaxWidth,
            maxHeight: this.defaultImageMaxHeight,
            cellWidth,
          })
          const alt = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
          snippets.push(formatImageMarkdown(alt, saved.markdownPath, dims))
        } catch (err) {
          console.error('[logseq-notion-table] Failed to save dropped image:', err)
          this.callbacks.onCopyToast?.('Failed to save dropped image')
        }
      }
    } else {
      const url = extractDroppedImageUrl(dt)
      if (url) {
        const dims = computeSmartImageSize({
          naturalWidth: 0,
          naturalHeight: 0,
          maxWidth: this.defaultImageMaxWidth,
          maxHeight: this.defaultImageMaxHeight,
          cellWidth,
        })
        snippets.push(formatImageMarkdown('image', url, dims))
      }
    }

    if (snippets.length === 0) return

    const joined = snippets.join('\n')
    const isEditingThisCell =
      this.activeCell?.row === rowIdx &&
      this.activeCell?.col === colIdx &&
      this.activeTextarea !== null

    if (isEditingThisCell && this.activeTextarea) {
      const ta = this.activeTextarea
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? ta.value.length
      const before = ta.value.slice(0, start)
      const after = ta.value.slice(end)
      const sepBefore = before && !before.endsWith('\n') && !before.endsWith(' ') ? '\n' : ''
      const sepAfter = after && !after.startsWith('\n') && !after.startsWith(' ') ? '\n' : ''
      const nextVal = `${before}${sepBefore}${joined}${sepAfter}${after}`
      ta.value = nextVal
      this.dirtyValue = nextVal
      this.table = updateCell(this.table, rowIdx, colIdx, nextVal)
      this.flushActiveEdit(true)
      return
    }

    const existing = this.getCellValue(rowIdx, colIdx).trim()
    const nextVal = existing ? `${existing}\n${joined}` : joined
    this.commitSingleCell(rowIdx, colIdx, nextVal)
  }

  private buildColHandle(colIdx: number): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-col-handle forbid-edit'
    btn.title = 'Drag to reorder or click for column options'
    btn.setAttribute('aria-label', `Column ${colIdx + 1} options`)
    btn.appendChild(createIcon(this.doc, 'grip', 11))

    const cleanup = attachHandleDragReorder({
      doc: this.doc,
      handle: btn,
      axis: 'col',
      sourceIndex: colIdx,
      getTargets: () =>
        this.tableEl ? Array.from(this.tableEl.querySelectorAll('thead th')) : [],
      getSourceElements: () =>
        this.tableEl
          ? Array.from(
              this.tableEl.querySelectorAll(`th[data-col="${colIdx}"], td[data-col="${colIdx}"]`)
            )
          : [],
      onClick: () => {
        btn.classList.add('nt-handle-open')
        const rect = btn.getBoundingClientRect()
        openPopoverMenu(
          this.doc,
          { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          this.buildColMenuItems(colIdx),
          () => btn.classList.remove('nt-handle-open')
        )
      },
      onReorder: (from, to) => {
        this.applyStructuralOp(moveColumn(this.table, from, to), { row: 0, col: to }, () => {
          this.remapColWidths(from, to)
        })
      },
    })
    this.cleanups.push(cleanup)
    return btn
  }

  private buildRowDragGhost(sourceRows: HTMLElement[]): HTMLElement | null {
    if (sourceRows.length === 0) return null

    const ghost = this.doc.createElement('div')
    ghost.className = 'nt-drag-ghost nt-drag-ghost-rows forbid-edit'

    if (this.tableEl) {
      const tableWidth = this.tableEl.getBoundingClientRect().width
      if (tableWidth > 0) {
        ghost.style.width = `${Math.round(Math.min(tableWidth, 560))}px`
      }
    }

    const table = this.doc.createElement('table')
    table.className = 'nt-table nt-drag-ghost-table'
    const tbody = this.doc.createElement('tbody')

    const previewRows = sourceRows.slice(0, 3)
    for (const srcTr of previewRows) {
      const clonedTr = srcTr.cloneNode(true) as HTMLElement
      clonedTr.classList.remove('nt-drag-source')
      clonedTr
        .querySelectorAll('.nt-row-gutter, .nt-col-handle, .nt-col-resizer, .nt-cell-edit-btn, textarea')
        .forEach((el) => el.remove())
      tbody.appendChild(clonedTr)
    }

    table.appendChild(tbody)
    ghost.appendChild(table)

    if (sourceRows.length > 3) {
      const extra = sourceRows.length - 3
      const more = this.doc.createElement('div')
      more.className = 'nt-drag-ghost-more'
      more.textContent = `+${extra} more ${extra === 1 ? 'row' : 'rows'}`
      ghost.appendChild(more)
    }

    if (sourceRows.length > 1) {
      const badge = this.doc.createElement('span')
      badge.className = 'nt-drag-ghost-badge'
      badge.textContent = `${sourceRows.length} rows`
      ghost.appendChild(badge)
    }

    return ghost
  }

  private buildRowHandle(rowIdx: number): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-row-handle forbid-edit'
    btn.title =
      rowIdx === 0
        ? 'Click for header row options'
        : 'Drag to reorder or click for row options'
    btn.setAttribute('aria-label', `Row ${rowIdx + 1} options`)
    btn.appendChild(createIcon(this.doc, 'grip', 11))

    if (rowIdx === 0) {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        btn.classList.add('nt-handle-open')
        const rect = btn.getBoundingClientRect()
        openPopoverMenu(
          this.doc,
          { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          this.buildRowMenuItems(0),
          () => btn.classList.remove('nt-handle-open')
        )
      })
      return btn
    }

    const bodyIdx = rowIdx - 1
    const visIdx = this.visibleBodyIndices.indexOf(bodyIdx)
    const getDraggedBodyIndices = (): number[] => {
      if (this.selectedBodyRows.has(bodyIdx) && this.selectedBodyRows.size > 0) {
        return this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
      }
      return [bodyIdx]
    }
    const cleanup = attachHandleDragReorder({
      doc: this.doc,
      handle: btn,
      axis: 'row',
      sourceIndex: Math.max(0, visIdx),
      getTargets: () =>
        this.tableEl ? Array.from(this.tableEl.querySelectorAll('tbody tr[data-body-idx]')) : [],
      getSourceElements: () => {
        if (!this.tableEl) return []
        const indices = getDraggedBodyIndices()
        const rows: HTMLElement[] = []
        for (const b of indices) {
          const tr = this.tableEl.querySelector(`tbody tr[data-body-idx="${b}"]`)
          if (tr) rows.push(tr as HTMLElement)
        }
        return rows
      },
      createDragGhost: (sourceEls) => this.buildRowDragGhost(sourceEls),
      onClick: () => {
        btn.classList.add('nt-handle-open')
        const rect = btn.getBoundingClientRect()
        openPopoverMenu(
          this.doc,
          { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          this.buildRowMenuItems(rowIdx),
          () => btn.classList.remove('nt-handle-open')
        )
      },
      onReorder: (_fromVis, _toVis, insertBeforeVis) => {
        this.suppressNextCellClick = true
        setTimeout(() => {
          this.suppressNextCellClick = false
        }, 0)

        const movingBodyIndices = getDraggedBodyIndices()
        if (movingBodyIndices.length === 0 || this.visibleBodyIndices.length === 0) return

        const insertBeforeBodyIdx =
          insertBeforeVis < this.visibleBodyIndices.length
            ? this.visibleBodyIndices[insertBeforeVis]
            : this.visibleBodyIndices[this.visibleBodyIndices.length - 1] + 1

        const { table: nextTable, indexMap } = moveRowsWithMap(
          this.table,
          movingBodyIndices,
          insertBeforeBodyIdx
        )
        if (nextTable === this.table) return

        this.applyStructuralOp(nextTable, null, () => {
          if (this.selectedBodyRows.size > 0) {
            const remapped = new Set<number>()
            for (const oldIdx of this.selectedBodyRows) {
              const mapped = indexMap.get(oldIdx)
              if (mapped !== undefined) remapped.add(mapped)
            }
            this.selectedBodyRows = remapped
          }
          if (this.selectionAnchorBodyIdx !== null) {
            this.selectionAnchorBodyIdx = indexMap.get(this.selectionAnchorBodyIdx) ?? null
          }
        })
      },
    })
    this.cleanups.push(cleanup)
    return btn
  }

  private applyColumnWidthToCell(cell: HTMLElement, width: number | null): void {
    if (width && width > 40) {
      cell.classList.add('nt-col-resized')
      cell.style.width = `${width}px`
      cell.style.minWidth = `${width}px`
      cell.style.setProperty('--nt-cell-max-w', `${Math.max(40, width - 16)}px`)
    } else {
      cell.classList.remove('nt-col-resized')
      cell.style.width = ''
      cell.style.minWidth = ''
      cell.style.removeProperty('--nt-cell-max-w')
    }
  }

  private buildColResizer(colIdx: number, colgroup: HTMLElement): HTMLElement {
    const resizer = this.doc.createElement('div')
    resizer.className = 'nt-col-resizer forbid-edit'
    resizer.title = 'Drag to resize column (double-click to reset)'

    resizer.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      delete this.colWidths[colIdx]
      this.savePrefs()
      const colEl = colgroup.children[colIdx] as HTMLElement | undefined
      if (colEl) colEl.style.width = ''
      this.tableEl
        ?.querySelectorAll(`th[data-col="${colIdx}"], td[data-col="${colIdx}"]`)
        .forEach((c) => this.applyColumnWidthToCell(c as HTMLElement, null))
    })

    resizer.addEventListener('mousedown', (downEv) => {
      if (downEv.button !== 0) return
      downEv.preventDefault()
      downEv.stopPropagation()

      const th = resizer.closest('th') as HTMLElement | null
      const colEl = colgroup.children[colIdx] as HTMLElement | undefined
      if (!th || !colEl) return

      const startX = downEv.clientX
      const startWidth = th.getBoundingClientRect().width || 120
      const win = this.doc.defaultView || window
      resizer.classList.add('nt-resizing')

      const onMove = (moveEv: MouseEvent) => {
        const nextWidth = Math.max(72, Math.round(startWidth + (moveEv.clientX - startX)))
        colEl.style.width = `${nextWidth}px`
        this.colWidths[colIdx] = nextWidth
        this.tableEl
          ?.querySelectorAll(`th[data-col="${colIdx}"], td[data-col="${colIdx}"]`)
          .forEach((c) => this.applyColumnWidthToCell(c as HTMLElement, nextWidth))
      }

      const onUp = () => {
        resizer.classList.remove('nt-resizing')
        win.removeEventListener('mousemove', onMove, true)
        win.removeEventListener('mouseup', onUp, true)
        this.savePrefs()
      }

      win.addEventListener('mousemove', onMove, true)
      win.addEventListener('mouseup', onUp, true)
    })

    return resizer
  }

  private pruneOutOfBoundsColWidths(persist = true): void {
    const colCount = this.table.headers.length
    const keys = Object.keys(this.colWidths)
    if (keys.length === 0) return
    let changed = false
    const next: Record<number, number> = {}
    for (const k of keys) {
      const idx = Number(k)
      const w = this.colWidths[idx]
      if (!Number.isInteger(idx) || idx < 0 || idx >= colCount || !w) {
        changed = true
        continue
      }
      next[idx] = w
    }
    if (changed) {
      this.colWidths = next
      if (persist) this.savePrefs()
    }
  }

  private remapColWidths(fromIdx: number, toIdx: number): void {
    const entries: Array<number | undefined> = []
    for (let c = 0; c < this.table.headers.length; c++) {
      entries.push(this.colWidths[c])
    }
    const [moved] = entries.splice(fromIdx, 1)
    entries.splice(toIdx, 0, moved)
    this.colWidths = {}
    entries.forEach((w, idx) => {
      if (w) this.colWidths[idx] = w
    })
    this.savePrefs()
  }

  private shiftColWidthsOnDuplicate(colIdx: number): void {
    const keys = Object.keys(this.colWidths)
    if (keys.length === 0) return
    const next: Record<number, number> = {}
    for (const k of keys) {
      const idx = Number(k)
      const w = this.colWidths[idx]
      if (!w) continue
      if (idx === colIdx) {
        next[idx] = w
        next[idx + 1] = w
      } else if (idx > colIdx) {
        next[idx + 1] = w
      } else {
        next[idx] = w
      }
    }
    this.colWidths = next
    this.savePrefs()
  }

  private shiftColWidthsOnDelete(colIdx: number): void {
    const keys = Object.keys(this.colWidths)
    if (keys.length === 0) return
    const next: Record<number, number> = {}
    for (const k of keys) {
      const idx = Number(k)
      const w = this.colWidths[idx]
      if (!w || idx === colIdx) continue
      next[idx > colIdx ? idx - 1 : idx] = w
    }
    this.colWidths = next
    this.savePrefs()
  }

  private insertNewRowWithPrefill(atBodyIdx: number, focusCol: number): void {
    const hasFilters = (this.table.filters?.length ?? 0) > 0
    const prefill = hasFilters
      ? buildPrefilledRowForFilters(this.table, this.preferredDateFormat)
      : undefined
    const nextTable = insertRow(this.table, atBodyIdx, prefill, this.timestampOpts)
    const willBeVisible = getVisibleRowIndices(
      nextTable,
      this.searchQuery,
      this.preferredDateFormat
    ).includes(atBodyIdx)
    if (willBeVisible) {
      const editableCol = this.findFirstEditableCol(focusCol)
      this.applyStructuralOp(
        nextTable,
        editableCol !== null ? { row: atBodyIdx + 1, col: editableCol } : null
      )
    } else {
      this.applyStructuralOp(nextTable, null)
      this.callbacks.onCopyToast?.(
        hasFilters ? 'Row added (hidden by active filter)' : 'Row added (hidden by active search)'
      )
    }
  }

  private buildAddRowBar(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-add-row-bar forbid-edit'
    btn.title = 'Add row'
    btn.setAttribute('aria-label', 'Add row')
    btn.appendChild(createIcon(this.doc, 'plus', 12))
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.insertNewRowWithPrefill(this.table.rows.length, 0)
    })
    return btn
  }

  private openAddColumnDialogAt(atColIdx: number, anchorEl: HTMLElement): void {
    this.flushActiveEdit(true)
    const rect = anchorEl.isConnected
      ? anchorEl.getBoundingClientRect()
      : this.hostEl.getBoundingClientRect()
    const headRect = this.tableEl?.querySelector('thead')?.getBoundingClientRect()
    const useHeaderY =
      anchorEl.classList.contains('nt-add-col-bar') && headRect && headRect.height > 0

    openAddColumnDialog(
      this.doc,
      {
        left: rect.left,
        top: useHeaderY ? headRect.top : rect.top,
        right: rect.right,
        bottom: useHeaderY ? headRect.bottom : rect.bottom,
      },
      {
        onConfirm: ({ name, type }) => {
          this.applyStructuralOp(
            insertColumn(this.table, atColIdx, {
              name,
              type,
              ...this.timestampOpts,
            }),
            null,
            () => {
              this.shiftColWidthsOnInsert(atColIdx)
            }
          )
        },
      }
    )
  }

  private shiftColWidthsOnInsert(atColIdx: number): void {
    const keys = Object.keys(this.colWidths)
    if (keys.length === 0) return
    const next: Record<number, number> = {}
    for (const k of keys) {
      const idx = Number(k)
      const w = this.colWidths[idx]
      if (!w) continue
      next[idx >= atColIdx ? idx + 1 : idx] = w
    }
    this.colWidths = next
    this.savePrefs()
  }

  private buildAddColBar(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-add-col-bar forbid-edit'
    btn.title = 'Add column'
    btn.setAttribute('aria-label', 'Add column')
    btn.appendChild(createIcon(this.doc, 'plus', 12))
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.openAddColumnDialogAt(this.table.headers.length, btn)
    })
    return btn
  }

  private buildRowMenuItems(rowIdx: number): PopoverMenuItem[] {
    const isHeader = rowIdx === 0
    const bodyIdx = rowIdx - 1
    const canDelete = !isHeader && this.table.rows.length > 1

    const items: PopoverMenuItem[] = []

    if (this.selectedBodyRows.size > 0) {
      const selBodyRows = this.visibleBodyIndices.filter((b) => this.selectedBodyRows.has(b))
      if (selBodyRows.length > 0) {
        const count = selBodyRows.length
        const noun = count === 1 ? 'row' : 'rows'
        items.push({ type: 'header', label: `${count} Selected ${count === 1 ? 'Row' : 'Rows'}` })
        items.push({
          label: `Copy ${count} ${noun} as Markdown`,
          icon: 'copy',
          onSelect: () => {
            const allCols = this.table.headers.map((_, idx) => idx)
            const md = serializeSelectionAsMarkdown(this.table, selBodyRows, allCols)
            void this.copyText(md, `Copied ${count} ${noun} as Markdown`)
          },
        })
        items.push({
          label: `Delete ${count} selected ${noun}`,
          icon: 'trash',
          danger: true,
          onSelect: () => {
            this.selectedBodyRows.clear()
            this.selectionAnchorBodyIdx = null
            this.applyStructuralOp(deleteRows(this.table, selBodyRows, this.timestampOpts), null)
          },
        })
        items.push({
          label: 'Clear selection',
          icon: 'x',
          onSelect: () => this.clearSelection(),
        })
        items.push({ type: 'separator' })
      }
    }

    items.push({ type: 'header', label: isHeader ? 'Header Row' : `Row ${rowIdx}` })

    if (!isHeader) {
      items.push({
        label: 'Insert above',
        icon: 'arrowUp',
        onSelect: () => {
          const editableCol = this.findFirstEditableCol(0)
          this.applyStructuralOp(
            insertRow(this.table, bodyIdx, undefined, this.timestampOpts),
            editableCol !== null ? { row: rowIdx, col: editableCol } : null
          )
        },
      })
    }

    items.push({
      label: 'Insert below',
      icon: 'arrowDown',
      onSelect: () => {
        const at = isHeader ? 0 : bodyIdx + 1
        const editableCol = this.findFirstEditableCol(0)
        this.applyStructuralOp(
          insertRow(this.table, at, undefined, this.timestampOpts),
          editableCol !== null ? { row: at + 1, col: editableCol } : null
        )
      },
    })

    items.push({
      label: 'Duplicate row',
      icon: 'duplicate',
      onSelect: () => {
        const focusRow = isHeader ? 1 : rowIdx + 1
        const editableCol = this.findFirstEditableCol(0)
        this.applyStructuralOp(
          duplicateRow(this.table, rowIdx, this.timestampOpts),
          editableCol !== null ? { row: focusRow, col: editableCol } : null
        )
      },
    })

    if (!isHeader) {
      const visIdx = this.visibleBodyIndices.indexOf(bodyIdx)
      items.push({ type: 'separator' })
      items.push({
        label: 'Move up',
        icon: 'arrowUp',
        shortcut: 'Alt+Shift+↑',
        disabled: visIdx <= 0,
        onSelect: () => {
          const targetBody = this.visibleBodyIndices[visIdx - 1]
          if (targetBody === undefined) return
          this.applyStructuralOp(moveRow(this.table, bodyIdx, targetBody), {
            row: targetBody + 1,
            col: 0,
          })
        },
      })
      items.push({
        label: 'Move down',
        icon: 'arrowDown',
        shortcut: 'Alt+Shift+↓',
        disabled: visIdx < 0 || visIdx >= this.visibleBodyIndices.length - 1,
        onSelect: () => {
          const targetBody = this.visibleBodyIndices[visIdx + 1]
          if (targetBody === undefined) return
          this.applyStructuralOp(moveRow(this.table, bodyIdx, targetBody), {
            row: targetBody + 1,
            col: 0,
          })
        },
      })
    }

    items.push({ type: 'separator' })
    items.push({
      label: 'Clear row contents',
      icon: 'eraser',
      onSelect: () => {
        const editableCol = rowIdx === 0 ? 0 : this.findFirstEditableCol(0)
        this.applyStructuralOp(
          clearRow(this.table, rowIdx, this.timestampOpts),
          editableCol !== null ? { row: rowIdx, col: editableCol } : null
        )
      },
    })

    if (!isHeader) {
      items.push({
        label: canDelete ? 'Delete row' : 'Clear last row',
        icon: 'trash',
        danger: true,
        onSelect: () => {
          const nextFocusRow = Math.min(rowIdx, Math.max(1, this.table.rows.length - 1))
          const editableCol = this.findFirstEditableCol(0)
          this.applyStructuralOp(
            deleteRow(this.table, bodyIdx, this.timestampOpts),
            editableCol !== null ? { row: nextFocusRow, col: editableCol } : null
          )
        },
      })
    }

    return items
  }

  private buildColSortMenuItems(colIdx: number): PopoverMenuItem[] {
    return [
      {
        label: 'Sort A → Z',
        icon: 'sortAsc',
        onSelect: () => this.applyStructuralOp(sortByColumn(this.table, colIdx, 'asc')),
      },
      {
        label: 'Sort Z → A',
        icon: 'sortDesc',
        onSelect: () => this.applyStructuralOp(sortByColumn(this.table, colIdx, 'desc')),
      },
    ]
  }

  private buildColMenuItems(colIdx: number): PopoverMenuItem[] {
    const curAlign: Alignment = this.table.alignments[colIdx] ?? null
    const canDelete = this.table.headers.length > 1
    const curType = this.getColumnSchema(colIdx).type

    const items: PopoverMenuItem[] = [
      { type: 'header', label: 'Column Type' },
      ...COLUMN_TYPE_CHOICES.map((t): PopoverMenuItem => ({
        label: COLUMN_TYPE_LABELS[t],
        icon: COLUMN_TYPE_ICONS[t],
        active: curType === t,
        onSelect: () =>
          this.applyStructuralOp(setColumnType(this.table, colIdx, t, this.timestampOpts)),
      })),
    ]

    if (curType === 'select' || curType === 'multi-select') {
      items.push({
        label: 'Configure options…',
        icon: 'sliders',
        onSelect: () => {
          const th = this.findCellElement(0, colIdx)
          if (th) this.openSelectPickerForCell(th, 0, colIdx, true)
        },
      })
    }

    items.push(
      { type: 'separator' },
      {
        label: 'Insert left',
        icon: 'arrowLeft',
        onSelect: () => {
          const anchor = this.findCellElement(0, colIdx) || this.hostEl
          this.openAddColumnDialogAt(colIdx, anchor)
        },
      },
      {
        label: 'Insert right',
        icon: 'arrowRight',
        onSelect: () => {
          const anchor = this.findCellElement(0, colIdx) || this.hostEl
          this.openAddColumnDialogAt(colIdx + 1, anchor)
        },
      },
      {
        label: 'Duplicate column',
        icon: 'duplicate',
        onSelect: () =>
          this.applyStructuralOp(duplicateColumn(this.table, colIdx), { row: 0, col: colIdx + 1 }, () => {
            this.shiftColWidthsOnDuplicate(colIdx)
          }),
      },
      { type: 'separator' },
      ...this.buildColSortMenuItems(colIdx),
      ...this.buildColFilterMenuItems(colIdx),
      {
        label: 'Calculate…',
        icon: 'hash',
        active: Boolean(this.getColumnSchema(colIdx).calc && this.getColumnSchema(colIdx).calc !== 'none'),
        onSelect: () => {
          const footerBtn = this.tableEl?.querySelectorAll('tfoot .nt-calc-btn')[
            colIdx
          ] as HTMLElement | undefined
          const th = this.findCellElement(0, colIdx)
          const anchor =
            this.isCalcRowVisible() && footerBtn && footerBtn.getBoundingClientRect().width > 0
              ? footerBtn
              : th || this.hostEl
          this.openCalcMenu(colIdx, anchor)
        },
      },
      { type: 'separator' },
      {
        label: 'Align left',
        icon: 'alignLeft',
        active: curAlign === 'left' || curAlign === null,
        onSelect: () => this.applyStructuralOp(setColumnAlignment(this.table, colIdx, 'left')),
      },
      {
        label: 'Align center',
        icon: 'alignCenter',
        active: curAlign === 'center',
        onSelect: () => this.applyStructuralOp(setColumnAlignment(this.table, colIdx, 'center')),
      },
      {
        label: 'Align right',
        icon: 'alignRight',
        active: curAlign === 'right',
        onSelect: () => this.applyStructuralOp(setColumnAlignment(this.table, colIdx, 'right')),
      },
      { type: 'separator' },
      {
        label: 'Move left',
        icon: 'arrowLeft',
        shortcut: 'Alt+Shift+←',
        disabled: colIdx <= 0,
        onSelect: () => {
          this.applyStructuralOp(
            moveColumn(this.table, colIdx, colIdx - 1),
            {
              row: 0,
              col: colIdx - 1,
            },
            () => {
              this.remapColWidths(colIdx, colIdx - 1)
            }
          )
        },
      },
      {
        label: 'Move right',
        icon: 'arrowRight',
        shortcut: 'Alt+Shift+→',
        disabled: colIdx >= this.table.headers.length - 1,
        onSelect: () => {
          this.applyStructuralOp(
            moveColumn(this.table, colIdx, colIdx + 1),
            {
              row: 0,
              col: colIdx + 1,
            },
            () => {
              this.remapColWidths(colIdx, colIdx + 1)
            }
          )
        },
      },
      { type: 'separator' },
      {
        label: 'Clear column contents',
        icon: 'eraser',
        disabled: isTimestampColumnType(curType),
        onSelect: () => this.applyStructuralOp(clearColumn(this.table, colIdx, false, this.timestampOpts)),
      },
      {
        label: 'Delete column',
        icon: 'trash',
        danger: true,
        disabled: !canDelete,
        onSelect: () => {
          this.applyStructuralOp(deleteColumn(this.table, colIdx), null, () => {
            if (this.table.headers.length > 1) {
              this.shiftColWidthsOnDelete(colIdx)
            }
          })
        },
      }
    )

    return items
  }

  private buildCalcFooter(): HTMLElement {
    const tfoot = this.doc.createElement('tfoot')
    const tr = this.doc.createElement('tr')
    tr.className = 'nt-calc-row'

    const visibleRows = this.visibleBodyIndices.map((idx) => this.table.rows[idx] || [])

    for (let c = 0; c < this.table.headers.length; c++) {
      const td = this.doc.createElement('td')
      td.className = 'nt-calc-cell forbid-edit'
      td.dataset.col = String(c)

      const schema = this.getColumnSchema(c)
      const align = this.table.alignments[c]
      if (align) {
        td.classList.add(`nt-align-${align}`)
      } else if (schema.type === 'number') {
        td.classList.add('nt-align-right')
      }

      const colTitle = (this.table.headers[c] || '').trim() || `Column ${c + 1}`
      const curCalc: ColumnCalculation = schema.calc || 'none'

      const locked = this.isLocked()
      const btn = this.doc.createElement('button')
      btn.type = 'button'
      btn.className = 'nt-calc-btn forbid-edit'
      btn.disabled = locked

      if (curCalc !== 'none') {
        const res = computeColumnCalculation(
          visibleRows,
          c,
          schema,
          curCalc,
          this.preferredDateFormat
        )
        btn.classList.add('nt-calc-active')
        btn.setAttribute('aria-label', `${colTitle} calculation: ${res.label} ${res.value}`)
        btn.title = `${res.label}: ${res.value}`

        const lbl = this.doc.createElement('span')
        lbl.className = 'nt-calc-label'
        lbl.textContent = res.label

        const val = this.doc.createElement('span')
        val.className = 'nt-calc-val'
        val.textContent = res.value

        btn.append(lbl, val)
      } else {
        btn.setAttribute('aria-label', `Calculate ${colTitle}`)
        const ph = this.doc.createElement('span')
        ph.className = 'nt-calc-placeholder'
        ph.textContent = 'Calculate'
        btn.appendChild(ph)
      }

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.isLocked()) return
        this.openCalcMenu(c, btn)
      })

      td.appendChild(btn)
      if (c === 0 && !locked) {
        td.appendChild(this.buildCalcRowHandle())
      }
      td.addEventListener('contextmenu', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (this.isLocked()) {
          this.openCellContextMenu(0, c, { left: e.clientX, top: e.clientY })
          return
        }
        this.openCalcRowMenu({ left: e.clientX, top: e.clientY })
      })
      tr.appendChild(td)
    }

    tfoot.appendChild(tr)
    return tfoot
  }

  private buildCalcRowHandle(): HTMLElement {
    const btn = this.doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-row-handle nt-calc-row-handle forbid-edit'
    btn.title = 'Click for calculate row options'
    btn.setAttribute('aria-label', 'Calculate row options')
    btn.appendChild(createIcon(this.doc, 'grip', 11))

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      btn.classList.add('nt-handle-open')
      const rect = btn.getBoundingClientRect()
      this.openCalcRowMenu(
        { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        () => btn.classList.remove('nt-handle-open')
      )
    })
    return btn
  }

  private openCalcRowMenu(
    anchor: { left: number; top: number; right?: number; bottom?: number },
    onClose?: () => void
  ): void {
    this.flushActiveEdit(true)
    const hasCalc = this.hasAnyCalculation()
    this.hostEl.classList.add('nt-calc-open')
    const items: PopoverMenuItem[] = [
      { type: 'header', label: 'Calculate Row' },
      {
        label: 'Clear all',
        icon: 'x',
        danger: true,
        disabled: !hasCalc,
        onSelect: () => {
          this.applyStructuralOp(clearAllColumnCalculations(this.table))
        },
      },
      { type: 'separator' },
      {
        label: 'Calc',
        icon: 'hash',
        checked: this.isCalcRowVisible(),
        active: this.isCalcRowVisible(),
        onSelect: () => {
          this.toggleCalcRow()
        },
      },
      {
        label: 'Lock table',
        icon: 'lock',
        onSelect: () => {
          this.toggleLock()
        },
      },
    ]

    openPopoverMenu(this.doc, anchor, items, () => {
      this.hostEl.classList.remove('nt-calc-open')
      onClose?.()
    })
  }

  private openCalcMenu(colIdx: number, anchorEl: HTMLElement): void {
    this.flushActiveEdit(true)
    const schema = this.getColumnSchema(colIdx)
    const curCalc: ColumnCalculation = schema.calc || 'none'
    const colTitle = (this.table.headers[colIdx] || '').trim() || `Column ${colIdx + 1}`
    const rect = anchorEl.isConnected
      ? anchorEl.getBoundingClientRect()
      : this.hostEl.getBoundingClientRect()

    this.hostEl.classList.add('nt-calc-open')
    const choices = getCalculationsForColumnType(schema.type)
    const items: PopoverMenuItem[] = [
      { type: 'header', label: `Calculate · ${colTitle}` },
      ...choices.map((entry): PopoverMenuItem => ({
        label: entry.label,
        active: curCalc === entry.calc,
        onSelect: () => {
          this.applyStructuralOp(setColumnCalculation(this.table, colIdx, entry.calc))
        },
      })),
    ]

    if (this.hasAnyCalculation()) {
      items.push(
        { type: 'separator' },
        {
          label: 'Clear all',
          icon: 'x',
          danger: true,
          onSelect: () => {
            this.applyStructuralOp(clearAllColumnCalculations(this.table))
          },
        }
      )
    }

    openPopoverMenu(
      this.doc,
      { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      items,
      () => {
        this.hostEl.classList.remove('nt-calc-open')
      }
    )
  }

  private buildColFilterMenuItems(colIdx: number): PopoverMenuItem[] {
    const colFilters = (this.table.filters || []).filter((f) => f.col === colIdx)
    const items: PopoverMenuItem[] = [
      {
        label: colFilters.length > 0 ? 'Edit filter…' : 'Filter column…',
        icon: 'filter',
        active: colFilters.length > 0,
        onSelect: () => {
          const th = this.findCellElement(0, colIdx) || this.hostEl
          if (colFilters.length > 0) {
            this.openFilterPopoverForFilter(colFilters[0], th, false)
          } else {
            this.startNewFilterForColumn(colIdx, th)
          }
        },
      },
    ]
    if (colFilters.length > 0) {
      items.push({
        label: 'Clear column filter',
        icon: 'x',
        onSelect: () => this.applyStructuralOp(clearColumnFilters(this.table, colIdx)),
      })
    }
    return items
  }

  private openCellContextMenu(
    rowIdx: number,
    colIdx: number,
    anchor: { left: number; top: number }
  ): void {
    if (this.isLocked()) {
      openPopoverMenu(this.doc, anchor, [
        { type: 'header', label: 'Table Locked' },
        {
          label: 'Unlock table',
          icon: 'unlock',
          onSelect: () => this.toggleLock(),
        },
        { type: 'separator' },
        ...this.buildColSortMenuItems(colIdx),
        ...this.buildColFilterMenuItems(colIdx),
        { type: 'separator' },
        {
          label: this.isFilteredOrSearched() ? 'Copy visible rows as Markdown' : 'Copy as Markdown',
          icon: 'copy',
          onSelect: () => this.copyMarkdown(),
        },
        {
          label: this.isFilteredOrSearched() ? 'Copy visible rows as CSV' : 'Copy as CSV',
          icon: 'copy',
          onSelect: () => this.copyCsv(),
        },
      ])
      return
    }
    const items: PopoverMenuItem[] = [
      ...this.buildRowMenuItems(rowIdx),
      { type: 'separator' },
      ...this.buildColMenuItems(colIdx),
      { type: 'separator' },
      {
        label: 'Calc',
        icon: 'hash',
        checked: this.isCalcRowVisible(),
        active: this.isCalcRowVisible(),
        onSelect: () => this.toggleCalcRow(),
      },
      {
        label: 'Lock table',
        icon: 'lock',
        onSelect: () => this.toggleLock(),
      },
    ]
    openPopoverMenu(this.doc, anchor, items)
  }

  private activateCell(
    rowIdx: number,
    colIdx: number,
    caretPos: 'start' | 'end' | 'selectAll' = 'end'
  ): void {
    if (this.isLocked()) return
    this.flushActiveEdit(true)

    const cell = this.findCellElement(rowIdx, colIdx)
    if (!cell) return

    if (rowIdx >= 1) {
      const colType = this.getColumnSchema(colIdx).type
      if (isTimestampColumnType(colType)) {
        return
      }
      if (colType === 'date') {
        this.openDatePickerForCell(cell, rowIdx, colIdx)
        return
      }
      if (colType === 'select' || colType === 'multi-select') {
        this.openSelectPickerForCell(cell, rowIdx, colIdx)
        return
      }
      if (colType === 'checkbox') {
        const cb = cell.querySelector('input.nt-col-checkbox') as HTMLInputElement | null
        cb?.focus()
        return
      }
    }

    cell.querySelector('.nt-cell-display')?.remove()
    cell.querySelector('.nt-header-inner')?.remove()

    const textarea = this.doc.createElement('textarea')
    textarea.className = 'nt-cell-editor forbid-edit'
    textarea.rows = 1
    textarea.value = this.getCellValue(rowIdx, colIdx)

    cell.classList.add('nt-cell-active')
    if (rowIdx === 0) {
      cell.insertBefore(this.buildHeaderInner(colIdx, textarea), cell.firstChild)
    } else {
      cell.insertBefore(textarea, cell.firstChild)
    }

    this.activeCell = { row: rowIdx, col: colIdx }
    this.activeTextarea = textarea
    this.dirtyValue = null
    this.cellEditCheckpointTable = cloneTableData(this.table)
    this.lastTypingAt = 0

    const autoSize = () => {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.max(20, textarea.scrollHeight)}px`
    }
    autoSize()

    if (this.callbacks.onSearchPages && (rowIdx === 0 || this.getColumnSchema(colIdx).type === 'text')) {
      this.autocomplete = new PageAutocompleteController({
        doc: this.doc,
        textarea,
        cellEl: cell,
        searchPages: this.callbacks.onSearchPages,
        onApplied: (nextValue) => {
          const before =
            this.cellEditCheckpointTable && this.lastTypingAt === 0
              ? this.cellEditCheckpointTable
              : this.table
          this.recordHistory(before, { row: rowIdx, col: colIdx })
          this.dirtyValue = nextValue
          this.table = updateCell(this.table, rowIdx, colIdx, nextValue, this.timestampOpts)
          this.cellEditCheckpointTable = cloneTableData(this.table)
          this.lastTypingAt = 0
          autoSize()
          this.refreshEditedTimeCellsInRow(rowIdx)
          this.refreshCalcFooter()
          this.scheduleCommit()
        },
      })
    }

    textarea.focus()
    if (caretPos === 'selectAll') {
      textarea.select()
    } else if (caretPos === 'start') {
      textarea.setSelectionRange(0, 0)
    } else {
      const len = textarea.value.length
      textarea.setSelectionRange(len, len)
    }

    textarea.addEventListener('input', () => {
      const now = Date.now()
      if (!this.cellEditCheckpointTable) {
        this.cellEditCheckpointTable = cloneTableData(this.table)
      }
      if (this.lastTypingAt === 0 || now - this.lastTypingAt > 800) {
        this.recordHistory(this.cellEditCheckpointTable, { row: rowIdx, col: colIdx })
        this.cellEditCheckpointTable = cloneTableData(this.table)
      }
      this.lastTypingAt = now
      this.dirtyValue = textarea.value
      this.table = updateCell(this.table, rowIdx, colIdx, textarea.value, this.timestampOpts)
      autoSize()
      this.refreshEditedTimeCellsInRow(rowIdx)
      this.refreshCalcFooter()
      this.scheduleCommit()
    })

    textarea.addEventListener('paste', (e) => {
      const files = Array.from(e.clipboardData?.files || []).filter(isImageFile)
      if (files.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        if (!this.canAcceptImageInCell(rowIdx, colIdx)) return
        void this.handleImageDropData(rowIdx, colIdx, cell, e.clipboardData)
        return
      }
      const dt = e.clipboardData
      const parsed = parseClipboardGrid(
        {
          customJson: dt?.getData(CLIPBOARD_TABLE_MIME),
          plainText: dt?.getData('text/plain'),
          htmlText: dt?.getData('text/html'),
        },
        this.table,
        rowIdx,
        colIdx,
        this.doc
      )
      if (!parsed) return
      const isMulti = parsed.grid.length > 1 || (parsed.grid[0]?.length ?? 0) > 1
      if (isMulti || parsed.isStructured) {
        e.preventDefault()
        e.stopPropagation()
        this.applyStructuralOp(
          applyGridPaste(this.table, rowIdx, colIdx, parsed.grid, this.timestampOpts),
          null
        )
      }
    })

    textarea.addEventListener('blur', () => {
      // Only flush if this textarea is still the active editor
      if (this.activeTextarea === textarea) {
        this.flushActiveEdit(true)
      }
    })

    textarea.addEventListener('keydown', (e) => {
      this.handleEditorKeyDown(e, textarea, rowIdx, colIdx)
    })
  }

  private handleEditorKeyDown(
    e: KeyboardEvent,
    textarea: HTMLTextAreaElement,
    rowIdx: number,
    colIdx: number
  ): void {
    if (!e.altKey) {
      const k = e.key.toLowerCase()
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && k === 'z'
      const isRedo =
        ((e.metaKey || e.ctrlKey) && e.shiftKey && k === 'z') ||
        (e.ctrlKey && !e.metaKey && !e.shiftKey && k === 'y')
      if (isUndo && this.undo()) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (isRedo && this.redo()) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    if (this.autocomplete?.handleKeyDown(e)) {
      return
    }

    const colCount = this.table.headers.length
    const visibleRows = [0, ...this.visibleBodyIndices.map((b) => b + 1)]
    const curVisPos = visibleRows.indexOf(rowIdx)

    // Tab / Shift+Tab cell traversal (auto-append row at final cell, skipping read-only timestamps in body rows)
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      const nextEditableCol = (targetRow: number, startCol: number, dir: 1 | -1): number | null => {
        for (let c = startCol; c >= 0 && c < colCount; c += dir) {
          if (targetRow === 0 || !this.isTimestampCol(c)) return c
        }
        return null
      }
      if (e.shiftKey) {
        const prevCol = nextEditableCol(rowIdx, colIdx - 1, -1)
        if (prevCol !== null) {
          this.activateCell(rowIdx, prevCol, 'end')
        } else if (curVisPos > 0) {
          const prevRow = visibleRows[curVisPos - 1]
          const lastCol = nextEditableCol(prevRow, colCount - 1, -1)
          if (lastCol !== null) {
            this.activateCell(prevRow, lastCol, 'end')
          }
        }
      } else {
        const nextCol = nextEditableCol(rowIdx, colIdx + 1, 1)
        if (nextCol !== null) {
          this.activateCell(rowIdx, nextCol, 'end')
        } else if (curVisPos >= 0 && curVisPos + 1 < visibleRows.length) {
          const nextRow = visibleRows[curVisPos + 1]
          const firstCol = nextEditableCol(nextRow, 0, 1)
          if (firstCol !== null) {
            this.activateCell(nextRow, firstCol, 'end')
          }
        } else {
          // Last editable cell of last visible row -> append new row
          this.insertNewRowWithPrefill(this.table.rows.length, 0)
        }
      }
      return
    }

    // Enter handling
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow newline inside cell
        e.stopPropagation()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      if (e.metaKey || e.ctrlKey) {
        const at = rowIdx === 0 ? 0 : rowIdx
        this.insertNewRowWithPrefill(at, colIdx)
        return
      }
      if (curVisPos >= 0 && curVisPos + 1 < visibleRows.length) {
        this.activateCell(visibleRows[curVisPos + 1], colIdx, 'end')
      } else {
        this.flushActiveEdit(true)
      }
      return
    }

    // Escape: commit & exit cell edit
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.flushActiveEdit(true)
      return
    }

    // Ctrl+Alt+Shift+Arrow -> insert row/col
    if (e.ctrlKey && e.altKey && e.shiftKey && !e.metaKey) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const at = rowIdx === 0 ? 0 : rowIdx
        this.insertNewRowWithPrefill(at, colIdx)
      } else if (e.key === 'ArrowUp' && rowIdx > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.insertNewRowWithPrefill(rowIdx - 1, colIdx)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        this.applyStructuralOp(
          insertColumn(this.table, colIdx, this.timestampOpts),
          { row: rowIdx, col: colIdx },
          () => {
            this.shiftColWidthsOnInsert(colIdx)
          }
        )
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        this.applyStructuralOp(
          insertColumn(this.table, colIdx + 1, this.timestampOpts),
          {
            row: rowIdx,
            col: colIdx + 1,
          },
          () => {
            this.shiftColWidthsOnInsert(colIdx + 1)
          }
        )
      }
      return
    }

    // Alt+Shift+Arrow -> move row/col
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const bodyIdx = rowIdx - 1
      const visBodyPos = this.visibleBodyIndices.indexOf(bodyIdx)
      if (e.key === 'ArrowUp' && rowIdx >= 1 && visBodyPos > 0) {
        e.preventDefault()
        e.stopPropagation()
        const targetBody = this.visibleBodyIndices[visBodyPos - 1]
        this.applyStructuralOp(moveRow(this.table, bodyIdx, targetBody), {
          row: targetBody + 1,
          col: colIdx,
        })
      } else if (
        e.key === 'ArrowDown' &&
        rowIdx >= 1 &&
        visBodyPos >= 0 &&
        visBodyPos < this.visibleBodyIndices.length - 1
      ) {
        e.preventDefault()
        e.stopPropagation()
        const targetBody = this.visibleBodyIndices[visBodyPos + 1]
        this.applyStructuralOp(moveRow(this.table, bodyIdx, targetBody), {
          row: targetBody + 1,
          col: colIdx,
        })
      } else if (e.key === 'ArrowLeft' && colIdx > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.applyStructuralOp(
          moveColumn(this.table, colIdx, colIdx - 1),
          {
            row: rowIdx,
            col: colIdx - 1,
          },
          () => {
            this.remapColWidths(colIdx, colIdx - 1)
          }
        )
      } else if (e.key === 'ArrowRight' && colIdx < colCount - 1) {
        e.preventDefault()
        e.stopPropagation()
        this.applyStructuralOp(
          moveColumn(this.table, colIdx, colIdx + 1),
          {
            row: rowIdx,
            col: colIdx + 1,
          },
          () => {
            this.remapColWidths(colIdx, colIdx + 1)
          }
        )
      }
      return
    }

    // Alt+Arrow -> jump between cells
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'ArrowUp' && curVisPos > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.activateCell(visibleRows[curVisPos - 1], colIdx, 'end')
      } else if (e.key === 'ArrowDown' && curVisPos >= 0 && curVisPos + 1 < visibleRows.length) {
        e.preventDefault()
        e.stopPropagation()
        this.activateCell(visibleRows[curVisPos + 1], colIdx, 'end')
      } else if (e.key === 'ArrowLeft' && colIdx > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.activateCell(rowIdx, colIdx - 1, 'end')
      } else if (e.key === 'ArrowRight' && colIdx + 1 < colCount) {
        e.preventDefault()
        e.stopPropagation()
        this.activateCell(rowIdx, colIdx + 1, 'end')
      }
      return
    }

    // Plain ArrowUp / ArrowDown at first/last line of cell
    if (!e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const selStart = textarea.selectionStart ?? 0
      const selEnd = textarea.selectionEnd ?? 0
      if (selStart === selEnd) {
        if (e.key === 'ArrowUp' && curVisPos > 0) {
          const before = textarea.value.slice(0, selStart)
          if (!before.includes('\n')) {
            e.preventDefault()
            e.stopPropagation()
            this.activateCell(visibleRows[curVisPos - 1], colIdx, 'end')
          }
        } else if (
          e.key === 'ArrowDown' &&
          curVisPos >= 0 &&
          curVisPos + 1 < visibleRows.length
        ) {
          const after = textarea.value.slice(selEnd)
          if (!after.includes('\n')) {
            e.preventDefault()
            e.stopPropagation()
            this.activateCell(visibleRows[curVisPos + 1], colIdx, 'end')
          }
        }
      }
    }
  }
}
