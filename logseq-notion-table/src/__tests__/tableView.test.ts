import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import { STYLES } from '../styles'

function createLogseqBlockDom(uuid: string, extraClasses = ''): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = `block-content inline ${extraClasses}`.trim()
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  const nativeTable = document.createElement('table')
  nativeTable.className = 'table-auto'
  nativeTable.innerHTML = '<thead><tr><th>Task</th><th>Owner</th></tr></thead><tbody><tr><td>Write docs</td><td>[[Alice]]</td></tr></tbody>'
  wrapper.appendChild(nativeTable)

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('DomObserver + TableView integration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('mounts Notion table as sibling without mutating .table-wrapper and skips query/logbook/tippy tables', async () => {
    const blocks: Record<string, string> = {
      'uuid-1': '| Task | Owner |\n| --- | --- |\n| Write docs | [[Alice]] |',
      'uuid-query': '| A | B |\n| --- | --- |\n| 1 | 2 |',
    }

    const normalBlock = createLogseqBlockDom('uuid-1')
    const queryBlock = createLogseqBlockDom('uuid-query')
    queryBlock.querySelector('.table-wrapper')!.classList.add('query-table')

    const tippy = document.createElement('div')
    tippy.className = 'tippy-popper'
    tippy.appendChild(createLogseqBlockDom('uuid-1'))

    document.body.append(normalBlock, queryBlock, tippy)

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

    await observer.scan()

    const hosts = document.querySelectorAll('.nt-host')
    expect(hosts).toHaveLength(1)

    const wrapper = normalBlock.querySelector('.table-wrapper')!
    expect(wrapper.getAttribute('data-nt-hidden')).toBe('true')
    // Native table inside .table-wrapper untouched
    expect(wrapper.querySelector('table.table-auto')).not.toBeNull()
    expect(wrapper.nextElementSibling).toBe(hosts[0])

    // Clicking inside .nt-host stops mousedown propagation to .block-content
    const parentMouseDown = vi.fn()
    normalBlock.addEventListener('mousedown', parentMouseDown)
    hosts[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(parentMouseDown).not.toHaveBeenCalled()

    // Destroy restores .table-wrapper and removes .nt-host
    observer.destroy()
    expect(document.querySelectorAll('.nt-host')).toHaveLength(0)
    expect(wrapper.getAttribute('data-nt-hidden')).toBeNull()
  })

  it('supports inline cell editing, Tab row append, + bars, and popover actions', async () => {
    const blocks: Record<string, string> = {
      'uuid-edit': '| Task | Owner |\n| --- | --- |\n| Draft | [[Bob]] |',
    }
    const updateBlock = vi.fn(async (uuid: string, content: string) => {
      blocks[uuid] = content
    })
    const openPage = vi.fn()

    const blockEl = createLogseqBlockDom('uuid-edit')
    document.body.appendChild(blockEl)

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock,
        editBlock: vi.fn(),
        openPage,
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    // Clicking [[Bob]] opens the page without entering cell edit mode
    const pageLink = host.querySelector('a.nt-page-ref') as HTMLAnchorElement
    expect(pageLink.textContent).toBe('Bob')
    pageLink.click()
    expect(openPage).toHaveBeenCalledWith('Bob', false)
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()

    // Click first body cell to edit
    const firstBodyCell = host.querySelector('tbody tr td[data-col="0"]') as HTMLElement
    firstBodyCell.click()
    const editor = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(editor).not.toBeNull()
    expect(editor.value).toBe('Draft')

    editor.value = 'Published'
    editor.dispatchEvent(new Event('input', { bubbles: true }))
    editor.dispatchEvent(new Event('blur'))

    // Wait for async save queue
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-edit']).toContain('Published')

    // Click last cell and press Tab -> appends a new row
    const lastCell = host.querySelector('tbody tr:last-child td:last-child') as HTMLElement
    lastCell.click()
    const lastEditor = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    lastEditor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Bottom + bar adds another row
    const addRowBtn = host.querySelector('.nt-add-row-bar') as HTMLButtonElement
    addRowBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)

    // Right + bar opens Add Column dialog; choosing a type creates & names the column
    const addColBtn = host.querySelector('.nt-add-col-bar') as HTMLButtonElement
    addColBtn.click()
    const addColDialog = document.querySelector('.nt-add-col-dialog') as HTMLElement
    expect(addColDialog).not.toBeNull()
    const msTypeBtn = Array.from(addColDialog.querySelectorAll('.nt-acd-type-btn')).find(
      (b) => b.textContent?.trim() === 'Multi-select'
    ) as HTMLButtonElement
    expect(msTypeBtn).toBeDefined()
    msTypeBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('.nt-add-col-dialog')).toBeNull()
    expect(host.querySelectorAll('thead th')).toHaveLength(3)
    expect(host.querySelectorAll('thead th')[2]?.textContent).toContain('Multi-select')

    // Right-click a cell to open popover menu and sort column
    const cell = host.querySelector('tbody td') as HTMLElement
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 50, clientY: 50 }))
    const popover = document.querySelector('.nt-popover')
    expect(popover).not.toBeNull()
    const headers = Array.from(popover!.querySelectorAll('.nt-popover-header')).map(
      (h) => h.textContent
    )
    expect(headers).not.toContain('Column 1')
    expect(headers).toContain('Column Type')

    const sortBtn = Array.from(popover!.querySelectorAll('.nt-popover-item')).find((b) =>
      b.textContent?.includes('Sort A → Z')
    ) as HTMLButtonElement
    expect(sortBtn).toBeDefined()
    sortBtn.click()
    expect(document.querySelector('.nt-popover')).toBeNull()

    observer.destroy()
  })

  it('cleans up orphaned .nt-host when .table-wrapper is removed from DOM', async () => {
    const blocks: Record<string, string> = {
      'uuid-orphan': '| A | B |\n| --- | --- |\n| 1 | 2 |',
    }
    const blockEl = createLogseqBlockDom('uuid-orphan')
    document.body.appendChild(blockEl)

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: vi.fn(),
        editBlock: vi.fn(),
        openPage: vi.fn(),
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    await observer.scan()
    expect(document.querySelectorAll('.nt-host')).toHaveLength(1)

    // Simulate Logseq re-rendering block without a table
    blockEl.querySelector('.table-wrapper')!.remove()
    await observer.scan()
    expect(document.querySelectorAll('.nt-host')).toHaveLength(0)

    observer.destroy()
  })

  it('uses compact padding, keyboard-accessible horizontal scroll container, and per-column resize width constraints', async () => {
    const blocks: Record<string, string> = {
      'uuid-scroll': '| Col1 | Col2 |\n| --- | --- |\n| Alpha | Beta |',
    }
    const blockEl = createLogseqBlockDom('uuid-scroll')
    document.body.appendChild(blockEl)

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: vi.fn(),
        editBlock: vi.fn(),
        openPage: vi.fn(),
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    const scroll = host.querySelector('.nt-scroll') as HTMLElement
    expect(scroll).not.toBeNull()
    expect(scroll.getAttribute('role')).toBe('region')
    expect(scroll.getAttribute('aria-label')).toBe('Table')
    expect(scroll.tabIndex).toBe(0)

    expect(STYLES).toContain('padding: 4px 7px !important;')
    expect(STYLES).toContain('width: max-content;')
    expect(STYLES).toContain('overflow-x: auto;')
    expect(STYLES).toContain('table-layout: auto;')

    const resizer = host.querySelector('thead th[data-col="0"] .nt-col-resizer') as HTMLElement
    resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 100, button: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 220 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    const col0Cells = Array.from(host.querySelectorAll('th[data-col="0"], td[data-col="0"]')) as HTMLElement[]
    expect(col0Cells.every((c) => c.classList.contains('nt-col-resized'))).toBe(true)
    expect(col0Cells[0].style.getPropertyValue('--nt-cell-max-w')).not.toBe('')

    resizer.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(col0Cells.every((c) => !c.classList.contains('nt-col-resized'))).toBe(true)
    expect(col0Cells[0].style.getPropertyValue('--nt-cell-max-w')).toBe('')

    observer.destroy()
  })

  it('handles Add Column dialog dismiss, Enter/click-away default Text, and type selection naming', async () => {
    const blocks: Record<string, string> = {
      'uuid-addcol': '| Item |\n| --- |\n| Alpha |',
    }
    document.body.appendChild(createLogseqBlockDom('uuid-addcol'))

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

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    const openDialog = () => {
      ;(host.querySelector('.nt-add-col-bar') as HTMLButtonElement).click()
      return document.querySelector('.nt-add-col-dialog') as HTMLElement
    }

    // 1. Click away without entering name or selecting type -> dismiss without creating column
    // Also verify dialog anchors near thead (title row) rather than bottom of full-height + bar
    const addBar = host.querySelector('.nt-add-col-bar') as HTMLButtonElement
    const thead = host.querySelector('thead') as HTMLElement
    vi.spyOn(addBar, 'getBoundingClientRect').mockReturnValue({
      left: 300,
      right: 316,
      top: 100,
      bottom: 500,
      width: 16,
      height: 400,
      x: 300,
      y: 100,
      toJSON: () => ({}),
    })
    vi.spyOn(thead, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 297,
      top: 100,
      bottom: 130,
      width: 197,
      height: 30,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    })

    let dlg = openDialog()
    expect(dlg).not.toBeNull()
    expect(Number.parseFloat(dlg.style.top)).toBeLessThan(150)
    await new Promise((r) => setTimeout(r, 10))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(document.querySelector('.nt-add-col-dialog')).toBeNull()
    expect(host.querySelectorAll('thead th')).toHaveLength(1)

    // 2. Enter name and press Enter -> creates Text column with that name
    dlg = openDialog()
    let input = dlg.querySelector('.nt-acd-input') as HTMLInputElement
    input.value = 'Notes'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('.nt-add-col-dialog')).toBeNull()
    expect(host.querySelectorAll('thead th')).toHaveLength(2)
    expect(host.querySelectorAll('thead th')[1]?.textContent).toContain('Notes')
    expect(blocks['uuid-addcol']).not.toContain('nt-schema')

    // 3. Enter name and click away -> creates Text column with that name
    dlg = openDialog()
    input = dlg.querySelector('.nt-acd-input') as HTMLInputElement
    input.value = 'Owner'
    await new Promise((r) => setTimeout(r, 10))
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('.nt-add-col-dialog')).toBeNull()
    expect(host.querySelectorAll('thead th')).toHaveLength(3)
    expect(host.querySelectorAll('thead th')[2]?.textContent).toContain('Owner')

    // 4. Select a type without typing a name -> names column after type ("Multi-select") and closes
    dlg = openDialog()
    const msBtn = Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
      (b) => b.textContent?.trim() === 'Multi-select'
    ) as HTMLButtonElement
    msBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(document.querySelector('.nt-add-col-dialog')).toBeNull()
    expect(host.querySelectorAll('thead th')).toHaveLength(4)
    expect(host.querySelectorAll('thead th')[3]?.textContent).toContain('Multi-select')
    expect(blocks['uuid-addcol']).toContain('"type":"multi-select"')

    // 5. Enter custom name AND select type -> keeps custom name with chosen type
    dlg = openDialog()
    input = dlg.querySelector('.nt-acd-input') as HTMLInputElement
    input.value = 'Due Date'
    const dateBtn = Array.from(dlg.querySelectorAll('.nt-acd-type-btn')).find(
      (b) => b.textContent?.trim() === 'Date'
    ) as HTMLButtonElement
    dateBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('thead th')).toHaveLength(5)
    expect(host.querySelectorAll('thead th')[4]?.textContent).toContain('Due Date')
    expect(blocks['uuid-addcol']).toContain('"type":"date"')

    observer.destroy()
  })

  it('locks table via context menu, enforces read-only mode with visible lock icon, allows sorting/filtering, and unlocks on lock click', async () => {
    const blocks: Record<string, string> = {
      'uuid-lock': [
        '| Task | Done | Due | Notes |',
        '| --- | --- | --- | --- |',
        '| Zebra | [ ] | [[2026-11-25]] | [ ] Subtask [[Page A]] |',
        '| Alpha | [x] | [[2026-11-26]] | Beta |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"checkbox"},{"type":"date"},{"type":"text"}]} -->',
      ].join('\n'),
    }
    const openPage = vi.fn()
    document.body.appendChild(createLogseqBlockDom('uuid-lock'))

    const makeObserver = () =>
      new DomObserver(
        document,
        {
          getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
          updateBlock: async (uuid, content) => {
            blocks[uuid] = content
          },
          editBlock: vi.fn(),
          openPage,
        },
        () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
      )

    let observer = makeObserver()
    await observer.scan()
    let host = document.querySelector('.nt-host') as HTMLElement

    // Open table context menu and click "Lock table"
    const firstCell = host.querySelector('tbody td[data-col="0"]') as HTMLElement
    firstCell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 }))
    const lockItem = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Lock table'
    ) as HTMLButtonElement
    expect(lockItem).toBeDefined()
    lockItem.click()
    await new Promise((r) => setTimeout(r, 20))

    // Locked visual state + persisted in Markdown
    expect(host.classList.contains('nt-locked')).toBe(true)
    expect(blocks['uuid-lock']).toContain('"locked":true')
    const lockBadge = host.querySelector('.nt-lock-badge') as HTMLButtonElement
    expect(lockBadge).not.toBeNull()
    expect(lockBadge.querySelector('svg')).not.toBeNull()

    // Handles, resizers, + bars, and cell edit buttons are hidden/removed
    expect(host.querySelector('.nt-add-row-bar')).toBeNull()
    expect(host.querySelector('.nt-add-col-bar')).toBeNull()
    expect(host.querySelector('.nt-col-handle')).toBeNull()
    expect(host.querySelector('.nt-row-handle')).toBeNull()
    expect(host.querySelector('.nt-col-resizer')).toBeNull()
    expect(host.querySelector('.nt-cell-edit-btn')).toBeNull()

    // Table cells are read-only: clicking text/date/checkbox cells does not edit or toggle
    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).click()
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    ;(host.querySelector('tbody td[data-col="2"]') as HTMLElement).click()
    expect(document.querySelector('.nt-date-popover')).toBeNull()
    const colCb = host.querySelector('input.nt-col-checkbox') as HTMLInputElement
    expect(colCb.disabled).toBe(true)
    const inlineCb = host.querySelector('input.nt-checkbox') as HTMLInputElement
    expect(inlineCb.disabled).toBe(true)

    // Links remain clickable while locked
    const pageLink = host.querySelector('a.nt-page-ref') as HTMLAnchorElement
    pageLink.click()
    expect(openPage).toHaveBeenCalled()

    // Sorting and filtering remain enabled while locked
    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 40 })
    )
    const sortAscItem = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.includes('Sort A → Z')
    ) as HTMLButtonElement
    expect(sortAscItem).toBeDefined()
    sortAscItem.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Alpha')
    expect(host.classList.contains('nt-locked')).toBe(true)

    const tbFilterBtn = host.querySelector('.nt-tb-filter-btn') as HTMLButtonElement
    expect(tbFilterBtn.disabled).toBe(false)
    tbFilterBtn.click()
    const filterTaskItem = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.includes('Task')
    ) as HTMLButtonElement
    expect(filterTaskItem).toBeDefined()
    filterTaskItem.click()
    const fpInput = document.querySelector('.nt-fp-input') as HTMLInputElement
    fpInput.value = 'Zebra'
    fpInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(host.querySelector('tbody tr td[data-col="0"]')?.textContent).toBe('Zebra')
    ;(host.querySelector('.nt-filter-clear-btn') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Remount preserves locked state
    observer.destroy()
    observer = makeObserver()
    await observer.scan()
    host = document.querySelector('.nt-host') as HTMLElement
    expect(host.classList.contains('nt-locked')).toBe(true)
    expect(host.querySelector('.nt-lock-badge')).not.toBeNull()

    // Clicking the lock icon unlocks the table and restores editing
    ;(host.querySelector('.nt-lock-badge') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.classList.contains('nt-locked')).toBe(false)
    expect(host.querySelector('.nt-lock-badge')).toBeNull()
    expect(blocks['uuid-lock']).not.toContain('"locked"')
    expect(host.querySelector('.nt-add-col-bar')).not.toBeNull()

    ;(host.querySelector('tbody td[data-col="0"]') as HTMLElement).click()
    expect(host.querySelector('textarea.nt-cell-editor')).not.toBeNull()

    observer.destroy()
  })

  it('omits header/column highlight and width toggle buttons from toolbar and always highlights header row', async () => {
    const blocks: Record<string, string> = {
      'uuid-toolbar': '| Name | Role |\n| --- | --- |\n| Alice | Admin |',
    }
    localStorage.setItem(
      'nt-prefs:uuid-toolbar:0',
      JSON.stringify({ headerRow: false, headerCol: true, fullWidth: true })
    )
    document.body.appendChild(createLogseqBlockDom('uuid-toolbar'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: vi.fn(),
        editBlock: vi.fn(),
        openPage: vi.fn(),
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    const toolbarTitles = Array.from(host.querySelectorAll('.nt-toolbar .nt-tb-btn')).map(
      (b) => b.getAttribute('title') || ''
    )

    expect(toolbarTitles).not.toContain('Toggle header row highlight')
    expect(toolbarTitles).not.toContain('Toggle header column highlight')
    expect(toolbarTitles).not.toContain('Full width')
    expect(toolbarTitles).not.toContain('Compact width')

    expect(host.classList.contains('nt-header-col')).toBe(false)
    expect(host.classList.contains('nt-full-width')).toBe(false)
    expect(STYLES).toContain('table.nt-table thead th {\n  background: var(--nt-header-bg) !important;\n  font-weight: 600;\n}')
    expect(STYLES).not.toContain('.nt-header-row')
    expect(STYLES).not.toContain('.nt-header-col')

    observer.destroy()
  })

  it('supports Notion-style multi-row checkbox selection (click, drag, select-all), cell drag-selection, Markdown copy, and multi-column paste', async () => {
    const blocks: Record<string, string> = {
      'uuid-sel': [
        '| Task | Date | Project | Tags | Cost |',
        '| --- | --- | --- | --- | --- |',
        '| o | [[Nov 10th, 2026]] | Project | no, yes | $100 |',
        '| alpha | [[Nov 11th, 2026]] | Beta | yes | $200 |',
        '| gamma | [[Nov 12th, 2026]] | Delta | no | $300 |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"date"},{"type":"text"},{"type":"multi-select","options":[{"id":"o1","label":"no","color":"gray"},{"id":"o2","label":"yes","color":"blue"}]},{"type":"text"}]} -->',
      ].join('\n'),
    }
    document.body.appendChild(createLogseqBlockDom('uuid-sel'))

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

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    const headCb = host.querySelector('thead th[data-col="0"] input.nt-row-select') as HTMLInputElement
    const rowEls = Array.from(host.querySelectorAll('tbody tr[data-body-idx]')) as HTMLElement[]
    const rowCbs = rowEls.map(
      (tr) => tr.querySelector('td[data-col="0"] input.nt-row-select') as HTMLInputElement
    )

    // Mock bounding rects for drag-selecting row checkboxes
    rowEls.forEach((tr, idx) => {
      vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        right: 400,
        top: 40 + idx * 30,
        bottom: 70 + idx * 30,
        width: 400,
        height: 30,
        x: 0,
        y: 40 + idx * 30,
        toJSON: () => ({}),
      })
    })

    // 1. Click-and-drag from row 0 checkbox to row 1 checkbox selects both rows & sets header indeterminate
    rowCbs[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY: 55 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientY: 85 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(host.classList.contains('nt-has-row-selection')).toBe(true)
    expect(rowEls[0].classList.contains('nt-row-selected')).toBe(true)
    expect(rowEls[1].classList.contains('nt-row-selected')).toBe(true)
    expect(rowEls[2].classList.contains('nt-row-selected')).toBe(false)
    expect(rowCbs[0].checked).toBe(true)
    expect(rowCbs[1].checked).toBe(true)
    expect(headCb.indeterminate).toBe(true)
    expect(headCb.getAttribute('aria-checked')).toBe('mixed')

    // 2. Copying selected rows outputs clean GFM Markdown table in text/plain + structured payload
    const copiedData: Record<string, string> = {}
    const copyEvent = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(copyEvent, 'clipboardData', {
      value: {
        setData: (type: string, val: string) => {
          copiedData[type] = val
        },
      },
    })
    host.dispatchEvent(copyEvent)

    expect(copyEvent.defaultPrevented).toBe(true)
    expect(copiedData['text/plain']).toContain('| Task')
    expect(copiedData['text/plain']).toContain('| o')
    expect(copiedData['text/plain']).toContain('[[Nov 10th, 2026]]')
    expect(copiedData['text/plain']).toContain('no, yes')
    expect(copiedData['text/plain']).toContain('| alpha')
    expect(copiedData['text/plain']).not.toContain('/page/')
    expect(copiedData['text/plain']).not.toContain('nt-schema')
    expect(copiedData['text/html']).toBeUndefined()
    expect(copiedData['application/x-logseq-notion-table']).toBeDefined()

    // 3. Header checkbox click selects all remaining rows -> checked; clicking again clears all
    headCb.click()
    expect(rowEls.every((tr) => tr.classList.contains('nt-row-selected'))).toBe(true)
    expect(headCb.checked).toBe(true)
    expect(headCb.indeterminate).toBe(false)

    headCb.click()
    expect(host.classList.contains('nt-has-row-selection')).toBe(false)
    expect(rowEls.every((tr) => !tr.classList.contains('nt-row-selected'))).toBe(true)

    // 4. Dragging across cells selects rectangular range without opening cell editor
    const startCell = host.querySelector('tbody tr[data-body-idx="0"] td[data-col="0"]') as HTMLElement
    const endCell = host.querySelector('tbody tr[data-body-idx="1"] td[data-col="2"]') as HTMLElement
    const headCells = Array.from(host.querySelectorAll('thead th[data-col]')) as HTMLElement[]
    headCells.forEach((hc, idx) => {
      vi.spyOn(hc, 'getBoundingClientRect').mockReturnValue({
        left: idx * 80,
        right: (idx + 1) * 80,
        top: 0,
        bottom: 30,
        width: 80,
        height: 30,
        x: idx * 80,
        y: 0,
        toJSON: () => ({}),
      })
    })
    const allTrs = Array.from(host.querySelectorAll('thead tr, tbody tr[data-body-idx]')) as HTMLElement[]
    allTrs.forEach((tr, idx) => {
      vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        right: 400,
        top: idx * 30,
        bottom: (idx + 1) * 30,
        width: 400,
        height: 30,
        x: 0,
        y: idx * 30,
        toJSON: () => ({}),
      })
    })

    startCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 45 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 75 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    expect(startCell.classList.contains('nt-cell-selected')).toBe(true)
    expect(endCell.classList.contains('nt-cell-selected')).toBe(true)
    expect(
      (host.querySelector('tbody tr[data-body-idx="2"] td[data-col="0"]') as HTMLElement).classList.contains(
        'nt-cell-selected'
      )
    ).toBe(false)

    // 5. Pasting copied Markdown table (or custom payload) into a body cell populates across columns, not single column
    const targetCell = host.querySelector('tbody tr[data-body-idx="2"] td[data-col="0"]') as HTMLElement
    await new Promise((r) => setTimeout(r, 10))
    targetCell.click()
    const editor = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(editor).not.toBeNull()

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) => {
          if (type === 'text/plain') return copiedData['text/plain']
          if (type === 'application/x-logseq-notion-table')
            return copiedData['application/x-logseq-notion-table']
          return ''
        },
      },
    })
    editor.dispatchEvent(pasteEvent)
    await new Promise((r) => setTimeout(r, 20))

    expect(pasteEvent.defaultPrevented).toBe(true)
    const updatedRows = Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
    expect(updatedRows).toHaveLength(4)
    expect(updatedRows[2].querySelector('td[data-col="0"]')?.textContent).toBe('o')
    expect(updatedRows[2].querySelector('td[data-col="1"]')?.textContent).toContain('Nov 10th, 2026')
    expect(updatedRows[2].querySelector('td[data-col="2"]')?.textContent).toBe('Project')
    expect(updatedRows[2].querySelector('td[data-col="4"]')?.textContent).toBe('$100')
    expect(updatedRows[3].querySelector('td[data-col="0"]')?.textContent).toBe('alpha')
    expect(updatedRows[3].querySelector('td[data-col="2"]')?.textContent).toBe('Beta')

    // 6. Pasting raw Markdown table text without custom MIME also populates across columns
    const r3Cell0 = host.querySelector('tbody tr[data-body-idx="2"] td[data-col="0"]') as HTMLElement
    r3Cell0.click()
    const editor2 = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    const mdPasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(mdPasteEvent, 'clipboardData', {
      value: {
        files: [],
        getData: (type: string) =>
          type === 'text/plain'
            ? '| Task | Date | Project |\n| --- | --- | --- |\n| pasted | [[Nov 15th, 2026]] | Launch |'
            : '',
      },
    })
    editor2.dispatchEvent(mdPasteEvent)
    await new Promise((r) => setTimeout(r, 20))

    const rowsAfterMdPaste = Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
    expect(rowsAfterMdPaste[2].querySelector('td[data-col="0"]')?.textContent).toBe('pasted')
    expect(rowsAfterMdPaste[2].querySelector('td[data-col="1"]')?.textContent).toContain('Nov 15th, 2026')
    expect(rowsAfterMdPaste[2].querySelector('td[data-col="2"]')?.textContent).toBe('Launch')

    // 7. Selecting row via checkbox and pressing Delete removes it cleanly
    const delCb = host.querySelector(
      'tbody tr[data-body-idx="3"] td[data-col="0"] input.nt-row-select'
    ) as HTMLInputElement
    delCb.click()
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr[data-body-idx]')).toHaveLength(3)

    // 8. Row handle and checkbox live in continuous .nt-row-gutter (no hover gap), and clicking each element does not conflict
    const row0Cell = host.querySelector('tbody tr[data-body-idx="0"] td[data-col="0"]') as HTMLElement
    const row0Gutter = row0Cell.querySelector('.nt-row-gutter') as HTMLElement
    const row0Handle = row0Gutter.querySelector('.nt-row-handle') as HTMLButtonElement
    const row0Select = row0Gutter.querySelector('.nt-row-select') as HTMLInputElement
    expect(row0Handle).not.toBeNull()
    expect(row0Select).not.toBeNull()
    expect(Array.from(row0Gutter.children)).toEqual([row0Select, row0Handle])
    expect(STYLES).toContain('padding: 10px 16px 8px 26px;')
    expect(STYLES).toContain('left: -25px;\n  width: 25px;')
    expect(STYLES).toContain('margin-right: -9px;')

    // Clicking handle opens row popover without toggling checkbox or editing cell
    row0Handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 45 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 5, clientY: 45 }))
    expect(document.querySelector('.nt-popover')).not.toBeNull()
    expect(row0Select.checked).toBe(false)
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    await new Promise((r) => setTimeout(r, 10))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    // Clicking checkbox selects row without editing cell or opening row popover
    row0Select.click()
    expect(row0Select.checked).toBe(true)
    expect(document.querySelector('.nt-popover')).toBeNull()
    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    row0Select.click()
    expect(row0Select.checked).toBe(false)

    // Clicking cell 0 edits cell without toggling checkbox
    row0Cell.click()
    const cell0Editor = row0Cell.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(cell0Editor).not.toBeNull()
    expect(row0Select.checked).toBe(false)
    cell0Editor.dispatchEvent(new Event('blur'))

    // 9. Pressing Escape on a subset cell selection switches to whole-row selection for those N rows, second Esc clears
    const cellA = host.querySelector('tbody tr[data-body-idx="0"] td[data-col="0"]') as HTMLElement
    const cellB = host.querySelector('tbody tr[data-body-idx="1"] td[data-col="1"]') as HTMLElement
    const updatedTrs = Array.from(host.querySelectorAll('thead tr, tbody tr[data-body-idx]')) as HTMLElement[]
    updatedTrs.forEach((tr, idx) => {
      vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        right: 400,
        top: idx * 30,
        bottom: (idx + 1) * 30,
        width: 400,
        height: 30,
        x: 0,
        y: idx * 30,
        toJSON: () => ({}),
      })
    })
    cellA.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 45 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 120, clientY: 75 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    expect(cellA.classList.contains('nt-cell-selected')).toBe(true)
    expect(cellB.classList.contains('nt-cell-selected')).toBe(true)

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(cellA.classList.contains('nt-cell-selected')).toBe(false)
    const afterEscRows = Array.from(host.querySelectorAll('tbody tr[data-body-idx]')) as HTMLElement[]
    expect(afterEscRows[0].classList.contains('nt-row-selected')).toBe(true)
    expect(afterEscRows[1].classList.contains('nt-row-selected')).toBe(true)
    expect(afterEscRows[2].classList.contains('nt-row-selected')).toBe(false)
    expect((afterEscRows[0].querySelector('input.nt-row-select') as HTMLInputElement).checked).toBe(true)
    expect((afterEscRows[1].querySelector('input.nt-row-select') as HTMLInputElement).checked).toBe(true)

    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(afterEscRows.every((tr) => !tr.classList.contains('nt-row-selected'))).toBe(true)

    // 10. Dragging from outside table (.nt-scroll empty space or gutter) selects 1-N whole rows, not entry selection
    const scrollEl = host.querySelector('.nt-scroll') as HTMLElement
    scrollEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 380, clientY: 40 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 100 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 100, clientY: 100 }))

    expect(host.querySelector('textarea.nt-cell-editor')).toBeNull()
    expect(afterEscRows.every((tr) => tr.classList.contains('nt-row-selected'))).toBe(true)
    expect(afterEscRows.every((tr) => (tr.querySelector('input.nt-row-select') as HTMLInputElement).checked)).toBe(true)
    expect(host.querySelectorAll('.nt-cell-selected')).toHaveLength(0)

    observer.destroy()
  })

  it('shows bulk edit dialog on row checkbox selection for select, date, and checkbox columns plus trash delete', async () => {
    const blocks: Record<string, string> = {
      'uuid-bulk': [
        '| Task | Status | Due | Done | Notes |',
        '| --- | --- | --- | --- | --- |',
        '| One | Todo | | [ ] | alpha |',
        '| Two | Todo | | [ ] | beta |',
        '| Three | Done | [[2026-11-25]] | [x] | gamma |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"select","options":[{"id":"s1","label":"Todo","color":"gray"},{"id":"s2","label":"In Progress","color":"blue"},{"id":"s3","label":"Done","color":"green"}]},{"type":"date"},{"type":"checkbox"},{"type":"text"}]} -->',
      ].join('\n'),
    }
    document.body.appendChild(createLogseqBlockDom('uuid-bulk'))

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

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    // No bulk dialog initially
    expect(host.querySelector('.nt-bulk-bar')).toBeNull()

    // Check rows 0 and 1
    const cbs = Array.from(
      host.querySelectorAll('tbody tr[data-body-idx] input.nt-row-select')
    ) as HTMLInputElement[]
    cbs[0].click()
    cbs[1].click()

    const bulkBar = host.querySelector('.nt-bulk-bar') as HTMLElement
    expect(bulkBar).not.toBeNull()
    expect(bulkBar.querySelector('.nt-bulk-count')?.textContent).toBe('2 selected')

    // Offers buttons ONLY for select, date, and checkbox columns (not text columns Task/Notes) + trashcan
    const colBtns = Array.from(bulkBar.querySelectorAll('.nt-bulk-btn[data-col]')) as HTMLButtonElement[]
    expect(colBtns.map((b) => b.textContent?.trim())).toEqual(['Status', 'Due', 'Done'])
    expect(colBtns.map((b) => b.dataset.colType)).toEqual(['select', 'date', 'checkbox'])
    const trashBtn = bulkBar.querySelector('.nt-bulk-delete') as HTMLButtonElement
    expect(trashBtn).not.toBeNull()

    // 1. Bulk-change Select column ("Status") -> "In Progress" across selected rows
    colBtns[0].click()
    const selectPop = document.querySelector('.nt-select-popover') as HTMLElement
    expect(selectPop).not.toBeNull()
    const inProgBtn = Array.from(selectPop.querySelectorAll('.nt-sp-row-btn')).find(
      (b) => b.textContent?.trim() === 'In Progress'
    ) as HTMLButtonElement
    expect(inProgBtn).toBeDefined()
    inProgBtn.click()
    await new Promise((r) => setTimeout(r, 20))

    let rows = Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
    expect(rows[0].querySelector('td[data-col="1"]')?.textContent).toContain('In Progress')
    expect(rows[1].querySelector('td[data-col="1"]')?.textContent).toContain('In Progress')
    expect(rows[2].querySelector('td[data-col="1"]')?.textContent).toContain('Done')

    // 2. Bulk-change Date column ("Due") -> "2026-12-01" across selected rows
    const bulkBar2 = host.querySelector('.nt-bulk-bar') as HTMLElement
    ;(bulkBar2.querySelector('.nt-bulk-btn[data-col="2"]') as HTMLButtonElement).click()
    const datePop = document.querySelector('.nt-date-popover') as HTMLElement
    expect(datePop).not.toBeNull()
    const dpInput = datePop.querySelector('.nt-dp-input') as HTMLInputElement
    dpInput.value = '2026-12-01'
    dpInput.dispatchEvent(new Event('input', { bubbles: true }))
    dpInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    rows = Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
    expect(rows[0].querySelector('td[data-col="2"]')?.textContent).toContain('Dec 1st, 2026')
    expect(rows[1].querySelector('td[data-col="2"]')?.textContent).toContain('Dec 1st, 2026')
    expect(rows[2].querySelector('td[data-col="2"]')?.textContent).toContain('2026-11-25')

    // 3. Bulk-change Checkbox column ("Done") -> Checked across selected rows
    const bulkBar3 = host.querySelector('.nt-bulk-bar') as HTMLElement
    ;(bulkBar3.querySelector('.nt-bulk-btn[data-col="3"]') as HTMLButtonElement).click()
    const checkedItem = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Checked'
    ) as HTMLButtonElement
    expect(checkedItem).toBeDefined()
    checkedItem.click()
    await new Promise((r) => setTimeout(r, 20))

    rows = Array.from(host.querySelectorAll('tbody tr[data-body-idx]'))
    expect((rows[0].querySelector('td[data-col="3"] input.nt-col-checkbox') as HTMLInputElement).checked).toBe(true)
    expect((rows[1].querySelector('td[data-col="3"] input.nt-col-checkbox') as HTMLInputElement).checked).toBe(true)

    // 4. Clicking trashcan deletes selected rows and hides bulk bar
    const bulkBar4 = host.querySelector('.nt-bulk-bar') as HTMLElement
    ;(bulkBar4.querySelector('.nt-bulk-delete') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 20))

    expect(host.querySelectorAll('tbody tr[data-body-idx]')).toHaveLength(1)
    expect(host.querySelector('tbody tr[data-body-idx="0"] td[data-col="0"]')?.textContent).toBe('Three')
    expect(host.querySelector('.nt-bulk-bar')).toBeNull()

    observer.destroy()
  })
})
