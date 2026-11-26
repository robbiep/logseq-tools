import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import {
  computeColumnCalculation,
  parseNumericCellValue,
  type ColumnSchema,
} from '../markdown/columnTypes'
import { matchesFilter } from '../markdown/tableFilters'
import {
  clearAllColumnCalculations,
  setColumnCalculation,
  setColumnType,
  sortByColumn,
} from '../markdown/tableOps'
import { parseBlockSegments, serializeTable, type TableData } from '../markdown/tableParser'
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
    '<table class="table-auto"><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Placeholder</td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('parseNumericCellValue', () => {
  it('parses plain, comma-separated, currency, percent, and accounting numbers while rejecting non-numeric strings', () => {
    expect(parseNumericCellValue('42')).toEqual({ value: 42 })
    expect(parseNumericCellValue('-12.5')).toEqual({ value: -12.5 })
    expect(parseNumericCellValue('$1,234.50')).toEqual({ value: 1234.5, prefix: '$' })
    expect(parseNumericCellValue('-$50')).toEqual({ value: -50, prefix: '$' })
    expect(parseNumericCellValue('$-50')).toEqual({ value: -50, prefix: '$' })
    expect(parseNumericCellValue('($500)')).toEqual({ value: -500, prefix: '$' })
    expect(parseNumericCellValue('45.5%')).toEqual({ value: 45.5, suffix: '%' })
    expect(parseNumericCellValue('€99')).toEqual({ value: 99, prefix: '€' })

    expect(parseNumericCellValue('')).toBeNull()
    expect(parseNumericCellValue('TBD')).toBeNull()
    expect(parseNumericCellValue('12px')).toBeNull()
    expect(parseNumericCellValue('2026-11-25')).toBeNull()
    expect(parseNumericCellValue('[[100]]')).toBeNull()
  })
})

describe('computeColumnCalculation', () => {
  const refDate = new Date(2026, 10, 25)

  it('computes all numeric aggregations and preserves shared currency/percent units while ignoring non-numeric cells', () => {
    const rows = [
      ['A', '$100'],
      ['B', '$200'],
      ['C', '$300'],
      ['D', '$400'],
      ['E', 'TBD'],
      ['F', ''],
    ]
    const schema: ColumnSchema = { type: 'number' }

    expect(computeColumnCalculation(rows, 1, schema, 'sum')).toEqual({ label: 'Sum', value: '$1,000' })
    expect(computeColumnCalculation(rows, 1, schema, 'average')).toEqual({ label: 'Avg', value: '$250' })
    expect(computeColumnCalculation(rows, 1, schema, 'median')).toEqual({ label: 'Med', value: '$250' })
    expect(computeColumnCalculation(rows, 1, schema, 'min')).toEqual({ label: 'Min', value: '$100' })
    expect(computeColumnCalculation(rows, 1, schema, 'max')).toEqual({ label: 'Max', value: '$400' })
    expect(computeColumnCalculation(rows, 1, schema, 'range')).toEqual({ label: 'Range', value: '$300' })

    const pctRows = [['20%'], ['50%'], ['80%']]
    expect(computeColumnCalculation(pctRows, 0, schema, 'average')).toEqual({ label: 'Avg', value: '50%' })
    expect(computeColumnCalculation(pctRows, 0, schema, 'median')).toEqual({ label: 'Med', value: '50%' })
  })

  it('computes count, unique, percent, checkbox, and date aggregations with compact display labels', () => {
    const msRows = [
      ['Red, Blue', '[x]', '[[2026-11-10]]'],
      ['Blue', '[ ]', '[[2026-11-25]]'],
      ['', '', ''],
    ]
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'count_all')).toEqual({
      label: 'Count',
      value: '3',
    })
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'count_unique')).toEqual({
      label: 'Unique',
      value: '2',
    })
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'count_empty')).toEqual({
      label: 'Empty',
      value: '1',
    })
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'count_not_empty')).toEqual({
      label: 'Not empty',
      value: '2',
    })
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'percent_empty')).toEqual({
      label: 'Empty',
      value: '33.3%',
    })
    expect(computeColumnCalculation(msRows, 0, { type: 'multi-select' }, 'percent_not_empty')).toEqual({
      label: 'Not Empty',
      value: '66.7%',
    })

    expect(computeColumnCalculation(msRows, 1, { type: 'checkbox' }, 'checked').value).toBe('1')
    expect(computeColumnCalculation(msRows, 1, { type: 'checkbox' }, 'unchecked').value).toBe('2')
    expect(computeColumnCalculation(msRows, 1, { type: 'checkbox' }, 'percent_checked').value).toBe('33.3%')
    expect(computeColumnCalculation(msRows, 1, { type: 'checkbox' }, 'percent_unchecked').value).toBe('66.7%')

    expect(
      computeColumnCalculation(msRows, 2, { type: 'date' }, 'earliest', 'yyyy-MM-dd', refDate).value
    ).toBe('2026-11-10')
    expect(
      computeColumnCalculation(msRows, 2, { type: 'date' }, 'latest', 'yyyy-MM-dd', refDate).value
    ).toBe('2026-11-25')
    expect(
      computeColumnCalculation(msRows, 2, { type: 'date' }, 'date_range', 'yyyy-MM-dd', refDate).value
    ).toBe('15 days')
  })
})

describe('Number column sorting, filtering, and schema persistence', () => {
  it('filters and sorts Number columns across currency, negative, and non-numeric values', () => {
    expect(matchesFilter('$150', { id: 'n1', col: 0, op: 'gt', value: '100' }, 'number')).toBe(true)
    expect(matchesFilter('($50)', { id: 'n1', col: 0, op: 'lt', value: '0' }, 'number')).toBe(true)
    expect(matchesFilter('$100', { id: 'n1', col: 0, op: 'eq', value: '100' }, 'number')).toBe(true)
    expect(matchesFilter('TBD', { id: 'n1', col: 0, op: 'neq', value: '100' }, 'number')).toBe(false)
    expect(matchesFilter('', { id: 'n1', col: 0, op: 'is_empty' }, 'number')).toBe(true)

    const t: TableData = {
      headers: ['Item', 'Amount'],
      alignments: [null, null],
      columns: [{ type: 'text' }, { type: 'number' }],
      rows: [
        ['A', '$1,000'],
        ['B', '($20)'],
        ['C', 'TBD'],
        ['D', '$100'],
        ['E', ''],
      ],
    }
    const sorted = sortByColumn(t, 1, 'asc')
    expect(sorted.rows.map((r) => r[1])).toEqual(['($20)', '$100', '$1,000', 'TBD', ''])
  })

  it('persists column calculations in nt-schema and prunes invalid calc on type switch', () => {
    let t: TableData = {
      headers: ['Name', 'Price'],
      alignments: [null, null],
      rows: [
        ['A', '$10'],
        ['B', '$20'],
      ],
    }

    t = setColumnCalculation(t, 0, 'count_all')
    const mdPlain = serializeTable(t)
    expect(mdPlain).toContain('nt-schema')
    const segPlain = parseBlockSegments(mdPlain)[0]
    if (segPlain.type !== 'table') throw new Error('Expected table')
    expect(segPlain.table.columns?.[0].calc).toBe('count_all')

    t = setColumnCalculation(t, 0, 'none')
    expect(serializeTable(t)).not.toContain('nt-schema')

    t = setColumnType(t, 1, 'number')
    t = setColumnCalculation(t, 1, 'sum')
    const mdNum = serializeTable(t)
    const segNum = parseBlockSegments(mdNum)[0]
    if (segNum.type !== 'table') throw new Error('Expected table')
    expect(segNum.table.columns?.[1].type).toBe('number')
    expect(segNum.table.columns?.[1].calc).toBe('sum')

    // Switching Number -> Text drops 'sum' (invalid for text)
    const backToText = setColumnType(segNum.table, 1, 'text')
    expect(backToText.columns).toBeUndefined()

    // clearAllColumnCalculations clears all calc fields while keeping column types
    let multiCalc = setColumnType(t, 1, 'number')
    multiCalc = setColumnCalculation(multiCalc, 0, 'count_all')
    multiCalc = setColumnCalculation(multiCalc, 1, 'sum')
    const clearedCalcs = clearAllColumnCalculations(multiCalc)
    expect(clearedCalcs.columns).toEqual([{ type: 'text' }, { type: 'number' }])
  })
})

describe('Number column + Calculate footer end-to-end', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('supports switching to Number, calculating Sum over filtered rows, live updates, and persistence across remount', async () => {
    const blocks: Record<string, string> = {
      'uuid-calc': [
        '| Item | Category | Cost |',
        '| --- | --- | --- |',
        '| Laptop | Hardware | $1,000 |',
        '| Mouse | Hardware | $50 |',
        '| SaaS | Software | $200 |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"select","options":[{"id":"c1","label":"Hardware","color":"blue"},{"id":"c2","label":"Software","color":"green"}]},{"type":"text"}]} -->',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-calc'))

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
        })
      )

    let observer = makeObserver()
    observer.start()
    await observer.scan()

    let host = document.querySelector('.nt-host') as HTMLElement

    // 1. Switch Cost column (col 2) to Number via column handle menu
    const costHandle = host.querySelector('thead th[data-col="2"] .nt-col-handle') as HTMLButtonElement
    costHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    const numMenuBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Number'
    ) as HTMLButtonElement
    numMenuBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    // Number body cells default to right alignment
    const costCell = host.querySelector('tbody tr td[data-col="2"]') as HTMLElement
    expect(costCell.classList.contains('nt-align-right')).toBe(true)

    // 2. Click Calculate footer button on Cost column -> choose Sum
    const calcBtn = host.querySelectorAll('tfoot .nt-calc-btn')[2] as HTMLButtonElement
    calcBtn.click()
    const sumMenuBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Sum'
    ) as HTMLButtonElement
    sumMenuBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-has-calc')).toBe(true)
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[2]?.textContent).toContain('$1,250')

    // 3. Filter Category = Hardware -> Sum updates live to $1,050
    ;(host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement).click()
    const catItem = Array.from(document.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Category')
    ) as HTMLButtonElement
    catItem.click()
    const hwOpt = Array.from(document.querySelectorAll('.nt-fp-opt-btn')).find((b) =>
      b.textContent?.includes('Hardware')
    ) as HTMLButtonElement
    hwOpt.click()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[2]?.textContent).toContain('$1,050')

    // 4. Edit Mouse cost $50 -> $100 -> Sum updates live to $1,100
    const mouseCostCell = host.querySelectorAll('tbody tr')[1].querySelector('td[data-col="2"]') as HTMLElement
    mouseCostCell.click()
    const ta = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    ta.value = '$100'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[2]?.textContent).toContain('$1,100')
    ta.dispatchEvent(new Event('blur'))
    await new Promise((r) => setTimeout(r, 20))

    // 5. Remount persists Number type + Sum + active filter
    observer.destroy()
    observer = makeObserver()
    observer.start()
    await observer.scan()
    host = document.querySelector('.nt-host') as HTMLElement
    expect(host.classList.contains('nt-has-calc')).toBe(true)
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[2]?.textContent).toContain('$1,100')

    // 6. Add another calculation on Item column, verify Clear all is in cell menu, then Clear all via calculate row handle menu
    const itemCalcBtn = host.querySelectorAll('tfoot .nt-calc-btn')[0] as HTMLButtonElement
    itemCalcBtn.click()
    expect(
      Array.from(document.querySelectorAll('.nt-popover-item')).some(
        (b) => b.textContent?.trim() === 'Clear all'
      )
    ).toBe(true)
    const countAllBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Count'
    ) as HTMLButtonElement
    countAllBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[0]?.textContent).toContain('2')

    const calcRowHandle = host.querySelector('tfoot .nt-calc-row-handle') as HTMLButtonElement
    expect(calcRowHandle).not.toBeNull()
    calcRowHandle.click()
    const clearAllBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Clear all'
    ) as HTMLButtonElement
    expect(clearAllBtn).toBeDefined()
    clearAllBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-has-calc')).toBe(false)
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[0]?.textContent).toBe('Calculate')
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[2]?.textContent).toBe('Calculate')
    expect(blocks['uuid-calc']).toContain('"type":"number"')
    expect(blocks['uuid-calc']).not.toContain('"calc"')

    observer.destroy()
  })

  it('toggles calculation row visibility via Calc context menu item without hover reveal', async () => {
    expect(STYLES).not.toContain('.nt-host:hover table.nt-table tfoot')
    expect(STYLES).not.toContain('.nt-host:focus-within table.nt-table tfoot')
    expect(STYLES).not.toContain('.nt-host:hover .nt-calc-placeholder')
    expect(STYLES).toContain('.nt-host.nt-show-calc table.nt-table tfoot')

    const blocks: Record<string, string> = {
      'uuid-calc-toggle': [
        '| Item | Cost |',
        '| --- | --- |',
        '| A | 10 |',
        '| B | 25 |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"number"}]} -->',
      ].join('\n'),
    }

    document.body.appendChild(createBlockDom('uuid-calc-toggle'))

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
        })
      )

    let observer = makeObserver()
    await observer.scan()

    let host = document.querySelector('.nt-host') as HTMLElement
    expect(host.classList.contains('nt-show-calc')).toBe(false)

    // 1. Open cell context menu -> Calc toggle is OFF -> click to turn ON
    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })
    )
    const calcToggle1 = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Calc'
    ) as HTMLButtonElement
    expect(calcToggle1).toBeDefined()
    expect(calcToggle1.getAttribute('role')).toBe('menuitemcheckbox')
    expect(calcToggle1.getAttribute('aria-checked')).toBe('false')
    calcToggle1.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-show-calc')).toBe(true)
    expect(blocks['uuid-calc-toggle']).toContain('"showCalc":true')

    // 2. Remount preserves Calc row visibility; set Sum on Cost
    observer.destroy()
    observer = makeObserver()
    await observer.scan()
    host = document.querySelector('.nt-host') as HTMLElement
    expect(host.classList.contains('nt-show-calc')).toBe(true)

    ;(host.querySelectorAll('tfoot .nt-calc-btn')[1] as HTMLButtonElement).click()
    const sumBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Sum'
    ) as HTMLButtonElement
    sumBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[1]?.textContent).toContain('35')

    // 3. Toggle Calc OFF via context menu -> row hides while preserving Sum config
    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })
    )
    const calcToggle2 = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Calc'
    ) as HTMLButtonElement
    expect(calcToggle2.getAttribute('aria-checked')).toBe('true')
    calcToggle2.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-show-calc')).toBe(false)
    expect(host.classList.contains('nt-has-calc')).toBe(true)
    expect(blocks['uuid-calc-toggle']).toContain('"showCalc":false')
    expect(blocks['uuid-calc-toggle']).toContain('"calc":"sum"')

    // 4. Toggle Calc back ON -> Sum row reappears with preserved value, then toggle OFF via calc row handle
    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })
    )
    const calcToggle3 = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Calc'
    ) as HTMLButtonElement
    expect(calcToggle3.getAttribute('aria-checked')).toBe('false')
    calcToggle3.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-show-calc')).toBe(true)
    expect(host.querySelectorAll('tfoot .nt-calc-btn')[1]?.textContent).toContain('35')

    ;(host.querySelector('tfoot .nt-calc-row-handle') as HTMLButtonElement).click()
    const calcToggleFromRow = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Calc'
    ) as HTMLButtonElement
    expect(calcToggleFromRow.getAttribute('aria-checked')).toBe('true')
    calcToggleFromRow.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.classList.contains('nt-show-calc')).toBe(false)

    // 5. Toolbar Calc toggle button toggles calculation row on/off with active bold styling
    expect(STYLES).toContain('.nt-tb-btn.nt-tb-calc-btn {\n  font-weight: 400;\n}')
    expect(STYLES).toContain('.nt-tb-btn.nt-tb-calc-btn.nt-active {\n  font-weight: 700;\n}')

    const tbCalcOff = host.querySelector('.nt-tb-calc-btn') as HTMLButtonElement
    expect(tbCalcOff).not.toBeNull()
    expect(tbCalcOff.textContent?.trim()).toBe('Calc')
    expect(tbCalcOff.classList.contains('nt-active')).toBe(false)
    expect(tbCalcOff.getAttribute('aria-pressed')).toBe('false')
    tbCalcOff.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-show-calc')).toBe(true)
    const tbCalcOn = host.querySelector('.nt-tb-calc-btn') as HTMLButtonElement
    expect(tbCalcOn.classList.contains('nt-active')).toBe(true)
    expect(tbCalcOn.getAttribute('aria-pressed')).toBe('true')
    tbCalcOn.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.classList.contains('nt-show-calc')).toBe(false)
    expect((host.querySelector('.nt-tb-calc-btn') as HTMLButtonElement).classList.contains('nt-active')).toBe(false)

    observer.destroy()
  })
})
