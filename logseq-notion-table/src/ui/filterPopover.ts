import {
  harvestOptionsFromColumn,
  type ColumnSchema,
  type SelectOption,
} from '../markdown/columnTypes'
import {
  formatLogseqDate,
  formatRelativeDateLabel,
  normalizeRelativeDateToken,
  parsePlaintextDate,
} from '../markdown/dateUtils'
import {
  cloneFilter,
  getOperatorsForColumnType,
  isValuelessFilterOp,
  type FilterOperator,
  type TableFilter,
} from '../markdown/tableFilters'
import { COLUMN_TYPE_ICONS } from './addColumnDialog'
import { createCalendarSection } from './datePicker'
import { createIcon } from './icons'
import { positionAnchoredElement, stopEvents, type AnchorRect } from './popoverPosition'

export interface FilterPopoverOptions {
  filter: TableFilter
  columnName: string
  columnSchema: ColumnSchema
  columnValues: string[]
  dateFormat: string
  startOfWeek: number
  returnFocusEl?: HTMLElement | null | (() => HTMLElement | null)
  onChange: (nextFilter: TableFilter, immediate: boolean) => void
  onDelete: () => void
  onClose?: () => void
}

let activeFilterPopoverClose: (() => void) | null = null

export function closeActiveFilterPopover(): void {
  if (activeFilterPopoverClose) {
    activeFilterPopoverClose()
    activeFilterPopoverClose = null
  }
}

export function openFilterPopover(
  doc: Document,
  anchor: AnchorRect,
  opts: FilterPopoverOptions
): () => void {
  closeActiveFilterPopover()

  const colType = opts.columnSchema.type
  let current = cloneFilter(opts.filter)

  const pop = doc.createElement('div')
  pop.className = 'nt-filter-popover forbid-edit'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', `Filter ${opts.columnName || 'Column'}`)

  stopEvents(pop, ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input', 'change'])

  // Header
  const header = doc.createElement('div')
  header.className = 'nt-fp-header'

  const colInfo = doc.createElement('div')
  colInfo.className = 'nt-fp-col'
  colInfo.appendChild(createIcon(doc, COLUMN_TYPE_ICONS[colType] || 'typeText', 13))
  const colNameSpan = doc.createElement('span')
  colNameSpan.className = 'nt-fp-col-name'
  colNameSpan.textContent = opts.columnName || `Column ${current.col + 1}`
  colInfo.appendChild(colNameSpan)
  header.appendChild(colInfo)

  let opSelect: HTMLSelectElement | null = null
  if (colType !== 'checkbox') {
    opSelect = doc.createElement('select')
    opSelect.className = 'nt-fp-op-select forbid-edit'
    opSelect.setAttribute('aria-label', 'Filter condition')
    for (const item of getOperatorsForColumnType(colType)) {
      const optEl = doc.createElement('option')
      optEl.value = item.op
      optEl.textContent = item.label
      if (item.op === current.op) optEl.selected = true
      opSelect.appendChild(optEl)
    }
    header.appendChild(opSelect)
  }

  const delBtn = doc.createElement('button')
  delBtn.type = 'button'
  delBtn.className = 'nt-fp-del-btn forbid-edit'
  delBtn.title = 'Delete filter'
  delBtn.setAttribute('aria-label', 'Delete filter')
  delBtn.appendChild(createIcon(doc, 'trash', 13))
  delBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    close(true)
    opts.onDelete()
  })
  header.appendChild(delBtn)
  pop.appendChild(header)

  const body = doc.createElement('div')
  body.className = 'nt-fp-body'
  pop.appendChild(body)

  const emitChange = (immediate: boolean) => {
    opts.onChange(cloneFilter(current), immediate)
  }

  const positionPopover = () => {
    positionAnchoredElement(doc, pop, anchor)
  }

  const renderBody = (): HTMLElement | null => {
    body.textContent = ''

    if (colType === 'checkbox') {
      body.style.display = 'block'
      const row = doc.createElement('div')
      row.className = 'nt-fp-bool-row'

      const makeToggle = (op: 'checked' | 'unchecked', label: string) => {
        const btn = doc.createElement('button')
        btn.type = 'button'
        btn.className = 'nt-fp-bool-btn forbid-edit'
        const active = current.op === op
        if (active) btn.classList.add('nt-active')
        btn.setAttribute('aria-pressed', active ? 'true' : 'false')
        btn.textContent = label
        btn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          current.op = op
          delete current.value
          emitChange(true)
          renderBody()
        })
        return btn
      }

      const checkedBtn = makeToggle('checked', 'Checked')
      const uncheckedBtn = makeToggle('unchecked', 'Unchecked')
      row.append(checkedBtn, uncheckedBtn)
      body.appendChild(row)
      return current.op === 'unchecked' ? uncheckedBtn : checkedBtn
    }

    if (isValuelessFilterOp(current.op)) {
      body.style.display = 'none'
      return opSelect
    }

    body.style.display = 'block'

    if (colType === 'text' || colType === 'url' || colType === 'number') {
      const input = doc.createElement('input')
      input.type = 'text'
      input.className = 'nt-fp-input forbid-edit'
      input.setAttribute('aria-label', 'Filter value')
      if (colType === 'number') {
        input.inputMode = 'decimal'
        input.placeholder = 'Type a number…'
      } else {
        input.placeholder = colType === 'url' ? 'Type URL or text…' : 'Type a value…'
      }
      input.value = typeof current.value === 'string' ? current.value : ''

      input.addEventListener('input', () => {
        current.value = input.value
        emitChange(false)
      })
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          current.value = input.value
          emitChange(true)
          close(true)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close(true)
        }
      })

      body.appendChild(input)
      return input
    }

    if (colType === 'select' || colType === 'multi-select') {
      const multi = colType === 'multi-select'
      const harvestedOpts: SelectOption[] = harvestOptionsFromColumn(
        opts.columnValues.map((v) => [v]),
        0,
        multi,
        opts.columnSchema.options || []
      )

      const searchInput = doc.createElement('input')
      searchInput.type = 'text'
      searchInput.className = 'nt-fp-input forbid-edit'
      searchInput.setAttribute('aria-label', 'Search options')
      searchInput.placeholder = 'Search options…'

      const listEl = doc.createElement('div')
      listEl.className = 'nt-fp-opt-list'

      const selectedVals = (): string[] =>
        Array.isArray(current.value) ? current.value : []

      const isSelected = (label: string): boolean =>
        selectedVals().some((v) => v.toLowerCase() === label.toLowerCase())

      const renderOptionsList = () => {
        listEl.textContent = ''
        const q = searchInput.value.trim().toLowerCase()
        const matching = harvestedOpts.filter((o) =>
          !q ? true : o.label.toLowerCase().includes(q)
        )

        if (matching.length === 0) {
          const empty = doc.createElement('div')
          empty.className = 'nt-sp-empty'
          empty.textContent =
            harvestedOpts.length === 0 ? 'No options in this column yet' : 'No matching options'
          listEl.appendChild(empty)
          return
        }

        for (const opt of matching) {
          const btn = doc.createElement('button')
          btn.type = 'button'
          btn.className = 'nt-fp-opt-btn forbid-edit'
          const active = isSelected(opt.label)
          if (active) btn.classList.add('nt-active')
          btn.setAttribute('aria-pressed', active ? 'true' : 'false')

          const pill = doc.createElement('span')
          pill.className = `nt-select-pill nt-color-${opt.color}`
          if (opt.isPage) {
            const pIcon = createIcon(doc, 'file', 11)
            pIcon.classList.add('nt-pill-page-icon')
            pill.appendChild(pIcon)
          }
          const lbl = doc.createElement('span')
          lbl.textContent = opt.label
          pill.appendChild(lbl)
          btn.appendChild(pill)

          if (active) {
            const chk = doc.createElement('span')
            chk.className = 'nt-sp-check'
            chk.appendChild(createIcon(doc, 'check', 13))
            btn.appendChild(chk)
          }

          btn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const cur = selectedVals()
            if (isSelected(opt.label)) {
              current.value = cur.filter((v) => v.toLowerCase() !== opt.label.toLowerCase())
            } else {
              current.value = [...cur, opt.label]
            }
            emitChange(true)
            renderOptionsList()
          })

          listEl.appendChild(btn)
        }
      }

      searchInput.addEventListener('input', renderOptionsList)
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close(true)
        }
      })

      renderOptionsList()
      body.append(searchInput, listEl)
      return searchInput
    }

    // Date filter
    const today = new Date()
    const rawVal = typeof current.value === 'string' ? current.value : ''
    const initialRelToken = normalizeRelativeDateToken(rawVal)
    let selectedDate = parsePlaintextDate(rawVal, today)
    const initialView = selectedDate || today

    const inputWrap = doc.createElement('div')
    inputWrap.className = 'nt-dp-input-wrap'

    const input = doc.createElement('input')
    input.type = 'text'
    input.className = 'nt-dp-input forbid-edit'
    input.setAttribute('aria-label', 'Filter date')
    input.placeholder = 'e.g. today, -7d, Nov 25, 2026-11-25'
    input.value =
      initialRelToken ?? (selectedDate ? formatLogseqDate(selectedDate, opts.dateFormat) : rawVal)

    const preview = doc.createElement('div')
    preview.className = 'nt-dp-preview'

    const updatePreview = (parsed: Date | null, text: string) => {
      preview.textContent = ''
      if (!text.trim()) {
        preview.className = 'nt-dp-preview nt-dp-preview-muted'
        preview.textContent = `Format: ${formatLogseqDate(today, opts.dateFormat)}`
        return
      }
      if (parsed) {
        const rel = normalizeRelativeDateToken(text)
        preview.className = 'nt-dp-preview nt-dp-preview-valid'
        if (rel) {
          preview.textContent = `→ ${formatRelativeDateLabel(rel)} (${formatLogseqDate(parsed, opts.dateFormat)}) · Dynamic`
        } else {
          preview.textContent = `→ ${formatLogseqDate(parsed, opts.dateFormat)}`
        }
      } else {
        preview.className = 'nt-dp-preview nt-dp-preview-warn'
        preview.textContent = 'Unrecognized date'
      }
    }

    inputWrap.append(input, preview)
    body.appendChild(inputWrap)

    const quickButtons: Array<{ token: string; btn: HTMLButtonElement }> = []
    const syncQuickButtons = () => {
      const activeRel = normalizeRelativeDateToken(
        typeof current.value === 'string' ? current.value : ''
      )
      for (const item of quickButtons) {
        const active = activeRel === item.token
        item.btn.classList.toggle('nt-active', active)
        item.btn.setAttribute('aria-pressed', active ? 'true' : 'false')
      }
    }

    let cal!: ReturnType<typeof createCalendarSection>

    const applyDate = (d: Date, immediate: boolean) => {
      selectedDate = d
      cal.setView(d.getFullYear(), d.getMonth())
      const iso = formatLogseqDate(d, 'yyyy-MM-dd')
      current.value = iso
      input.value = formatLogseqDate(d, opts.dateFormat)
      updatePreview(d, input.value)
      cal.render()
      syncQuickButtons()
      emitChange(immediate)
    }

    const applyRelativeDate = (token: string, immediate: boolean) => {
      const parsed = parsePlaintextDate(token, today)
      if (parsed) {
        selectedDate = parsed
        cal.setView(parsed.getFullYear(), parsed.getMonth())
      }
      current.value = token
      input.value = token
      updatePreview(parsed, token)
      cal.render()
      syncQuickButtons()
      emitChange(immediate)
    }

    cal = createCalendarSection(doc, {
      initialYear: initialView.getFullYear(),
      initialMonth: initialView.getMonth(),
      startOfWeek: opts.startOfWeek,
      today,
      getSelectedDate: () => selectedDate,
      onSelectDay: (d) => applyDate(d, true),
    })
    body.append(cal.headerEl, cal.weekdaysEl, cal.gridEl)

    input.addEventListener('input', () => {
      const text = input.value
      const parsed = parsePlaintextDate(text, today)
      updatePreview(parsed, text)
      if (!text.trim()) {
        selectedDate = null
        current.value = ''
        cal.render()
        syncQuickButtons()
        emitChange(false)
      } else if (parsed) {
        selectedDate = parsed
        cal.setView(parsed.getFullYear(), parsed.getMonth())
        const rel = normalizeRelativeDateToken(text)
        current.value = rel ?? formatLogseqDate(parsed, 'yyyy-MM-dd')
        cal.render()
        syncQuickButtons()
        emitChange(false)
      }
    })

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const raw = input.value.trim()
        if (!raw) {
          selectedDate = null
          current.value = ''
          syncQuickButtons()
          emitChange(true)
          close(true)
          return
        }
        const parsed = parsePlaintextDate(raw, today)
        if (parsed) {
          const rel = normalizeRelativeDateToken(raw)
          if (rel) {
            applyRelativeDate(rel, true)
          } else {
            applyDate(parsed, true)
          }
          close(true)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(true)
      }
    })

    const footer = doc.createElement('div')
    footer.className = 'nt-dp-footer'

    const makeQuick = (
      label: string,
      onClick: () => void,
      danger = false,
      relToken?: string
    ) => {
      const b = doc.createElement('button')
      b.type = 'button'
      b.className = 'nt-dp-quick-btn forbid-edit'
      if (danger) b.classList.add('nt-danger')
      if (relToken) {
        b.dataset.relToken = relToken
        quickButtons.push({ token: relToken, btn: b })
      }
      b.textContent = label
      b.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick()
      })
      return b
    }

    footer.append(
      makeQuick('Today', () => applyRelativeDate('today', true), false, 'today'),
      makeQuick('Tomorrow', () => applyRelativeDate('tomorrow', true), false, 'tomorrow'),
      makeQuick('Yesterday', () => applyRelativeDate('yesterday', true), false, 'yesterday'),
      makeQuick('-7d', () => applyRelativeDate('-7d', true), false, '-7d'),
      makeQuick('+7d', () => applyRelativeDate('+7d', true), false, '+7d'),
      makeQuick(
        'Clear',
        () => {
          selectedDate = null
          current.value = ''
          input.value = ''
          updatePreview(null, '')
          cal.render()
          syncQuickButtons()
          emitChange(true)
        },
        true
      )
    )
    body.appendChild(footer)

    updatePreview(selectedDate, input.value)
    cal.render()
    syncQuickButtons()
    return input
  }

  if (opSelect) {
    opSelect.addEventListener('change', () => {
      const nextOp = opSelect!.value as FilterOperator
      const prevValueless = isValuelessFilterOp(current.op)
      const nextValueless = isValuelessFilterOp(nextOp)
      current.op = nextOp
      if (nextValueless) {
        delete current.value
      } else if (prevValueless) {
        current.value = colType === 'select' || colType === 'multi-select' ? [] : ''
      }
      emitChange(true)
      const focusTarget = renderBody()
      positionPopover()
      focusTarget?.focus()
    })
  }

  const initialFocusEl = renderBody()

  pop.style.visibility = 'hidden'
  pop.style.left = '0px'
  pop.style.top = '0px'
  doc.body.appendChild(pop)
  positionPopover()
  pop.style.visibility = 'visible'

  let closed = false
  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) close(false)
  }
  const onDocKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close(true)
    }
  }

  const close = (restoreFocus = false) => {
    if (closed) return
    closed = true
    doc.removeEventListener('mousedown', onOutside, true)
    doc.removeEventListener('keydown', onDocKey, true)
    pop.remove()
    if (activeFilterPopoverClose === closeWrapper) activeFilterPopoverClose = null
    opts.onClose?.()
    if (restoreFocus) {
      const targetEl =
        typeof opts.returnFocusEl === 'function' ? opts.returnFocusEl() : opts.returnFocusEl
      if (targetEl && targetEl.isConnected) {
        targetEl.focus()
      }
    }
  }

  const closeWrapper = () => close(false)
  activeFilterPopoverClose = closeWrapper
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', onOutside, true)
      doc.addEventListener('keydown', onDocKey, true)
      initialFocusEl?.focus()
      if (initialFocusEl instanceof HTMLInputElement) {
        initialFocusEl.select()
      }
    }
  }, 0)

  return () => close(false)
}
