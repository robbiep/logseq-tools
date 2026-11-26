import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import {
  PageIndex,
  detectPageTrigger,
  formatCompletionInsertion,
  normalizePageEntities,
  rankPageMatches,
} from '../host/pageIndex'

function createBlockDom(uuid: string): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = 'block-content inline'
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  wrapper.innerHTML = '<table class="table-auto"><thead><tr><th>Task</th><th>Owner</th></tr></thead><tbody><tr><td>Draft</td><td></td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('pageIndex & trigger parsing', () => {
  it('detects [[page]] and #tag triggers accurately', () => {
    expect(detectPageTrigger('See [[pro', 9)).toEqual({
      mode: 'page',
      start: 4,
      end: 9,
      query: 'pro',
    })

    // Consumes existing ]] immediately after caret so we do not emit ]]]]
    expect(detectPageTrigger('See [[pro]] later', 9)).toEqual({
      mode: 'page',
      start: 4,
      end: 11,
      query: 'pro',
    })

    // Closed [[done]] does not trigger
    expect(detectPageTrigger('See [[done]] ', 13)).toBeNull()

    // #tag and #[[multi word]] triggers
    expect(detectPageTrigger('Note #urg', 9)).toEqual({
      mode: 'tag',
      start: 5,
      end: 9,
      query: 'urg',
    })
    expect(detectPageTrigger('Note #[[proj', 12)).toEqual({
      mode: 'tag',
      start: 5,
      end: 12,
      query: 'proj',
    })

    // URL fragment does not trigger tag
    expect(detectPageTrigger('https://example.com/#sec', 24)).toBeNull()
  })

  it('formats page and tag insertions', () => {
    expect(formatCompletionInsertion('page', 'Project Alpha')).toBe('[[Project Alpha]]')
    expect(formatCompletionInsertion('tag', 'urgent')).toBe('#urgent')
    expect(formatCompletionInsertion('tag', 'Multi Word')).toBe('#[[Multi Word]]')
  })

  it('ranks exact, prefix, alias, and non-journal matches and includes New page option', () => {
    const candidates = normalizePageEntities([
      { originalName: 'Nov 25, 2026', 'journal?': true, updatedAt: 500 },
      { originalName: 'Project Alpha', properties: { alias: ['PA', 'Alpha Initiative'] }, updatedAt: 200 },
      { originalName: 'Project Beta', updatedAt: 300 },
      { originalName: 'My Project Notes', updatedAt: 400 },
    ])

    const res = rankPageMatches(candidates, 'pro')
    expect(res.map((r) => r.name)).toEqual([
      'Project Beta',
      'Project Alpha',
      'My Project Notes',
      'pro',
    ])
    expect(res[3].isNew).toBe(true)

    const aliasRes = rankPageMatches(candidates, 'alpha ini')
    expect(aliasRes[0].name).toBe('Project Alpha')
    expect(aliasRes[0].matchedAlias).toBe('Alpha Initiative')
  })

  it('caches getAllPages and invalidates cleanly', async () => {
    const fetchAll = vi.fn(async () => [{ originalName: 'Alpha' }])
    const idx = new PageIndex(fetchAll)
    await idx.search('a')
    await idx.search('al')
    expect(fetchAll).toHaveBeenCalledTimes(1)

    idx.invalidate()
    await idx.search('al')
    expect(fetchAll).toHaveBeenCalledTimes(2)
  })
})

describe('TableView [[ page autocomplete integration', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('opens dropdown on [[, navigates with ArrowDown + Enter, and keeps cell editing active', async () => {
    const blocks: Record<string, string> = {
      'uuid-ac': '| Task | Owner |\n| --- | --- |\n| Draft |  |',
    }
    const pageIndex = new PageIndex(async () => [
      { originalName: 'Project Alpha', updatedAt: 200 },
      { originalName: 'Project Beta', updatedAt: 300 },
      { originalName: 'Other Page', updatedAt: 100 },
    ])

    document.body.appendChild(createBlockDom('uuid-ac'))

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

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    const cell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement
    cell.click()

    const textarea = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    textarea.value = 'See [[pro'
    textarea.setSelectionRange(9, 9)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    await new Promise((r) => setTimeout(r, 20))

    const dropdown = document.querySelector('.nt-autocomplete') as HTMLElement
    expect(dropdown).not.toBeNull()
    const items = Array.from(dropdown.querySelectorAll('.nt-ac-item'))
    expect(items[0].textContent).toContain('Project Beta')
    expect(items[1].textContent).toContain('Project Alpha')

    // ArrowDown moves selection to Project Alpha, Enter inserts it
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(textarea.value).toBe('See [[Project Alpha]]')
    expect(textarea.selectionStart).toBe('See [[Project Alpha]]'.length)
    expect(document.querySelector('.nt-autocomplete')).toBeNull()
    // Remains in cell editor for continued typing
    expect(host.querySelector('textarea.nt-cell-editor')).toBe(textarea)

    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-ac']).toContain('See [[Project Alpha]]')

    observer.destroy()
  })

  it('closes on Escape without exiting cell and completes on mousedown+click without blur', async () => {
    const blocks: Record<string, string> = {
      'uuid-ac2': '| Task | Owner |\n| --- | --- |\n| Draft |  |',
    }
    const pageIndex = new PageIndex(async () => [
      { originalName: 'Urgent', updatedAt: 100 },
      { originalName: 'Multi Word', updatedAt: 90 },
    ])

    document.body.appendChild(createBlockDom('uuid-ac2'))

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

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    const cell = host.querySelector('tbody tr td[data-col="0"]') as HTMLElement
    cell.click()

    const textarea = host.querySelector('textarea.nt-cell-editor') as HTMLTextAreaElement
    textarea.value = '[['
    textarea.setSelectionRange(2, 2)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    expect(document.querySelector('.nt-autocomplete')).not.toBeNull()

    // Escape closes popup only, keeps textarea open
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(document.querySelector('.nt-autocomplete')).toBeNull()
    expect(host.querySelector('textarea.nt-cell-editor')).toBe(textarea)

    // Now test #tag click completion
    textarea.value = 'Task #mul'
    textarea.setSelectionRange(9, 9)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 20))

    const firstItem = document.querySelector('.nt-autocomplete .nt-ac-item') as HTMLButtonElement
    expect(firstItem).not.toBeNull()
    const mdEv = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    firstItem.dispatchEvent(mdEv)
    expect(mdEv.defaultPrevented).toBe(true)
    firstItem.click()

    expect(textarea.value).toBe('Task #[[Multi Word]]')
    expect(document.querySelector('.nt-autocomplete')).toBeNull()

    observer.destroy()
  })
})
