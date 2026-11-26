import { formatLogseqDate, formatTimestamp, parsePlaintextDate, parseTimestamp } from './dateUtils'
import { isValuelessFilterOp, normalizeFilters, type TableFilter } from './tableFilters'

export type ColumnType =
  | 'text'
  | 'number'
  | 'date'
  | 'created-time'
  | 'edited-time'
  | 'select'
  | 'multi-select'
  | 'checkbox'
  | 'url'

export function isTimestampColumnType(type: ColumnType): boolean {
  return type === 'created-time' || type === 'edited-time'
}

export type ColumnCalculation =
  | 'none'
  | 'count_all'
  | 'count_unique'
  | 'count_empty'
  | 'count_not_empty'
  | 'percent_empty'
  | 'percent_not_empty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'checked'
  | 'unchecked'
  | 'percent_checked'
  | 'percent_unchecked'
  | 'earliest'
  | 'latest'
  | 'date_range'

export type OptionColor =
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

export interface SelectOption {
  id: string
  label: string
  isPage?: boolean
  color: OptionColor
}

export interface RowTimestampMeta {
  createdAt?: number
  editedAt?: number
}

export interface ColumnSchema {
  type: ColumnType
  options?: SelectOption[]
  calc?: ColumnCalculation
}

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  'created-time': 'Created time',
  'edited-time': 'Edited Time',
  select: 'Select',
  'multi-select': 'Multi-select',
  checkbox: 'Checkbox',
  url: 'URL',
}

export const CALCULATION_LABELS: Record<ColumnCalculation, string> = {
  none: 'None',
  count_all: 'Count',
  count_unique: 'Count unique',
  count_empty: 'Count empty',
  count_not_empty: 'Count not empty',
  percent_empty: 'Percent empty',
  percent_not_empty: 'Percent not empty',
  sum: 'Sum',
  average: 'Average',
  median: 'Median',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percent_checked: 'Percent checked',
  percent_unchecked: 'Percent unchecked',
  earliest: 'Earliest date',
  latest: 'Latest date',
  date_range: 'Date range',
}

export const CALCULATION_DISPLAY_LABELS: Record<ColumnCalculation, string> = {
  none: '',
  count_all: 'Count',
  count_unique: 'Unique',
  count_empty: 'Empty',
  count_not_empty: 'Not empty',
  percent_empty: 'Empty',
  percent_not_empty: 'Not Empty',
  sum: 'Sum',
  average: 'Avg',
  median: 'Med',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percent_checked: 'Percent checked',
  percent_unchecked: 'Percent unchecked',
  earliest: 'Earliest date',
  latest: 'Latest date',
  date_range: 'Date range',
}

const BASE_CALCS: ColumnCalculation[] = [
  'none',
  'count_all',
  'count_unique',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
]

const EXTRA_CALCS_BY_TYPE: Partial<Record<ColumnType, ColumnCalculation[]>> = {
  number: ['sum', 'average', 'median', 'min', 'max', 'range'],
  checkbox: ['checked', 'unchecked', 'percent_checked', 'percent_unchecked'],
  date: ['earliest', 'latest', 'date_range'],
  'created-time': ['earliest', 'latest', 'date_range'],
  'edited-time': ['earliest', 'latest', 'date_range'],
}

export function getCalculationsForColumnType(
  type: ColumnType
): Array<{ calc: ColumnCalculation; label: string }> {
  const extras = EXTRA_CALCS_BY_TYPE[type] || []
  const list = [...BASE_CALCS, ...extras]
  return list.map((calc) => ({ calc, label: CALCULATION_LABELS[calc] }))
}

export function isValidCalculationForType(
  calc: string | undefined,
  type: ColumnType
): calc is ColumnCalculation {
  if (!calc) return false
  const allowed = getCalculationsForColumnType(type)
  return allowed.some((item) => item.calc === calc)
}

export const OPTION_COLORS: OptionColor[] = [
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'yellow',
  'red',
  'brown',
  'gray',
]

export const DEFAULT_COLUMN_SCHEMA: ColumnSchema = { type: 'text' }

const VALID_COLUMN_TYPES = new Set<ColumnType>([
  'text',
  'number',
  'date',
  'created-time',
  'edited-time',
  'select',
  'multi-select',
  'checkbox',
  'url',
])

const VALID_OPTION_COLORS = new Set<OptionColor>(OPTION_COLORS)

const SCHEMA_COMMENT_RE = /^\s*<!--\s*nt-schema:\s*(\{.*\})\s*-->\s*$/

export function pickNextOptionColor(existing: SelectOption[]): OptionColor {
  return OPTION_COLORS[existing.length % OPTION_COLORS.length]
}

export function cloneColumnSchema(col?: ColumnSchema): ColumnSchema {
  if (!col) return { type: 'text' }
  return {
    type: col.type,
    ...(col.options ? { options: col.options.map((o) => ({ ...o })) } : {}),
    ...(col.calc && col.calc !== 'none' ? { calc: col.calc } : {}),
  }
}

export function normalizeColumns(
  columns: ColumnSchema[] | undefined,
  colCount: number
): ColumnSchema[] {
  const out: ColumnSchema[] = []
  for (let i = 0; i < colCount; i++) {
    const raw = columns?.[i]
    if (!raw || !VALID_COLUMN_TYPES.has(raw.type)) {
      out.push({ type: 'text' })
      continue
    }
    const normOpts = Array.isArray(raw.options)
      ? raw.options
          .filter((o) => o && typeof o.label === 'string' && o.label.trim().length > 0)
          .map((o, idx) => ({
            id: typeof o.id === 'string' && o.id ? o.id : `opt_${i}_${idx}`,
            label: o.label.trim(),
            isPage: o.isPage ? true : undefined,
            color: VALID_OPTION_COLORS.has(o.color) ? o.color : OPTION_COLORS[idx % OPTION_COLORS.length],
          }))
      : undefined
    const normCalc =
      typeof raw.calc === 'string' &&
      raw.calc !== 'none' &&
      isValidCalculationForType(raw.calc, raw.type)
        ? raw.calc
        : undefined
    out.push({
      type: raw.type,
      ...(normOpts && normOpts.length > 0 ? { options: normOpts } : {}),
      ...(normCalc ? { calc: normCalc } : {}),
    })
  }
  return out
}

export function hasNonDefaultSchema(columns?: ColumnSchema[]): boolean {
  if (!columns || columns.length === 0) return false
  return columns.some(
    (c) =>
      c.type !== 'text' ||
      (c.options && c.options.length > 0) ||
      Boolean(c.calc && c.calc !== 'none')
  )
}

export function hasRowTimestampMeta(rowMeta?: RowTimestampMeta[]): boolean {
  if (!rowMeta || rowMeta.length === 0) return false
  return rowMeta.some((m) => Boolean(m && (m.createdAt !== undefined || m.editedAt !== undefined)))
}

export interface ParsedTableSchema {
  columns?: ColumnSchema[]
  filters?: TableFilter[]
  locked?: boolean
  showCalc?: boolean
  rowMeta?: RowTimestampMeta[]
}

type SerializedRowTimestamp = [number | null] | [number | null, number] | null

export function serializeSchemaComment(
  columns?: ColumnSchema[],
  filters?: TableFilter[],
  locked?: boolean,
  rowMeta?: RowTimestampMeta[],
  showCalc?: boolean
): string | null {
  const hasCols = hasNonDefaultSchema(columns)
  const hasFilters = Boolean(filters && filters.length > 0)
  const isLocked = Boolean(locked)
  const hasRt = hasRowTimestampMeta(rowMeta)
  const hasShowCalc = typeof showCalc === 'boolean'
  if (!hasCols && !hasFilters && !isLocked && !hasRt && !hasShowCalc) return null

  const payload: {
    v: number
    columns?: Array<{ type: ColumnType; options?: SelectOption[]; calc?: ColumnCalculation }>
    filters?: TableFilter[]
    locked?: boolean
    showCalc?: boolean
    rt?: SerializedRowTimestamp[]
  } = { v: 1 }

  if (isLocked) {
    payload.locked = true
  }

  if (hasShowCalc) {
    payload.showCalc = showCalc
  }

  if (hasCols && columns) {
    payload.columns = columns.map((c) => {
      const entry: { type: ColumnType; options?: SelectOption[]; calc?: ColumnCalculation } = {
        type: c.type,
      }
      if (c.options && c.options.length > 0) {
        entry.options = c.options.map((o) => {
          const clean: SelectOption = { id: o.id, label: o.label, color: o.color }
          if (o.isPage) clean.isPage = true
          return clean
        })
      }
      if (c.calc && c.calc !== 'none') {
        entry.calc = c.calc
      }
      return entry
    })
  }

  if (hasFilters && filters) {
    payload.filters = filters.map((f) => {
      const clean: TableFilter = { id: f.id, col: f.col, op: f.op }
      if (!isValuelessFilterOp(f.op) && f.value !== undefined) {
        clean.value = Array.isArray(f.value) ? [...f.value] : f.value
      }
      return clean
    })
  }

  if (hasRt && rowMeta) {
    payload.rt = rowMeta.map((m): SerializedRowTimestamp => {
      const c =
        typeof m?.createdAt === 'number' && Number.isFinite(m.createdAt)
          ? Math.floor(m.createdAt / 1000)
          : null
      const e =
        typeof m?.editedAt === 'number' && Number.isFinite(m.editedAt)
          ? Math.floor(m.editedAt / 1000)
          : null
      if (c === null && e === null) return null
      if (e === null) return [c]
      return [c, e]
    })
  }

  return `<!-- nt-schema: ${JSON.stringify(payload)} -->`
}

function parseRowTimestampList(raw: unknown): RowTimestampMeta[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const out: RowTimestampMeta[] = raw.map((entry) => {
    if (!Array.isArray(entry)) return {}
    const rawC = entry[0]
    const rawE = entry[1]
    const createdAt =
      typeof rawC === 'number' && Number.isFinite(rawC) && rawC >= 0
        ? Math.floor(rawC) * 1000
        : undefined
    const editedAt =
      typeof rawE === 'number' && Number.isFinite(rawE) && rawE >= 0
        ? Math.floor(rawE) * 1000
        : undefined
    return {
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(editedAt !== undefined ? { editedAt } : {}),
    }
  })
  return hasRowTimestampMeta(out) ? out : undefined
}

export function parseTableSchemaComment(line: string): ParsedTableSchema | null {
  const match = (line || '').match(SCHEMA_COMMENT_RE)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as {
      v?: number
      columns?: ColumnSchema[]
      filters?: unknown[]
      locked?: unknown
      showCalc?: unknown
      rt?: unknown
    }
    if (!parsed || typeof parsed !== 'object') return null
    const hasColsArr = Array.isArray(parsed.columns)
    const hasFiltersArr = Array.isArray(parsed.filters)
    const hasLockedFlag = typeof parsed.locked === 'boolean'
    const hasShowCalcFlag = typeof parsed.showCalc === 'boolean'
    const hasRtArr = Array.isArray(parsed.rt)
    if (!hasColsArr && !hasFiltersArr && !hasLockedFlag && !hasShowCalcFlag && !hasRtArr) return null

    const columns = hasColsArr
      ? normalizeColumns(parsed.columns, parsed.columns!.length)
      : undefined

    let filters: TableFilter[] | undefined
    if (hasFiltersArr && parsed.filters!.length > 0) {
      let maxFilterCol = 0
      for (const item of parsed.filters!) {
        const colNum = (item as { col?: unknown } | null)?.col
        if (typeof colNum === 'number' && Number.isInteger(colNum) && colNum > maxFilterCol) {
          maxFilterCol = colNum
        }
      }
      const inferredColCount = columns ? columns.length : maxFilterCol + 1
      const norm = normalizeFilters(parsed.filters, inferredColCount, columns)
      if (norm.length > 0) {
        filters = norm
      }
    }

    const locked = parsed.locked === true ? true : undefined
    const showCalc = typeof parsed.showCalc === 'boolean' ? parsed.showCalc : undefined
    const rowMeta = parseRowTimestampList(parsed.rt)
    if (!columns && !filters && !locked && typeof showCalc !== 'boolean' && !rowMeta) return null
    return {
      ...(columns ? { columns } : {}),
      ...(filters ? { filters } : {}),
      ...(locked ? { locked: true } : {}),
      ...(typeof showCalc === 'boolean' ? { showCalc } : {}),
      ...(rowMeta ? { rowMeta } : {}),
    }
  } catch {
    return null
  }
}

export function parseSchemaComment(line: string): ColumnSchema[] | null {
  return parseTableSchemaComment(line)?.columns ?? null
}

export interface ParsedSelectValue {
  label: string
  isPage: boolean
  raw: string
}

/**
 * Split select / multi-select cell values by commas OUTSIDE of `[[...]]` brackets,
 * so page names containing commas (e.g. `[[Nov 25th, 2026]]`) remain intact.
 */
export function parseSelectCellValues(raw: string, multi: boolean): ParsedSelectValue[] {
  const trimmed = (raw || '').trim()
  if (!trimmed) return []

  const tokens: string[] = []
  if (!multi) {
    tokens.push(trimmed)
  } else {
    let current = ''
    let bracketDepth = 0
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '[' && trimmed[i + 1] === '[') {
        bracketDepth++
        current += '[['
        i++
        continue
      }
      if (trimmed[i] === ']' && trimmed[i + 1] === ']' && bracketDepth > 0) {
        bracketDepth--
        current += ']]'
        i++
        continue
      }
      if (trimmed[i] === ',' && bracketDepth === 0) {
        const t = current.trim()
        if (t) tokens.push(t)
        current = ''
        continue
      }
      current += trimmed[i]
    }
    const tail = current.trim()
    if (tail) tokens.push(tail)
  }

  return tokens.map((tok) => {
    const pageMatch = tok.match(/^\[\[(.+)\]\]$/)
    if (pageMatch) {
      return { label: pageMatch[1].trim(), isPage: true, raw: tok }
    }
    return { label: tok, isPage: false, raw: tok }
  })
}

export function formatSelectCellValues(
  values: Array<{ label: string; isPage?: boolean }>
): string {
  return values
    .map((v) => {
      const label = v.label.trim()
      if (!label) return ''
      return v.isPage ? `[[${label}]]` : label
    })
    .filter(Boolean)
    .join(', ')
}

export function harvestOptionsFromColumn(
  rows: string[][],
  colIdx: number,
  multi: boolean,
  existing: SelectOption[] = []
): SelectOption[] {
  const result = existing.map((o) => ({ ...o }))
  const byLower = new Map<string, SelectOption>()
  for (const opt of result) {
    byLower.set(opt.label.toLowerCase(), opt)
  }

  for (const row of rows) {
    const cell = row[colIdx] ?? ''
    const parsed = parseSelectCellValues(cell, multi)
    for (const item of parsed) {
      const key = item.label.toLowerCase()
      const found = byLower.get(key)
      if (found) {
        if (item.isPage) found.isPage = true
      } else {
        const nextOpt: SelectOption = {
          id: `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          label: item.label,
          isPage: item.isPage ? true : undefined,
          color: pickNextOptionColor(result),
        }
        result.push(nextOpt)
        byLower.set(key, nextOpt)
      }
    }
  }

  return result
}

export function isCheckboxChecked(raw: string): boolean {
  const trimmed = (raw || '').trim().toLowerCase()
  return (
    trimmed.startsWith('[x]') ||
    trimmed === 'x' ||
    trimmed === 'true' ||
    trimmed === 'yes' ||
    trimmed === '✓' ||
    trimmed === '✅'
  )
}

export function formatCheckboxValue(checked: boolean): string {
  return checked ? '[x]' : '[ ]'
}

export interface ParsedUrlCell {
  href: string
  display: string
}

const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const DOMAIN_LIKE_RE =
  /^(?:localhost(?::\d+)?|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})(?::\d+)?(?:[/?#][^\s]*)?$/

export function parseUrlCell(raw: string): ParsedUrlCell | null {
  const trimmed = (raw || '').trim()
  if (!trimmed) return null

  // Markdown link: [Label](url)
  const mdMatch = trimmed.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
  if (mdMatch) {
    const label = mdMatch[1].trim()
    const target = normalizeHref(mdMatch[2].trim())
    if (!target) return null
    return { href: target, display: label || mdMatch[2].trim() }
  }

  const href = normalizeHref(trimmed)
  if (!href) return null
  return { href, display: trimmed }
}

function normalizeHref(candidate: string): string | null {
  if (!candidate) return null
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
    try {
      const parsed = new URL(candidate)
      return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
    } catch {
      return null
    }
  }
  if (DOMAIN_LIKE_RE.test(candidate)) {
    try {
      const parsed = new URL(`https://${candidate}`)
      return parsed.href
    } catch {
      return null
    }
  }
  return null
}

export interface ParsedNumericValue {
  value: number
  prefix?: string
  suffix?: string
}

const CURRENCY_PREFIX_RE = /^([$€£¥₹₿])/
const CURRENCY_SUFFIX_RE = /([$€£¥₹%])$/
const VALID_NUM_BODY_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$|^\.\d+$/

export function parseNumericCellValue(raw: string): ParsedNumericValue | null {
  let s = (raw || '').trim()
  if (!s) return null

  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  let signFound = false
  if (s.startsWith('-')) {
    negative = !negative
    signFound = true
    s = s.slice(1).trim()
  } else if (s.startsWith('+')) {
    signFound = true
    s = s.slice(1).trim()
  }

  let prefix: string | undefined
  const prefMatch = s.match(CURRENCY_PREFIX_RE)
  if (prefMatch) {
    prefix = prefMatch[1]
    s = s.slice(prefix.length).trim()
  }

  if (!signFound) {
    if (s.startsWith('-')) {
      negative = !negative
      s = s.slice(1).trim()
    } else if (s.startsWith('+')) {
      s = s.slice(1).trim()
    }
  }

  let suffix: string | undefined
  const sufMatch = s.match(CURRENCY_SUFFIX_RE)
  if (sufMatch) {
    suffix = sufMatch[1]
    s = s.slice(0, -suffix.length).trim()
  }

  if (!s || !VALID_NUM_BODY_RE.test(s)) return null
  const num = Number(s.replace(/,/g, ''))
  if (!Number.isFinite(num)) return null
  const value = negative && num !== 0 ? -num : num
  return {
    value,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  }
}

function formatComputedNumber(val: number, prefix?: string, suffix?: string): string {
  const rounded = Math.round(val * 10000) / 10000
  const absFormatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: prefix && !suffix ? 2 : 4,
    minimumFractionDigits: prefix && !suffix && rounded % 1 !== 0 ? 2 : 0,
  }).format(Math.abs(rounded))
  const sign = rounded < 0 ? '-' : ''
  return `${sign}${prefix ?? ''}${absFormatted}${suffix ?? ''}`
}

function formatPercent(count: number, total: number): string {
  if (total <= 0) return '0%'
  const pct = (count / total) * 100
  const rounded = Math.round(pct * 10) / 10
  return `${rounded}%`
}

function isCellEmptyForCalc(raw: string, colType: ColumnType): boolean {
  if (colType === 'select' || colType === 'multi-select') {
    return parseSelectCellValues(raw, colType === 'multi-select').length === 0
  }
  return (raw || '').trim().length === 0
}

export function computeColumnCalculation(
  rows: string[][],
  colIdx: number,
  schema: ColumnSchema,
  calc: ColumnCalculation,
  dateFormat = 'MMM do, yyyy',
  referenceDate: Date = new Date()
): { label: string; value: string } {
  const label = CALCULATION_DISPLAY_LABELS[calc] || ''
  if (calc === 'none') return { label: '', value: '' }

  const colType = schema.type
  const total = rows.length
  const cells = rows.map((r) => r[colIdx] ?? '')

  if (calc === 'count_all') {
    return { label, value: String(total) }
  }

  if (calc === 'count_empty') {
    const emptyCount = cells.filter((c) => isCellEmptyForCalc(c, colType)).length
    return { label, value: String(emptyCount) }
  }

  if (calc === 'count_not_empty') {
    const nonEmpty = cells.filter((c) => !isCellEmptyForCalc(c, colType)).length
    return { label, value: String(nonEmpty) }
  }

  if (calc === 'percent_empty') {
    const emptyCount = cells.filter((c) => isCellEmptyForCalc(c, colType)).length
    return { label, value: formatPercent(emptyCount, total) }
  }

  if (calc === 'percent_not_empty') {
    const nonEmpty = cells.filter((c) => !isCellEmptyForCalc(c, colType)).length
    return { label, value: formatPercent(nonEmpty, total) }
  }

  if (calc === 'count_unique') {
    const uniq = new Set<string>()
    if (colType === 'select' || colType === 'multi-select') {
      const multi = colType === 'multi-select'
      for (const c of cells) {
        for (const item of parseSelectCellValues(c, multi)) {
          uniq.add(item.label.toLowerCase())
        }
      }
    } else if (colType === 'number') {
      for (const c of cells) {
        const parsed = parseNumericCellValue(c)
        if (parsed) {
          uniq.add(`num:${parsed.value}`)
        } else if (c.trim()) {
          uniq.add(`raw:${c.trim().toLowerCase()}`)
        }
      }
    } else if (colType === 'date') {
      for (const c of cells) {
        const d = parsePlaintextDate(c, referenceDate)
        if (d) {
          uniq.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
        } else if (c.trim()) {
          uniq.add(c.trim().toLowerCase())
        }
      }
    } else if (isTimestampColumnType(colType)) {
      for (const c of cells) {
        const d = parseTimestamp(c, referenceDate)
        if (d) {
          uniq.add(String(d.getTime()))
        } else if (c.trim()) {
          uniq.add(c.trim().toLowerCase())
        }
      }
    } else if (colType === 'checkbox') {
      for (const c of cells) {
        uniq.add(isCheckboxChecked(c) ? 'checked' : 'unchecked')
      }
    } else {
      for (const c of cells) {
        const trimmed = c.trim()
        if (trimmed) uniq.add(trimmed.toLowerCase())
      }
    }
    return { label, value: String(uniq.size) }
  }

  if (
    calc === 'checked' ||
    calc === 'unchecked' ||
    calc === 'percent_checked' ||
    calc === 'percent_unchecked'
  ) {
    const checkedCount = cells.filter((c) => isCheckboxChecked(c)).length
    const uncheckedCount = total - checkedCount
    if (calc === 'checked') return { label, value: String(checkedCount) }
    if (calc === 'unchecked') return { label, value: String(uncheckedCount) }
    if (calc === 'percent_checked') return { label, value: formatPercent(checkedCount, total) }
    return { label, value: formatPercent(uncheckedCount, total) }
  }

  if (calc === 'earliest' || calc === 'latest' || calc === 'date_range') {
    const isTs = isTimestampColumnType(colType)
    const dates = cells
      .map((c) => (isTs ? parseTimestamp(c, referenceDate) : parsePlaintextDate(c, referenceDate)))
      .filter((d): d is Date => d !== null)
    if (dates.length === 0) return { label, value: '—' }

    const toLocalMidnightMs = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    dates.sort((a, b) => (isTs ? a.getTime() - b.getTime() : toLocalMidnightMs(a) - toLocalMidnightMs(b)))
    const first = dates[0]
    const last = dates[dates.length - 1]
    if (calc === 'earliest') {
      return { label, value: isTs ? formatTimestamp(first, dateFormat) : formatLogseqDate(first, dateFormat) }
    }
    if (calc === 'latest') {
      return { label, value: isTs ? formatTimestamp(last, dateFormat) : formatLogseqDate(last, dateFormat) }
    }
    const days = Math.round((toLocalMidnightMs(last) - toLocalMidnightMs(first)) / 86400000)
    return { label, value: `${days} ${days === 1 ? 'day' : 'days'}` }
  }

  // Numeric calculations: sum, average, median, min, max, range
  const parsedNums = cells
    .map(parseNumericCellValue)
    .filter((p): p is ParsedNumericValue => p !== null)

  let commonPrefix: string | undefined
  let commonSuffix: string | undefined
  if (parsedNums.length > 0) {
    const firstPrefix = parsedNums[0].prefix
    if (firstPrefix && parsedNums.every((p) => p.prefix === firstPrefix)) {
      commonPrefix = firstPrefix
    }
    const firstSuffix = parsedNums[0].suffix
    if (firstSuffix && parsedNums.every((p) => p.suffix === firstSuffix)) {
      commonSuffix = firstSuffix
    }
  }

  if (calc === 'sum') {
    const totalSum = parsedNums.reduce((acc, p) => acc + p.value, 0)
    return { label, value: formatComputedNumber(totalSum, commonPrefix, commonSuffix) }
  }

  if (parsedNums.length === 0) {
    return { label, value: '—' }
  }

  const values = parsedNums.map((p) => p.value).sort((a, b) => a - b)
  if (calc === 'min') {
    return { label, value: formatComputedNumber(values[0], commonPrefix, commonSuffix) }
  }
  if (calc === 'max') {
    return { label, value: formatComputedNumber(values[values.length - 1], commonPrefix, commonSuffix) }
  }
  if (calc === 'range') {
    return {
      label,
      value: formatComputedNumber(values[values.length - 1] - values[0], commonPrefix, commonSuffix),
    }
  }
  if (calc === 'average') {
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return { label, value: formatComputedNumber(avg, commonPrefix, commonSuffix) }
  }
  if (calc === 'median') {
    const mid = Math.floor(values.length / 2)
    const med = values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2
    return { label, value: formatComputedNumber(med, commonPrefix, commonSuffix) }
  }

  return { label, value: '—' }
}
