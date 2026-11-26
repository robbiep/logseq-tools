import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import { parseTableSchemaComment, serializeSchemaComment } from '../markdown/columnTypes'
import {
  buildPrefilledRowForFilters,
  getMatchingRowIndices,
  matchesFilter,
  type TableFilter,
} from '../markdown/tableFilters'
import {
  clearAllTableFilters,
  deleteColumn,
  duplicateColumn,
  insertColumn,
  moveColumn,
  removeTableFilter,
  setColumnType,
  upsertTableFilter,
} from '../markdown/tableOps'
import { parseBlockSegments, serializeTable, type TableData } from '../markdown/tableParser'

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

describe('tableFilters unit logic', () => {
  const refDate = new Date(2026, 10, 25) // 2026-11-25

  it('evaluates text filters (including [[Page]] links) across all operators', () => {
    expect(
      matchesFilter('[[Project Alpha]] specs', { id: '1', col: 0, op: 'contains', value: 'alpha' }, 'text')
    ).toBe(true)
    expect(
      matchesFilter('[[Project Alpha]]', { id: '1', col: 0, op: 'is', value: 'Project Alpha' }, 'text')
    ).toBe(true)
    expect(
      matchesFilter('Beta', { id: '1', col: 0, op: 'not_contains', value: 'alpha' }, 'text')
    ).toBe(true)
    expect(
      matchesFilter('Alpha', { id: '1', col: 0, op: 'is_not', value: 'alpha' }, 'text')
    ).toBe(false)
    expect(matchesFilter('   ', { id: '1', col: 0, op: 'is_empty' }, 'text')).toBe(true)
    expect(matchesFilter('hi', { id: '1', col: 0, op: 'is_not_empty' }, 'text')).toBe(true)
  })

  it('excludes embedded image tokens and markdown link destinations from text filter matching', () => {
    const imgOnly = '![image.png](../assets/storages/logseq-notion-table/test.png){:width 200, :height 150}'
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'contains', value: 't' }, 'text')).toBe(false)
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'contains', value: 'assets' }, 'text')).toBe(false)
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'contains', value: 'image' }, 'text')).toBe(false)
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'not_contains', value: 't' }, 'text')).toBe(true)
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'is_not_empty' }, 'text')).toBe(true)
    expect(matchesFilter(imgOnly, { id: '1', col: 0, op: 'is_empty' }, 'text')).toBe(false)

    const textWithImg = 'Alpha ![image.png](../assets/test.png)'
    expect(matchesFilter(textWithImg, { id: '1', col: 0, op: 'contains', value: 't' }, 'text')).toBe(false)
    expect(matchesFilter(textWithImg, { id: '1', col: 0, op: 'contains', value: 'Alpha' }, 'text')).toBe(true)
    expect(matchesFilter(textWithImg, { id: '1', col: 0, op: 'is', value: 'Alpha' }, 'text')).toBe(true)

    expect(
      matchesFilter('[image.png](../assets/test.png)', { id: '1', col: 0, op: 'contains', value: 't' }, 'text')
    ).toBe(false)
    expect(
      matchesFilter('[image.png](../assets/test.png)', { id: '1', col: 0, op: 'contains', value: 'assets' }, 'text')
    ).toBe(false)
    expect(
      matchesFilter('[Alpha](https://example.com/test)', { id: '1', col: 0, op: 'contains', value: 't' }, 'text')
    ).toBe(false)
    expect(
      matchesFilter('[Alpha](https://example.com/test)', { id: '1', col: 0, op: 'contains', value: 'Alpha' }, 'text')
    ).toBe(true)
  })

  it('evaluates date filters across is/before/after/on_or_before/on_or_after/empty', () => {
    expect(
      matchesFilter('[[Nov 25th, 2026]]', { id: 'd', col: 0, op: 'is', value: '2026-11-25' }, 'date', refDate)
    ).toBe(true)
    expect(
      matchesFilter('[[2026-11-20]]', { id: 'd', col: 0, op: 'before', value: '2026-11-25' }, 'date', refDate)
    ).toBe(true)
    expect(
      matchesFilter('[[2026-11-25]]', { id: 'd', col: 0, op: 'before', value: '2026-11-25' }, 'date', refDate)
    ).toBe(false)
    expect(
      matchesFilter('[[2026-11-26]]', { id: 'd', col: 0, op: 'after', value: '2026-11-25' }, 'date', refDate)
    ).toBe(true)
    expect(
      matchesFilter('[[2026-11-25]]', { id: 'd', col: 0, op: 'on_or_before', value: '2026-11-25' }, 'date', refDate)
    ).toBe(true)
    expect(
      matchesFilter('[[2026-11-25]]', { id: 'd', col: 0, op: 'on_or_after', value: '2026-11-25' }, 'date', refDate)
    ).toBe(true)
    expect(
      matchesFilter('', { id: 'd', col: 0, op: 'is', value: '2026-11-25' }, 'date', refDate)
    ).toBe(false)
    expect(matchesFilter('', { id: 'd', col: 0, op: 'is_empty' }, 'date', refDate)).toBe(true)
    expect(matchesFilter('today', { id: 'd', col: 0, op: 'is_not_empty' }, 'date', refDate)).toBe(true)
  })

  it('evaluates select, multi-select, checkbox, and url filters', () => {
    expect(
      matchesFilter('In Progress', { id: 's', col: 0, op: 'is', value: ['In Progress', 'Done'] }, 'select')
    ).toBe(true)
    expect(
      matchesFilter('', { id: 's', col: 0, op: 'is_not', value: ['In Progress'] }, 'select')
    ).toBe(true)
    expect(
      matchesFilter('[[Nov 25th, 2026]], Urgent', { id: 'm', col: 0, op: 'contains', value: ['Urgent'] }, 'multi-select')
    ).toBe(true)
    expect(
      matchesFilter('[[Nov 25th, 2026]], Urgent', { id: 'm', col: 0, op: 'not_contains', value: ['Low'] }, 'multi-select')
    ).toBe(true)

    expect(matchesFilter('[x]', { id: 'c', col: 0, op: 'checked' }, 'checkbox')).toBe(true)
    expect(matchesFilter('[ ]', { id: 'c', col: 0, op: 'unchecked' }, 'checkbox')).toBe(true)
    expect(matchesFilter('', { id: 'c', col: 0, op: 'unchecked' }, 'checkbox')).toBe(true)

    expect(
      matchesFilter('[Docs](https://logseq.com)', { id: 'u', col: 0, op: 'contains', value: 'logseq.com' }, 'url')
    ).toBe(true)
    expect(
      matchesFilter('[Docs](https://logseq.com)', { id: 'u', col: 0, op: 'contains', value: 'Docs' }, 'url')
    ).toBe(true)
    expect(
      matchesFilter('https://example.com', { id: 'u', col: 0, op: 'not_contains', value: 'logseq' }, 'url')
    ).toBe(true)
  })

  it('combines multiple active filters with AND semantics and builds pre-filled new rows', () => {
    const table: TableData = {
      headers: ['Task', 'Status', 'Due', 'Done'],
      alignments: [null, null, null, null],
      columns: [
        { type: 'text' },
        { type: 'select', options: [{ id: '1', label: 'In Progress', color: 'blue' }] },
        { type: 'date' },
        { type: 'checkbox' },
      ],
      rows: [
        ['Alpha', 'In Progress', '[[2026-11-25]]', '[x]'],
        ['Beta', 'In Progress', '[[2026-11-26]]', '[ ]'],
        ['Gamma', 'Done', '[[2026-11-25]]', '[x]'],
      ],
      filters: [
        { id: 'f1', col: 1, op: 'is', value: ['In Progress'] },
        { id: 'f2', col: 3, op: 'checked' },
      ],
    }
    expect(getMatchingRowIndices(table, refDate)).toEqual([0])

    const withDateFilter = upsertTableFilter(table, {
      id: 'f3',
      col: 2,
      op: 'is',
      value: '2026-11-25',
    })
    const prefilled = buildPrefilledRowForFilters(withDateFilter, 'yyyy-MM-dd', refDate)
    expect(prefilled).toEqual(['', 'In Progress', '[[2026-11-25]]', '[x]'])
  })
})

describe('filter schema persistence & structural ops', () => {
  it('persists filters in nt-schema comment and omits comment when plain text table has no filters', () => {
    const plainWithFilter: TableData = {
      headers: ['Name', 'Notes'],
      alignments: [null, null],
      rows: [['Alpha', 'Hello']],
      filters: [{ id: 'f1', col: 0, op: 'contains', value: 'alp' }],
    }
    const md = serializeTable(plainWithFilter)
    expect(md).toContain('<!-- nt-schema:')
    expect(md).not.toContain('"columns"')
    expect(md).toContain('"filters"')

    const segments = parseBlockSegments(md)
    expect(segments).toHaveLength(1)
    if (segments[0].type !== 'table') throw new Error('Expected table')
    expect(segments[0].table.filters).toEqual([{ id: 'f1', col: 0, op: 'contains', value: 'alp' }])

    const cleared = clearAllTableFilters(segments[0].table)
    expect(serializeTable(cleared)).not.toContain('nt-schema')
    expect(serializeSchemaComment([{ type: 'text' }, { type: 'text' }], [])).toBeNull()
    expect(parseTableSchemaComment('not a comment')).toBeNull()
  })

  it('remaps and prunes filters across insertColumn, duplicateColumn, moveColumn, deleteColumn, and setColumnType', () => {
    let table: TableData = {
      headers: ['Task', 'Status', 'Done'],
      alignments: [null, null, null],
      columns: [
        { type: 'text' },
        { type: 'select', options: [{ id: 'o1', label: 'In Progress', color: 'blue' }] },
        { type: 'checkbox' },
      ],
      rows: [['A', 'In Progress', '[x]']],
      filters: [
        { id: 'f_status', col: 1, op: 'is', value: ['In Progress'] },
        { id: 'f_done', col: 2, op: 'checked' },
      ],
    }

    table = insertColumn(table, 1) // Task, New, Status(2), Done(3)
    expect(table.filters?.map((f) => f.col)).toEqual([2, 3])

    table = duplicateColumn(table, 2) // Task, New, Status(2), StatusCopy(3), Done(4)
    expect(table.filters?.map((f) => f.col)).toEqual([2, 4])

    table = moveColumn(table, 2, 0) // Status(0), Task(1), New(2), StatusCopy(3), Done(4)
    expect(table.filters?.find((f) => f.id === 'f_status')?.col).toBe(0)

    table = setColumnType(table, 0, 'multi-select')
    expect(table.filters?.find((f) => f.id === 'f_status')?.op).toBe('contains')

    table = setColumnType(table, 4, 'date') // 'checked' invalid on date -> pruned
    expect(table.filters?.find((f) => f.id === 'f_done')).toBeUndefined()

    table = deleteColumn(table, 0) // Deletes Status(0) -> removes f_status -> filters deleted
    expect(table.filters).toBeUndefined()
  })
})

describe('TableView persistent & dismissible filtering end-to-end', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('filters Select ("In Progress"), persists to Markdown, survives remount, edits visible rows accurately, and dismisses cleanly', async () => {
    const initialMd = [
      '| Task | Status |',
      '| --- | --- |',
      '| Write spec | Todo |',
      '| Build UI | In Progress |',
      '| Ship release | Done |',
      '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"select","options":[{"id":"s1","label":"Todo","color":"gray"},{"id":"s2","label":"In Progress","color":"blue"},{"id":"s3","label":"Done","color":"green"}]}]} -->',
    ].join('\n')

    const blocks: Record<string, string> = { 'uuid-flt': initialMd }
    document.body.appendChild(createBlockDom('uuid-flt'))

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
    observer.start()
    await observer.scan()

    let host = document.querySelector('.nt-host') as HTMLElement
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)

    // 1. Open toolbar Filter menu -> pick Status column
    const tbFilterBtn = host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement
    tbFilterBtn.click()
    const menu = document.querySelector('.nt-popover')!
    const statusMenuBtn = Array.from(menu.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Status')
    ) as HTMLButtonElement
    statusMenuBtn.click()

    // 2. Select "In Progress" in filter popover
    const fp = document.querySelector('.nt-filter-popover') as HTMLElement
    expect(fp).not.toBeNull()
    const inProgBtn = Array.from(fp.querySelectorAll('.nt-fp-opt-btn')).find((b) =>
      b.textContent?.includes('In Progress')
    ) as HTMLButtonElement
    inProgBtn.click()

    // Dismiss popover by clicking outside
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    // Only "Build UI" row should be visible, filter bar shows chip & "1 of 3 rows"
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Build UI')
    expect(host.querySelector('.nt-filter-count')?.textContent).toBe('1 of 3 rows')
    expect(host.querySelector('.nt-col-filter-indicator')).not.toBeNull()
    expect(blocks['uuid-flt']).toContain('"filters"')
    expect(blocks['uuid-flt']).toContain('"In Progress"')

    // 3. Edit the visible cell ("Build UI" -> "Build Filter UI") and verify underlying row 1 (not row 0!) updates
    const visibleTaskCell = host.querySelector('tbody tr td[data-col="0"]') as HTMLElement
    visibleTaskCell.click()
    const editor = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    editor.value = 'Build Filter UI'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new Event('blur'))
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-flt']).toContain('| Write spec      | Todo        |')
    expect(blocks['uuid-flt']).toContain('| Build Filter UI | In Progress |')

    // 4. Add a row while filtered -> pre-fills Status = "In Progress" so new row stays visible
    ;(host.querySelector('.nt-add-row-bar') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // 5. Full unmount + remount persists the filter
    observer.destroy()
    observer = makeObserver()
    observer.start()
    await observer.scan()
    host = document.querySelector('.nt-host') as HTMLElement
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(host.querySelector('.nt-filter-chip')?.textContent).toContain('In Progress')

    // 6. Modify filter via chip click -> switch operator to "is not" -> shows "Write spec" and "Ship release"
    const chipBtn = host.querySelector('.nt-filter-chip-btn') as HTMLButtonElement
    chipBtn.click()
    const fpEdit = document.querySelector('.nt-filter-popover') as HTMLElement
    const opSelect = fpEdit.querySelector('.nt-fp-op-select') as HTMLSelectElement
    opSelect.value = 'is_not'
    opSelect.dispatchEvent(new Event('change', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(host.querySelector('.nt-filter-count')?.textContent).toBe('2 of 4 rows')

    // 7. Dismiss filter with 1 click on chip × button
    const rmBtn = host.querySelector('.nt-filter-chip-rm') as HTMLButtonElement
    rmBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelector('.nt-filter-bar')).toBeNull()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(4)
    expect(blocks['uuid-flt']).not.toContain('"filters"')

    // 8. Cmd+Z restores dismissed filter
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    observer.destroy()
  })

  it('supports Date, Text, Checkbox, and URL filtering, empty-state clearing, and Cmd+Z isolation inside filter inputs', async () => {
    const initialMd = [
      '| Name | Due | Done | Link |',
      '| --- | --- | --- | --- |',
      '| Alpha | [[2026-11-25]] | [x] | https://logseq.com |',
      '| Beta | [[2026-11-30]] | [ ] | https://example.com |',
      '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"date"},{"type":"checkbox"},{"type":"url"}]} -->',
    ].join('\n')

    const blocks: Record<string, string> = { 'uuid-multi': initialMd }
    document.body.appendChild(createBlockDom('uuid-multi'))

    const observer = new DomObserver(
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

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // Filter Date column via column handle menu -> click calendar day 2026-11-25
    const dateHandle = host.querySelector('thead th[data-col="1"] .nt-col-handle') as HTMLButtonElement
    dateHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    const filterColBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Filter column')
    ) as HTMLButtonElement
    filterColBtn.click()

    const dateFp = document.querySelector('.nt-filter-popover') as HTMLElement
    const dateInput = dateFp.querySelector('.nt-dp-input') as HTMLInputElement
    dateInput.value = '2026-11-25'
    dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Alpha')

    // Add a Text filter that yields 0 matches and check Cmd+Z isolation inside filter input
    ;(host.querySelector('.nt-filter-add-btn') as HTMLButtonElement).click()
    const addMenu = document.querySelector('.nt-popover')!
    const nameMenuBtn = Array.from(addMenu.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Name')
    ) as HTMLButtonElement
    nameMenuBtn.click()

    const textFp = document.querySelector('.nt-filter-popover') as HTMLElement
    const textInput = textFp.querySelector('.nt-fp-input') as HTMLInputElement
    textInput.value = 'nomatch'
    textInput.dispatchEvent(new Event('input', { bubbles: true }))

    // Cmd+Z inside .nt-filter-popover input must NOT be intercepted by DomObserver
    const cmdZ = new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    textInput.dispatchEvent(cmdZ)
    expect(cmdZ.defaultPrevented).toBe(false)

    textInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    // Empty-state row renders and Clear filters restores all 2 rows
    const emptyClearBtn = host.querySelector('.nt-empty-filter-clear-btn') as HTMLButtonElement
    expect(emptyClearBtn).not.toBeNull()
    emptyClearBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Checkbox filter: Checked
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const doneBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Done')
    ) as HTMLButtonElement
    doneBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Alpha')

    // Toggle Checkbox filter to Unchecked
    const cbFp = document.querySelector('.nt-filter-popover') as HTMLElement
    const uncheckedBtn = Array.from(cbFp.querySelectorAll('.nt-fp-bool-btn')).find((b) =>
      b.textContent?.includes('Unchecked')
    ) as HTMLButtonElement
    uncheckedBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Beta')

    // Clear all
    ;(host.querySelector('.nt-filter-clear-btn') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // URL filter
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const linkBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Link')
    ) as HTMLButtonElement
    linkBtn.click()
    const urlFp = document.querySelector('.nt-filter-popover') as HTMLElement
    const urlInput = urlFp.querySelector('.nt-fp-input') as HTMLInputElement
    urlInput.value = 'logseq.com'
    urlInput.dispatchEvent(new Event('input', { bubbles: true }))
    urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Alpha')

    observer.destroy()
  })

  it('preserves first-keystroke text filtering when autoSaveDelayMs > scan delay and MutationObserver/scans run', async () => {
    const initialMd = [
      '| Column 1 | Status |',
      '| --- | --- |',
      '| Taco | Project |',
      '| [[Page33333]] | Banana |',
      '| ![image.png](../assets/test.png) |  |',
    ].join('\n')

    const blocks: Record<string, string> = { 'uuid-debounce': initialMd }
    document.body.appendChild(createBlockDom('uuid-debounce'))

    const observer = new DomObserver(
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
        autoSaveDelayMs: 120,
        fullWidthByDefault: false,
        monospaceRawSource: true,
      })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)

    // Open text filter on Column 1 and type "t" without pressing Enter
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const colBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Column 1')
    ) as HTMLButtonElement
    colBtn.click()

    const fp = document.querySelector('.nt-filter-popover') as HTMLElement
    const input = fp.querySelector('.nt-fp-input') as HTMLInputElement
    input.value = 't'
    input.dispatchEvent(new Event('input', { bubbles: true }))

    // Immediately filtered on first keystroke
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Taco')

    // Wait past DomObserver's 30ms MutationObserver debounce and also trigger an explicit scan
    await new Promise((r) => setTimeout(r, 60))
    await observer.scan()

    // Filter must NOT be wiped out by stale block read before autoSaveDelayMs fires
    expect(host.querySelector('.nt-filter-bar')).not.toBeNull()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Taco')

    // Wait past autoSaveDelayMs (120ms) and verify persistence to Markdown
    await new Promise((r) => setTimeout(r, 110))
    expect(blocks['uuid-debounce']).toContain('"filters"')
    expect(blocks['uuid-debounce']).toContain('"value":"t"')

    observer.destroy()
  })
})
