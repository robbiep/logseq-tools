import {
  formatCheckboxValue,
  formatSelectCellValues,
  isCheckboxChecked,
  isTimestampColumnType,
  parseNumericCellValue,
  parseSelectCellValues,
  parseUrlCell,
  type ColumnSchema,
  type ColumnType,
} from './columnTypes'
import {
  formatJournalDateLink,
  formatLogseqDate,
  formatTimestamp,
  parsePlaintextDate,
  parseTimestamp,
} from './dateUtils'
import { IMAGE_TOKEN_RE } from './imageUtils'
import type { TableData } from './tableParser'

export type TextFilterOp =
  | 'contains'
  | 'not_contains'
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'

export type DateFilterOp =
  | 'is'
  | 'before'
  | 'after'
  | 'on_or_before'
  | 'on_or_after'
  | 'is_empty'
  | 'is_not_empty'

export type SelectFilterOp = 'is' | 'is_not' | 'is_empty' | 'is_not_empty'

export type MultiSelectFilterOp = 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

export type CheckboxFilterOp = 'checked' | 'unchecked'

export type UrlFilterOp = 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

export type NumberFilterOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty'

export type FilterOperator =
  | TextFilterOp
  | NumberFilterOp
  | DateFilterOp
  | SelectFilterOp
  | MultiSelectFilterOp
  | CheckboxFilterOp
  | UrlFilterOp

export interface TableFilter {
  id: string
  col: number
  op: FilterOperator
  value?: string | string[]
}

const DATE_FILTER_OPS: Array<{ op: FilterOperator; label: string }> = [
  { op: 'is', label: 'is' },
  { op: 'before', label: 'is before' },
  { op: 'after', label: 'is after' },
  { op: 'on_or_before', label: 'is on or before' },
  { op: 'on_or_after', label: 'is on or after' },
  { op: 'is_empty', label: 'is empty' },
  { op: 'is_not_empty', label: 'is not empty' },
]

const OPERATORS_BY_TYPE: Record<ColumnType, Array<{ op: FilterOperator; label: string }>> = {
  text: [
    { op: 'contains', label: 'contains' },
    { op: 'not_contains', label: 'does not contain' },
    { op: 'is', label: 'is' },
    { op: 'is_not', label: 'is not' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { op: 'eq', label: '=' },
    { op: 'neq', label: '≠' },
    { op: 'gt', label: '>' },
    { op: 'gte', label: '≥' },
    { op: 'lt', label: '<' },
    { op: 'lte', label: '≤' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  date: DATE_FILTER_OPS,
  'created-time': DATE_FILTER_OPS,
  'edited-time': DATE_FILTER_OPS,
  select: [
    { op: 'is', label: 'is' },
    { op: 'is_not', label: 'is not' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  'multi-select': [
    { op: 'contains', label: 'contains' },
    { op: 'not_contains', label: 'does not contain' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
  checkbox: [
    { op: 'checked', label: 'is checked' },
    { op: 'unchecked', label: 'is unchecked' },
  ],
  url: [
    { op: 'contains', label: 'contains' },
    { op: 'not_contains', label: 'does not contain' },
    { op: 'is_empty', label: 'is empty' },
    { op: 'is_not_empty', label: 'is not empty' },
  ],
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  is: 'is',
  is_not: 'is not',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  before: 'is before',
  after: 'is after',
  on_or_before: 'is on or before',
  on_or_after: 'is on or after',
  checked: 'is checked',
  unchecked: 'is unchecked',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
}

const VALUELESS_OPS = new Set<FilterOperator>([
  'is_empty',
  'is_not_empty',
  'checked',
  'unchecked',
])

export function getOperatorsForColumnType(
  type: ColumnType
): Array<{ op: FilterOperator; label: string }> {
  return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text
}

export function getOperatorLabel(op: FilterOperator): string {
  return OPERATOR_LABELS[op] || op
}

export function isValuelessFilterOp(op: FilterOperator): boolean {
  return VALUELESS_OPS.has(op)
}

export function isValidOperatorForType(op: string, type: ColumnType): op is FilterOperator {
  const allowed = OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text
  return allowed.some((entry) => entry.op === op)
}

const NUMBER_CMP_OPS = new Set<FilterOperator>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])

export function isFilterComplete(filter: TableFilter): boolean {
  if (isValuelessFilterOp(filter.op)) return true
  if (Array.isArray(filter.value)) {
    return filter.value.some((v) => v.trim().length > 0)
  }
  if (typeof filter.value !== 'string' || filter.value.trim().length === 0) {
    return false
  }
  if (NUMBER_CMP_OPS.has(filter.op)) {
    return parseNumericCellValue(filter.value) !== null
  }
  return true
}

export function createDefaultFilter(col: number, type: ColumnType): TableFilter {
  const id = `flt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  const defaultOp = getOperatorsForColumnType(type)[0].op
  if (type === 'checkbox') {
    return { id, col, op: defaultOp }
  }
  if (type === 'select' || type === 'multi-select') {
    return { id, col, op: defaultOp, value: [] }
  }
  return { id, col, op: defaultOp, value: '' }
}

export function cloneFilter(filter: TableFilter): TableFilter {
  const cloned: TableFilter = {
    id: filter.id,
    col: filter.col,
    op: filter.op,
  }
  if (!isValuelessFilterOp(filter.op)) {
    if (Array.isArray(filter.value)) {
      cloned.value = [...filter.value]
    } else if (typeof filter.value === 'string') {
      cloned.value = filter.value
    }
  }
  return cloned
}

function normalizeFilterValue(
  rawValue: unknown,
  op: FilterOperator,
  colType: ColumnType
): string | string[] | undefined {
  if (isValuelessFilterOp(op)) return undefined
  if (colType === 'select' || colType === 'multi-select') {
    if (Array.isArray(rawValue)) {
      const seen = new Set<string>()
      const clean: string[] = []
      for (const item of rawValue) {
        if (typeof item !== 'string') continue
        const trimmed = item.trim()
        if (!trimmed) continue
        const lower = trimmed.toLowerCase()
        if (!seen.has(lower)) {
          seen.add(lower)
          clean.push(trimmed)
        }
      }
      return clean
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      return [rawValue.trim()]
    }
    return []
  }
  return typeof rawValue === 'string' ? rawValue : ''
}

export function normalizeFilters(
  filters: unknown,
  colCount: number,
  columns?: ColumnSchema[]
): TableFilter[] {
  if (!Array.isArray(filters) || colCount <= 0) return []
  const out: TableFilter[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < filters.length; i++) {
    const raw = filters[i] as Partial<TableFilter> | null | undefined
    if (!raw || typeof raw !== 'object') continue
    if (typeof raw.col !== 'number' || !Number.isInteger(raw.col)) continue
    if (raw.col < 0 || raw.col >= colCount) continue

    const colType: ColumnType = columns?.[raw.col]?.type ?? 'text'
    if (typeof raw.op !== 'string' || !isValidOperatorForType(raw.op, colType)) continue

    let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `flt_${raw.col}_${i}`
    while (seenIds.has(id)) {
      id = `${id}_${i}`
    }
    seenIds.add(id)

    const value = normalizeFilterValue(raw.value, raw.op, colType)
    const entry: TableFilter = {
      id,
      col: raw.col,
      op: raw.op,
      ...(value !== undefined ? { value } : {}),
    }
    out.push(entry)
  }

  return out
}

function toDayInt(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
}

function stripPageBrackets(val: string): string {
  return val.replace(/\[\[([^\]]+)\]\]/g, '$1').trim()
}

function extractSearchableText(raw: string): string {
  const imgGlobalRe = new RegExp(IMAGE_TOKEN_RE.source, 'g')
  return raw
    .replace(imgGlobalRe, '')
    .replace(/\[([^\]]+)\]\(\[\[[^\]]+\]\]\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function matchesFilter(
  cellRaw: string,
  filter: TableFilter,
  colType: ColumnType,
  referenceDate: Date = new Date()
): boolean {
  if (!isFilterComplete(filter)) return true

  const raw = cellRaw ?? ''
  const trimmed = raw.trim()
  const op = filter.op

  if (op === 'is_empty') {
    if (colType === 'select' || colType === 'multi-select') {
      return parseSelectCellValues(raw, colType === 'multi-select').length === 0
    }
    return trimmed.length === 0
  }
  if (op === 'is_not_empty') {
    if (colType === 'select' || colType === 'multi-select') {
      return parseSelectCellValues(raw, colType === 'multi-select').length > 0
    }
    return trimmed.length > 0
  }

  if (colType === 'checkbox') {
    const checked = isCheckboxChecked(raw)
    return op === 'checked' ? checked : !checked
  }

  if (colType === 'select' || colType === 'multi-select') {
    const selectedLabels = Array.isArray(filter.value)
      ? filter.value.map((v) => v.trim().toLowerCase()).filter(Boolean)
      : typeof filter.value === 'string' && filter.value.trim()
        ? [filter.value.trim().toLowerCase()]
        : []
    if (selectedLabels.length === 0) return true

    const selectedSet = new Set(selectedLabels)
    const cellTokens = parseSelectCellValues(raw, colType === 'multi-select').map((t) =>
      t.label.toLowerCase()
    )
    const hasOverlap = cellTokens.some((tok) => selectedSet.has(tok))

    if (op === 'is' || op === 'contains') return hasOverlap
    if (op === 'is_not' || op === 'not_contains') return !hasOverlap
    return true
  }

  if (colType === 'date' || isTimestampColumnType(colType)) {
    const targetRaw = typeof filter.value === 'string' ? filter.value.trim() : ''
    if (!targetRaw) return true
    const targetDate = parsePlaintextDate(targetRaw, referenceDate)
    if (!targetDate) return true
    const cellDate = isTimestampColumnType(colType)
      ? parseTimestamp(trimmed, referenceDate)
      : parsePlaintextDate(trimmed, referenceDate)
    if (!cellDate) return false

    const cellDay = toDayInt(cellDate)
    const targetDay = toDayInt(targetDate)

    switch (op) {
      case 'is':
        return cellDay === targetDay
      case 'before':
        return cellDay < targetDay
      case 'after':
        return cellDay > targetDay
      case 'on_or_before':
        return cellDay <= targetDay
      case 'on_or_after':
        return cellDay >= targetDay
      default:
        return true
    }
  }

  if (colType === 'number') {
    const targetRaw = typeof filter.value === 'string' ? filter.value : ''
    const target = parseNumericCellValue(targetRaw)
    if (!target) return true
    const cellParsed = parseNumericCellValue(raw)
    if (!cellParsed) return false

    switch (op) {
      case 'eq':
        return cellParsed.value === target.value
      case 'neq':
        return cellParsed.value !== target.value
      case 'gt':
        return cellParsed.value > target.value
      case 'gte':
        return cellParsed.value >= target.value
      case 'lt':
        return cellParsed.value < target.value
      case 'lte':
        return cellParsed.value <= target.value
      default:
        return true
    }
  }

  if (colType === 'url') {
    const needle = (typeof filter.value === 'string' ? filter.value : '').trim().toLowerCase()
    if (!needle) return true
    const parsed = parseUrlCell(raw)
    const candidates = [trimmed.toLowerCase()]
    if (parsed) {
      candidates.push(parsed.href.toLowerCase(), parsed.display.toLowerCase())
    }
    const matched = candidates.some((c) => c.includes(needle))
    return op === 'not_contains' ? !matched : matched
  }

  // Default: 'text'
  const needle = (typeof filter.value === 'string' ? filter.value : '').trim().toLowerCase()
  if (!needle) return true
  const searchable = extractSearchableText(raw)
  const rawLower = searchable.toLowerCase()
  const strippedLower = stripPageBrackets(searchable).toLowerCase()

  switch (op) {
    case 'contains':
      return rawLower.includes(needle) || strippedLower.includes(needle)
    case 'not_contains':
      return !rawLower.includes(needle) && !strippedLower.includes(needle)
    case 'is':
      return rawLower === needle || strippedLower === needle
    case 'is_not':
      return rawLower !== needle && strippedLower !== needle
    default:
      return true
  }
}

export function getMatchingRowIndices(
  table: TableData,
  referenceDate: Date = new Date()
): number[] {
  const filters = table.filters
  if (!filters || filters.length === 0) {
    return table.rows.map((_, idx) => idx)
  }

  const indices: number[] = []
  for (let r = 0; r < table.rows.length; r++) {
    const row = table.rows[r]
    let matchesAll = true
    for (const filter of filters) {
      if (filter.col < 0 || filter.col >= table.headers.length) continue
      const colType: ColumnType = table.columns?.[filter.col]?.type ?? 'text'
      if (!matchesFilter(row[filter.col] ?? '', filter, colType, referenceDate)) {
        matchesAll = false
        break
      }
    }
    if (matchesAll) {
      indices.push(r)
    }
  }
  return indices
}

export function buildPrefilledRowForFilters(
  table: TableData,
  preferredDateFormat = 'MMM do, yyyy',
  referenceDate: Date = new Date()
): string[] {
  const row = new Array<string>(table.headers.length).fill('')
  const filters = table.filters
  if (!filters || filters.length === 0) return row

  for (const filter of filters) {
    const col = filter.col
    if (col < 0 || col >= row.length) continue
    if (row[col] !== '') continue

    const schema = table.columns?.[col]
    const colType: ColumnType = schema?.type ?? 'text'

    if (colType === 'checkbox') {
      row[col] = formatCheckboxValue(filter.op === 'checked')
      continue
    }

    if (colType === 'select' && filter.op === 'is' && Array.isArray(filter.value)) {
      const first = filter.value.find((v) => v.trim().length > 0)
      if (first) {
        const opt = schema?.options?.find((o) => o.label.toLowerCase() === first.toLowerCase())
        row[col] = formatSelectCellValues([{ label: opt?.label ?? first, isPage: opt?.isPage }])
      }
      continue
    }

    if (colType === 'multi-select' && filter.op === 'contains' && Array.isArray(filter.value)) {
      const first = filter.value.find((v) => v.trim().length > 0)
      if (first) {
        const opt = schema?.options?.find((o) => o.label.toLowerCase() === first.toLowerCase())
        row[col] = formatSelectCellValues([{ label: opt?.label ?? first, isPage: opt?.isPage }])
      }
      continue
    }

    if (colType === 'date' && filter.op === 'is' && typeof filter.value === 'string') {
      const parsed = parsePlaintextDate(filter.value, referenceDate)
      if (parsed) {
        row[col] = formatJournalDateLink(parsed, preferredDateFormat)
      }
      continue
    }

    if (colType === 'text' && filter.op === 'is' && typeof filter.value === 'string') {
      const val = filter.value.trim()
      if (val) {
        row[col] = val
      }
      continue
    }

    if (colType === 'number' && filter.op === 'eq' && typeof filter.value === 'string') {
      const val = filter.value.trim()
      if (val && parseNumericCellValue(val) !== null) {
        row[col] = val
      }
    }
  }

  return row
}

/**
 * Evaluate whether a body row matches an ephemeral quick-search query across any visible cell.
 * Excludes checkbox syntax (`[x]`/`[ ]`) and raw image/link URLs inside text cells.
 */
export function matchesQuickSearch(
  row: string[],
  table: TableData,
  query: string,
  preferredDateFormat = 'MMM do, yyyy',
  referenceDate: Date = new Date()
): boolean {
  const needle = (query || '').trim().toLowerCase()
  if (!needle) return true

  for (let c = 0; c < table.headers.length; c++) {
    const raw = row[c] ?? ''
    if (!raw.trim()) continue
    const colType: ColumnType = table.columns?.[c]?.type ?? 'text'

    if (colType === 'checkbox') {
      continue
    }

    if (colType === 'select' || colType === 'multi-select') {
      const tokens = parseSelectCellValues(raw, colType === 'multi-select')
      if (
        tokens.some((v) => v.label.toLowerCase().includes(needle)) ||
        stripPageBrackets(raw).toLowerCase().includes(needle)
      ) {
        return true
      }
      continue
    }

    if (colType === 'url') {
      if (raw.toLowerCase().includes(needle)) return true
      const parsed = parseUrlCell(raw)
      if (
        parsed &&
        (parsed.href.toLowerCase().includes(needle) ||
          parsed.display.toLowerCase().includes(needle))
      ) {
        return true
      }
      continue
    }

    if (colType === 'number') {
      const lowerRaw = raw.toLowerCase()
      if (
        lowerRaw.includes(needle) ||
        lowerRaw.replace(/,/g, '').includes(needle)
      ) {
        return true
      }
      continue
    }

    if (colType === 'date' || isTimestampColumnType(colType)) {
      const lowerRaw = raw.toLowerCase()
      if (
        lowerRaw.includes(needle) ||
        stripPageBrackets(raw).toLowerCase().includes(needle)
      ) {
        return true
      }
      const parsed = isTimestampColumnType(colType)
        ? parseTimestamp(raw, referenceDate)
        : parsePlaintextDate(raw, referenceDate)
      if (parsed) {
        const formatted = isTimestampColumnType(colType)
          ? formatTimestamp(parsed, preferredDateFormat)
          : formatLogseqDate(parsed, preferredDateFormat)
        if (formatted.toLowerCase().includes(needle)) return true
      }
      continue
    }

    const searchable = extractSearchableText(raw)
    if (
      searchable.toLowerCase().includes(needle) ||
      stripPageBrackets(searchable).toLowerCase().includes(needle)
    ) {
      return true
    }
  }

  return false
}

/**
 * Compute visible body row indices after applying both persistent column filters
 * and an optional ephemeral quick-search query.
 */
export function getVisibleRowIndices(
  table: TableData,
  searchQuery = '',
  preferredDateFormat = 'MMM do, yyyy',
  referenceDate: Date = new Date()
): number[] {
  const matched = getMatchingRowIndices(table, referenceDate)
  if (!searchQuery || !searchQuery.trim()) return matched
  return matched.filter((idx) =>
    matchesQuickSearch(
      table.rows[idx] || [],
      table,
      searchQuery,
      preferredDateFormat,
      referenceDate
    )
  )
}
