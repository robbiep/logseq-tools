import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import {
  computeColumnCalculation,
  parseTableSchemaComment,
  serializeSchemaComment,
} from '../markdown/columnTypes'
import { formatTimestamp, parseTimestamp } from '../markdown/dateUtils'
import { matchesFilter } from '../markdown/tableFilters'
import {
  applyGridPaste,
  clearCellRange,
  clearColumn,
  clearRow,
  deleteRow,
  duplicateRow,
  insertColumn,
  insertRow,
  moveRow,
  setColumnType,
  sortByColumn,
  updateCell,
} from '../markdown/tableOps'
import { parseBlockSegments, serializeTable, createEmptyTable, type TableData } from '../markdown/tableParser'

function createBlockDom(uuid: string): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = 'block-content inline'
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  wrapper.innerHTML =
    '<table class="table-auto"><thead><tr><th>Task</th></tr></thead><tbody><tr><td>Placeholder</td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('timestamp formatting and parsing', () => {
  it('formats date and time without [[page]] links across preferredDateFormat patterns', () => {
    const dt = new Date(2026, 10, 25, 16, 24, 9)
    expect(formatTimestamp(dt, 'MMM do, yyyy')).toBe('Nov 25th, 2026 16:24')
    expect(formatTimestamp(dt, 'yyyy-MM-dd')).toBe('2026-11-25 16:24')
    expect(formatTimestamp(dt, 'dd/MM/yyyy')).toBe('25/11/2026 16:24')

    expect(formatTimestamp(dt, 'MMM do, yyyy')).not.toContain('[[')
    expect(formatTimestamp(dt, 'MMM do, yyyy')).not.toContain(']]')
  })

  it('parses 24h, 12h AM/PM, ISO, and date-only strings', () => {
    const d1 = parseTimestamp('Nov 25th, 2026 16:24')
    expect(d1).not.toBeNull()
    expect(d1!.getFullYear()).toBe(2026)
    expect(d1!.getMonth()).toBe(10)
    expect(d1!.getDate()).toBe(25)
    expect(d1!.getHours()).toBe(16)
    expect(d1!.getMinutes()).toBe(24)

    const d2 = parseTimestamp('2026-11-25 04:05 PM')
    expect(d2).not.toBeNull()
    expect(d2!.getHours()).toBe(16)
    expect(d2!.getMinutes()).toBe(5)

    const d3 = parseTimestamp('2026-11-25T09:15:30')
    expect(d3).not.toBeNull()
    expect(d3!.getHours()).toBe(9)
    expect(d3!.getMinutes()).toBe(15)
    expect(d3!.getSeconds()).toBe(30)

    expect(parseTimestamp('not a timestamp')).toBeNull()
  })
})

describe('created-time & edited-time column operations', () => {
  const t0 = new Date(2026, 10, 25, 9, 0)
  const t1 = new Date(2026, 10, 25, 10, 30)
  const t2 = new Date(2026, 10, 25, 14, 45)
  const opts0 = { dateFormat: 'yyyy-MM-dd', now: t0 }
  const opts1 = { dateFormat: 'yyyy-MM-dd', now: t1 }
  const opts2 = { dateFormat: 'yyyy-MM-dd', now: t2 }

  it('persists created-time and edited-time column types in nt-schema', () => {
    const schemaStr = serializeSchemaComment([
      { type: 'text' },
      { type: 'created-time' },
      { type: 'edited-time' },
    ])
    expect(schemaStr).toContain('"created-time"')
    expect(schemaStr).toContain('"edited-time"')
    const parsed = parseTableSchemaComment(schemaStr!)
    expect(parsed?.columns).toEqual([
      { type: 'text' },
      { type: 'created-time' },
      { type: 'edited-time' },
    ])
  })

  it('populates created-time on empty row creation, preserves it on edits, and updates edited-time anytime the row changes', () => {
    let table: TableData = {
      headers: ['Task', 'Created time', 'Edited Time'],
      alignments: [null, null, null],
      columns: [{ type: 'text' }, { type: 'created-time' }, { type: 'edited-time' }],
      rows: [['Existing', '2026-11-20 08:00', '']],
    }

    // Inserting an empty row stamps Created time immediately and leaves Edited Time blank until changed
    table = insertRow(table, 1, undefined, opts0)
    expect(table.rows[1]).toEqual(['', '2026-11-25 09:00', ''])

    // Updating a cell with the exact same value does NOT bump Edited Time
    const unchanged = updateCell(table, 2, 0, '', opts1)
    expect(unchanged).toBe(table)

    // Editing a body cell updates Edited Time without changing Created time
    table = updateCell(table, 2, 0, 'New Task', opts1)
    expect(table.rows[1]).toEqual(['New Task', '2026-11-25 09:00', '2026-11-25 10:30'])

    // Manual edit attempts targeting created-time or edited-time body cells are ignored
    expect(updateCell(table, 2, 1, 'hacked', opts2)).toBe(table)
    expect(updateCell(table, 2, 2, 'hacked', opts2)).toBe(table)

    // Header rename does NOT alter body Edited Time
    table = updateCell(table, 0, 0, 'Item', opts2)
    expect(table.headers[0]).toBe('Item')
    expect(table.rows[1][2]).toBe('2026-11-25 10:30')

    // clearRow clears editable cells, preserves Created time, and updates Edited Time
    table = clearRow(table, 2, opts2)
    expect(table.rows[1]).toEqual(['', '2026-11-25 09:00', '2026-11-25 14:45'])

    // duplicateRow gives the copy a fresh Created time and empty Edited Time
    table = duplicateRow(table, 1, opts2)
    expect(table.rows[1]).toEqual(['Existing', '2026-11-25 14:45', ''])
  })

  it('handles insertColumn, setColumnType, clearCellRange, clearColumn, deleteRow, applyGridPaste, sort, filter, and calculations', () => {
    let table: TableData = {
      headers: ['Task', 'Done'],
      alignments: [null, null],
      columns: [{ type: 'text' }, { type: 'checkbox' }],
      rows: [
        ['Alpha', '[ ]'],
        ['Beta', '[x]'],
      ],
    }

    // Adding a Created time column backfills existing rows
    table = insertColumn(table, 2, { name: 'Created time', type: 'created-time', ...opts0 })
    expect(table.rows[0][2]).toBe('2026-11-25 09:00')
    expect(table.rows[1][2]).toBe('2026-11-25 09:00')

    // Adding an Edited Time column starts empty
    table = insertColumn(table, 3, { name: 'Edited Time', type: 'edited-time', ...opts0 })
    expect(table.rows[0][3]).toBe('')
    expect(table.rows[1][3]).toBe('')

    // clearCellRange skips timestamp columns while clearing editable cells and stamping Edited Time
    table = clearCellRange(table, [1], [1, 2, 3], opts1)
    expect(table.rows[0]).toEqual(['Alpha', '', '2026-11-25 09:00', '2026-11-25 10:30'])

    // clearColumn on non-timestamp col updates Edited Time only on rows that changed
    table = clearColumn(table, 1, false, opts2)
    expect(table.rows[0][3]).toBe('2026-11-25 10:30') // row 0 col 1 was already ''
    expect(table.rows[1][3]).toBe('2026-11-25 14:45') // row 1 col 1 changed from '[x]' -> ''

    // applyGridPaste expands rows with Created time and stamps Edited Time on modified rows
    table = applyGridPaste(
      table,
      2,
      0,
      [
        ['Beta Updated', '[ ]'],
        ['Gamma', '[x]'],
      ],
      opts2
    )
    expect(table.rows).toHaveLength(3)
    expect(table.rows[2]).toEqual(['Gamma', '[x]', '2026-11-25 14:45', '2026-11-25 14:45'])

    // Chronological sorting works across date+time strings (not lexicographic)
    const chronoTable: TableData = {
      headers: ['Name', 'Created time'],
      alignments: [null, null],
      columns: [{ type: 'text' }, { type: 'created-time' }],
      rows: [
        ['LaterSameDay', 'Nov 25th, 2026 16:00'],
        ['EarlierMonth', 'Feb 1st, 2026 23:00'],
        ['EarlierSameDay', 'Nov 25th, 2026 08:30'],
        ['Blank', ''],
      ],
    }
    const sortedAsc = sortByColumn(chronoTable, 1, 'asc')
    expect(sortedAsc.rows.map((r) => r[0])).toEqual([
      'EarlierMonth',
      'EarlierSameDay',
      'LaterSameDay',
      'Blank',
    ])

    // Date filters & calculations work on created-time / edited-time
    expect(
      matchesFilter('Nov 25th, 2026 16:00', { id: 'f1', col: 1, op: 'is', value: '2026-11-25' }, 'created-time')
    ).toBe(true)
    expect(
      computeColumnCalculation(chronoTable.rows, 1, { type: 'created-time' }, 'earliest', 'MMM do, yyyy').value
    ).toBe('Feb 1st, 2026 23:00')
    expect(
      computeColumnCalculation(chronoTable.rows, 1, { type: 'created-time' }, 'latest', 'MMM do, yyyy').value
    ).toBe('Nov 25th, 2026 16:00')

    // setColumnType to created-time fills empty cells while preserving existing values
    const converted = setColumnType(
      {
        headers: ['A', 'C'],
        alignments: [null, null],
        rows: [
          ['1', '2026-11-01 12:00'],
          ['2', ''],
        ],
      },
      1,
      'created-time',
      opts0
    )
    expect(converted.rows.map((r) => r[1])).toEqual(['2026-11-01 12:00', '2026-11-25 09:00'])

    // deleteRow last-row protection creates fresh empty row with Created time
    const oneRow: TableData = {
      headers: ['Task', 'Created time', 'Edited Time'],
      alignments: [null, null, null],
      columns: [{ type: 'text' }, { type: 'created-time' }, { type: 'edited-time' }],
      rows: [['Old', '2026-11-01 08:00', '2026-11-02 09:00']],
    }
    expect(deleteRow(oneRow, 0, opts1).rows[0]).toEqual(['', '2026-11-25 10:30', ''])
  })

  it('tracks row create and edit times before timestamp columns exist and populates them when added later', () => {
    let table: TableData = {
      headers: ['Task', 'Notes'],
      alignments: [null, null],
      rows: [['Zebra', 'Initial']],
    }

    // Create row at t0, edit it at t1, move rows, sort, then add columns at t2
    table = insertRow(table, 1, undefined, opts0)
    table = updateCell(table, 2, 0, 'Alpha', opts1)
    table = moveRow(table, 1, 0) // Alpha is now row 0, Zebra is row 1
    table = sortByColumn(table, 0, 'asc') // Alpha (0), Zebra (1)

    // Compact row timestamps are persisted inside nt-schema even before columns are added
    expect(serializeTable(table)).toContain('"rt":[[1795615200,1795620600],null]')
    expect(serializeTable(table)).not.toContain('"columns"')

    // Now add Created time and Edited Time columns at t2
    table = insertColumn(table, 2, { name: 'Created time', type: 'created-time', ...opts2 })
    table = insertColumn(table, 3, { name: 'Edited Time', type: 'edited-time', ...opts2 })

    expect(table.rows[0]).toEqual(['Alpha', '', '2026-11-25 09:00', '2026-11-25 10:30'])
    expect(table.rows[1]).toEqual(['Zebra', 'Initial', '2026-11-25 14:45', ''])

    // Same when converting an existing plain column via setColumnType
    let plain2: TableData = {
      headers: ['Task', 'Created', 'Edited'],
      alignments: [null, null, null],
      rows: [['First', '', '']],
    }
    plain2 = insertRow(plain2, 1, undefined, opts0)
    plain2 = updateCell(plain2, 2, 0, 'Second', opts1)
    plain2 = setColumnType(plain2, 1, 'created-time', opts2)
    plain2 = setColumnType(plain2, 2, 'edited-time', opts2)
    expect(plain2.rows[1]).toEqual(['Second', '2026-11-25 09:00', '2026-11-25 10:30'])

    // createEmptyTable seeds createdAt and round-trips compactly through nt-schema rt
    const empty = createEmptyTable(2, 3, t0)
    const serializedEmpty = serializeTable(empty)
    expect(serializedEmpty).toContain('"rt":[')
    const reparsedEmpty = parseBlockSegments(serializedEmpty)[0]
    if (reparsedEmpty.type !== 'table') throw new Error('Expected table')
    expect(reparsedEmpty.table.rowMeta).toEqual([
      { createdAt: t0.getTime() },
      { createdAt: t0.getTime() },
    ])
  })
})

describe('TableView Created time & Edited Time end-to-end', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('offers Created time and Edited Time in Add Column dialog, populates on empty row creation, updates on edits, and does not link date pages', async () => {
    const blocks: Record<string, string> = {
      'uuid-ts': '| Task |\n| --- |\n| Initial |',
    }
    const openPage = vi.fn()
    document.body.appendChild(createBlockDom('uuid-ts'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: async (uuid, content) => {
          blocks[uuid] = content
        },
        editBlock: vi.fn(),
        openPage,
      },
      () => ({
        autoSaveDelayMs: 0,
        fullWidthByDefault: false,
        monospaceRawSource: true,
        preferredDateFormat: 'MMM do, yyyy',
      })
    )

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // 1. Add "Created time" column via + Add Column dialog
    ;(host.querySelector('.nt-add-col-bar') as HTMLButtonElement).click()
    let dlg = document.querySelector('.nt-add-col-dialog') as HTMLElement
    const createdBtn = Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
      (b) => b.textContent?.trim() === 'Created time'
    ) as HTMLButtonElement
    expect(createdBtn).toBeDefined()
    createdBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    // 2. Add "Edited Time" column via + Add Column dialog
    ;(host.querySelector('.nt-add-col-bar') as HTMLButtonElement).click()
    dlg = document.querySelector('.nt-add-col-dialog') as HTMLElement
    const editedBtn = Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
      (b) => b.textContent?.trim() === 'Edited Time'
    ) as HTMLButtonElement
    expect(editedBtn).toBeDefined()
    editedBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('thead th')).toHaveLength(3)
    expect(host.querySelectorAll('thead th')[1]?.textContent).toContain('Created time')
    expect(host.querySelectorAll('thead th')[2]?.textContent).toContain('Edited Time')

    // 3. Add a new empty row via + bar -> Created time is populated immediately, Edited Time is blank
    ;(host.querySelector('.nt-add-row-bar') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))

    const rows = host.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(2)
    const row2CreatedCell = rows[1].querySelector('td[data-col="1"]') as HTMLElement
    const row2EditedCell = rows[1].querySelector('td[data-col="2"]') as HTMLElement

    const createdText = row2CreatedCell.querySelector('.nt-timestamp-text')?.textContent || ''
    expect(createdText).toMatch(/\d{4}\s+\d{2}:\d{2}$/)
    expect(createdText).not.toContain('[[')
    expect(row2CreatedCell.querySelector('a')).toBeNull()
    expect(row2EditedCell.querySelector('.nt-timestamp-text')).toBeNull()

    // Clicking a Created time or Edited Time cell closes any active editor and does NOT open a textarea or date picker
    row2CreatedCell.click()
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    expect(document.querySelector('.nt-date-popover')).toBeNull()
    expect(row2EditedCell.querySelector('.nt-timestamp-text')).toBeNull()

    // 4. Edit Row 2 Task cell -> Edited Time updates live on input and persists without [[...]] links
    const row2TaskCell = rows[1].querySelector('td[data-col="0"]') as HTMLElement
    row2TaskCell.click()
    const editor = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(editor).not.toBeNull()
    editor.value = 'Updated task'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    expect(row2EditedCell.querySelector('.nt-timestamp-text')?.textContent).toMatch(/\d{4}\s+\d{2}:\d{2}$/)

    // Tab skips read-only timestamp columns and appends a new row when at the last editable cell
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)
    const row3CreatedCell = host.querySelectorAll('tbody tr')[2].querySelector('td[data-col="1"]') as HTMLElement
    expect(row3CreatedCell.querySelector('.nt-timestamp-text')?.textContent).toMatch(/\d{4}\s+\d{2}:\d{2}$/)

    const editedText =
      host.querySelectorAll('tbody tr')[1].querySelector('td[data-col="2"] .nt-timestamp-text')?.textContent || ''
    expect(editedText).toMatch(/\d{4}\s+\d{2}:\d{2}$/)
    expect(editedText).not.toContain('[[')
    expect(row2EditedCell.querySelector('a')).toBeNull()

    // Persisted Markdown has no [[...]] date links for timestamp columns and survives round-trip
    const md = blocks['uuid-ts']
    expect(md).toContain('"type":"created-time"')
    expect(md).toContain('"type":"edited-time"')
    const segs = parseBlockSegments(md)
    expect(segs).toHaveLength(1)
    if (segs[0].type !== 'table') throw new Error('Expected table')
    expect(segs[0].table.rows[1][0]).toBe('Updated task')
    expect(segs[0].table.rows[1][1]).toBe(createdText)
    expect(segs[0].table.rows[1][2]).toBe(editedText)
    const tableBodyOnly = serializeTable(segs[0].table).split('<!-- nt-schema:')[0]
    expect(tableBodyOnly).not.toContain('[[')
    expect(openPage).not.toHaveBeenCalled()

    observer.destroy()
  })

  it('persists row create/edit times in nt-schema before columns exist, survives DB rebuild/clear localStorage, and populates columns added later', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 25, 9, 0))

    // Start from a newly created table at 09:00 (only 1 body row for DOM test)
    const blocks: Record<string, string> = {
      'uuid-pretrack': serializeTable(createEmptyTable(1, 2, new Date(2026, 10, 25, 9, 0))),
    }
    document.body.appendChild(createBlockDom('uuid-pretrack'))

    const makeObserver = () =>
      new DomObserver(
        document,
        {
          getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
          updateBlock: async (uuid, content) => {
            blocks[uuid] = content
          },
          editBlock: vi.fn(),
          openPage: vi.fn(),
        },
        () => ({
          autoSaveDelayMs: 0,
          fullWidthByDefault: false,
          monospaceRawSource: true,
          preferredDateFormat: 'yyyy-MM-dd',
        })
      )

    let observer = makeObserver()
    await observer.scan()
    let host = document.querySelector('.nt-host') as HTMLElement

    // Edit Row 1 at 10:15 (no timestamp columns exist yet)
    vi.setSystemTime(new Date(2026, 10, 25, 10, 15))
    ;(host.querySelector('tbody tr td[data-col="0"]') as HTMLElement).click()
    const editor1 = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    editor1.value = 'Initial Updated'
    editor1.dispatchEvent(new Event('input', { bubbles: true }))
    editor1.dispatchEvent(new Event('blur'))
    await new Promise((r) => setTimeout(r, 20))

    // Add empty Row 2 at 11:30 (still no timestamp columns exist)
    vi.setSystemTime(new Date(2026, 10, 25, 11, 30))
    ;(host.querySelector('.nt-add-row-bar') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))

    // Compact row timestamps are persisted inside nt-schema in Markdown
    expect(blocks['uuid-pretrack']).toContain('<!-- nt-schema:')
    expect(blocks['uuid-pretrack']).toContain('"rt":[')

    // Simulate Logseq exit + cache/localStorage clear + DB rebuild (brand new block UUID)
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0))
    observer.destroy()
    localStorage.clear()
    blocks['uuid-reindexed'] = blocks['uuid-pretrack']
    delete blocks['uuid-pretrack']
    document.body.innerHTML = ''
    document.body.appendChild(createBlockDom('uuid-reindexed'))
    observer = makeObserver()
    await observer.scan()
    host = document.querySelector('.nt-host') as HTMLElement

    // Add "Created time" and "Edited Time" columns at 12:45
    vi.setSystemTime(new Date(2026, 10, 25, 12, 45))
    ;(host.querySelector('.nt-add-col-bar') as HTMLButtonElement).click()
    let dlg = document.querySelector('.nt-add-col-dialog') as HTMLElement
    ;(
      Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
        (b) => b.textContent?.trim() === 'Created time'
      ) as HTMLButtonElement
    ).click()
    await new Promise((r) => setTimeout(r, 20))

    ;(host.querySelector('.nt-add-col-bar') as HTMLButtonElement).click()
    dlg = document.querySelector('.nt-add-col-dialog') as HTMLElement
    ;(
      Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
        (b) => b.textContent?.trim() === 'Edited Time'
      ) as HTMLButtonElement
    ).click()
    await new Promise((r) => setTimeout(r, 20))

    const bodyRows = host.querySelectorAll('tbody tr')
    expect(bodyRows).toHaveLength(2)

    // Row 1 uses persisted 09:00 create time and 10:15 edit time even after DB rebuild
    expect(bodyRows[0].querySelector('td[data-col="1"]')?.textContent).toBe('2026-11-25 09:00')
    expect(bodyRows[0].querySelector('td[data-col="2"]')?.textContent).toBe('2026-11-25 10:15')

    // Row 2 uses persisted 11:30 create time and stays unedited
    expect(bodyRows[1].querySelector('td[data-col="1"]')?.textContent).toBe('2026-11-25 11:30')
    expect(bodyRows[1].querySelector('td[data-col="2"]')?.textContent).toBe('')

    observer.destroy()
  })
})
