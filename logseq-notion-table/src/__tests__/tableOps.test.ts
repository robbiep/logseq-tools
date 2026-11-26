import { describe, expect, it } from 'vitest'
import {
  applyGridPaste,
  applyTsvPaste,
  clearCellRange,
  clearColumn,
  clearRow,
  deleteColumn,
  deleteRow,
  deleteRows,
  duplicateColumn,
  duplicateRow,
  insertColumn,
  insertRow,
  moveColumn,
  moveRow,
  parseClipboardGrid,
  parseHtmlTableGrid,
  parseMarkdownTableGrid,
  parseTsvGrid,
  serializeSelectionAsMarkdown,
  setColumnAlignment,
  sortByColumn,
  tableToCsv,
  updateCell,
} from '../markdown/tableOps'
import type { TableData } from '../markdown/tableParser'

const baseTable = (): TableData => ({
  headers: ['Name', 'Score'],
  alignments: [null, null],
  rows: [
    ['Alice', '10'],
    ['Bob', '2'],
    ['Charlie', ''],
  ],
})

describe('tableOps', () => {
  it('updates header and body cells immutably', () => {
    const t = baseTable()
    const t1 = updateCell(t, 0, 0, 'Person')
    const t2 = updateCell(t1, 2, 1, '20')
    expect(t.headers[0]).toBe('Name')
    expect(t1.headers[0]).toBe('Person')
    expect(t2.rows[1][1]).toBe('20')
  })

  it('inserts, duplicates, moves, clears, and deletes rows with last-row protection', () => {
    const t = baseTable()
    expect(insertRow(t, 0).rows).toHaveLength(4)
    expect(duplicateRow(t, 1).rows[1]).toEqual(['Alice', '10'])
    expect(moveRow(t, 0, 2).rows.map((r) => r[0])).toEqual(['Bob', 'Charlie', 'Alice'])
    expect(clearRow(t, 1).rows[0]).toEqual(['', ''])
    expect(clearRow(t, 0).headers).toEqual(['', ''])

    // Deleting down to 1 row clears the last row rather than removing it
    const oneRow = deleteRow(deleteRow(t, 2), 1)
    expect(oneRow.rows).toHaveLength(1)
    const cleared = deleteRow(oneRow, 0)
    expect(cleared.rows).toEqual([['', '']])
  })

  it('inserts, duplicates, moves, clears, and deletes columns with single-column protection', () => {
    const t = baseTable()
    expect(insertColumn(t, 1).headers).toEqual(['Name', '', 'Score'])
    const typedCol = insertColumn(t, 2, { name: 'Tags', type: 'multi-select' })
    expect(typedCol.headers).toEqual(['Name', 'Score', 'Tags'])
    expect(typedCol.columns?.[2]).toEqual({ type: 'multi-select' })
    expect(duplicateColumn(t, 0).headers).toEqual(['Name', 'Name', 'Score'])
    expect(moveColumn(t, 0, 1).headers).toEqual(['Score', 'Name'])
    expect(clearColumn(t, 1).rows.map((r) => r[1])).toEqual(['', '', ''])

    const oneCol = deleteColumn(t, 0)
    expect(oneCol.headers).toEqual(['Score'])
    expect(deleteColumn(oneCol, 0).headers).toEqual(['Score'])
  })

  it('sets column alignment and sorts numerically/naturally with blanks last', () => {
    const t = setColumnAlignment(baseTable(), 1, 'right')
    expect(t.alignments).toEqual([null, 'right'])

    const asc = sortByColumn(t, 1, 'asc')
    expect(asc.rows.map((r) => r[1])).toEqual(['2', '10', ''])

    const desc = sortByColumn(t, 1, 'desc')
    expect(desc.rows.map((r) => r[1])).toEqual(['10', '2', ''])
  })

  it('applies TSV paste and auto-expands grid', () => {
    const t = baseTable()
    const pasted = applyTsvPaste(t, 2, 1, '99\tGold\n55\tSilver\n77\tBronze')
    expect(pasted.headers).toEqual(['Name', 'Score', ''])
    expect(pasted.rows).toHaveLength(4)
    expect(pasted.rows[1][1]).toBe('99')
    expect(pasted.rows[1][2]).toBe('Gold')
    expect(pasted.rows[3][1]).toBe('77')
    expect(pasted.rows[3][2]).toBe('Bronze')
  })

  it('exports RFC 4180 CSV', () => {
    const csv = tableToCsv({
      headers: ['Col "A"', 'Col, B'],
      alignments: [null, null],
      rows: [['hello', 'world']],
    })
    expect(csv).toBe('"Col ""A""","Col, B"\nhello,world')
  })

  it('deletes multiple rows and clears cell ranges with last-row protection', () => {
    const t = baseTable()
    const delTwo = deleteRows(t, [0, 2])
    expect(delTwo.rows).toEqual([['Bob', '2']])

    const delAll = deleteRows(t, [0, 1, 2])
    expect(delAll.rows).toEqual([['', '']])

    const cleared = clearCellRange(t, [1, 2], [0])
    expect(cleared.rows[0][0]).toBe('')
    expect(cleared.rows[1][0]).toBe('')
    expect(cleared.rows[0][1]).toBe('10')
  })

  it('serializes selected rows/columns as clean GFM Markdown without schema comments', () => {
    const t: TableData = {
      headers: ['Task', 'Date', 'Tags'],
      alignments: [null, null, null],
      columns: [{ type: 'text' }, { type: 'date' }, { type: 'multi-select' }],
      rows: [
        ['o', '[[Nov 10th, 2026]]', 'no, yes'],
        ['p', '[[Nov 11th, 2026]]', 'maybe'],
      ],
    }
    const md = serializeSelectionAsMarkdown(t, [0], [0, 1, 2])
    expect(md).toContain('| Task | Date')
    expect(md).toContain('| o')
    expect(md).toContain('[[Nov 10th, 2026]]')
    expect(md).toContain('no, yes')
    expect(md).not.toContain('nt-schema')
    expect(md).not.toContain('| p')
  })

  it('parses quoted TSV, Markdown tables, and HTML tables into 2D paste grids', () => {
    expect(parseTsvGrid('"line1\nline2"\t"a""b"\nnext\trow')).toEqual([
      ['line1\nline2', 'a"b'],
      ['next', 'row'],
    ])

    const target = baseTable()
    const md = '| Name | Score |\n| --- | --- |\n| Zed | 99 |\n| Ada | 88 |'
    expect(parseMarkdownTableGrid(md, target.headers, 1, 0)).toEqual([
      ['Zed', '99'],
      ['Ada', '88'],
    ])
    expect(parseMarkdownTableGrid(md, target.headers, 0, 0)).toEqual([
      ['Name', 'Score'],
      ['Zed', '99'],
      ['Ada', '88'],
    ])
    expect(parseMarkdownTableGrid('| Zed | 99 |')).toEqual([['Zed', '99']])

    const html =
      '<table><tbody><tr><td><div class="nt-cell-display">o</div></td><td><a data-ref="Nov 10th, 2026" href="#/page/nov">Nov 10th, 2026</a></td><td><span class="nt-select-pill">no</span><span class="nt-select-pill">yes</span></td></tr></tbody></table>'
    expect(parseHtmlTableGrid(html)).toEqual([['o', '[[Nov 10th, 2026]]', 'no, yes']])

    const fromClipboard = parseClipboardGrid(
      { plainText: 'o\n\nNov 10th, 2026\nProject', htmlText: html },
      target,
      1,
      0
    )
    expect(fromClipboard?.isStructured).toBe(true)
    expect(fromClipboard?.grid).toEqual([['o', '[[Nov 10th, 2026]]', 'no, yes']])

    const applied = applyGridPaste(target, 1, 0, fromClipboard!.grid)
    expect(applied.rows[0]).toEqual(['o', '[[Nov 10th, 2026]]', 'no, yes'])
  })
})
