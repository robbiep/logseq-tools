import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import { PageIndex } from '../host/pageIndex'
import type { TableData } from '../markdown/tableParser'
import { TableHistory } from '../ui/tableHistory'

function createBlockDom(uuid: string): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = 'block-content inline'
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  wrapper.innerHTML =
    '<table class="table-auto"><thead><tr><th>Name</th><th>Status</th><th>Done</th></tr></thead><tbody><tr><td>Alpha</td><td>Todo</td><td>[ ]</td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

const sampleTable = (val = 'A'): TableData => ({
  headers: ['Col1', 'Col2'],
  alignments: [null, null],
  rows: [[val, 'B']],
})

describe('TableHistory', () => {
  it('pushes deep-cloned snapshots, deduplicates consecutive identical states, and supports undo/redo', () => {
    const hist = new TableHistory(3)
    expect(hist.canUndo()).toBe(false)
    expect(hist.canRedo()).toBe(false)

    const s0 = sampleTable('0')
    hist.push(s0, { row: 1, col: 0 })
    // Mutating original does not corrupt snapshot
    s0.rows[0][0] = 'mutated'

    // Identical state to top is deduplicated
    hist.push(sampleTable('0'))
    hist.push(sampleTable('1'))
    hist.push(sampleTable('2'))
    hist.push(sampleTable('3')) // Exceeds maxEntries=3 -> drops '0'

    expect(hist.canUndo()).toBe(true)

    const u1 = hist.undo(sampleTable('4'))!
    expect(u1.table.rows[0][0]).toBe('3')
    expect(hist.canRedo()).toBe(true)

    const u2 = hist.undo(u1.table)!
    expect(u2.table.rows[0][0]).toBe('2')

    const r1 = hist.redo(u2.table)!
    expect(r1.table.rows[0][0]).toBe('3')

    // Pushing new change clears redo stack
    hist.push(r1.table)
    expect(hist.canRedo()).toBe(false)
  })
})

describe('DomObserver + TableView Cmd+Z Undo / Redo', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('undoes and redoes multi-step cell edits, row ops, column deletion, and checkbox toggles even when focus is on body', async () => {
    const blocks: Record<string, string> = {
      'uuid-undo':
        '| Name | Status | Done |\n| --- | --- | --- |\n| Alpha | Todo | [ ] |',
    }
    const updateBlock = vi.fn(async (uuid: string, content: string) => {
      blocks[uuid] = content
    })

    document.body.appendChild(createBlockDom('uuid-undo'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock,
        editBlock: vi.fn(),
        openPage: vi.fn(),
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // Step 1: Edit Name cell from Alpha -> Beta and blur
    const nameCell = host.querySelector('tbody tr td[data-col="0"]') as HTMLElement
    nameCell.click()
    const ta = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    ta.value = 'Beta'
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.dispatchEvent(new Event('blur'))

    // Step 2: Add a row via bottom + bar
    ;(host.querySelector('.nt-add-row-bar') as HTMLButtonElement).click()

    // Step 3: Switch Done column to Checkbox & toggle Row 1 checkbox
    const doneHandle = host.querySelector('thead th[data-col="2"] .nt-col-handle') as HTMLButtonElement
    doneHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    const chkTypeBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Checkbox'
    ) as HTMLButtonElement
    chkTypeBtn.click()

    const cbCell = host.querySelector('tbody tr td[data-col="2"]') as HTMLElement
    cbCell.click()

    // Step 4: Delete Status column
    const statusHandle = host.querySelector('thead th[data-col="1"] .nt-col-handle') as HTMLButtonElement
    statusHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }))
    const delColBtn = Array.from(document.querySelectorAll('.nt-popover-item')).find(
      (b) => b.textContent?.trim() === 'Delete column'
    ) as HTMLButtonElement
    delColBtn.click()

    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('thead th')).toHaveLength(2)
    expect(blocks['uuid-undo']).toContain('[x]')

    // Simulate focus on document.body (outside textarea) and press Cmd+Z 5 times
    const sendCmdZ = (shiftKey = false) => {
      const ev = new KeyboardEvent('keydown', {
        key: 'z',
        metaKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      document.body.dispatchEvent(ev)
      return ev
    }

    // Undo #1: Restore deleted Status column
    expect(sendCmdZ().defaultPrevented).toBe(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('thead th')).toHaveLength(3)
    expect(blocks['uuid-undo']).toContain('Todo')

    // Undo #2: Uncheck checkbox
    sendCmdZ()
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-undo']).toContain('[ ]')

    // Undo #3: Revert column type back from Checkbox to Text
    sendCmdZ()
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-undo']).not.toContain('"columns"')

    // Undo #4: Remove added row
    sendCmdZ()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)

    // Undo #5: Revert Beta -> Alpha
    sendCmdZ()
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-undo']).toContain('| Alpha |')
    expect(blocks['uuid-undo']).not.toContain('nt-schema')

    // Redo via Cmd+Shift+Z restores Beta
    sendCmdZ(true)
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-undo']).toContain('| Beta |')

    // Redo via Ctrl+Y restores 2nd row
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'y',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2)

    // Toolbar Undo/Redo buttons work and reflect disabled state
    const undoBtn = host.querySelector('button[aria-label="Undo (Cmd/Ctrl+Z)"]') as HTMLButtonElement
    const redoBtn = host.querySelector('button[aria-label="Redo (Cmd/Ctrl+Shift+Z)"]') as HTMLButtonElement
    expect(undoBtn.disabled).toBe(false)
    expect(redoBtn.disabled).toBe(false)
    undoBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)

    observer.destroy()
  })

  it('undoes [[ autocomplete inside an active cell and does not hijack Cmd+Z in native Logseq editors', async () => {
    const blocks: Record<string, string> = {
      'uuid-ac-undo': '| Name | Notes |\n| --- | --- |\n| Alpha |  |',
    }
    const pageIndex = new PageIndex(async () => [{ originalName: 'Project Alpha', updatedAt: 100 }])
    document.body.appendChild(createBlockDom('uuid-ac-undo'))

    const nativeEditor = document.createElement('div')
    nativeEditor.className = 'editor-wrapper'
    const nativeTa = document.createElement('textarea')
    nativeEditor.appendChild(nativeTa)
    document.body.appendChild(nativeEditor)

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: async (uuid, content) => {
          blocks[uuid] = content
        },
        editBlock: vi.fn(),
        openPage: vi.fn(),
        searchPages: (q) => pageIndex.search(q),
      },
      () => ({ autoSaveDelayMs: 0, fullWidthByDefault: false, monospaceRawSource: true })
    )

    observer.start()
    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement

    // Edit cell with [[ autocomplete
    const notesCell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement
    notesCell.click()
    const ta = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    ta.value = '[[pro'
    ta.setSelectionRange(5, 5)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(ta.value).toBe('[[Project Alpha]]')

    // Pressing Cmd+Z while still inside the cell textarea reverts to '[[pro'
    const undoEv = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    ta.dispatchEvent(undoEv)
    expect(undoEv.defaultPrevented).toBe(true)

    const liveTa = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    expect(liveTa).not.toBeNull()
    expect(liveTa.value).toBe('[[pro')

    // Focusing native Logseq editor clears lastActiveView and never intercepts Cmd+Z there
    nativeTa.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const nativeUndo = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    nativeTa.dispatchEvent(nativeUndo)
    expect(nativeUndo.defaultPrevented).toBe(false)

    observer.destroy()
  })
})
