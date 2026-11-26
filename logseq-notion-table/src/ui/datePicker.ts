import {
  formatJournalDateLink,
  formatLogseqDate,
  getMonthCalendarGrid,
  getMonthTitle,
  getWeekdayShortHeaders,
  isSameDay,
  parsePlaintextDate,
} from '../markdown/dateUtils'
import { createIcon } from './icons'
import { positionAnchoredElement, stopEvents, type AnchorRect } from './popoverPosition'

export interface CalendarSection {
  headerEl: HTMLElement
  weekdaysEl: HTMLElement
  gridEl: HTMLElement
  setView: (year: number, month: number) => void
  render: () => void
}

export function createCalendarSection(
  doc: Document,
  opts: {
    initialYear: number
    initialMonth: number
    startOfWeek: number
    today: Date
    getSelectedDate: () => Date | null
    onSelectDay: (date: Date) => void
  }
): CalendarSection {
  let viewYear = opts.initialYear
  let viewMonth = opts.initialMonth

  const headerEl = doc.createElement('div')
  headerEl.className = 'nt-dp-cal-header'

  const prevBtn = doc.createElement('button')
  prevBtn.type = 'button'
  prevBtn.className = 'nt-dp-nav-btn forbid-edit'
  prevBtn.setAttribute('aria-label', 'Previous month')
  prevBtn.appendChild(createIcon(doc, 'chevronLeft', 14))

  const monthTitle = doc.createElement('span')
  monthTitle.className = 'nt-dp-month-title'

  const nextBtn = doc.createElement('button')
  nextBtn.type = 'button'
  nextBtn.className = 'nt-dp-nav-btn forbid-edit'
  nextBtn.setAttribute('aria-label', 'Next month')
  nextBtn.appendChild(createIcon(doc, 'chevronRight', 14))

  headerEl.append(prevBtn, monthTitle, nextBtn)

  const weekdaysEl = doc.createElement('div')
  weekdaysEl.className = 'nt-dp-weekdays'
  for (const wd of getWeekdayShortHeaders(opts.startOfWeek)) {
    const cell = doc.createElement('span')
    cell.className = 'nt-dp-weekday'
    cell.textContent = wd
    weekdaysEl.appendChild(cell)
  }

  const gridEl = doc.createElement('div')
  gridEl.className = 'nt-dp-grid'

  const render = () => {
    monthTitle.textContent = getMonthTitle(viewYear, viewMonth)
    gridEl.textContent = ''
    const selectedDate = opts.getSelectedDate()
    const days = getMonthCalendarGrid(viewYear, viewMonth, opts.startOfWeek)
    for (const item of days) {
      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'nt-dp-day forbid-edit'
      btn.textContent = String(item.date.getDate())
      btn.dataset.iso = formatLogseqDate(item.date, 'yyyy-MM-dd')
      if (!item.inCurrentMonth) btn.classList.add('nt-dp-outside')
      if (isSameDay(item.date, opts.today)) btn.classList.add('nt-dp-today')
      if (isSameDay(item.date, selectedDate)) btn.classList.add('nt-dp-selected')

      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        opts.onSelectDay(item.date)
      })
      gridEl.appendChild(btn)
    }
  }

  prevBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    viewMonth--
    if (viewMonth < 0) {
      viewMonth = 11
      viewYear--
    }
    render()
  })

  nextBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    viewMonth++
    if (viewMonth > 11) {
      viewMonth = 0
      viewYear++
    }
    render()
  })

  return {
    headerEl,
    weekdaysEl,
    gridEl,
    setView: (year: number, month: number) => {
      viewYear = year
      viewMonth = month
    },
    render,
  }
}

export interface DatePickerOptions {
  currentRaw: string
  dateFormat: string
  startOfWeek: number
  onSelect: (formattedMarkdown: string) => void
  onClear: () => void
  onClose?: () => void
}

let activeDatePickerClose: (() => void) | null = null

export function closeActiveDatePicker(): void {
  if (activeDatePickerClose) {
    activeDatePickerClose()
    activeDatePickerClose = null
  }
}

export function openDatePicker(
  doc: Document,
  anchor: AnchorRect,
  opts: DatePickerOptions
): () => void {
  closeActiveDatePicker()

  const today = new Date()
  const initialDate = parsePlaintextDate(opts.currentRaw, today)

  let selectedDate: Date | null = initialDate
  const initialView = initialDate || today

  const pop = doc.createElement('div')
  pop.className = 'nt-date-popover forbid-edit'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Date picker')

  stopEvents(pop, ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input'])

  const inputWrap = doc.createElement('div')
  inputWrap.className = 'nt-dp-input-wrap'

  const input = doc.createElement('input')
  input.type = 'text'
  input.className = 'nt-dp-input forbid-edit'
  input.placeholder = 'Type date (e.g. tomorrow, Nov 25, 2026-11-25)'
  const strippedInitial = opts.currentRaw.trim().replace(/^\[\[(.+)\]\]$/, '$1')
  input.value = strippedInitial

  const preview = doc.createElement('div')
  preview.className = 'nt-dp-preview'

  const updatePreview = (parsed: Date | null, rawText: string) => {
    preview.textContent = ''
    if (!rawText.trim()) {
      preview.className = 'nt-dp-preview nt-dp-preview-muted'
      preview.textContent = `Format: ${formatLogseqDate(today, opts.dateFormat)}`
      return
    }
    if (parsed) {
      preview.className = 'nt-dp-preview nt-dp-preview-valid'
      preview.textContent = `→ ${formatJournalDateLink(parsed, opts.dateFormat)}`
    } else {
      preview.className = 'nt-dp-preview nt-dp-preview-warn'
      preview.textContent = 'Unrecognized date — Enter will save text as-is'
    }
  }

  inputWrap.append(input, preview)
  pop.appendChild(inputWrap)

  const commitDate = (d: Date) => {
    close()
    opts.onSelect(formatJournalDateLink(d, opts.dateFormat))
  }

  const cal = createCalendarSection(doc, {
    initialYear: initialView.getFullYear(),
    initialMonth: initialView.getMonth(),
    startOfWeek: opts.startOfWeek,
    today,
    getSelectedDate: () => selectedDate,
    onSelectDay: (d) => commitDate(d),
  })
  pop.append(cal.headerEl, cal.weekdaysEl, cal.gridEl)

  input.addEventListener('input', () => {
    const parsed = parsePlaintextDate(input.value, today)
    updatePreview(parsed, input.value)
    if (parsed) {
      selectedDate = parsed
      cal.setView(parsed.getFullYear(), parsed.getMonth())
      cal.render()
    }
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const raw = input.value.trim()
      if (!raw) {
        close()
        opts.onClear()
        return
      }
      const parsed = parsePlaintextDate(raw, today)
      if (parsed) {
        commitDate(parsed)
      } else {
        close()
        opts.onSelect(raw)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  })

  const footer = doc.createElement('div')
  footer.className = 'nt-dp-footer'

  const makeQuick = (label: string, onClick: () => void, danger = false) => {
    const b = doc.createElement('button')
    b.type = 'button'
    b.className = 'nt-dp-quick-btn forbid-edit'
    if (danger) b.classList.add('nt-danger')
    b.textContent = label
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      onClick()
    })
    return b
  }

  footer.append(
    makeQuick('Today', () => commitDate(today)),
    makeQuick('Tomorrow', () => commitDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))),
    makeQuick('Clear', () => {
      close()
      opts.onClear()
    }, true)
  )
  pop.appendChild(footer)

  updatePreview(initialDate, strippedInitial)
  cal.render()

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
    if (activeDatePickerClose === close) activeDatePickerClose = null
    opts.onClose?.()
  }

  activeDatePickerClose = close
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', onOutside, true)
      doc.addEventListener('keydown', onDocKey, true)
      input.focus()
      input.select()
    }
  }, 0)

  return close
}
