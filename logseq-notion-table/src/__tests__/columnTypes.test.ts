import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import { PageIndex } from '../host/pageIndex'
import {
  formatSelectCellValues,
  harvestOptionsFromColumn,
  parseSchemaComment,
  parseSelectCellValues,
  parseUrlCell,
  serializeSchemaComment,
} from '../markdown/columnTypes'
import {
  formatJournalDateLink,
  formatLogseqDate,
  normalizeLogseqStartOfWeek,
  parsePlaintextDate,
} from '../markdown/dateUtils'
import { setColumnType, sortByColumn } from '../markdown/tableOps'
import { parseBlockSegments, serializeTable, type TableData } from '../markdown/tableParser'
import { openSelectPicker } from '../ui/selectPicker'

function createBlockDom(uuid: string): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = 'block-content inline'
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  wrapper.innerHTML =
    '<table class="table-auto"><thead><tr><th>Task</th><th>Due</th><th>Status</th><th>Done</th><th>Link</th></tr></thead><tbody><tr><td>Kickoff</td><td></td><td>Todo</td><td></td><td></td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('dateUtils', () => {
  it('formats dates across Logseq preferredDateFormat patterns', () => {
    const d = new Date(2026, 10, 25) // Nov 25, 2026 (Wed)
    expect(formatLogseqDate(d, 'MMM do, yyyy')).toBe('Nov 25th, 2026')
    expect(formatLogseqDate(d, 'yyyy-MM-dd')).toBe('2026-11-25')
    expect(formatLogseqDate(d, 'dd/MM/yyyy')).toBe('25/11/2026')
    expect(formatLogseqDate(d, 'EEEE, MMMM do, yyyy')).toBe('Wednesday, November 25th, 2026')
    expect(formatJournalDateLink(new Date(2026, 0, 1), 'MMM do, yyyy')).toBe('[[Jan 1st, 2026]]')
  })

  it('parses plaintext and relative dates and rejects invalid calendar dates', () => {
    const ref = new Date(2026, 10, 25) // Wed Nov 25, 2026
    expect(formatLogseqDate(parsePlaintextDate('today', ref)!, 'yyyy-MM-dd')).toBe('2026-11-25')
    expect(formatLogseqDate(parsePlaintextDate('tomorrow', ref)!, 'yyyy-MM-dd')).toBe('2026-11-26')
    expect(formatLogseqDate(parsePlaintextDate('yesterday', ref)!, 'yyyy-MM-dd')).toBe('2026-11-24')
    expect(formatLogseqDate(parsePlaintextDate('in 3 days', ref)!, 'yyyy-MM-dd')).toBe('2026-11-28')
    expect(formatLogseqDate(parsePlaintextDate('2026-12-01', ref)!, 'yyyy-MM-dd')).toBe('2026-12-01')
    expect(formatLogseqDate(parsePlaintextDate('12/05/2026', ref)!, 'yyyy-MM-dd')).toBe('2026-12-05')
    expect(formatLogseqDate(parsePlaintextDate('Nov 25th, 2026', ref)!, 'yyyy-MM-dd')).toBe('2026-11-25')
    expect(formatLogseqDate(parsePlaintextDate('[[Nov 25th, 2026]]', ref)!, 'yyyy-MM-dd')).toBe('2026-11-25')
    expect(formatLogseqDate(parsePlaintextDate('25 Nov 2026', ref)!, 'yyyy-MM-dd')).toBe('2026-11-25')

    expect(parsePlaintextDate('2026-02-30', ref)).toBeNull()
    expect(parsePlaintextDate('not a date', ref)).toBeNull()
    expect(normalizeLogseqStartOfWeek(0)).toBe(1) // Logseq 0 = Monday -> JS 1
    expect(normalizeLogseqStartOfWeek(6)).toBe(0) // Logseq 6 = Sunday -> JS 0
  })
})

describe('columnTypes & schema persistence', () => {
  it('parses and formats select/multi-select values preserving commas inside [[Page]] links', () => {
    const parsed = parseSelectCellValues('[[Nov 25th, 2026]], Urgent, [[Project Alpha]]', true)
    expect(parsed).toEqual([
      { label: 'Nov 25th, 2026', isPage: true, raw: '[[Nov 25th, 2026]]' },
      { label: 'Urgent', isPage: false, raw: 'Urgent' },
      { label: 'Project Alpha', isPage: true, raw: '[[Project Alpha]]' },
    ])
    expect(formatSelectCellValues(parsed)).toBe('[[Nov 25th, 2026]], Urgent, [[Project Alpha]]')
  })

  it('parses plaintext URLs and rejects unsafe schemes', () => {
    expect(parseUrlCell('github.com/logseq/og')).toEqual({
      href: 'https://github.com/logseq/og',
      display: 'github.com/logseq/og',
    })
    expect(parseUrlCell('[Logseq](https://logseq.com)')).toEqual({
      href: 'https://logseq.com/',
      display: 'Logseq',
    })
    expect(parseUrlCell('javascript:alert(1)')).toBeNull()
  })

  it('omits schema comment for plain all-text tables and round-trips typed schemas', () => {
    const plain: TableData = {
      headers: ['A', 'B'],
      alignments: [null, null],
      rows: [['1', '2']],
    }
    expect(serializeTable(plain)).not.toContain('nt-schema')
    expect(serializeSchemaComment([{ type: 'text' }, { type: 'text' }])).toBeNull()

    const typed = setColumnType(
      {
        headers: ['Name', 'Due', 'Tags'],
        alignments: [null, null, null],
        rows: [
          ['Alpha', '[[Nov 25th, 2026]]', '[[Backend]], Urgent'],
          ['Beta', '[[Nov 20th, 2026]]', 'Urgent'],
        ],
      },
      1,
      'date'
    )
    const withTags = setColumnType(typed, 2, 'multi-select')
    expect(withTags.columns?.[2].options?.map((o) => ({ label: o.label, isPage: o.isPage }))).toEqual([
      { label: 'Backend', isPage: true },
      { label: 'Urgent', isPage: undefined },
    ])

    const md = serializeTable(withTags)
    expect(md).toContain('<!-- nt-schema:')
    const segments = parseBlockSegments(md)
    expect(segments).toHaveLength(1)
    if (segments[0].type !== 'table') throw new Error('Expected table')
    expect(segments[0].table.columns?.[1].type).toBe('date')
    expect(segments[0].table.columns?.[2].type).toBe('multi-select')

    // Chronological date sort
    const sorted = sortByColumn(segments[0].table, 1, 'asc')
    expect(sorted.rows.map((r) => r[0])).toEqual(['Beta', 'Alpha'])

    // Harvest preserves existing option colors
    const harvested = harvestOptionsFromColumn([['Done']], 0, false, [
      { id: '1', label: 'Done', color: 'green' },
    ])
    expect(harvested[0].color).toBe('green')
    expect(parseSchemaComment('not a comment')).toBeNull()
  })
})

describe('TableView column types end-to-end', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('supports switching column types and interacting with Date, Select/Multi-select (with Pages), Checkbox, and URL cells', async () => {
    const blocks: Record<string, string> = {
      'uuid-types':
        '| Task | Due | Status | Done | Link |\n| --- | --- | --- | --- | --- |\n| Kickoff |  | Todo |  |  |',
    }
    const openExternalLink = vi.fn()
    const openPage = vi.fn()
    const pageIndex = new PageIndex(async () => [
      { originalName: 'Project Alpha', updatedAt: 200 },
      { originalName: 'Urgent', updatedAt: 100 },
    ])

    document.body.appendChild(createBlockDom('uuid-types'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: async (uuid, content) => {
          blocks[uuid] = content
        },
        editBlock: vi.fn(),
        openPage,
        openExternalLink,
        searchPages: (q) => pageIndex.search(q),
      },
      () => ({
        autoSaveDelayMs: 0,
        fullWidthByDefault: false,
        monospaceRawSource: true,
        preferredDateFormat: 'yyyy-MM-dd',
        preferredStartOfWeek: 0,
      })
    )

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // Helper to switch column type via column handle menu
    const setTypeViaMenu = async (colIdx: number, label: string) => {
      const handle = host.querySelector(`thead th[data-col="${colIdx}"] .nt-col-handle`) as HTMLButtonElement
      handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
      const menu = document.querySelector('.nt-popover')!
      const btn = Array.from(menu.querySelectorAll('.nt-popover-item')).find(
        (b) => b.textContent?.trim() === label
      ) as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 20))
    }

    await setTypeViaMenu(1, 'Date')
    await setTypeViaMenu(2, 'Multi-select')
    await setTypeViaMenu(3, 'Checkbox')
    await setTypeViaMenu(4, 'URL')

    expect(blocks['uuid-types']).toContain('<!-- nt-schema:')

    // Empty Date cell should render empty without "Select date" placeholder text
    const initialDateCell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement
    expect(initialDateCell.querySelector('.nt-date-main')?.textContent).toBe('')
    expect(initialDateCell.querySelector('.nt-cell-placeholder')).toBeNull()

    // 1. Date cell: click -> type plaintext date -> automap to yyyy-MM-dd journal link
    const dateCell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement
    dateCell.click()
    const datePop = document.querySelector('.nt-date-popover') as HTMLElement
    expect(datePop).not.toBeNull()
    const dateInput = datePop.querySelector('.nt-dp-input') as HTMLInputElement
    dateInput.value = 'Nov 25, 2026'
    dateInput.dispatchEvent(new Event('input', { bubbles: true }))
    expect(datePop.querySelector('.nt-dp-preview')?.textContent).toContain('[[2026-11-25]]')
    dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-types']).toContain('[[2026-11-25]]')
    // Date column header retains calendar icon, while date data entries do not render one
    const dateHeaderIcon = host.querySelector('thead th[data-col="1"] .nt-col-type-icon svg')
    expect(dateHeaderIcon).not.toBeNull()
    expect(dateCell.querySelector('.nt-date-main svg')).toBeNull()
    expect(dateCell.querySelector('.nt-cell-muted-icon')).toBeNull()

    // Text and Multi-select headers show their type icons (horizontal lines vs bulleted rows)
    const textHeaderTh = host.querySelector('thead th[data-col="0"]') as HTMLElement
    const textHeaderIcon = textHeaderTh.querySelector('.nt-col-type-icon svg') as SVGElement
    expect(textHeaderIcon).not.toBeNull()
    expect(textHeaderIcon.querySelectorAll('circle')).toHaveLength(0)

    const msHeaderIcon = host.querySelector('thead th[data-col="2"] .nt-col-type-icon svg') as SVGElement
    expect(msHeaderIcon).not.toBeNull()
    expect(msHeaderIcon.querySelectorAll('circle')).toHaveLength(3)

    // Header type icon stays visible inside .nt-header-inner alongside textarea while editing
    textHeaderTh.click()
    const headerEditor = textHeaderTh.querySelector('.nt-header-inner textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(headerEditor).not.toBeNull()
    expect(textHeaderTh.querySelector('.nt-header-inner .nt-col-type-icon svg')).not.toBeNull()
    headerEditor.dispatchEvent(new Event('blur'))

    // 2. Multi-select cell: click -> add Page-backed option [[Project Alpha]]
    const selectCell = host.querySelector('tbody tr td[data-col="2"]') as HTMLElement
    selectCell.click()
    const spPop = document.querySelector('.nt-select-popover') as HTMLElement
    expect(spPop).not.toBeNull()
    const spInput = spPop.querySelector('.nt-sp-input') as HTMLInputElement
    spInput.value = '[[Project'
    spInput.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise((r) => setTimeout(r, 20))
    const pageOptionBtn = Array.from(spPop.querySelectorAll('.nt-sp-page-btn')).find((b) =>
      b.textContent?.includes('[[Project Alpha]]')
    ) as HTMLButtonElement
    expect(pageOptionBtn).toBeDefined()
    pageOptionBtn.click()

    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-types']).toContain('Todo, [[Project Alpha]]')

    // 3. Checkbox cell: 1-click toggles [x]
    const cbCell = host.querySelector('tbody tr td[data-col="3"]') as HTMLElement
    cbCell.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-types']).toContain('[x]')

    // 4. URL cell: enter plaintext domain -> renders clickable hyperlink
    const urlCell = host.querySelector('tbody tr td[data-col="4"]') as HTMLElement
    urlCell.click()
    const urlEditor = urlCell.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    urlEditor.value = 'github.com/logseq/og'
    urlEditor.dispatchEvent(new Event('input', { bubbles: true }))
    urlEditor.dispatchEvent(new Event('blur'))

    await new Promise((r) => setTimeout(r, 20))
    const linkEl = urlCell.querySelector('a.nt-url-link') as HTMLAnchorElement
    expect(linkEl).not.toBeNull()
    expect(linkEl.href).toBe('https://github.com/logseq/og')
    linkEl.click()
    expect(openExternalLink).toHaveBeenCalledWith('https://github.com/logseq/og')

    observer.destroy()
  })

  it('renders newly created multi-select options in an empty cell even when DB scans run during saves', async () => {
    const blocks: Record<string, string> = {
      'uuid-ms-race': [
        '| Name | Tags |',
        '| --- | --- |',
        '| Row1 | yes, no |',
        '| Row2 |  |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"multi-select","options":[{"id":"o1","label":"yes","color":"blue"},{"id":"o2","label":"no","color":"green"}]}]} -->',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-ms-race'))

    let observer: DomObserver
    const updateBlock = vi.fn(async (uuid: string, content: string) => {
      // Simulate async DB write + immediate DB.onChanged scan echo
      await new Promise((r) => setTimeout(r, 5))
      blocks[uuid] = content
      void observer.scan()
    })

    observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock,
        editBlock: vi.fn(),
        openPage: vi.fn(),
      },
      () => ({
        autoSaveDelayMs: 0,
        fullWidthByDefault: false,
        monospaceRawSource: true,
      })
    )

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // Empty Multi-select cell should render empty without "Select…" placeholder text
    const emptyCell = host.querySelectorAll('tbody tr')[1].querySelector('td[data-col="1"]') as HTMLElement
    expect(emptyCell.querySelector('.nt-select-cell')?.textContent).toBe('')
    expect(emptyCell.querySelector('.nt-cell-placeholder')).toBeNull()

    // Click empty Row2 Tags cell (row index 1 in tbody)
    emptyCell.click()

    const spPop = document.querySelector('.nt-select-popover') as HTMLElement
    expect(spPop).not.toBeNull()
    const spInput = spPop.querySelector('.nt-sp-input') as HTMLInputElement

    // Create & select "test"
    spInput.value = 'test'
    spInput.dispatchEvent(new Event('input', { bubbles: true }))
    const createTestBtn = Array.from(spPop.querySelectorAll('.nt-sp-create-btn')).find((b) =>
      b.textContent?.includes('Create "test"')
    ) as HTMLButtonElement
    createTestBtn.click()

    // Immediately create & select "taco" while picker is open and Save #1 is in flight
    spInput.value = 'taco'
    spInput.dispatchEvent(new Event('input', { bubbles: true }))
    const createTacoBtn = Array.from(spPop.querySelectorAll('.nt-sp-create-btn')).find((b) =>
      b.textContent?.includes('Create "taco"')
    ) as HTMLButtonElement
    createTacoBtn.click()

    await new Promise((r) => setTimeout(r, 40))

    // Only 2 atomic updateBlock calls (1 per created option, not 4)
    expect(updateBlock).toHaveBeenCalledTimes(2)
    expect(blocks['uuid-ms-race']).toContain('| Row2 | test, taco')

    // Live cell in DOM renders both pills
    const liveCell = host.querySelectorAll('tbody tr')[1].querySelector('td[data-col="1"]') as HTMLElement
    const pills = Array.from(liveCell.querySelectorAll('.nt-select-pill')).map((el) =>
      el.textContent?.trim()
    )
    expect(pills).toEqual(['test', 'taco'])

    observer.destroy()
  })

  it('does not pre-highlight the top row on open in select or multi-select dialogs', () => {
    const sampleOptions = [
      { id: '1', label: 'Project', color: 'blue' as const },
      { id: '2', label: 'Banana', color: 'green' as const },
      { id: '3', label: 'Cat', color: 'purple' as const },
    ]

    for (const multi of [false, true]) {
      const onChangeSelection = vi.fn()
      const close = openSelectPicker(
        document,
        { left: 10, top: 10, bottom: 30 },
        {
          multi,
          currentRaw: 'Cat',
          options: sampleOptions,
          onChangeSelection,
          onUpdateOptions: vi.fn(),
        }
      )

      const pop = document.querySelector('.nt-select-popover') as HTMLElement
      expect(pop).not.toBeNull()
      expect(pop.querySelectorAll('.nt-sp-row-active')).toHaveLength(0)

      const input = pop.querySelector('.nt-sp-input') as HTMLInputElement

      // Enter without navigating or typing should not activate an unhighlighted row
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      expect(onChangeSelection).not.toHaveBeenCalled()

      // ArrowDown highlights the top row, ArrowUp from initial state highlights the last row
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      let rows = Array.from(pop.querySelectorAll('.nt-sp-row'))
      expect(rows[0].classList.contains('nt-sp-row-active')).toBe(true)

      // Typing highlights the top match, clearing input removes highlight again
      input.value = 'Ban'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      rows = Array.from(pop.querySelectorAll('.nt-sp-row'))
      expect(rows).toHaveLength(1)
      expect(rows[0].classList.contains('nt-sp-row-active')).toBe(true)

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
      expect(pop.querySelectorAll('.nt-sp-row-active')).toHaveLength(0)

      // In multi-select, choosing an option clears input and leaves no row pre-highlighted
      if (multi) {
        input.value = 'Ban'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(onChangeSelection).toHaveBeenCalledWith('Cat, Banana', expect.any(Array))
        expect(pop.querySelectorAll('.nt-sp-row-active')).toHaveLength(0)
      } else {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
        rows = Array.from(pop.querySelectorAll('.nt-sp-row'))
        expect(rows[2].classList.contains('nt-sp-row-active')).toBe(true)
      }

      close()
    }
  })
})
