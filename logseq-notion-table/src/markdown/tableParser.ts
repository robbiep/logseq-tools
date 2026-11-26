import {
  hasNonDefaultSchema,
  hasRowTimestampMeta,
  normalizeColumns,
  parseTableSchemaComment,
  serializeSchemaComment,
  type ColumnSchema,
  type RowTimestampMeta,
} from './columnTypes'
import { normalizeFilters, type TableFilter } from './tableFilters'

export type Alignment = 'left' | 'center' | 'right' | null

export type { RowTimestampMeta }

export interface TableData {
  headers: string[]
  alignments: Alignment[]
  rows: string[][]
  columns?: ColumnSchema[]
  filters?: TableFilter[]
  locked?: boolean
  showCalc?: boolean
  rowMeta?: RowTimestampMeta[]
}

export type BlockSegment =
  | { type: 'text'; raw: string }
  | { type: 'table'; table: TableData; raw: string }

const DELIM_CELL_RE = /^:?-{1,}:?$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

/**
 * Decode cell escapes and line breaks from raw GFM table cell text into
 * editable plain text.
 */
function decodeCellText(rawCell: string): string {
  return rawCell
    .trim()
    .replace(/\\\|/g, '|')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\[:br\]/g, '\n')
}

/**
 * Encode editable cell text back into safe single-line GFM table cell content.
 * Escapes unescaped pipes outside inline code spans and converts newlines to <br>.
 */
function encodeCellText(cell: string): string {
  const singleLine = cell.replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
  let out = ''
  let i = 0
  let inCodeFenceLen = 0

  while (i < singleLine.length) {
    const ch = singleLine[i]

    if (ch === '`') {
      let run = 0
      while (i + run < singleLine.length && singleLine[i + run] === '`') {
        run++
      }
      if (inCodeFenceLen === 0) {
        inCodeFenceLen = run
      } else if (inCodeFenceLen === run) {
        inCodeFenceLen = 0
      }
      out += singleLine.slice(i, i + run)
      i += run
      continue
    }

    if (ch === '|' && inCodeFenceLen === 0) {
      // Count preceding consecutive backslashes to avoid double-escaping \|
      let backslashes = 0
      for (let j = out.length - 1; j >= 0 && out[j] === '\\'; j--) {
        backslashes++
      }
      if (backslashes % 2 === 0) {
        out += '\\|'
      } else {
        out += '|'
      }
      i++
      continue
    }

    out += ch
    i++
  }

  return out
}

/**
 * Split a raw GFM table row into decoded cell strings, respecting \| escapes
 * and inline code spans (`...`).
 */
export function splitRowCells(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []

  const rawSegments: string[] = []
  let current = ''
  let i = 0
  let inCodeFenceLen = 0
  let hasLeadingPipe = false
  let hasTrailingPipe = false

  // Detect leading pipe
  let start = 0
  if (trimmed[0] === '|') {
    hasLeadingPipe = true
    start = 1
  }

  i = start
  while (i < trimmed.length) {
    const ch = trimmed[i]

    if (ch === '`') {
      let run = 0
      while (i + run < trimmed.length && trimmed[i + run] === '`') {
        run++
      }
      if (inCodeFenceLen === 0) {
        inCodeFenceLen = run
      } else if (inCodeFenceLen === run) {
        inCodeFenceLen = 0
      }
      current += trimmed.slice(i, i + run)
      i += run
      continue
    }

    if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '\\|'
      i += 2
      continue
    }

    if (ch === '|' && inCodeFenceLen === 0) {
      if (i === trimmed.length - 1) {
        hasTrailingPipe = true
        break
      }
      rawSegments.push(current)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  if (!hasTrailingPipe) {
    rawSegments.push(current)
  } else if (current.length > 0 || !hasLeadingPipe || rawSegments.length === 0) {
    // Trailing pipe closes the last cell stored in `current`
    rawSegments.push(current)
  }

  return rawSegments.map(decodeCellText)
}

function splitRawDelimiterCells(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes('|')) return null

  let inner = trimmed
  if (inner.startsWith('|')) inner = inner.slice(1)
  if (inner.endsWith('|')) inner = inner.slice(0, -1)

  const parts = inner.split('|').map((p) => p.trim())
  if (parts.length === 0) return null
  if (!parts.every((p) => DELIM_CELL_RE.test(p))) return null
  return parts
}

/**
 * Check whether a line is a valid GFM table delimiter row (e.g. | :--- | ---: |).
 */
export function isDelimiterRow(line: string): boolean {
  return splitRawDelimiterCells(line) !== null
}

/**
 * Parse alignment specifications from a valid GFM delimiter row.
 */
export function parseAlignments(line: string): Alignment[] {
  const parts = splitRawDelimiterCells(line)
  if (!parts) return []
  return parts.map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (left) return 'left'
    if (right) return 'right'
    return null
  })
}

function isTableHeaderPair(headerLine: string, delimLine: string): boolean {
  if (!headerLine || !delimLine) return false
  if (!headerLine.includes('|')) return false
  const alignments = parseAlignments(delimLine)
  if (alignments.length === 0) return false
  const headerCells = splitRowCells(headerLine)
  return headerCells.length === alignments.length
}

/**
 * Fast synchronous check for whether block content contains at least one GFM table
 * outside of fenced code blocks.
 */
export function looksLikeMarkdownTable(content: string): boolean {
  if (!content || typeof content !== 'string') return false
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let activeFence: { char: string; len: number } | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!activeFence) {
        activeFence = { char: marker[0], len: marker.length }
      } else if (marker[0] === activeFence.char && marker.length >= activeFence.len && line.trim() === marker) {
        activeFence = null
      }
      continue
    }
    if (activeFence) continue

    if (i + 1 < lines.length && isTableHeaderPair(line, lines[i + 1])) {
      return true
    }
  }
  return false
}

function normalizeTableColumns(
  headers: string[],
  alignments: Alignment[],
  rows: string[][],
  columns?: ColumnSchema[],
  filters?: TableFilter[],
  locked?: boolean,
  rowMeta?: RowTimestampMeta[],
  showCalc?: boolean
): TableData {
  let maxCols = Math.max(1, headers.length, alignments.length)
  for (const row of rows) {
    if (row.length > maxCols) maxCols = row.length
  }

  const normHeaders = headers.slice(0, maxCols)
  while (normHeaders.length < maxCols) normHeaders.push('')

  const normAlignments = alignments.slice(0, maxCols)
  while (normAlignments.length < maxCols) normAlignments.push(null)

  const normRows = rows.map((row) => {
    const copy = row.slice(0, maxCols)
    while (copy.length < maxCols) copy.push('')
    return copy
  })

  const normCols = columns && hasNonDefaultSchema(columns)
    ? normalizeColumns(columns, maxCols)
    : undefined

  const normFilters =
    filters && filters.length > 0 ? normalizeFilters(filters, maxCols, normCols) : undefined

  const normRowMeta = hasRowTimestampMeta(rowMeta)
    ? normRows.map((_, i) => {
        const m = rowMeta?.[i]
        return m
          ? {
              ...(m.createdAt !== undefined ? { createdAt: m.createdAt } : {}),
              ...(m.editedAt !== undefined ? { editedAt: m.editedAt } : {}),
            }
          : {}
      })
    : undefined

  const hasAnyCalc = Boolean(normCols?.some((c) => Boolean(c.calc && c.calc !== 'none')))
  const normShowCalc =
    showCalc === true ? (hasAnyCalc ? undefined : true) : showCalc === false ? (hasAnyCalc ? false : undefined) : undefined

  return {
    headers: normHeaders,
    alignments: normAlignments,
    rows: normRows,
    ...(normCols ? { columns: normCols } : {}),
    ...(normFilters && normFilters.length > 0 ? { filters: normFilters } : {}),
    ...(locked ? { locked: true } : {}),
    ...(typeof normShowCalc === 'boolean' ? { showCalc: normShowCalc } : {}),
    ...(normRowMeta ? { rowMeta: normRowMeta } : {}),
  }
}

/**
 * Parse block markdown content into an ordered sequence of text and table segments,
 * preserving surrounding properties, text, and multiple tables per block while
 * ignoring tables inside fenced code blocks.
 */
export function parseBlockSegments(content: string): BlockSegment[] {
  const normalized = (content || '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const segments: BlockSegment[] = []
  let textBuffer: string[] = []
  let activeFence: { char: string; len: number } | null = null

  const flushText = () => {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', raw: textBuffer.join('\n') })
      textBuffer = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = line.match(FENCE_RE)
    if (fenceMatch) {
      const marker = fenceMatch[1]
      if (!activeFence) {
        activeFence = { char: marker[0], len: marker.length }
      } else if (marker[0] === activeFence.char && marker.length >= activeFence.len && line.trim() === marker) {
        activeFence = null
      }
      textBuffer.push(line)
      i++
      continue
    }

    if (!activeFence && i + 1 < lines.length && isTableHeaderPair(line, lines[i + 1])) {
      flushText()
      const start = i
      const headers = splitRowCells(line)
      const alignments = parseAlignments(lines[i + 1])
      const rows: string[][] = []
      i += 2

      while (i < lines.length) {
        const bodyLine = lines[i]
        const trimmed = bodyLine.trim()
        if (!trimmed || !trimmed.includes('|')) break
        if (FENCE_RE.test(bodyLine)) break
        rows.push(splitRowCells(bodyLine))
        i++
      }

      let parsedColumns: ColumnSchema[] | undefined
      let parsedFilters: TableFilter[] | undefined
      let parsedLocked: boolean | undefined
      let parsedShowCalc: boolean | undefined
      let parsedRowMeta: RowTimestampMeta[] | undefined
      if (i < lines.length) {
        const parsedSchema = parseTableSchemaComment(lines[i])
        if (parsedSchema) {
          parsedColumns = parsedSchema.columns
          parsedFilters = parsedSchema.filters
          parsedLocked = parsedSchema.locked
          parsedShowCalc = parsedSchema.showCalc
          parsedRowMeta = parsedSchema.rowMeta
          i++
        }
      }

      const raw = lines.slice(start, i).join('\n')
      segments.push({
        type: 'table',
        table: normalizeTableColumns(
          headers,
          alignments,
          rows,
          parsedColumns,
          parsedFilters,
          parsedLocked,
          parsedRowMeta,
          parsedShowCalc
        ),
        raw,
      })
      continue
    }

    textBuffer.push(line)
    i++
  }

  flushText()
  return segments
}

function formatDelimiterCell(alignment: Alignment, width: number): string {
  const minDash = Math.max(3, width)
  if (alignment === 'center') {
    const dashes = Math.max(1, minDash - 2)
    return `:${'-'.repeat(dashes)}:`
  }
  if (alignment === 'left') {
    const dashes = Math.max(2, minDash - 1)
    return `:${'-'.repeat(dashes)}`
  }
  if (alignment === 'right') {
    const dashes = Math.max(2, minDash - 1)
    return `${'-'.repeat(dashes)}:`
  }
  return '-'.repeat(minDash)
}

/**
 * Serialize a TableData structure into clean, aligned GFM Markdown.
 */
export function serializeTable(table: TableData): string {
  const norm = normalizeTableColumns(
    table.headers,
    table.alignments,
    table.rows,
    table.columns,
    table.filters,
    table.locked,
    table.rowMeta,
    table.showCalc
  )
  const colCount = norm.headers.length
  const encodedHeaders = norm.headers.map(encodeCellText)
  const encodedRows = norm.rows.map((r) => r.map(encodeCellText))

  const widths = new Array<number>(colCount).fill(3)
  for (let c = 0; c < colCount; c++) {
    widths[c] = Math.max(widths[c], encodedHeaders[c].length)
    for (const row of encodedRows) {
      widths[c] = Math.max(widths[c], (row[c] ?? '').length)
    }
  }

  const formatRow = (cells: string[]): string =>
    `| ${cells.map((cell, c) => cell.padEnd(widths[c], ' ')).join(' | ')} |`

  const delimCells = norm.alignments.map((align, c) => formatDelimiterCell(align, widths[c]))
  const delimRow = `| ${delimCells.join(' | ')} |`

  const lines = [formatRow(encodedHeaders), delimRow, ...encodedRows.map(formatRow)]
  const schemaComment = serializeSchemaComment(
    norm.columns,
    norm.filters,
    norm.locked,
    norm.rowMeta,
    norm.showCalc
  )
  if (schemaComment) {
    lines.push(schemaComment)
  }
  return lines.join('\n')
}

/**
 * Reconstruct full block markdown content from segments.
 */
export function serializeBlockSegments(segments: BlockSegment[]): string {
  return segments
    .map((seg) => (seg.type === 'table' ? serializeTable(seg.table) : seg.raw))
    .join('\n')
}

/**
 * Create a new empty GFM table with the given total column and row counts
 * (where `totalRows` includes the header row; at least 1 data row is created).
 */
export function createEmptyTable(
  cols: number,
  totalRows: number,
  now: Date = new Date()
): TableData {
  const safeCols = Math.max(1, Math.floor(cols))
  const bodyRowsCount = Math.max(1, Math.floor(totalRows) - 1)
  const createdAt = Math.floor(now.getTime() / 1000) * 1000

  const headers = Array.from({ length: safeCols }, (_, i) => `Column ${i + 1}`)
  const alignments: Alignment[] = new Array<Alignment>(safeCols).fill(null)
  const rows = Array.from({ length: bodyRowsCount }, () => new Array<string>(safeCols).fill(''))
  const rowMeta: RowTimestampMeta[] = Array.from({ length: bodyRowsCount }, () => ({ createdAt }))

  return { headers, alignments, rows, rowMeta }
}
