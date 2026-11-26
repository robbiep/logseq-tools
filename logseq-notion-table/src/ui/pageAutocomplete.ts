import {
  detectPageTrigger,
  formatCompletionInsertion,
  type AutocompleteTrigger,
  type PageSearchResult,
} from '../host/pageIndex'

export interface PageAutocompleteOptions {
  doc: Document
  textarea: HTMLTextAreaElement
  cellEl: HTMLElement
  searchPages: (query: string) => Promise<PageSearchResult[]>
  onApplied: (nextValue: string) => void
}

const IGNORED_KEYUP_KEYS = new Set(['Escape', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab'])

export class PageAutocompleteController {
  private doc: Document
  private textarea: HTMLTextAreaElement
  private cellEl: HTMLElement
  private searchPages: (query: string) => Promise<PageSearchResult[]>
  private onApplied: (nextValue: string) => void

  private dropdownEl: HTMLElement | null = null
  private results: PageSearchResult[] = []
  private selectedIndex = 0
  private activeTrigger: AutocompleteTrigger | null = null
  private requestSeq = 0
  private destroyed = false

  private onInputBound: () => void
  private onClickBound: () => void
  private onKeyUpBound: (e: KeyboardEvent) => void
  private onOutsideMouseDownBound: (e: MouseEvent) => void

  constructor(opts: PageAutocompleteOptions) {
    this.doc = opts.doc
    this.textarea = opts.textarea
    this.cellEl = opts.cellEl
    this.searchPages = opts.searchPages
    this.onApplied = opts.onApplied

    this.onInputBound = () => {
      void this.refresh()
    }
    this.onClickBound = () => {
      void this.refresh()
    }
    this.onKeyUpBound = (e: KeyboardEvent) => {
      if (IGNORED_KEYUP_KEYS.has(e.key)) return
      void this.refresh()
    }
    this.onOutsideMouseDownBound = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (this.dropdownEl?.contains(target) || target === this.textarea) return
      this.close()
    }

    this.textarea.addEventListener('input', this.onInputBound)
    this.textarea.addEventListener('click', this.onClickBound)
    this.textarea.addEventListener('keyup', this.onKeyUpBound)
    this.doc.addEventListener('mousedown', this.onOutsideMouseDownBound, true)
  }

  public isOpen(): boolean {
    return this.dropdownEl !== null && this.results.length > 0 && this.activeTrigger !== null
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.isOpen()) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      this.selectedIndex = (this.selectedIndex + 1) % this.results.length
      this.updateSelectedDom()
      return true
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      this.selectedIndex = (this.selectedIndex - 1 + this.results.length) % this.results.length
      this.updateSelectedDom()
      return true
    }

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      this.applySelected()
      return true
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      this.close()
      return true
    }

    return false
  }

  public async refresh(): Promise<void> {
    if (this.destroyed) return
    const cursorPos = this.textarea.selectionStart ?? this.textarea.value.length
    const trigger = detectPageTrigger(this.textarea.value, cursorPos)
    if (!trigger) {
      this.close()
      return
    }

    this.activeTrigger = trigger
    const seq = ++this.requestSeq

    let matches: PageSearchResult[] = []
    try {
      matches = await this.searchPages(trigger.query)
    } catch {
      matches = []
    }

    if (this.destroyed || seq !== this.requestSeq) return

    // Re-check trigger in case value changed while awaiting
    const latestCursor = this.textarea.selectionStart ?? this.textarea.value.length
    const latestTrigger = detectPageTrigger(this.textarea.value, latestCursor)
    if (!latestTrigger) {
      this.close()
      return
    }
    this.activeTrigger = latestTrigger
    this.results = matches
    this.selectedIndex = 0

    if (matches.length === 0) {
      this.close()
      return
    }

    this.renderDropdown(latestTrigger)
  }

  private renderDropdown(trigger: AutocompleteTrigger): void {
    if (!this.dropdownEl) {
      this.dropdownEl = this.doc.createElement('div')
      this.dropdownEl.className = 'nt-autocomplete forbid-edit'
      this.dropdownEl.setAttribute('role', 'listbox')
      this.dropdownEl.addEventListener('mousedown', (e) => {
        // Keep focus inside textarea so blur does not fire before click
        e.preventDefault()
        e.stopPropagation()
      })
      this.dropdownEl.addEventListener('click', (e) => {
        e.stopPropagation()
      })
      this.doc.body.appendChild(this.dropdownEl)
    }

    this.dropdownEl.textContent = ''

    const header = this.doc.createElement('div')
    header.className = 'nt-ac-header'
    header.textContent = trigger.mode === 'tag' ? 'Tags & Pages' : 'Link to Page'
    this.dropdownEl.appendChild(header)

    const list = this.doc.createElement('div')
    list.className = 'nt-ac-list'

    const queryText = trigger.query.trim()

    this.results.forEach((item, idx) => {
      const btn = this.doc.createElement('button')
      btn.type = 'button'
      btn.className = 'nt-ac-item forbid-edit'
      btn.setAttribute('role', 'option')
      btn.dataset.acIndex = String(idx)
      if (idx === this.selectedIndex) {
        btn.classList.add('nt-ac-selected')
        btn.setAttribute('aria-selected', 'true')
      }

      const mainCol = this.doc.createElement('div')
      mainCol.className = 'nt-ac-main'

      const titleEl = this.doc.createElement('div')
      titleEl.className = 'nt-ac-title'

      if (item.isNew) {
        const prefix = this.doc.createElement('span')
        prefix.className = 'nt-ac-new-prefix'
        prefix.textContent = 'Create page: '
        titleEl.appendChild(prefix)
        titleEl.appendChild(this.doc.createTextNode(item.name))
      } else {
        this.appendHighlightedText(titleEl, item.name, queryText)
      }
      mainCol.appendChild(titleEl)

      if (item.matchedAlias) {
        const aliasEl = this.doc.createElement('div')
        aliasEl.className = 'nt-ac-alias'
        aliasEl.textContent = `Alias: ${item.matchedAlias}`
        mainCol.appendChild(aliasEl)
      }

      btn.appendChild(mainCol)

      if (item.isNew || item.isJournal) {
        const badge = this.doc.createElement('span')
        badge.className = item.isNew ? 'nt-ac-badge nt-ac-badge-new' : 'nt-ac-badge'
        badge.textContent = item.isNew ? 'New' : 'Journal'
        btn.appendChild(badge)
      }

      btn.addEventListener('mouseenter', () => {
        this.selectedIndex = idx
        this.updateSelectedDom(false)
      })

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.selectedIndex = idx
        this.applySelected()
      })

      list.appendChild(btn)
    })

    this.dropdownEl.appendChild(list)
    this.positionDropdown()
  }

  private appendHighlightedText(
    parent: HTMLElement,
    text: string,
    query: string
  ): void {
    if (!query) {
      parent.appendChild(this.doc.createTextNode(text))
      return
    }
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx === -1) {
      parent.appendChild(this.doc.createTextNode(text))
      return
    }
    if (idx > 0) {
      parent.appendChild(this.doc.createTextNode(text.slice(0, idx)))
    }
    const mark = this.doc.createElement('mark')
    mark.className = 'nt-ac-match'
    mark.textContent = text.slice(idx, idx + query.length)
    parent.appendChild(mark)
    if (idx + query.length < text.length) {
      parent.appendChild(this.doc.createTextNode(text.slice(idx + query.length)))
    }
  }

  private positionDropdown(): void {
    if (!this.dropdownEl) return
    const win = this.doc.defaultView || window
    const cellRect = this.cellEl.getBoundingClientRect()
    const vw = win.innerWidth || this.doc.documentElement.clientWidth || 1024
    const vh = win.innerHeight || this.doc.documentElement.clientHeight || 768

    this.dropdownEl.style.visibility = 'hidden'
    this.dropdownEl.style.left = '0px'
    this.dropdownEl.style.top = '0px'

    const menuRect = this.dropdownEl.getBoundingClientRect()
    const menuWidth = menuRect.width || 280
    const menuHeight = menuRect.height || 240

    let left = cellRect.left
    if (left + menuWidth > vw - 12) {
      left = Math.max(8, vw - menuWidth - 12)
    }

    let top = cellRect.bottom + 4
    if (top + menuHeight > vh - 12 && cellRect.top - menuHeight - 4 >= 8) {
      top = cellRect.top - menuHeight - 4
    }

    this.dropdownEl.style.left = `${Math.max(8, left)}px`
    this.dropdownEl.style.top = `${Math.max(8, top)}px`
    this.dropdownEl.style.visibility = 'visible'
  }

  private updateSelectedDom(scrollIntoView = true): void {
    if (!this.dropdownEl) return
    const items = this.dropdownEl.querySelectorAll('.nt-ac-item')
    items.forEach((el, idx) => {
      const selected = idx === this.selectedIndex
      el.classList.toggle('nt-ac-selected', selected)
      if (selected) {
        el.setAttribute('aria-selected', 'true')
        if (scrollIntoView && typeof (el as HTMLElement).scrollIntoView === 'function') {
          ;(el as HTMLElement).scrollIntoView({ block: 'nearest' })
        }
      } else {
        el.removeAttribute('aria-selected')
      }
    })
  }

  private applySelected(): void {
    if (!this.activeTrigger || this.results.length === 0) return
    const chosen = this.results[this.selectedIndex] || this.results[0]
    if (!chosen) return

    const { start, end, mode } = this.activeTrigger
    const insertion = formatCompletionInsertion(mode, chosen.name)
    const before = this.textarea.value.slice(0, start)
    const after = this.textarea.value.slice(end)
    const nextValue = `${before}${insertion}${after}`
    const nextCursor = before.length + insertion.length

    this.textarea.value = nextValue
    this.textarea.focus()
    this.textarea.setSelectionRange(nextCursor, nextCursor)

    this.close()
    this.onApplied(nextValue)
  }

  public close(): void {
    this.activeTrigger = null
    this.results = []
    this.selectedIndex = 0
    if (this.dropdownEl) {
      this.dropdownEl.remove()
      this.dropdownEl = null
    }
  }

  public destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.close()
    this.textarea.removeEventListener('input', this.onInputBound)
    this.textarea.removeEventListener('click', this.onClickBound)
    this.textarea.removeEventListener('keyup', this.onKeyUpBound)
    this.doc.removeEventListener('mousedown', this.onOutsideMouseDownBound, true)
  }
}
