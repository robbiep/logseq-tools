import { cloneFilter } from '../markdown/tableFilters'
import type { TableData } from '../markdown/tableParser'

export interface CellCoord {
  row: number
  col: number
}

export interface HistoryEntry {
  table: TableData
  focusCell?: CellCoord | null
  colWidths?: Record<number, number>
}

export function cloneTableData(table: TableData): TableData {
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.map((r) => [...r]),
    ...(table.columns
      ? {
          columns: table.columns.map((c) => ({
            type: c.type,
            ...(c.options ? { options: c.options.map((o) => ({ ...o })) } : {}),
            ...(c.calc ? { calc: c.calc } : {}),
          })),
        }
      : {}),
    ...(table.filters && table.filters.length > 0
      ? { filters: table.filters.map(cloneFilter) }
      : {}),
    ...(table.locked ? { locked: true } : {}),
    ...(typeof table.showCalc === 'boolean' ? { showCalc: table.showCalc } : {}),
    ...(table.rowMeta
      ? { rowMeta: table.rowMeta.map((m) => (m ? { ...m } : {})) }
      : {}),
  }
}

export function tablesEqual(a: TableData, b: TableData): boolean {
  if (Boolean(a.locked) !== Boolean(b.locked)) return false
  if (a.showCalc !== b.showCalc) return false
  if (a.headers.length !== b.headers.length || a.rows.length !== b.rows.length) return false
  for (let c = 0; c < a.headers.length; c++) {
    if (a.headers[c] !== b.headers[c]) return false
    if (a.alignments[c] !== b.alignments[c]) return false
  }
  if (JSON.stringify(a.columns || null) !== JSON.stringify(b.columns || null)) return false
  if (JSON.stringify(a.filters || null) !== JSON.stringify(b.filters || null)) return false
  for (let r = 0; r < a.rows.length; r++) {
    for (let c = 0; c < a.headers.length; c++) {
      if ((a.rows[r][c] ?? '') !== (b.rows[r][c] ?? '')) return false
    }
  }
  return true
}

export class TableHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private maxEntries: number

  constructor(maxEntries = 100) {
    this.maxEntries = maxEntries
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0
  }

  public push(
    beforeTable: TableData,
    focusCell?: CellCoord | null,
    colWidths?: Record<number, number>
  ): void {
    const top = this.undoStack[this.undoStack.length - 1]
    if (
      top &&
      tablesEqual(top.table, beforeTable) &&
      JSON.stringify(top.colWidths || null) === JSON.stringify(colWidths || null)
    ) {
      this.redoStack = []
      return
    }
    this.undoStack.push({
      table: cloneTableData(beforeTable),
      focusCell: focusCell ? { ...focusCell } : null,
      ...(colWidths !== undefined ? { colWidths: { ...colWidths } } : {}),
    })
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  public undo(
    currentTable: TableData,
    currentFocus?: CellCoord | null,
    currentColWidths?: Record<number, number>
  ): HistoryEntry | null {
    const prev = this.undoStack.pop()
    if (!prev) return null
    this.redoStack.push({
      table: cloneTableData(currentTable),
      focusCell: currentFocus ? { ...currentFocus } : null,
      ...(currentColWidths !== undefined ? { colWidths: { ...currentColWidths } } : {}),
    })
    return {
      table: cloneTableData(prev.table),
      focusCell: prev.focusCell ? { ...prev.focusCell } : null,
      ...(prev.colWidths !== undefined ? { colWidths: { ...prev.colWidths } } : {}),
    }
  }

  public redo(
    currentTable: TableData,
    currentFocus?: CellCoord | null,
    currentColWidths?: Record<number, number>
  ): HistoryEntry | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push({
      table: cloneTableData(currentTable),
      focusCell: currentFocus ? { ...currentFocus } : null,
      ...(currentColWidths !== undefined ? { colWidths: { ...currentColWidths } } : {}),
    })
    return {
      table: cloneTableData(next.table),
      focusCell: next.focusCell ? { ...next.focusCell } : null,
      ...(next.colWidths !== undefined ? { colWidths: { ...next.colWidths } } : {}),
    }
  }

  public clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
