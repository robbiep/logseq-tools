import type { PageSearchResult } from '../host/pageIndex'
import {
  OPTION_COLORS,
  formatSelectCellValues,
  parseSelectCellValues,
  pickNextOptionColor,
  type OptionColor,
  type SelectOption,
} from '../markdown/columnTypes'
import { createIcon } from './icons'
import { positionAnchoredElement, stopEvents, type AnchorRect } from './popoverPosition'

export interface SelectPickerOptions {
  multi: boolean
  currentRaw: string
  options: SelectOption[]
  manageOnly?: boolean
  searchPages?: (query: string) => Promise<PageSearchResult[]>
  onChangeSelection: (nextRaw: string, nextOptions: SelectOption[]) => void
  onUpdateOptions: (nextOptions: SelectOption[]) => void
  onRenameOption?: (
    optionId: string,
    oldLabel: string,
    nextLabel: string,
    nextOptions: SelectOption[]
  ) => void
  onClose?: () => void
}

let activeSelectPickerClose: (() => void) | null = null

export function closeActiveSelectPicker(): void {
  if (activeSelectPickerClose) {
    activeSelectPickerClose()
    activeSelectPickerClose = null
  }
}

export function openSelectPicker(
  doc: Document,
  anchor: AnchorRect,
  opts: SelectPickerOptions
): () => void {
  closeActiveSelectPicker()

  let options: SelectOption[] = opts.options.map((o) => ({ ...o }))
  let selected = opts.manageOnly ? [] : parseSelectCellValues(opts.currentRaw, opts.multi)
  let editingOptionId: string | null = null
  let activeRenameDraft: string | null = null
  let renameError = ''
  let shouldFocusRename = false
  let pageSuggestions: PageSearchResult[] = []
  let activeRowIdx = -1
  let searchSeq = 0

  const pop = doc.createElement('div')
  pop.className = 'nt-select-popover forbid-edit'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', opts.multi ? 'Multi-select options' : 'Select option')

  stopEvents(pop, ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input'])

  const headerArea = doc.createElement('div')
  headerArea.className = 'nt-sp-top'

  const chipsWrap = doc.createElement('div')
  chipsWrap.className = 'nt-sp-chips'

  const input = doc.createElement('input')
  input.type = 'text'
  input.className = 'nt-sp-input forbid-edit'
  input.placeholder = opts.manageOnly
    ? 'Search, create option, or [[Page]]…'
    : 'Search or create option (type [[ for pages)…'

  headerArea.append(chipsWrap, input)
  pop.appendChild(headerArea)

  const listEl = doc.createElement('div')
  listEl.className = 'nt-sp-list'
  pop.appendChild(listEl)

  const findOptionColor = (label: string): OptionColor => {
    const found = options.find((o) => o.label.toLowerCase() === label.toLowerCase())
    return found?.color || 'gray'
  }

  const isLabelSelected = (label: string): boolean =>
    selected.some((s) => s.label.toLowerCase() === label.toLowerCase())

  const commitSelection = () => {
    opts.onChangeSelection(formatSelectCellValues(selected), options)
  }

  const ensureOption = (label: string, isPage?: boolean, emitIfChanged = false): SelectOption => {
    const existing = options.find((o) => o.label.toLowerCase() === label.toLowerCase())
    if (existing) {
      if (isPage && !existing.isPage) {
        existing.isPage = true
        if (emitIfChanged) opts.onUpdateOptions(options)
      }
      return existing
    }
    const next: SelectOption = {
      id: `opt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      label: label.trim(),
      isPage: isPage ? true : undefined,
      color: pickNextOptionColor(options),
    }
    options = [...options, next]
    if (emitIfChanged) opts.onUpdateOptions(options)
    return next
  }

  const chooseOption = (label: string, isPage?: boolean) => {
    const opt = ensureOption(label, isPage, Boolean(opts.manageOnly))
    if (opts.manageOnly) {
      input.value = ''
      pageSuggestions = []
      activeRowIdx = -1
      renderAll()
      return
    }

    if (opts.multi) {
      if (isLabelSelected(opt.label)) {
        selected = selected.filter((s) => s.label.toLowerCase() !== opt.label.toLowerCase())
      } else {
        selected = [
          ...selected,
          { label: opt.label, isPage: Boolean(opt.isPage), raw: opt.isPage ? `[[${opt.label}]]` : opt.label },
        ]
      }
      commitSelection()
      input.value = ''
      pageSuggestions = []
      activeRowIdx = -1
      renderAll()
      input.focus()
    } else {
      selected = [
        { label: opt.label, isPage: Boolean(opt.isPage), raw: opt.isPage ? `[[${opt.label}]]` : opt.label },
      ]
      commitSelection()
      close()
    }
  }

  const renderChips = () => {
    chipsWrap.textContent = ''
    if (opts.manageOnly || selected.length === 0) {
      chipsWrap.style.display = 'none'
      return
    }
    chipsWrap.style.display = 'flex'
    for (const item of selected) {
      const chip = doc.createElement('span')
      chip.className = `nt-select-pill nt-color-${findOptionColor(item.label)}`
      if (item.isPage) {
        const icon = createIcon(doc, 'file', 11)
        icon.classList.add('nt-pill-page-icon')
        chip.appendChild(icon)
      }
      const txt = doc.createElement('span')
      txt.textContent = item.label
      chip.appendChild(txt)

      const rm = doc.createElement('button')
      rm.type = 'button'
      rm.className = 'nt-sp-chip-rm forbid-edit'
      rm.setAttribute('aria-label', `Remove ${item.label}`)
      rm.appendChild(createIcon(doc, 'x', 10))
      rm.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        selected = selected.filter((s) => s.label.toLowerCase() !== item.label.toLowerCase())
        commitSelection()
        renderAll()
        input.focus()
      })
      chip.appendChild(rm)
      chipsWrap.appendChild(chip)
    }
  }

  type ActionEntry = {
    run: () => void
    el: HTMLElement
  }
  let navigableRows: ActionEntry[] = []

  const renderList = () => {
    listEl.textContent = ''
    navigableRows = []

    const rawInput = input.value.trim()
    const wantsPageExplicit = rawInput.startsWith('[[')
    const cleanQuery = rawInput.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
    const lowerQuery = cleanQuery.toLowerCase()

    const filteredOpts = options.filter((o) =>
      !lowerQuery ? true : o.label.toLowerCase().includes(lowerQuery)
    )

    if (filteredOpts.length > 0) {
      const sec = doc.createElement('div')
      sec.className = 'nt-sp-section-label'
      sec.textContent = opts.manageOnly ? 'Column Options' : 'Select an option'
      listEl.appendChild(sec)
    }

    for (const opt of filteredOpts) {
      const row = doc.createElement('div')
      row.className = 'nt-sp-row forbid-edit'

      const mainBtn = doc.createElement('button')
      mainBtn.type = 'button'
      mainBtn.className = 'nt-sp-row-btn forbid-edit'

      const pill = doc.createElement('span')
      pill.className = `nt-select-pill nt-color-${opt.color}`
      if (opt.isPage) {
        const icon = createIcon(doc, 'file', 11)
        icon.classList.add('nt-pill-page-icon')
        pill.appendChild(icon)
      }
      const lbl = doc.createElement('span')
      lbl.textContent = opt.label
      pill.appendChild(lbl)
      mainBtn.appendChild(pill)

      if (!opts.manageOnly && isLabelSelected(opt.label)) {
        const chk = doc.createElement('span')
        chk.className = 'nt-sp-check'
        chk.appendChild(createIcon(doc, 'check', 13))
        mainBtn.appendChild(chk)
      }

      mainBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        chooseOption(opt.label, opt.isPage)
      })

      const editBtn = doc.createElement('button')
      editBtn.type = 'button'
      editBtn.className = 'nt-sp-opt-edit forbid-edit'
      editBtn.title = 'Customize option color or page link'
      editBtn.setAttribute('aria-label', `Edit ${opt.label}`)
      editBtn.appendChild(createIcon(doc, 'sliders', 12))
      editBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        editingOptionId = editingOptionId === opt.id ? null : opt.id
        activeRenameDraft = editingOptionId ? opt.label : null
        renameError = ''
        shouldFocusRename = Boolean(editingOptionId)
        renderList()
      })

      row.append(mainBtn, editBtn)
      listEl.appendChild(row)

      const entryIdx = navigableRows.length
      navigableRows.push({
        el: row,
        run: () => chooseOption(opt.label, opt.isPage),
      })
      if (entryIdx === activeRowIdx) {
        row.classList.add('nt-sp-row-active')
      }

      // Inline editor for rename, color, page link toggle, and delete
      if (editingOptionId === opt.id) {
        const editor = doc.createElement('div')
        editor.className = 'nt-sp-opt-editor forbid-edit'

        const renameRow = doc.createElement('div')
        renameRow.className = 'nt-sp-rename-row'

        const renameInput = doc.createElement('input')
        renameInput.type = 'text'
        renameInput.className = 'nt-sp-rename-input forbid-edit'
        renameInput.setAttribute('aria-label', 'Option name')
        renameInput.placeholder = 'Option name…'
        renameInput.value = activeRenameDraft ?? opt.label

        const renameBtn = doc.createElement('button')
        renameBtn.type = 'button'
        renameBtn.className = 'nt-sp-rename-btn forbid-edit'
        renameBtn.title = 'Save option name'
        renameBtn.setAttribute('aria-label', 'Save option name')
        renameBtn.appendChild(createIcon(doc, 'check', 12))

        const errEl = doc.createElement('div')
        errEl.className = 'nt-sp-rename-err'
        if (renameError) {
          errEl.textContent = renameError
          errEl.style.display = 'block'
        } else {
          errEl.style.display = 'none'
        }

        const commitRename = () => {
          const trimmed = renameInput.value.trim()
          if (!trimmed) {
            renameError = 'Name cannot be empty'
            errEl.textContent = renameError
            errEl.style.display = 'block'
            renameInput.focus()
            return
          }
          if (trimmed === opt.label) {
            editingOptionId = null
            activeRenameDraft = null
            renameError = ''
            renderList()
            input.focus()
            return
          }
          if (
            options.some(
              (o) => o.id !== opt.id && o.label.toLowerCase() === trimmed.toLowerCase()
            )
          ) {
            renameError = 'Option already exists'
            errEl.textContent = renameError
            errEl.style.display = 'block'
            renameInput.focus()
            return
          }

          const oldLabel = opt.label
          opt.label = trimmed
          selected = selected.map((s) =>
            s.label.toLowerCase() === oldLabel.toLowerCase()
              ? {
                  label: trimmed,
                  isPage: s.isPage,
                  raw: s.isPage ? `[[${trimmed}]]` : trimmed,
                }
              : s
          )
          editingOptionId = null
          activeRenameDraft = null
          renameError = ''
          if (opts.onRenameOption) {
            opts.onRenameOption(opt.id, oldLabel, trimmed, options)
          } else {
            opts.onUpdateOptions(options)
          }
          renderAll()
          input.focus()
        }

        renameInput.addEventListener('input', () => {
          activeRenameDraft = renameInput.value
          renameError = ''
          errEl.textContent = ''
          errEl.style.display = 'none'
        })
        renameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            commitRename()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            editingOptionId = null
            activeRenameDraft = null
            renameError = ''
            renderList()
            input.focus()
          }
        })
        renameBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          commitRename()
        })

        renameRow.append(renameInput, renameBtn)
        editor.append(renameRow, errEl)

        const colorsRow = doc.createElement('div')
        colorsRow.className = 'nt-sp-color-dots'
        for (const color of OPTION_COLORS) {
          const dot = doc.createElement('button')
          dot.type = 'button'
          dot.className = `nt-sp-color-dot nt-color-${color} forbid-edit`
          dot.dataset.color = color
          dot.setAttribute('aria-label', `Color: ${color}`)
          dot.setAttribute('aria-pressed', opt.color === color ? 'true' : 'false')
          if (opt.color === color) {
            dot.classList.add('nt-dot-active')
            dot.appendChild(createIcon(doc, 'check', 10))
          }
          dot.title = color
          dot.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            opt.color = color
            opts.onUpdateOptions(options)
            renderChips()
            renderList()
          })
          colorsRow.appendChild(dot)
        }
        editor.appendChild(colorsRow)

        const controls = doc.createElement('div')
        controls.className = 'nt-sp-opt-actions'

        const pageToggle = doc.createElement('button')
        pageToggle.type = 'button'
        pageToggle.className = 'nt-sp-mini-btn forbid-edit'
        if (opt.isPage) pageToggle.classList.add('nt-active')
        pageToggle.appendChild(createIcon(doc, 'file', 11))
        const ptSpan = doc.createElement('span')
        ptSpan.textContent = opt.isPage ? 'Linked [[Page]]' : 'Link as [[Page]]'
        pageToggle.appendChild(ptSpan)
        pageToggle.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          opt.isPage = opt.isPage ? undefined : true
          // Update active selection format atomically if this option is currently selected
          if (isLabelSelected(opt.label)) {
            selected = selected.map((s) =>
              s.label.toLowerCase() === opt.label.toLowerCase()
                ? {
                    label: opt.label,
                    isPage: Boolean(opt.isPage),
                    raw: opt.isPage ? `[[${opt.label}]]` : opt.label,
                  }
                : s
            )
            commitSelection()
            renderChips()
          } else {
            opts.onUpdateOptions(options)
          }
          renderList()
        })

        const delBtn = doc.createElement('button')
        delBtn.type = 'button'
        delBtn.className = 'nt-sp-mini-btn nt-danger forbid-edit'
        delBtn.appendChild(createIcon(doc, 'trash', 11))
        const delSpan = doc.createElement('span')
        delSpan.textContent = 'Delete'
        delBtn.appendChild(delSpan)
        delBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          options = options.filter((o) => o.id !== opt.id)
          editingOptionId = null
          activeRenameDraft = null
          renameError = ''
          opts.onUpdateOptions(options)
          renderList()
        })

        controls.append(pageToggle, delBtn)
        editor.appendChild(controls)
        listEl.appendChild(editor)

        if (shouldFocusRename) {
          shouldFocusRename = false
          renameInput.focus()
          renameInput.select()
        }
      }
    }

    // Create new option(s) when query doesn't match an existing option exactly
    const hasExactOpt =
      lowerQuery.length > 0 && options.some((o) => o.label.toLowerCase() === lowerQuery)

    if (cleanQuery && !hasExactOpt) {
      if (!wantsPageExplicit) {
        const createRow = doc.createElement('button')
        createRow.type = 'button'
        createRow.className = 'nt-sp-create-btn forbid-edit'
        createRow.appendChild(createIcon(doc, 'plus', 13))
        const lbl = doc.createElement('span')
        lbl.textContent = `Create "${cleanQuery}"`
        createRow.appendChild(lbl)
        createRow.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          chooseOption(cleanQuery, false)
        })
        listEl.appendChild(createRow)

        const entryIdx = navigableRows.length
        navigableRows.push({
          el: createRow,
          run: () => chooseOption(cleanQuery, false),
        })
        if (entryIdx === activeRowIdx) createRow.classList.add('nt-sp-row-active')
      }

      const createPageRow = doc.createElement('button')
      createPageRow.type = 'button'
      createPageRow.className = 'nt-sp-create-btn forbid-edit'
      createPageRow.appendChild(createIcon(doc, 'file', 13))
      const plbl = doc.createElement('span')
      plbl.textContent = `Use Page [[${cleanQuery}]]`
      createPageRow.appendChild(plbl)
      createPageRow.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        chooseOption(cleanQuery, true)
      })
      listEl.appendChild(createPageRow)

      const entryIdx = navigableRows.length
      navigableRows.push({
        el: createPageRow,
        run: () => chooseOption(cleanQuery, true),
      })
      if (entryIdx === activeRowIdx) createPageRow.classList.add('nt-sp-row-active')
    }

    // Matching graph pages from Logseq
    const existingOptLower = new Set(options.map((o) => o.label.toLowerCase()))
    const filteredPages = pageSuggestions
      .filter((p) => !p.isNew && !existingOptLower.has(p.name.toLowerCase()))
      .slice(0, 6)

    if (filteredPages.length > 0 && (wantsPageExplicit || cleanQuery.length > 0)) {
      const sec = doc.createElement('div')
      sec.className = 'nt-sp-section-label'
      sec.textContent = 'Logseq Pages'
      listEl.appendChild(sec)

      for (const page of filteredPages) {
        const pBtn = doc.createElement('button')
        pBtn.type = 'button'
        pBtn.className = 'nt-sp-create-btn nt-sp-page-btn forbid-edit'
        pBtn.appendChild(createIcon(doc, 'file', 12))
        const span = doc.createElement('span')
        span.textContent = `[[${page.name}]]`
        pBtn.appendChild(span)
        pBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          chooseOption(page.name, true)
        })
        listEl.appendChild(pBtn)

        const entryIdx = navigableRows.length
        navigableRows.push({
          el: pBtn,
          run: () => chooseOption(page.name, true),
        })
        if (entryIdx === activeRowIdx) pBtn.classList.add('nt-sp-row-active')
      }
    }

    if (navigableRows.length === 0) {
      const empty = doc.createElement('div')
      empty.className = 'nt-sp-empty'
      empty.textContent = 'Type to create an option or [[ to link a Page'
      listEl.appendChild(empty)
    } else if (activeRowIdx >= navigableRows.length) {
      activeRowIdx = cleanQuery ? 0 : -1
      if (activeRowIdx >= 0) {
        navigableRows[activeRowIdx]?.el.classList.add('nt-sp-row-active')
      }
    }
  }

  const renderAll = () => {
    renderChips()
    renderList()
  }

  const refreshPageSearch = async () => {
    if (!opts.searchPages) return
    const raw = input.value.trim()
    const clean = raw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
    if (!raw.startsWith('[[') && !clean) {
      pageSuggestions = []
      renderList()
      return
    }
    const seq = ++searchSeq
    try {
      const matches = await opts.searchPages(clean)
      if (seq !== searchSeq || closed) return
      pageSuggestions = matches
      renderList()
    } catch {
      // Ignore search failure
    }
  }

  input.addEventListener('input', () => {
    activeRowIdx = input.value.trim() ? 0 : -1
    renderList()
    void refreshPageSearch()
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !input.value && selected.length > 0 && !opts.manageOnly) {
      e.preventDefault()
      e.stopPropagation()
      selected = selected.slice(0, -1)
      commitSelection()
      renderAll()
      return
    }
    if (e.key === 'ArrowDown' && navigableRows.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      activeRowIdx = activeRowIdx < 0 ? 0 : (activeRowIdx + 1) % navigableRows.length
      renderList()
      return
    }
    if (e.key === 'ArrowUp' && navigableRows.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      activeRowIdx =
        activeRowIdx < 0
          ? navigableRows.length - 1
          : (activeRowIdx - 1 + navigableRows.length) % navigableRows.length
      renderList()
      return
    }
    if (e.key === 'Enter' && activeRowIdx >= 0 && navigableRows.length > 0) {
      e.preventDefault()
      e.stopPropagation()
      navigableRows[activeRowIdx]?.run()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  })

  renderAll()

  pop.style.visibility = 'hidden'
  pop.style.left = '0px'
  pop.style.top = '0px'
  doc.body.appendChild(pop)

  positionAnchoredElement(doc, pop, anchor)
  pop.style.visibility = 'visible'

  let closed = false
  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) close()
  }
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if ((e.target as Element | null)?.classList.contains('nt-sp-rename-input')) {
        e.preventDefault()
        e.stopPropagation()
        editingOptionId = null
        activeRenameDraft = null
        renameError = ''
        renderList()
        input.focus()
        return
      }
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  const close = () => {
    if (closed) return
    closed = true
    doc.removeEventListener('mousedown', onOutside, true)
    doc.removeEventListener('keydown', onDocKey, true)
    pop.remove()
    if (activeSelectPickerClose === close) activeSelectPickerClose = null
    opts.onClose?.()
  }

  activeSelectPickerClose = close
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', onOutside, true)
      doc.addEventListener('keydown', onDocKey, true)
      input.focus()
    }
  }, 0)

  return close
}
