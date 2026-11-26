import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import {
  formatRelativeDateLabel,
  isRelativeDateExpression,
  normalizeRelativeDateToken,
} from '../markdown/dateUtils'
import {
  getVisibleRowIndices,
  matchesFilter,
  matchesQuickSearch,
} from '../markdown/tableFilters'
import {
  getVisibleTableSlice,
  moveRows,
  moveRowsWithMap,
  renameColumnOption,
  setColumnOptionColor,
} from '../markdown/tableOps'
import { parseBlockSegments, type TableData } from '../markdown/tableParser'
import { STYLES } from '../styles'

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

function mockClipboard(store: { text: string }): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async (txt: string) => {
        store.text = txt
      }),
    },
  })
}

describe('pragmatic features unit logic', () => {
  it('normalizes and formats dynamic relative date expressions and evaluates across shifting reference dates', () => {
    expect(normalizeRelativeDateToken('TODAY')).toBe('today')
    expect(normalizeRelativeDateToken('tod')).toBe('today')
    expect(normalizeRelativeDateToken('tom')).toBe('tomorrow')
    expect(normalizeRelativeDateToken('yest')).toBe('yesterday')
    expect(normalizeRelativeDateToken('in 7 days')).toBe('+7d')
    expect(normalizeRelativeDateToken('+2w')).toBe('+2w')
    expect(normalizeRelativeDateToken('7 days ago')).toBe('-7d')
    expect(normalizeRelativeDateToken('-3m')).toBe('-3m')
    expect(normalizeRelativeDateToken('Next   Friday')).toBe('next friday')
    expect(normalizeRelativeDateToken('2026-11-25')).toBeNull()
    expect(normalizeRelativeDateToken('[[Nov 25th, 2026]]')).toBeNull()
    expect(isRelativeDateExpression('-7d')).toBe(true)
    expect(isRelativeDateExpression('2026-11-25')).toBe(false)

    expect(formatRelativeDateLabel('today')).toBe('Today')
    expect(formatRelativeDateLabel('tomorrow')).toBe('Tomorrow')
    expect(formatRelativeDateLabel('yesterday')).toBe('Yesterday')
    expect(formatRelativeDateLabel('-7d')).toBe('7 days ago')
    expect(formatRelativeDateLabel('+1w')).toBe('In 1 week')
    expect(formatRelativeDateLabel('next friday')).toBe('Next Friday')

    // Filter with "today" shifts automatically when referenceDate advances
    const day1 = new Date(2026, 10, 25)
    const day2 = new Date(2026, 10, 26)
    expect(
      matchesFilter('[[2026-11-25]]', { id: 'f', col: 0, op: 'is', value: 'today' }, 'date', day1)
    ).toBe(true)
    expect(
      matchesFilter('[[2026-11-25]]', { id: 'f', col: 0, op: 'is', value: 'today' }, 'date', day2)
    ).toBe(false)
    expect(
      matchesFilter('[[2026-11-26]]', { id: 'f', col: 0, op: 'is', value: 'today' }, 'date', day2)
    ).toBe(true)
  })

  it('evaluates quick search across typed columns while ignoring checkboxes and image URLs', () => {
    const table: TableData = {
      headers: ['Task', 'Status', 'Done', 'Due', 'Cost', 'Link'],
      alignments: [null, null, null, null, null, null],
      columns: [
        { type: 'text' },
        { type: 'multi-select', options: [{ id: 's1', label: 'Urgent', color: 'red' }] },
        { type: 'checkbox' },
        { type: 'date' },
        { type: 'number' },
        { type: 'url' },
      ],
      rows: [
        [
          '[[Project Alpha]] ![shot.png](../assets/secret_path.png)',
          'Urgent, [[Q4]]',
          '[x]',
          '[[2026-11-25]]',
          '$1,250',
          '[Docs](https://logseq.com/guide)',
        ],
        ['Beta', 'Low', '[ ]', '[[2026-12-01]]', '$90', 'example.org'],
      ],
    }

    expect(matchesQuickSearch(table.rows[0], table, 'alpha', 'MMM do, yyyy')).toBe(true)
    expect(matchesQuickSearch(table.rows[0], table, 'q4', 'MMM do, yyyy')).toBe(true)
    expect(matchesQuickSearch(table.rows[0], table, '1250', 'MMM do, yyyy')).toBe(true)
    expect(matchesQuickSearch(table.rows[0], table, 'logseq.com', 'MMM do, yyyy')).toBe(true)
    expect(matchesQuickSearch(table.rows[0], table, 'Nov 25th', 'MMM do, yyyy')).toBe(true)

    // Excludes image markdown paths/alts and checkbox raw "[x]"
    expect(matchesQuickSearch(table.rows[0], table, 'secret_path', 'MMM do, yyyy')).toBe(false)
    expect(matchesQuickSearch(table.rows[0], table, 'shot.png', 'MMM do, yyyy')).toBe(false)
    expect(matchesQuickSearch(table.rows[0], table, '[x]', 'MMM do, yyyy')).toBe(false)
    expect(getVisibleRowIndices(table, 'Beta', 'MMM do, yyyy')).toEqual([1])
  })

  it('renames select/multi-select options, sets option colors, and slices visible rows cleanly', () => {
    const base: TableData = {
      headers: ['Task', 'Tags'],
      alignments: [null, null],
      columns: [
        { type: 'text' },
        {
          type: 'multi-select',
          options: [
            { id: 'o1', label: 'Todo', color: 'gray' },
            { id: 'o2', label: 'Urgent', color: 'red', isPage: true },
          ],
        },
      ],
      rows: [
        ['A', 'Todo, [[Urgent]]'],
        ['B', '[[Urgent]]'],
      ],
      filters: [{ id: 'flt1', col: 1, op: 'contains', value: ['Urgent'] }],
    }

    const renamed = renameColumnOption(base, 1, 'o2', 'Critical', { skipAutoTimestamps: true })
    expect(renamed.columns?.[1].options?.find((o) => o.id === 'o2')?.label).toBe('Critical')
    expect(renamed.rows[0][1]).toBe('Todo, [[Critical]]')
    expect(renamed.rows[1][1]).toBe('[[Critical]]')
    expect(renamed.filters?.[0].value).toEqual(['Critical'])

    // Case-only rename is allowed; colliding rename is rejected
    const caseRenamed = renameColumnOption(renamed, 1, 'o1', 'TODO', { skipAutoTimestamps: true })
    expect(caseRenamed.rows[0][1]).toBe('TODO, [[Critical]]')
    expect(renameColumnOption(caseRenamed, 1, 'o1', 'critical', { skipAutoTimestamps: true })).toBe(
      caseRenamed
    )

    const recolored = setColumnOptionColor(caseRenamed, 1, 'o1', 'purple')
    expect(recolored.columns?.[1].options?.find((o) => o.id === 'o1')?.color).toBe('purple')

    const slice = getVisibleTableSlice(recolored, [1])
    expect(slice.rows).toEqual([['B', '[[Critical]]']])
    expect(slice.columns).toBeUndefined()
    expect(slice.filters).toBeUndefined()
  })

  it('includes sticky header styles for both inline scroll containers and maximized mode', () => {
    expect(STYLES).toContain('overflow-y: auto;\n  max-height: 75vh;')
    expect(STYLES).toContain('.nt-scroll table.nt-table thead th {\n  position: sticky;\n  top: 0;')
    expect(STYLES).toContain('linear-gradient(var(--nt-header-bg), var(--nt-header-bg)), var(--nt-bg)')
    expect(STYLES).toContain('.nt-host.nt-maximized .nt-scroll-wrap')
    expect(STYLES).toContain('.nt-host.nt-maximized .nt-scroll {\n  flex: 1 1 auto;')
  })
})

describe('pragmatic features end-to-end', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('supports ephemeral quick search (toolbar, Cmd+F, locked mode, Cmd+Z isolation) and filter-aware Copy MD/CSV', async () => {
    const blocks: Record<string, string> = {
      'uuid-search': [
        '| Task | Status | Cost |',
        '| --- | --- | --- |',
        '| Alpha Launch | In Progress | $100 |',
        '| Beta Bugfix | Done | $200 |',
        '| Alpha Retro | Done | $300 |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"select","options":[{"id":"s1","label":"In Progress","color":"blue"},{"id":"s2","label":"Done","color":"green"}]},{"type":"number"}]} -->',
      ].join('\n'),
    }
    const updateBlock = vi.fn(async (uuid: string, content: string) => {
      blocks[uuid] = content
    })
    const showToast = vi.fn()
    const clipboard = { text: '' }
    mockClipboard(clipboard)

    document.body.appendChild(createBlockDom('uuid-search'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock,
        editBlock: vi.fn(),
        openPage: vi.fn(),
        showToast,
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // 1. Unfiltered Copy MD & CSV export all 3 rows
    const copyMdBtn = host.querySelector('button[title="Copy as Markdown"]') as HTMLButtonElement
    const copyCsvBtn = host.querySelector('button[title="Copy as CSV"]') as HTMLButtonElement
    copyMdBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(clipboard.text).toContain('Alpha Launch')
    expect(clipboard.text).toContain('Beta Bugfix')
    expect(clipboard.text).toContain('Alpha Retro')
    expect(showToast).toHaveBeenLastCalledWith('Copied Markdown table', 'success')

    copyCsvBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(clipboard.text).toContain('Beta Bugfix,Done,$200')
    expect(showToast).toHaveBeenLastCalledWith('Copied CSV', 'success')

    // 2. Open search via Cmd+F while focused inside scroll container
    const scroll = host.querySelector('.nt-scroll') as HTMLElement
    scroll.focus()
    scroll.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true })
    )

    const searchInput = host.querySelector('.nt-search-input') as HTMLInputElement
    expect(searchInput).not.toBeNull()
    expect(document.activeElement).toBe(searchInput)

    // Typing filters live, preserves focus on input, and makes zero updateBlock calls
    searchInput.value = 'Alpha'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.activeElement).toBe(searchInput)
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(host.querySelector('.nt-search-count')?.textContent).toBe('2 of 3 rows')
    expect(updateBlock).not.toHaveBeenCalled()

    // Cmd+Z inside search input is NOT hijacked by DomObserver
    const cmdZ = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    searchInput.dispatchEvent(cmdZ)
    expect(cmdZ.defaultPrevented).toBe(false)

    // Filter-aware Copy MD & CSV export ONLY the 2 searched rows without nt-schema
    expect(copyMdBtn.title).toBe('Copy visible rows as Markdown')
    copyMdBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(clipboard.text).toContain('Alpha Launch')
    expect(clipboard.text).toContain('Alpha Retro')
    expect(clipboard.text).not.toContain('Beta Bugfix')
    expect(clipboard.text).not.toContain('nt-schema')
    expect(showToast).toHaveBeenLastCalledWith('Copied 2 filtered rows as Markdown', 'success')

    copyCsvBtn.click()
    await new Promise((r) => setTimeout(r, 10))
    expect(clipboard.text).toContain('Alpha Launch,In Progress,$100')
    expect(clipboard.text).not.toContain('Beta Bugfix')
    expect(showToast).toHaveBeenLastCalledWith('Copied 2 filtered rows as CSV', 'success')

    // 3. No-match state offers Clear search, Escape closes search bar
    searchInput.value = 'zzzzz'
    searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(host.querySelector('.nt-empty-search-clear-btn')).not.toBeNull()
    searchInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    expect(host.querySelector('.nt-search-bar')).toBeNull()
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)

    // 4. Persistent filter + lock mode: search still works and Copy MD exports visible slice
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const statusMenu = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Status')
    ) as HTMLButtonElement
    statusMenu.click()
    const doneOpt = Array.from(document.querySelectorAll('.nt-fp-opt-btn')).find((b) =>
      b.textContent?.includes('Done')
    ) as HTMLButtonElement
    doneOpt.click()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Lock table via toolbar
    ;(host.querySelector('button[title="Lock table"]') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.classList.contains('nt-locked')).toBe(true)

    // Search while locked narrows Done rows to Alpha Retro (1 row)
    ;(host.querySelector('.nt-tb-search-btn') as HTMLButtonElement).click()
    const lockedSearch = host.querySelector('.nt-search-input') as HTMLInputElement
    lockedSearch.value = 'Retro'
    lockedSearch.dispatchEvent(new Event('input', { bubbles: true }))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)

    ;(host.querySelector('button[title="Copy visible rows as Markdown"]') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 10))
    expect(clipboard.text).toContain('Alpha Retro')
    expect(clipboard.text).not.toContain('Beta Bugfix')

    observer.destroy()
  })

  it('renames select options, changes option colors (including harvested options & filter chips), and supports Cmd+Z undo', async () => {
    const blocks: Record<string, string> = {
      'uuid-opt-edit': [
        '| Task | Status |',
        '| --- | --- |',
        '| One | Todo |',
        '| Two | Todo |',
        '| Three | Doing |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"select"}],"filters":[{"id":"f1","col":1,"op":"is","value":["Todo"]}]} -->',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-opt-edit'))

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
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Open Select picker on Row 1 Status cell (Todo was harvested from rows, not pre-listed in schema)
    const statusCell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement
    statusCell.click()

    const pop = document.querySelector('.nt-select-popover') as HTMLElement
    expect(pop).not.toBeNull()

    // Click edit sliders button on "Todo"
    const editTodoBtn = pop.querySelector('button[aria-label="Edit Todo"]') as HTMLButtonElement
    expect(editTodoBtn).not.toBeNull()
    editTodoBtn.click()

    // Change color to purple
    const purpleDot = pop.querySelector('.nt-sp-color-dot[data-color="purple"]') as HTMLButtonElement
    purpleDot.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(statusCell.querySelector('.nt-select-pill')?.classList.contains('nt-color-purple')).toBe(
      true
    )
    expect(host.querySelector('.nt-filter-chip-pill')?.classList.contains('nt-color-purple')).toBe(
      true
    )
    expect(blocks['uuid-opt-edit']).toContain('"color":"purple"')

    // Rename "Todo" -> "Backlog"
    const renameInput = pop.querySelector('.nt-sp-rename-input') as HTMLInputElement
    expect(renameInput).not.toBeNull()
    renameInput.value = 'Backlog'
    renameInput.dispatchEvent(new Event('input', { bubbles: true }))
    renameInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-opt-edit']).toContain('| One   | Backlog |')
    expect(blocks['uuid-opt-edit']).toContain('| Two   | Backlog |')
    expect(blocks['uuid-opt-edit']).toContain('"value":["Backlog"]')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(host.querySelector('.nt-filter-chip-pill')?.textContent).toBe('Backlog')

    // Close picker & Cmd+Z undoes rename cleanly
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 10))
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-opt-edit']).toContain('| One   | Todo')
    expect(blocks['uuid-opt-edit']).toContain('"value":["Todo"]')

    observer.destroy()
  })

  it('persists dynamic relative date filters ("today", "-7d", "tomorrow") while keeping calendar clicks static', async () => {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayIso = iso(today)
    const tomorrowIso = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))

    const blocks: Record<string, string> = {
      'uuid-dyn-date': [
        '| Task | Due |',
        '| --- | --- |',
        `| DueToday | [[${todayIso}]] |`,
        `| DueTomorrow | [[${tomorrowIso}]] |`,
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"date"}]} -->',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-dyn-date'))

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

    // Open filter on Due column
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const dueMenu = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Due')
    ) as HTMLButtonElement
    dueMenu.click()

    const fp = document.querySelector('.nt-filter-popover') as HTMLElement
    const todayBtn = fp.querySelector('button[data-rel-token="today"]') as HTMLButtonElement
    todayBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-dyn-date']).toContain('"value":"today"')
    expect(host.querySelector('.nt-filter-chip-dynamic')?.textContent).toBe('Today')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('DueToday')

    // Typing "tomorrow" and pressing Enter saves "tomorrow" dynamically
    const dpInput = fp.querySelector('.nt-dp-input') as HTMLInputElement
    dpInput.value = 'tomorrow'
    dpInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(fp.querySelector('.nt-dp-preview')?.textContent).toContain('Dynamic')
    dpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-dyn-date']).toContain('"value":"tomorrow"')
    expect(host.querySelector('.nt-filter-chip-dynamic')?.textContent).toBe('Tomorrow')
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('DueTomorrow')

    // Re-open chip and click a specific calendar day -> persists static ISO date
    ;(host.querySelector('.nt-filter-chip-btn') as HTMLButtonElement).click()
    const fp2 = document.querySelector('.nt-filter-popover') as HTMLElement
    const dayBtn = fp2.querySelector(`.nt-dp-day[data-iso="${todayIso}"]`) as HTMLButtonElement
    dayBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(blocks['uuid-dyn-date']).toContain(`"value":"${todayIso}"`)
    expect(host.querySelector('.nt-filter-chip-dynamic')).toBeNull()

    observer.destroy()
  })

  it('keeps colWidths synchronized across column insert (dialog & keyboard), duplicate, move, delete, and undo/redo', async () => {
    const blocks: Record<string, string> = {
      'uuid-widths': '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |',
    }
    document.body.appendChild(createBlockDom('uuid-widths'))

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
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    const readWidths = () => {
      const raw = localStorage.getItem('nt-prefs:uuid-widths:0')
      return raw ? (JSON.parse(raw).colWidths as Record<string, number>) : {}
    }

    // Resize Col 0 (A) to 150px and Col 2 (C) to 240px
    const resizeCol = (colIdx: number, deltaX: number) => {
      const th = host.querySelector(`thead th[data-col="${colIdx}"]`) as HTMLElement
      vi.spyOn(th, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        right: 120,
        top: 0,
        bottom: 30,
        width: 120,
        height: 30,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })
      const resizer = th.querySelector('.nt-col-resizer') as HTMLElement
      resizer.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100, button: 0 })
      )
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100 + deltaX }))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    }

    resizeCol(0, 30) // 150
    resizeCol(2, 120) // 240
    expect(readWidths()).toEqual({ '0': 150, '2': 240 })

    // 1. Duplicate Col 0 (A) -> [A(150), A(150), B, C(240)]
    const clickColMenu = (colIdx: number, itemText: string) => {
      const handle = host.querySelector(`thead th[data-col="${colIdx}"] .nt-col-handle`) as HTMLElement
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
      const item = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
        b.textContent?.includes(itemText)
      ) as HTMLButtonElement
      item.click()
    }

    clickColMenu(0, 'Duplicate column')
    await new Promise((r) => setTimeout(r, 20))
    expect(readWidths()).toEqual({ '0': 150, '1': 150, '3': 240 })
    expect((host.querySelector('thead th[data-col="3"]') as HTMLElement).style.width).toBe('240px')

    // 2. Delete Col 1 (duplicated A) -> [A(150), B, C(240)]
    clickColMenu(1, 'Delete column')
    await new Promise((r) => setTimeout(r, 20))
    expect(readWidths()).toEqual({ '0': 150, '2': 240 })

    // 3. Keyboard insert left on Col 2 (C) -> [A(150), B, New, C(240)]
    const th2 = host.querySelector('thead th[data-col="2"]') as HTMLElement
    th2.click()
    const th2Editor = th2.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    th2Editor.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowLeft',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(readWidths()).toEqual({ '0': 150, '3': 240 })

    // 4. Undo keyboard insert -> restores [A(150), B, C(240)]
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(readWidths()).toEqual({ '0': 150, '2': 240 })
    const parsed = parseBlockSegments(blocks['uuid-widths'])[0]
    expect(parsed.type === 'table' && parsed.table.headers).toEqual(['A', 'B', 'C'])

    // 5. Redo keyboard insert -> restores [A(150), B, '', C(240)]
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(readWidths()).toEqual({ '0': 150, '3': 240 })

    observer.destroy()
  })

  it('moves multiple contiguous and non-contiguous rows with rowMeta and indexMap, and treats no-op drops as identity', () => {
    const base: TableData = {
      headers: ['Item'],
      alignments: [null],
      rows: [['R0'], ['R1'], ['R2'], ['R3']],
      rowMeta: [{ createdAt: 1000 }, { createdAt: 2000 }, { createdAt: 3000 }, { createdAt: 4000 }],
    }

    // Move [0, 1] down before index 3 -> [R2, R0, R1, R3]
    const downMid = moveRowsWithMap(base, [0, 1], 3)
    expect(downMid.table.rows.map((r) => r[0])).toEqual(['R2', 'R0', 'R1', 'R3'])
    expect(downMid.table.rowMeta?.map((m) => m.createdAt)).toEqual([3000, 1000, 2000, 4000])
    expect(downMid.indexMap.get(0)).toBe(1)
    expect(downMid.indexMap.get(1)).toBe(2)
    expect(downMid.indexMap.get(2)).toBe(0)
    expect(downMid.indexMap.get(3)).toBe(3)

    // Move [0, 1] down to end (before index 4) -> [R2, R3, R0, R1]
    expect(moveRows(base, [0, 1], 4).rows.map((r) => r[0])).toEqual(['R2', 'R3', 'R0', 'R1'])

    // Move [1, 2] up before index 0 -> [R1, R2, R0, R3]
    expect(moveRows(base, [1, 2], 0).rows.map((r) => r[0])).toEqual(['R1', 'R2', 'R0', 'R3'])

    // Move non-contiguous [0, 2] down before index 4 -> [R1, R3, R0, R2]
    expect(moveRows(base, [0, 2], 4).rows.map((r) => r[0])).toEqual(['R1', 'R3', 'R0', 'R2'])

    // No-op drop ([0, 1] before 2) returns original reference
    expect(moveRowsWithMap(base, [0, 1], 2).table).toBe(base)
  })

  it('keeps rows unfocused after drag-and-drop, moves all multi-selected rows with checkboxes, shows translucent drag ghost, and leaves no cell focused after column deletion', async () => {
    const blocks: Record<string, string> = {
      'uuid-dnd': [
        '| Name | Notes |',
        '| --- | --- |',
        '| Taco | A |',
        '| COOOO | B |',
        '| Empty | C |',
        '| Row4 | D |',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-dnd'))

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
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    const mockRowRects = () => {
      const trs = Array.from(host.querySelectorAll('tbody tr[data-body-idx]')) as HTMLElement[]
      trs.forEach((tr, idx) => {
        vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({
          left: 20,
          right: 420,
          top: 40 + idx * 30,
          bottom: 70 + idx * 30,
          width: 400,
          height: 30,
          x: 20,
          y: 40 + idx * 30,
          toJSON: () => ({}),
        })
      })
    }

    const rowTexts = () =>
      Array.from(host.querySelectorAll('tbody tr[data-body-idx] td[data-col="0"]')).map(
        (td) => td.textContent?.trim() || ''
      )

    const checkedBodyIndices = () =>
      Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
        .filter((tr) => (tr.querySelector('input.nt-row-select') as HTMLInputElement)?.checked)
        .map((tr) => Number((tr as HTMLElement).dataset.bodyIdx))

    // 1. Single row drag: drag Row 0 (Taco) below Row 2 (Empty) -> [COOOO, Empty, Taco, Row4], NO cell focused
    mockRowRects()
    const row0Handle = host.querySelector(
      'tbody tr[data-body-idx="0"] .nt-row-handle'
    ) as HTMLElement
    row0Handle.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 10,
        clientY: 55,
      })
    )
    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 125 }) // past Row 2 (top=100, mid=115, bottom=130) -> before Row 3
    )

    const singleGhost = document.querySelector('.nt-drag-ghost') as HTMLElement
    expect(singleGhost).not.toBeNull()
    expect(singleGhost.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(singleGhost.querySelector('.nt-drag-ghost-badge')).toBeNull()
    expect(document.body.classList.contains('nt-dragging')).toBe(true)

    window.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 12, clientY: 125 })
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(document.querySelector('.nt-drag-ghost')).toBeNull()
    expect(document.body.classList.contains('nt-dragging')).toBe(false)
    expect(rowTexts()).toEqual(['COOOO', 'Empty', 'Taco', 'Row4'])
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()

    // Reset order via Undo
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(rowTexts()).toEqual(['Taco', 'COOOO', 'Empty', 'Row4'])

    // 2. Multi-row select (Taco + COOOO) and drag Row 0 past Empty -> moves BOTH rows and remaps checkboxes!
    const cb0 = host.querySelector(
      'tbody tr[data-body-idx="0"] input.nt-row-select'
    ) as HTMLInputElement
    const cb1 = host.querySelector(
      'tbody tr[data-body-idx="1"] input.nt-row-select'
    ) as HTMLInputElement
    cb0.click()
    cb1.click()
    expect(checkedBodyIndices()).toEqual([0, 1])

    mockRowRects()
    const multiHandle = host.querySelector(
      'tbody tr[data-body-idx="0"] .nt-row-handle'
    ) as HTMLElement
    multiHandle.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 10,
        clientY: 55,
      })
    )
    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 125 })
    )

    const tr0 = host.querySelector('tbody tr[data-body-idx="0"]') as HTMLElement
    const tr1 = host.querySelector('tbody tr[data-body-idx="1"]') as HTMLElement
    expect(tr0.classList.contains('nt-drag-source')).toBe(true)
    expect(tr1.classList.contains('nt-drag-source')).toBe(true)

    const multiGhost = document.querySelector('.nt-drag-ghost') as HTMLElement
    expect(multiGhost).not.toBeNull()
    expect(multiGhost.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(multiGhost.querySelector('.nt-drag-ghost-badge')?.textContent).toBe('2 rows')

    window.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 12, clientY: 125 })
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(document.querySelector('.nt-drag-ghost')).toBeNull()
    expect(rowTexts()).toEqual(['Empty', 'Taco', 'COOOO', 'Row4'])
    expect(checkedBodyIndices()).toEqual([1, 2])
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()

    // 3. Dragging an unselected row (Empty at index 0) while Taco (1) and COOOO (2) are checked moves Empty and keeps checkboxes on Taco & COOOO!
    mockRowRects()
    const emptyHandle = host.querySelector(
      'tbody tr[data-body-idx="0"] .nt-row-handle'
    ) as HTMLElement
    emptyHandle.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 10,
        clientY: 55,
      })
    )
    window.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 12, clientY: 170 }) // below all rows -> end
    )
    window.dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: 12, clientY: 170 })
    )
    await new Promise((r) => setTimeout(r, 20))

    expect(rowTexts()).toEqual(['Taco', 'COOOO', 'Row4', 'Empty'])
    expect(checkedBodyIndices()).toEqual([0, 1])
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()

    // 4. Delete column -> removes column and leaves NO cell focused or in edit mode
    const col1Handle = host.querySelector('thead th[data-col="1"] .nt-col-handle') as HTMLElement
    col1Handle.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
    )
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    const delColBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Delete column')
    ) as HTMLButtonElement
    delColBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('thead th')).toHaveLength(1)
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()

    observer.destroy()
  })
})
