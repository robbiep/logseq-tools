import { describe, expect, it, vi } from 'vitest'
import { renderCellContent, toggleCheckboxInRawText } from '../markdown/inlineRenderer'

describe('inlineRenderer', () => {
  it('renders bold, italic, strike, highlight, code, and line breaks safely', () => {
    const div = document.createElement('div')
    div.appendChild(
      renderCellContent(
        document,
        '**bold** *italic* ~~old~~ ==mark== `code`\nnext <script>alert(1)</script>'
      )
    )

    expect(div.querySelector('strong')?.textContent).toBe('bold')
    expect(div.querySelector('em')?.textContent).toBe('italic')
    expect(div.querySelector('del')?.textContent).toBe('old')
    expect(div.querySelector('mark')?.textContent).toBe('mark')
    expect(div.querySelector('code')?.textContent).toBe('code')
    expect(div.querySelector('br')).not.toBeNull()
    expect(div.querySelector('script')).toBeNull()
    expect(div.textContent).toContain('<script>alert(1)</script>')
  })

  it('renders clickable Logseq [[page]] links, #tags, and safe external links', () => {
    const onPageClick = vi.fn()
    const onExternalLinkClick = vi.fn()
    const div = document.createElement('div')
    div.appendChild(
      renderCellContent(
        document,
        '[[Project Alpha]] #urgent [Docs](https://example.com) [bad](javascript:alert(1))',
        { onPageClick, onExternalLinkClick }
      )
    )

    const pageRef = div.querySelector('a.nt-page-ref') as HTMLAnchorElement
    expect(pageRef).not.toBeNull()
    expect(pageRef.textContent).toBe('Project Alpha')
    pageRef.click()
    expect(onPageClick).toHaveBeenCalledWith('Project Alpha', false)

    const tagRef = div.querySelector('a.nt-tag') as HTMLAnchorElement
    expect(tagRef.textContent).toBe('#urgent')

    const extLinks = div.querySelectorAll('a.nt-ext-link')
    expect(extLinks).toHaveLength(1)
    expect((extLinks[0] as HTMLAnchorElement).href).toBe('https://example.com/')
    ;(extLinks[0] as HTMLAnchorElement).click()
    expect(onExternalLinkClick).toHaveBeenCalledWith('https://example.com')
  })

  it('renders interactive checkboxes and toggles raw text', () => {
    const onCheckboxToggle = vi.fn()
    const div = document.createElement('div')
    div.appendChild(
      renderCellContent(document, '[ ] first\n[x] second', { onCheckboxToggle })
    )

    const cbs = div.querySelectorAll('input[type="checkbox"]')
    expect(cbs).toHaveLength(2)
    expect((cbs[0] as HTMLInputElement).checked).toBe(false)
    expect((cbs[1] as HTMLInputElement).checked).toBe(true)

    ;(cbs[0] as HTMLInputElement).checked = true
    cbs[0].dispatchEvent(new Event('change', { bubbles: true }))
    expect(onCheckboxToggle).toHaveBeenCalledWith(0, true)

    expect(toggleCheckboxInRawText('[ ] first\n[x] second', 0, true)).toBe(
      '[x] first\n[x] second'
    )
    expect(toggleCheckboxInRawText('[ ] first\n[x] second', 1, false)).toBe(
      '[ ] first\n[ ] second'
    )
  })
})
