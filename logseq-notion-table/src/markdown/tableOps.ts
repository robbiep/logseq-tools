import {
  cloneColumnSchema,
  formatSelectCellValues,
  harvestOptionsFromColumn,
  hasNonDefaultSchema,
  isCheckboxChecked,
  isTimestampColumnType,
  isValidCalculationForType,
  normalizeColumns,
  parseNumericCellValue,
  parseSelectCellValues,
  type ColumnCalculation,
  type ColumnSchema,
  type ColumnType,
  type OptionColor,
  type SelectOption,
} from './columnTypes'
import { formatTimestamp, parsePlaintextDate, parseTimestamp } from './dateUtils'
import {
  cloneFilter,
  isValidOperatorForType,
  type FilterOperator,
  type TableFilter,
} from './tableFilters'
import {
  isDelimiterRow,
  looksLikeMarkdownTable,
  parseBlockSegments,
  serializeTable,
  splitRowCells,
  type Alignment,
  type RowTimestampMeta,
  type TableData,
} from './tableParser'

function cloneTable(table: TableData): TableData {
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows: table.rows.map((r) => [...r]),
    ...(table.columns ? { columns: normalizeColumns(table.columns, table.headers.length) } : {}),
    ...(table.filters && table.filters.length > 0
      ? { filters: table.filters.map(cloneFilter) }
      : {}),
    ...(table.locked ? { locked: true } : {}),
    ...(typeof table.showCalc === 'boolean' ? { showCalc: table.showCalc } : {}),
    ...(table.rowMeta
      ? {
          rowMeta: table.rows.map((_, i) => {
            const m = table.rowMeta?.[i]
            return m ? { ...m } : {}
          }),
        }
      : {}),
  }
}

export function setTableLocked(table: TableData, locked: boolean): TableData {
  if (Boolean(table.locked) === locked) return table
  const next = cloneTable(table)
  if (locked) {
    next.locked = true
  } else {
    delete next.locked
  }
  return next
}

export function isTableCalcVisible(table: TableData): boolean {
  if (typeof table.showCalc === 'boolean') return table.showCalc
  return Boolean(table.columns?.some((c) => Boolean(c.calc && c.calc !== 'none')))
}

export function setTableShowCalc(table: TableData, showCalc: boolean): TableData {
  const hasAnyCalc = Boolean(table.columns?.some((c) => Boolean(c.calc && c.calc !== 'none')))
  const nextFlag: boolean | undefined = showCalc
    ? hasAnyCalc
      ? undefined
      : true
    : hasAnyCalc
      ? false
      : undefined
  if (table.showCalc === nextFlag) return table
  const next = cloneTable(table)
  if (typeof nextFlag === 'boolean') {
    next.showCalc = nextFlag
  } else {
    delete next.showCalc
  }
  return next
}

function pruneEmptyFilters(table: TableData): TableData {
  if (table.filters && table.filters.length === 0) {
    delete table.filters
  }
  return table
}

function ensureColumns(table: TableData): ColumnSchema[] {
  if (!table.columns) {
    table.columns = normalizeColumns(undefined, table.headers.length)
  }
  return table.columns
}

function pruneDefaultColumns(table: TableData): TableData {
  if (table.columns && !hasNonDefaultSchema(table.columns)) {
    delete table.columns
  }
  return table
}

export interface TimestampOptions {
  dateFormat?: string
  now?: Date
  skipAutoTimestamps?: boolean
}

function getColumnType(table: TableData, colIdx: number): ColumnType {
  return table.columns?.[colIdx]?.type ?? 'text'
}

function resolveTimestampMs(opts?: TimestampOptions): number {
  const raw = (opts?.now ?? new Date()).getTime()
  return Math.floor(raw / 1000) * 1000
}

function ensureRowMeta(table: TableData): RowTimestampMeta[] {
  if (!table.rowMeta) {
    table.rowMeta = table.rows.map(() => ({}))
  } else {
    while (table.rowMeta.length < table.rows.length) {
      table.rowMeta.push({})
    }
    if (table.rowMeta.length > table.rows.length) {
      table.rowMeta.length = table.rows.length
    }
  }
  return table.rowMeta
}

function stampCreatedColumns(
  row: string[],
  columns: ColumnSchema[] | undefined,
  timestamp: string
): void {
  if (!columns) return
  for (let c = 0; c < row.length; c++) {
    if (columns[c]?.type === 'created-time') {
      row[c] = timestamp
    }
  }
}

function stampEditedColumns(
  row: string[],
  columns: ColumnSchema[] | undefined,
  timestamp: string
): void {
  if (!columns) return
  for (let c = 0; c < row.length; c++) {
    if (columns[c]?.type === 'edited-time') {
      row[c] = timestamp
    }
  }
}

function clearEditedColumns(row: string[], columns: ColumnSchema[] | undefined): void {
  if (!columns) return
  for (let c = 0; c < row.length; c++) {
    if (columns[c]?.type === 'edited-time') {
      row[c] = ''
    }
  }
}

function stampRowCreated(
  table: TableData,
  bodyIdx: number,
  tsMs: number,
  dateFormat?: string
): void {
  const meta = ensureRowMeta(table)
  meta[bodyIdx] = { ...(meta[bodyIdx] || {}), createdAt: tsMs }
  stampCreatedColumns(table.rows[bodyIdx], table.columns, formatTimestamp(new Date(tsMs), dateFormat))
}

function stampRowEdited(
  table: TableData,
  bodyIdx: number,
  tsMs: number,
  dateFormat?: string
): void {
  const meta = ensureRowMeta(table)
  meta[bodyIdx] = { ...(meta[bodyIdx] || {}), editedAt: tsMs }
  stampEditedColumns(table.rows[bodyIdx], table.columns, formatTimestamp(new Date(tsMs), dateFormat))
}

/**
 * Update a single cell. `rowIdx === 0` targets the header row; `rowIdx >= 1`
 * targets body row `rowIdx - 1`.
 */
export function updateCell(
  table: TableData,
  rowIdx: number,
  colIdx: number,
  value: string,
  opts?: TimestampOptions
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  if (rowIdx === 0) {
    if (table.headers[colIdx] === value) return table
    const next = cloneTable(table)
    next.headers[colIdx] = value
    return next
  }
  const bodyIdx = rowIdx - 1
  if (bodyIdx < 0 || bodyIdx >= table.rows.length) return table
  if (!opts?.skipAutoTimestamps && isTimestampColumnType(getColumnType(table, colIdx))) {
    return table
  }
  if (table.rows[bodyIdx][colIdx] === value) return table
  const next = cloneTable(table)
  next.rows[bodyIdx][colIdx] = value
  if (!opts?.skipAutoTimestamps) {
    stampRowEdited(next, bodyIdx, resolveTimestampMs(opts), opts?.dateFormat)
  }
  return next
}

/**
 * Update column `colIdx` across multiple body rows (`bodyIndices` are 0-based within `table.rows`).
 */
export function updateColumnInRows(
  table: TableData,
  bodyIndices: number[],
  colIdx: number,
  value: string,
  opts?: TimestampOptions
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  if (!opts?.skipAutoTimestamps && isTimestampColumnType(getColumnType(table, colIdx))) {
    return table
  }
  const uniqueRows = Array.from(
    new Set(bodyIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < table.rows.length))
  )
  if (uniqueRows.length === 0) return table

  let next: TableData | null = null
  const tsMs = resolveTimestampMs(opts)
  for (const bodyIdx of uniqueRows) {
    if (table.rows[bodyIdx][colIdx] === value) continue
    if (!next) next = cloneTable(table)
    next.rows[bodyIdx][colIdx] = value
    if (!opts?.skipAutoTimestamps) {
      stampRowEdited(next, bodyIdx, tsMs, opts?.dateFormat)
    }
  }
  return next ?? table
}

/**
 * Insert an empty body row at `atBodyIdx` (`0` = first body row, `rows.length` = end).
 */
export function insertRow(
  table: TableData,
  atBodyIdx: number,
  initialValues?: string[],
  opts?: TimestampOptions
): TableData {
  const next = cloneTable(table)
  const clamped = Math.max(0, Math.min(next.rows.length, atBodyIdx))
  const row = new Array<string>(next.headers.length).fill('')
  if (initialValues) {
    for (let c = 0; c < row.length; c++) {
      if (typeof initialValues[c] === 'string') {
        row[c] = initialValues[c]
      }
    }
  }
  next.rows.splice(clamped, 0, row)
  if (next.rowMeta) {
    next.rowMeta.splice(clamped, 0, {})
  }
  if (!opts?.skipAutoTimestamps) {
    stampRowCreated(next, clamped, resolveTimestampMs(opts), opts?.dateFormat)
  }
  return next
}

/**
 * Duplicate a row. If `rowIdx === 0` (header), inserts a copy of the header as
 * the first body row. Otherwise duplicates `rows[rowIdx - 1]` right below it.
 */
export function duplicateRow(
  table: TableData,
  rowIdx: number,
  opts?: TimestampOptions
): TableData {
  const next = cloneTable(table)
  if (rowIdx === 0) {
    const newRow = [...next.headers]
    next.rows.unshift(newRow)
    if (next.rowMeta) {
      next.rowMeta.unshift({})
    }
    if (!opts?.skipAutoTimestamps) {
      clearEditedColumns(newRow, next.columns)
      stampRowCreated(next, 0, resolveTimestampMs(opts), opts?.dateFormat)
    }
    return next
  }
  const bodyIdx = rowIdx - 1
  if (bodyIdx < 0 || bodyIdx >= next.rows.length) return table
  const newRow = [...next.rows[bodyIdx]]
  next.rows.splice(bodyIdx + 1, 0, newRow)
  if (next.rowMeta) {
    next.rowMeta.splice(bodyIdx + 1, 0, {})
  }
  if (!opts?.skipAutoTimestamps) {
    clearEditedColumns(newRow, next.columns)
    stampRowCreated(next, bodyIdx + 1, resolveTimestampMs(opts), opts?.dateFormat)
  }
  return next
}

/**
 * Delete a body row (`bodyIdx` is 0-based within `table.rows`).
 * Protects GFM structure: if only 1 body row remains, clears its contents
 * rather than leaving 0 body rows.
 */
export function deleteRow(
  table: TableData,
  bodyIdx: number,
  opts?: TimestampOptions
): TableData {
  if (bodyIdx < 0 || bodyIdx >= table.rows.length) return table
  const next = cloneTable(table)
  if (next.rows.length <= 1) {
    next.rows[0] = new Array<string>(next.headers.length).fill('')
    if (next.rowMeta) {
      next.rowMeta = [{}]
    }
    if (!opts?.skipAutoTimestamps) {
      stampRowCreated(next, 0, resolveTimestampMs(opts), opts?.dateFormat)
    }
    return next
  }
  next.rows.splice(bodyIdx, 1)
  if (next.rowMeta) {
    next.rowMeta.splice(bodyIdx, 1)
  }
  return next
}

/**
 * Delete multiple body rows (`bodyIndices` are 0-based within `table.rows`).
 * Protects GFM structure: if all body rows are deleted, leaves 1 empty row.
 */
export function deleteRows(
  table: TableData,
  bodyIndices: number[],
  opts?: TimestampOptions
): TableData {
  const toDelete = new Set(
    bodyIndices.filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < table.rows.length)
  )
  if (toDelete.size === 0) return table
  const next = cloneTable(table)
  next.rows = next.rows.filter((_, idx) => !toDelete.has(idx))
  if (next.rowMeta) {
    next.rowMeta = next.rowMeta.filter((_, idx) => !toDelete.has(idx))
  }
  if (next.rows.length === 0) {
    next.rows = [new Array<string>(next.headers.length).fill('')]
    if (next.rowMeta) {
      next.rowMeta = [{}]
    }
    if (!opts?.skipAutoTimestamps) {
      stampRowCreated(next, 0, resolveTimestampMs(opts), opts?.dateFormat)
    }
  }
  return next
}

/**
 * Clear all cells in the specified `rowIndices` (`0` = header, `>= 1` = body) and `colIndices`.
 */
export function clearCellRange(
  table: TableData,
  rowIndices: number[],
  colIndices: number[],
  opts?: TimestampOptions
): TableData {
  const validCols = colIndices.filter((c) => c >= 0 && c < table.headers.length)
  if (validCols.length === 0 || rowIndices.length === 0) return table
  const next = cloneTable(table)
  let changed = false
  const changedBodyRows = new Set<number>()
  for (const r of rowIndices) {
    if (r === 0) {
      for (const c of validCols) {
        if (next.headers[c] !== '') {
          next.headers[c] = ''
          changed = true
        }
      }
    } else {
      const bodyIdx = r - 1
      if (bodyIdx >= 0 && bodyIdx < next.rows.length) {
        for (const c of validCols) {
          if (!opts?.skipAutoTimestamps && isTimestampColumnType(getColumnType(next, c))) {
            continue
          }
          if (next.rows[bodyIdx][c] !== '') {
            next.rows[bodyIdx][c] = ''
            changed = true
            changedBodyRows.add(bodyIdx)
          }
        }
      }
    }
  }
  if (!opts?.skipAutoTimestamps && changedBodyRows.size > 0) {
    const tsMs = resolveTimestampMs(opts)
    for (const bodyIdx of changedBodyRows) {
      stampRowEdited(next, bodyIdx, tsMs, opts?.dateFormat)
    }
  }
  return changed ? next : table
}

/**
 * Move a body row from `fromBodyIdx` to `toBodyIdx`.
 */
export function moveRow(
  table: TableData,
  fromBodyIdx: number,
  toBodyIdx: number
): TableData {
  if (
    fromBodyIdx < 0 ||
    fromBodyIdx >= table.rows.length ||
    toBodyIdx < 0 ||
    toBodyIdx >= table.rows.length ||
    fromBodyIdx === toBodyIdx
  ) {
    return table
  }
  const next = cloneTable(table)
  const [moved] = next.rows.splice(fromBodyIdx, 1)
  next.rows.splice(toBodyIdx, 0, moved)
  if (next.rowMeta) {
    const [movedMeta] = next.rowMeta.splice(fromBodyIdx, 1)
    next.rowMeta.splice(toBodyIdx, 0, movedMeta ?? {})
  }
  return next
}

export interface MoveRowsResult {
  table: TableData
  indexMap: Map<number, number>
}

/**
 * Move one or more body rows (`movingBodyIndices`, 0-based) together as an ordered block
 * to just before `insertBeforeBodyIdx` (`0..rows.length`).
 * Returns both the updated table and an old-index -> new-index mapping.
 */
export function moveRowsWithMap(
  table: TableData,
  movingBodyIndices: number[],
  insertBeforeBodyIdx: number
): MoveRowsResult {
  const rowCount = table.rows.length
  const identityMap = new Map<number, number>()
  for (let i = 0; i < rowCount; i++) {
    identityMap.set(i, i)
  }

  const validMoving = Array.from(
    new Set(
      movingBodyIndices.filter(
        (idx) => Number.isInteger(idx) && idx >= 0 && idx < rowCount
      )
    )
  ).sort((a, b) => a - b)

  if (validMoving.length === 0) {
    return { table, indexMap: identityMap }
  }

  const movingSet = new Set(validMoving)
  const clampedInsert = Math.max(0, Math.min(rowCount, insertBeforeBodyIdx))
  const remaining: number[] = []
  for (let i = 0; i < rowCount; i++) {
    if (!movingSet.has(i)) remaining.push(i)
  }

  const movedBefore = validMoving.filter((i) => i < clampedInsert).length
  const dest = Math.max(0, Math.min(remaining.length, clampedInsert - movedBefore))
  const nextOrder = [...remaining.slice(0, dest), ...validMoving, ...remaining.slice(dest)]

  if (nextOrder.every((oldIdx, newIdx) => oldIdx === newIdx)) {
    return { table, indexMap: identityMap }
  }

  const next = cloneTable(table)
  next.rows = nextOrder.map((oldIdx) => next.rows[oldIdx])
  if (next.rowMeta) {
    next.rowMeta = nextOrder.map((oldIdx) => next.rowMeta![oldIdx] ?? {})
  }

  const indexMap = new Map<number, number>()
  nextOrder.forEach((oldIdx, newIdx) => {
    indexMap.set(oldIdx, newIdx)
  })
  return { table: next, indexMap }
}

/**
 * Move one or more body rows (`movingBodyIndices`, 0-based) together as an ordered block
 * to just before `insertBeforeBodyIdx` (`0..rows.length`).
 */
export function moveRows(
  table: TableData,
  movingBodyIndices: number[],
  insertBeforeBodyIdx: number
): TableData {
  return moveRowsWithMap(table, movingBodyIndices, insertBeforeBodyIdx).table
}

/**
 * Clear all cells in `rowIdx` (`0` = header, `>= 1` = body row).
 */
export function clearRow(
  table: TableData,
  rowIdx: number,
  opts?: TimestampOptions
): TableData {
  const next = cloneTable(table)
  if (rowIdx === 0) {
    next.headers = new Array<string>(next.headers.length).fill('')
    return next
  }
  const bodyIdx = rowIdx - 1
  if (bodyIdx < 0 || bodyIdx >= next.rows.length) return table
  let changed = false
  for (let c = 0; c < next.headers.length; c++) {
    if (!opts?.skipAutoTimestamps && isTimestampColumnType(getColumnType(next, c))) {
      continue
    }
    if (next.rows[bodyIdx][c] !== '') {
      next.rows[bodyIdx][c] = ''
      changed = true
    }
  }
  if (changed && !opts?.skipAutoTimestamps) {
    stampRowEdited(next, bodyIdx, resolveTimestampMs(opts), opts?.dateFormat)
  }
  return next
}

/**
 * Insert a new column at `atColIdx`, optionally pre-seeded with a name and column type.
 */
export function insertColumn(
  table: TableData,
  atColIdx: number,
  options?: { name?: string; type?: ColumnType } & TimestampOptions
): TableData {
  const next = cloneTable(table)
  const clamped = Math.max(0, Math.min(next.headers.length, atColIdx))
  const colType: ColumnType = options?.type ?? 'text'
  const colName = options?.name ?? ''
  next.headers.splice(clamped, 0, colName)
  next.alignments.splice(clamped, 0, null)
  if (next.columns || colType !== 'text') {
    const cols = ensureColumns(next)
    cols.splice(clamped, 0, { type: colType })
  }
  if (next.filters) {
    for (const f of next.filters) {
      if (f.col >= clamped) f.col++
    }
  }
  if (colType === 'created-time' && !options?.skipAutoTimestamps) {
    const fallbackMs = resolveTimestampMs(options)
    const meta = ensureRowMeta(next)
    for (let r = 0; r < next.rows.length; r++) {
      const tsMs = meta[r]?.createdAt ?? fallbackMs
      if (meta[r]?.createdAt === undefined) {
        meta[r] = { ...(meta[r] || {}), createdAt: tsMs }
      }
      next.rows[r].splice(clamped, 0, formatTimestamp(new Date(tsMs), options?.dateFormat))
    }
  } else if (colType === 'edited-time' && !options?.skipAutoTimestamps) {
    for (let r = 0; r < next.rows.length; r++) {
      const editedMs = next.rowMeta?.[r]?.editedAt
      const val =
        editedMs !== undefined ? formatTimestamp(new Date(editedMs), options?.dateFormat) : ''
      next.rows[r].splice(clamped, 0, val)
    }
  } else {
    for (const row of next.rows) {
      row.splice(clamped, 0, '')
    }
  }
  return pruneDefaultColumns(next)
}

/**
 * Duplicate column `colIdx` immediately to its right.
 */
export function duplicateColumn(table: TableData, colIdx: number): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  next.headers.splice(colIdx + 1, 0, next.headers[colIdx])
  next.alignments.splice(colIdx + 1, 0, next.alignments[colIdx])
  if (next.columns) {
    next.columns.splice(colIdx + 1, 0, cloneColumnSchema(next.columns[colIdx]))
  }
  if (next.filters) {
    for (const f of next.filters) {
      if (f.col > colIdx) f.col++
    }
  }
  for (const row of next.rows) {
    row.splice(colIdx + 1, 0, row[colIdx] ?? '')
  }
  return next
}

/**
 * Delete column `colIdx`. No-op if only 1 column remains.
 */
export function deleteColumn(table: TableData, colIdx: number): TableData {
  if (table.headers.length <= 1) return table
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  next.headers.splice(colIdx, 1)
  next.alignments.splice(colIdx, 1)
  if (next.columns) {
    next.columns.splice(colIdx, 1)
  }
  if (next.filters) {
    next.filters = next.filters
      .filter((f) => f.col !== colIdx)
      .map((f) => (f.col > colIdx ? { ...f, col: f.col - 1 } : f))
  }
  for (const row of next.rows) {
    row.splice(colIdx, 1)
  }
  return pruneEmptyFilters(pruneDefaultColumns(next))
}

/**
 * Move column from `fromColIdx` to `toColIdx`.
 */
export function moveColumn(
  table: TableData,
  fromColIdx: number,
  toColIdx: number
): TableData {
  const len = table.headers.length
  if (
    fromColIdx < 0 ||
    fromColIdx >= len ||
    toColIdx < 0 ||
    toColIdx >= len ||
    fromColIdx === toColIdx
  ) {
    return table
  }
  const next = cloneTable(table)
  const [h] = next.headers.splice(fromColIdx, 1)
  next.headers.splice(toColIdx, 0, h)
  const [a] = next.alignments.splice(fromColIdx, 1)
  next.alignments.splice(toColIdx, 0, a)
  if (next.columns) {
    const [c] = next.columns.splice(fromColIdx, 1)
    next.columns.splice(toColIdx, 0, c)
  }
  if (next.filters) {
    for (const f of next.filters) {
      if (f.col === fromColIdx) {
        f.col = toColIdx
      } else if (fromColIdx < toColIdx && f.col > fromColIdx && f.col <= toColIdx) {
        f.col--
      } else if (fromColIdx > toColIdx && f.col >= toColIdx && f.col < fromColIdx) {
        f.col++
      }
    }
  }
  for (const row of next.rows) {
    const [cell] = row.splice(fromColIdx, 1)
    row.splice(toColIdx, 0, cell)
  }
  return next
}

/**
 * Clear all body cells (and optionally header if desired — clears body cells + header)
 * in `colIdx`.
 */
export function clearColumn(
  table: TableData,
  colIdx: number,
  includeHeader = false,
  opts?: TimestampOptions
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  if (includeHeader) {
    next.headers[colIdx] = ''
  }
  if (!opts?.skipAutoTimestamps && isTimestampColumnType(getColumnType(next, colIdx))) {
    return next
  }
  const tsMs = !opts?.skipAutoTimestamps ? resolveTimestampMs(opts) : null
  for (let r = 0; r < next.rows.length; r++) {
    if (next.rows[r][colIdx] !== '') {
      next.rows[r][colIdx] = ''
      if (tsMs !== null) {
        stampRowEdited(next, r, tsMs, opts?.dateFormat)
      }
    }
  }
  return next
}

/**
 * Set alignment for column `colIdx`.
 */
export function setColumnAlignment(
  table: TableData,
  colIdx: number,
  alignment: Alignment
): TableData {
  if (colIdx < 0 || colIdx >= table.alignments.length) return table
  const next = cloneTable(table)
  next.alignments[colIdx] = alignment
  return next
}

/**
 * Change column `colIdx` type and auto-harvest select options when switching to select/multi-select.
 */
export function setColumnType(
  table: TableData,
  colIdx: number,
  nextType: ColumnType,
  opts?: TimestampOptions
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  const cols = ensureColumns(next)
  const cur = cols[colIdx] || { type: 'text' }

  const prevType = cur.type
  const preservedCalc =
    cur.calc && isValidCalculationForType(cur.calc, nextType) && cur.calc !== 'none'
      ? cur.calc
      : undefined
  if (nextType === 'select' || nextType === 'multi-select') {
    const harvested = harvestOptionsFromColumn(
      next.rows,
      colIdx,
      nextType === 'multi-select',
      cur.options || []
    )
    cols[colIdx] = {
      type: nextType,
      ...(harvested.length > 0 ? { options: harvested } : {}),
      ...(preservedCalc ? { calc: preservedCalc } : {}),
    }
  } else {
    cols[colIdx] = {
      type: nextType,
      ...(cur.options && cur.options.length > 0 ? { options: cur.options } : {}),
      ...(preservedCalc ? { calc: preservedCalc } : {}),
    }
  }

  if (nextType === 'created-time' && !opts?.skipAutoTimestamps) {
    const fallbackMs = resolveTimestampMs(opts)
    const meta = ensureRowMeta(next)
    for (let r = 0; r < next.rows.length; r++) {
      if (!(next.rows[r][colIdx] || '').trim()) {
        const tsMs = meta[r]?.createdAt ?? fallbackMs
        if (meta[r]?.createdAt === undefined) {
          meta[r] = { ...(meta[r] || {}), createdAt: tsMs }
        }
        next.rows[r][colIdx] = formatTimestamp(new Date(tsMs), opts?.dateFormat)
      }
    }
  } else if (nextType === 'edited-time' && !opts?.skipAutoTimestamps) {
    for (let r = 0; r < next.rows.length; r++) {
      if (!(next.rows[r][colIdx] || '').trim()) {
        const editedMs = next.rowMeta?.[r]?.editedAt
        if (editedMs !== undefined) {
          next.rows[r][colIdx] = formatTimestamp(new Date(editedMs), opts?.dateFormat)
        }
      }
    }
  }

  if (nextType !== prevType && next.filters) {
    next.filters = next.filters.flatMap((f) => {
      if (f.col !== colIdx) return [f]
      let op: FilterOperator = f.op
      if (prevType === 'select' && nextType === 'multi-select') {
        if (op === 'is') op = 'contains'
        else if (op === 'is_not') op = 'not_contains'
      } else if (prevType === 'multi-select' && nextType === 'select') {
        if (op === 'contains') op = 'is'
        else if (op === 'not_contains') op = 'is_not'
      }
      if (!isValidOperatorForType(op, nextType)) return []
      return [{ ...f, op }]
    })
  }

  return pruneEmptyFilters(pruneDefaultColumns(next))
}

export function upsertTableFilter(table: TableData, filter: TableFilter): TableData {
  if (filter.col < 0 || filter.col >= table.headers.length) return table
  const next = cloneTable(table)
  const list = next.filters ? [...next.filters] : []
  const idx = list.findIndex((f) => f.id === filter.id)
  const clean = cloneFilter(filter)
  if (idx >= 0) {
    list[idx] = clean
  } else {
    list.push(clean)
  }
  next.filters = list
  return next
}

export function removeTableFilter(table: TableData, filterId: string): TableData {
  if (!table.filters || table.filters.length === 0) return table
  const next = cloneTable(table)
  next.filters = next.filters!.filter((f) => f.id !== filterId)
  return pruneEmptyFilters(next)
}

export function clearColumnFilters(table: TableData, colIdx: number): TableData {
  if (!table.filters || table.filters.length === 0) return table
  const next = cloneTable(table)
  next.filters = next.filters!.filter((f) => f.col !== colIdx)
  return pruneEmptyFilters(next)
}

export function clearAllTableFilters(table: TableData): TableData {
  if (!table.filters || table.filters.length === 0) return table
  const next = cloneTable(table)
  delete next.filters
  return next
}

/**
 * Update the available options for a select / multi-select column.
 */
export function setColumnOptions(
  table: TableData,
  colIdx: number,
  options: SelectOption[]
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  const cols = ensureColumns(next)
  const cur = cols[colIdx] || { type: 'select' }
  cols[colIdx] = {
    type: cur.type,
    options: options.length > 0 ? options.map((o) => ({ ...o })) : undefined,
    ...(cur.calc ? { calc: cur.calc } : {}),
  }
  return pruneDefaultColumns(next)
}

/**
 * Rename an option in a select / multi-select column and propagate the rename
 * across all matching body cells and active column filters.
 */
export function renameColumnOption(
  table: TableData,
  colIdx: number,
  optionId: string,
  nextLabel: string,
  opts?: TimestampOptions
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const col = table.columns?.[colIdx]
  if (!col || (col.type !== 'select' && col.type !== 'multi-select')) return table

  const trimmed = (nextLabel || '').trim()
  if (!trimmed) return table

  const existingOpts = col.options || []
  const targetOpt = existingOpts.find((o) => o.id === optionId)
  if (!targetOpt) return table

  const oldLabel = targetOpt.label
  if (oldLabel === trimmed) return table

  const lowerOld = oldLabel.toLowerCase()
  const lowerNext = trimmed.toLowerCase()
  if (existingOpts.some((o) => o.id !== optionId && o.label.toLowerCase() === lowerNext)) {
    return table
  }

  const next = cloneTable(table)
  const cols = ensureColumns(next)
  cols[colIdx] = {
    ...cols[colIdx],
    options: (cols[colIdx].options || []).map((o) =>
      o.id === optionId ? { ...o, label: trimmed } : o
    ),
  }

  const multi = col.type === 'multi-select'
  const tsMs = !opts?.skipAutoTimestamps ? resolveTimestampMs(opts) : null
  for (let r = 0; r < next.rows.length; r++) {
    const raw = next.rows[r][colIdx] ?? ''
    if (!raw.trim()) continue
    const tokens = parseSelectCellValues(raw, multi)
    let matched = false
    const updatedTokens = tokens.map((tok) => {
      if (tok.label.toLowerCase() === lowerOld) {
        matched = true
        return { label: trimmed, isPage: tok.isPage }
      }
      return { label: tok.label, isPage: tok.isPage }
    })
    if (!matched) continue
    const nextCell = formatSelectCellValues(updatedTokens)
    if (next.rows[r][colIdx] !== nextCell) {
      next.rows[r][colIdx] = nextCell
      if (tsMs !== null) {
        stampRowEdited(next, r, tsMs, opts?.dateFormat)
      }
    }
  }

  if (next.filters) {
    next.filters = next.filters.map((f) => {
      if (f.col !== colIdx || !Array.isArray(f.value)) return f
      const seen = new Set<string>()
      const mapped: string[] = []
      for (const v of f.value) {
        const nextVal = v.trim().toLowerCase() === lowerOld ? trimmed : v.trim()
        if (!nextVal) continue
        const key = nextVal.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          mapped.push(nextVal)
        }
      }
      return { ...f, value: mapped }
    })
  }

  return pruneDefaultColumns(next)
}

/**
 * Update the color of a single option in a select / multi-select column.
 */
export function setColumnOptionColor(
  table: TableData,
  colIdx: number,
  optionId: string,
  color: OptionColor
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const col = table.columns?.[colIdx]
  if (!col || !col.options) return table
  const target = col.options.find((o) => o.id === optionId)
  if (!target || target.color === color) return table

  const next = cloneTable(table)
  const cols = ensureColumns(next)
  cols[colIdx] = {
    ...cols[colIdx],
    options: (cols[colIdx].options || []).map((o) =>
      o.id === optionId ? { ...o, color } : o
    ),
  }
  return next
}

export function setColumnCalculation(
  table: TableData,
  colIdx: number,
  calc: ColumnCalculation
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  const cols = ensureColumns(next)
  const cur = cols[colIdx] || { type: 'text' }
  const nextCalc =
    calc !== 'none' && isValidCalculationForType(calc, cur.type) ? calc : undefined
  cols[colIdx] = {
    type: cur.type,
    ...(cur.options && cur.options.length > 0 ? { options: cur.options } : {}),
    ...(nextCalc ? { calc: nextCalc } : {}),
  }
  if (nextCalc && next.showCalc === false) {
    delete next.showCalc
  } else if (!nextCalc && next.showCalc === false && !cols.some((c) => Boolean(c.calc && c.calc !== 'none'))) {
    delete next.showCalc
  }
  return pruneDefaultColumns(next)
}

/**
 * Clear all active column calculations while preserving column types and options.
 */
export function clearAllColumnCalculations(table: TableData): TableData {
  if (!table.columns || !table.columns.some((c) => Boolean(c.calc && c.calc !== 'none'))) {
    return table
  }
  const next = cloneTable(table)
  next.columns = next.columns!.map((col) => ({
    type: col.type,
    ...(col.options && col.options.length > 0 ? { options: col.options } : {}),
  }))
  if (next.showCalc === false) {
    delete next.showCalc
  }
  return pruneDefaultColumns(next)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

function parseComparableNumber(val: string): number | null {
  const cleaned = val.trim().replace(/,/g, '')
  if (!cleaned) return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

function stripBrackets(val: string): string {
  return val.replace(/\[\[([^\]]+)\]\]/g, '$1').trim()
}

/**
 * Sort body rows by column `colIdx` (`asc` or `desc`). Empty cells always sort last.
 */
export function sortByColumn(
  table: TableData,
  colIdx: number,
  direction: 'asc' | 'desc'
): TableData {
  if (colIdx < 0 || colIdx >= table.headers.length) return table
  const next = cloneTable(table)
  const sign = direction === 'asc' ? 1 : -1
  const colType = next.columns?.[colIdx]?.type ?? 'text'

  const paired = next.rows.map((row, idx) => ({
    row,
    meta: next.rowMeta?.[idx],
  }))

  paired.sort(({ row: rowA }, { row: rowB }) => {
    const a = (rowA[colIdx] ?? '').trim()
    const b = (rowB[colIdx] ?? '').trim()

    if (colType === 'checkbox') {
      const ca = isCheckboxChecked(a) ? 1 : 0
      const cb = isCheckboxChecked(b) ? 1 : 0
      return (ca - cb) * sign
    }

    if (!a && !b) return 0
    if (!a) return 1
    if (!b) return -1

    if (colType === 'date' || isTimestampColumnType(colType)) {
      const da = isTimestampColumnType(colType) ? parseTimestamp(a) : parsePlaintextDate(a)
      const db = isTimestampColumnType(colType) ? parseTimestamp(b) : parsePlaintextDate(b)
      if (!da && !db) return collator.compare(stripBrackets(a), stripBrackets(b)) * sign
      if (!da) return 1
      if (!db) return -1
      return (da.getTime() - db.getTime()) * sign
    }

    if (colType === 'number') {
      const numA = parseNumericCellValue(a)?.value ?? null
      const numB = parseNumericCellValue(b)?.value ?? null
      if (numA !== null && numB !== null) {
        if (numA === numB) return 0
        return (numA - numB) * sign
      }
      if (numA !== null) return -1
      if (numB !== null) return 1
      return collator.compare(stripBrackets(a), stripBrackets(b)) * sign
    }

    const numA = parseComparableNumber(a)
    const numB = parseComparableNumber(b)
    if (numA !== null && numB !== null) {
      if (numA === numB) return 0
      return (numA - numB) * sign
    }

    return collator.compare(stripBrackets(a), stripBrackets(b)) * sign
  })

  next.rows = paired.map((p) => p.row)
  if (next.rowMeta) {
    next.rowMeta = paired.map((p) => p.meta ?? {})
  }

  return next
}

/**
 * Parse a TSV string into a 2D cell grid, supporting RFC-4180 quoted cells
 * (embedded tabs/newlines and `""` escaped quotes).
 */
export function parseTsvGrid(tsvText: string): string[][] {
  const normalized = tsvText.replace(/\r\n?/g, '\n')
  if (!normalized) return []

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let atCellStart = true
  let i = 0

  while (i < normalized.length) {
    const ch = normalized[i]
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }

    if (atCellStart && ch === '"') {
      inQuotes = true
      atCellStart = false
      i++
      continue
    }

    if (ch === '\t') {
      row.push(cell)
      cell = ''
      atCellStart = true
      i++
      continue
    }

    if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      atCellStart = true
      i++
      continue
    }

    cell += ch
    atCellStart = false
    i++
  }

  row.push(cell)
  rows.push(row)

  // Drop trailing empty rows caused by trailing newlines
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop()
  }
  return rows
}

/**
 * Parse a GFM Markdown table or pipe-delimited rows into a 2D cell grid.
 * When pasting into body rows (`targetStartRowIdx >= 1`), skips the header row
 * if it matches the target table's headers at `targetStartColIdx`.
 */
export function parseMarkdownTableGrid(
  text: string,
  targetHeaders?: string[],
  targetStartRowIdx = 0,
  targetStartColIdx = 0
): string[][] | null {
  const normalized = (text || '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return null

  if (looksLikeMarkdownTable(normalized)) {
    const segments = parseBlockSegments(normalized)
    const nonEmpty = segments.filter(
      (s) => s.type === 'table' || s.raw.trim().length > 0
    )
    if (nonEmpty.length === 1 && nonEmpty[0].type === 'table') {
      const parsed = nonEmpty[0].table
      if (targetStartRowIdx >= 1 && parsed.rows.length > 0 && targetHeaders) {
        const headersMatch = parsed.headers.every(
          (h, idx) =>
            h.trim().toLowerCase() ===
            (targetHeaders[targetStartColIdx + idx] ?? '').trim().toLowerCase()
        )
        if (headersMatch) {
          return parsed.rows.map((r) => [...r])
        }
      }
      return [parsed.headers, ...parsed.rows]
    }
  }

  // Fallback for pipe-delimited row(s) without a delimiter row, e.g. `| a | b |`
  const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean)
  if (
    lines.length > 0 &&
    lines.every((l) => l.startsWith('|') && l.endsWith('|') && l.indexOf('|', 1) !== -1)
  ) {
    const grid = lines.filter((l) => !isDelimiterRow(l)).map((l) => splitRowCells(l))
    if (grid.length > 0 && grid.some((r) => r.length > 1)) {
      return grid
    }
  }

  return null
}

function extractHtmlCellText(cellEl: Element): string {
  const pills = Array.from(cellEl.querySelectorAll('.nt-select-pill'))
  if (pills.length > 0) {
    return pills
      .map((pill) => {
        const clone = pill.cloneNode(true) as Element
        clone.querySelectorAll('.nt-pill-page-icon').forEach((n) => n.remove())
        return (clone.textContent || '').trim()
      })
      .filter(Boolean)
      .join(', ')
  }

  const clone = cellEl.cloneNode(true) as Element
  clone
    .querySelectorAll(
      '.nt-col-handle, .nt-row-handle, .nt-row-select, .nt-col-resizer, .nt-cell-edit-btn, .nt-col-type-icon, .nt-col-filter-indicator, .nt-cell-placeholder'
    )
    .forEach((n) => n.remove())

  const checkbox = clone.querySelector('input[type="checkbox"]') as HTMLInputElement | null
  if (checkbox) {
    const rest = (clone.textContent || '').trim()
    if (!rest) {
      return checkbox.checked ? '[x]' : '[ ]'
    }
  }

  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith('\n')
  })

  clone.querySelectorAll('a').forEach((a) => {
    const ref = a.getAttribute('data-ref')
    const href = a.getAttribute('href') || ''
    const txt = (a.textContent || '').trim()
    if (ref) {
      a.replaceWith(txt && txt !== ref ? `[${txt}]([[${ref}]])` : `[[${ref}]]`)
    } else if (href.startsWith('#/page/') && txt) {
      a.replaceWith(`[[${txt}]]`)
    }
  })

  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

/**
 * Parse an HTML `<table>` snippet from clipboard `text/html` into a 2D cell grid.
 */
export function parseHtmlTableGrid(html: string, doc?: Document): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html)) return null
  const Parser = doc?.defaultView?.DOMParser || globalThis.DOMParser
  if (!Parser) return null

  const parsedDoc = new Parser().parseFromString(html, 'text/html')
  const tableEl = parsedDoc.querySelector('table')
  if (!tableEl) return null

  const rows = Array.from(tableEl.querySelectorAll('tr')).filter(
    (tr) => tr.closest('table') === tableEl
  )
  if (rows.length === 0) return null

  const grid: string[][] = []
  for (const tr of rows) {
    const cells = Array.from(tr.children).filter(
      (el) => el.tagName === 'TH' || el.tagName === 'TD'
    )
    if (cells.length === 0) continue
    const rowValues: string[] = []
    for (const c of cells) {
      const text = extractHtmlCellText(c)
      const span = Math.max(1, Number.parseInt(c.getAttribute('colspan') || '1', 10) || 1)
      for (let i = 0; i < span; i++) {
        rowValues.push(i === 0 ? text : '')
      }
    }
    grid.push(rowValues)
  }

  return grid.length > 0 ? grid : null
}

/**
 * Write a 2D cell grid into `table` starting at `(startRowIdx, startColIdx)`,
 * auto-expanding columns and body rows if needed.
 */
export function applyGridPaste(
  table: TableData,
  startRowIdx: number,
  startColIdx: number,
  grid: string[][],
  opts?: TimestampOptions
): TableData {
  if (grid.length === 0) return table

  const maxPasteCols = Math.max(...grid.map((r) => r.length))
  if (maxPasteCols <= 0) return table
  const neededCols = startColIdx + maxPasteCols
  const neededTotalRows = startRowIdx + grid.length

  const next = cloneTable(table)
  while (next.headers.length < neededCols) {
    next.headers.push('')
    next.alignments.push(null)
    if (next.columns) {
      next.columns.push({ type: 'text' })
    }
    for (const row of next.rows) {
      row.push('')
    }
  }

  const tsMs = !opts?.skipAutoTimestamps ? resolveTimestampMs(opts) : null
  const neededBodyRows = Math.max(1, neededTotalRows - 1)
  while (next.rows.length < neededBodyRows) {
    const newRow = new Array<string>(next.headers.length).fill('')
    next.rows.push(newRow)
    const newIdx = next.rows.length - 1
    if (next.rowMeta) {
      next.rowMeta.push({})
    }
    if (tsMs !== null) {
      stampRowCreated(next, newIdx, tsMs, opts?.dateFormat)
    }
  }

  const changedBodyRows = new Set<number>()
  for (let r = 0; r < grid.length; r++) {
    const targetRowIdx = startRowIdx + r
    for (let c = 0; c < grid[r].length; c++) {
      const targetColIdx = startColIdx + c
      const val = grid[r][c]
      if (targetRowIdx === 0) {
        next.headers[targetColIdx] = val
      } else {
        const bodyIdx = targetRowIdx - 1
        if (tsMs !== null && isTimestampColumnType(getColumnType(next, targetColIdx))) {
          continue
        }
        if (next.rows[bodyIdx][targetColIdx] !== val) {
          next.rows[bodyIdx][targetColIdx] = val
          changedBodyRows.add(bodyIdx)
        }
      }
    }
  }

  if (tsMs !== null && changedBodyRows.size > 0) {
    for (const bodyIdx of changedBodyRows) {
      stampRowEdited(next, bodyIdx, tsMs, opts?.dateFormat)
    }
  }

  return next
}

/**
 * Parse a TSV (tab-separated) grid and write it starting at `(startRowIdx, startColIdx)`,
 * auto-expanding columns and body rows if the pasted grid exceeds current dimensions.
 */
export function applyTsvPaste(
  table: TableData,
  startRowIdx: number,
  startColIdx: number,
  tsvText: string
): TableData {
  const grid = parseTsvGrid(tsvText)
  return applyGridPaste(table, startRowIdx, startColIdx, grid)
}

export interface ClipboardTablePayload {
  v: 1
  cells: string[][]
  includesHeader: boolean
}

/**
 * Parse clipboard data (custom table payload, Markdown table, TSV, HTML table,
 * or multiline plain text) into a 2D cell grid for pasting.
 */
export function parseClipboardGrid(
  data: { customJson?: string; plainText?: string; htmlText?: string },
  targetTable: TableData,
  startRowIdx: number,
  startColIdx: number,
  doc?: Document
): { grid: string[][]; isStructured: boolean } | null {
  if (data.customJson) {
    try {
      const parsed = JSON.parse(data.customJson) as Partial<ClipboardTablePayload>
      if (
        parsed?.v === 1 &&
        Array.isArray(parsed.cells) &&
        parsed.cells.length > 0 &&
        parsed.cells.every((r) => Array.isArray(r))
      ) {
        return {
          grid: parsed.cells.map((r) => r.map((c) => String(c ?? ''))),
          isStructured: true,
        }
      }
    } catch {
      // Ignore invalid JSON payload
    }
  }

  const plain = data.plainText ?? ''
  const mdGrid = parseMarkdownTableGrid(
    plain,
    targetTable.headers,
    startRowIdx,
    startColIdx
  )
  if (mdGrid) {
    return { grid: mdGrid, isStructured: true }
  }

  if (plain.includes('\t')) {
    const tsvGrid = parseTsvGrid(plain)
    if (tsvGrid.length > 0) {
      return { grid: tsvGrid, isStructured: true }
    }
  }

  if (data.htmlText) {
    const htmlGrid = parseHtmlTableGrid(data.htmlText, doc)
    if (htmlGrid && (htmlGrid.length > 1 || (htmlGrid[0]?.length ?? 0) > 1)) {
      return { grid: htmlGrid, isStructured: true }
    }
  }

  if (plain.includes('\n')) {
    const lineGrid = parseTsvGrid(plain)
    if (lineGrid.length > 0) {
      return { grid: lineGrid, isStructured: false }
    }
  }

  return null
}

/**
 * Serialize a slice of rows and columns as a clean GFM Markdown table
 * (without internal schema/filter comments).
 */
export function serializeSelectionAsMarkdown(
  table: TableData,
  bodyRowIndices: number[],
  colIndices: number[]
): string {
  const validCols = colIndices.filter((c) => c >= 0 && c < table.headers.length)
  if (validCols.length === 0) return ''

  const headers = validCols.map((c) => table.headers[c] ?? '')
  const alignments = validCols.map((c) => table.alignments[c] ?? null)
  const rows = bodyRowIndices
    .filter((b) => b >= 0 && b < table.rows.length)
    .map((b) => validCols.map((c) => table.rows[b]?.[c] ?? ''))

  return serializeTable({ headers, alignments, rows })
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Convert table to RFC 4180 CSV string.
 */
export function tableToCsv(table: TableData): string {
  const allRows = [table.headers, ...table.rows]
  return allRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}

/**
 * Build a clean TableData slice containing only the specified visible body rows,
 * suitable for exporting filtered Markdown or CSV without internal schema comments.
 */
export function getVisibleTableSlice(
  table: TableData,
  visibleBodyIndices: number[]
): TableData {
  const rows = visibleBodyIndices
    .filter((b) => Number.isInteger(b) && b >= 0 && b < table.rows.length)
    .map((b) => [...table.rows[b]])
  return {
    headers: [...table.headers],
    alignments: [...table.alignments],
    rows,
  }
}
