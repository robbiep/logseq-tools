import { COLUMN_TYPE_LABELS, type ColumnType } from '../markdown/columnTypes'
import { createIcon, type IconName } from './icons'
import { positionAnchoredElement, stopEvents, type AnchorRect } from './popoverPosition'

export const COLUMN_TYPE_ICONS: Record<ColumnType, IconName> = {
  text: 'typeText',
  number: 'hash',
  date: 'calendar',
  'created-time': 'clock',
  'edited-time': 'clockEdit',
  select: 'select',
  'multi-select': 'multiSelect',
  checkbox: 'checkbox',
  url: 'link',
  media: 'image',
}

export const COLUMN_TYPE_CHOICES: ColumnType[] = [
  'text',
  'number',
  'date',
  'select',
  'multi-select',
  'checkbox',
  'url',
  'media',
  'created-time',
  'edited-time',
]

export interface AddColumnDialogOptions {
  onConfirm: (result: { name: string; type: ColumnType }) => void
  onCancel?: () => void
}

let activeCloseFn: (() => void) | null = null

export function closeActiveAddColumnDialog(): void {
  if (activeCloseFn) {
    activeCloseFn()
    activeCloseFn = null
  }
}

/**
 * Open an anchored dialog to enter a new column's name and/or pick its type.
 */
export function openAddColumnDialog(
  doc: Document,
  anchor: AnchorRect,
  opts: AddColumnDialogOptions
): () => void {
  closeActiveAddColumnDialog()

  const win = doc.defaultView || window
  const dialog = doc.createElement('div')
  dialog.className = 'nt-add-col-dialog forbid-edit'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-label', 'Add column')

  stopEvents(dialog, ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input', 'change'])

  const top = doc.createElement('div')
  top.className = 'nt-acd-top'

  const input = doc.createElement('input')
  input.type = 'text'
  input.className = 'nt-acd-input forbid-edit'
  input.placeholder = 'Column name…'
  input.setAttribute('aria-label', 'Column name')
  top.appendChild(input)
  dialog.appendChild(top)

  const list = doc.createElement('div')
  list.className = 'nt-acd-list'

  const hdr = doc.createElement('div')
  hdr.className = 'nt-popover-header'
  hdr.textContent = 'Column Type'
  list.appendChild(hdr)

  const typeButtons: HTMLButtonElement[] = []
  for (const type of COLUMN_TYPE_CHOICES) {
    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-popover-item nt-acd-type-btn forbid-edit'
    btn.dataset.colType = type

    const iconSpan = doc.createElement('span')
    iconSpan.className = 'nt-popover-icon'
    iconSpan.appendChild(createIcon(doc, COLUMN_TYPE_ICONS[type], 14))

    const labelSpan = doc.createElement('span')
    labelSpan.className = 'nt-popover-label'
    labelSpan.textContent = COLUMN_TYPE_LABELS[type]

    btn.append(iconSpan, labelSpan)
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const typed = input.value.trim()
      const name = typed || COLUMN_TYPE_LABELS[type]
      confirm({ name, type })
    })
    typeButtons.push(btn)
    list.appendChild(btn)
  }
  dialog.appendChild(list)

  dialog.style.visibility = 'hidden'
  dialog.style.left = '0px'
  dialog.style.top = '0px'
  doc.body.appendChild(dialog)

  positionAnchoredElement(doc, dialog, anchor, {
    margin: 8,
    alignRightOnOverflow: true,
    clampAboveToViewport: true,
    clampLeftToViewport: true,
  })
  dialog.style.visibility = 'visible'
  input.focus()

  let closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    doc.removeEventListener('mousedown', handleOutsideMouseDown, true)
    doc.removeEventListener('keydown', handleDocKeyDown, true)
    win.removeEventListener('scroll', handleScroll, true)
    dialog.remove()
    if (activeCloseFn === cancel) activeCloseFn = null
  }

  const cancel = () => {
    if (closed) return
    cleanup()
    opts.onCancel?.()
  }

  const confirm = (result: { name: string; type: ColumnType }) => {
    if (closed) return
    cleanup()
    opts.onConfirm(result)
  }

  const dismissFromOutside = () => {
    const trimmed = input.value.trim()
    if (trimmed) {
      confirm({ name: trimmed, type: 'text' })
    } else {
      cancel()
    }
  }

  const handleOutsideMouseDown = (e: MouseEvent) => {
    if (!dialog.contains(e.target as Node)) {
      dismissFromOutside()
    }
  }

  const handleDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
  }

  const handleScroll = () => {
    dismissFromOutside()
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const trimmed = input.value.trim()
      if (trimmed) {
        confirm({ name: trimmed, type: 'text' })
      }
      return
    }
    if (e.key === 'ArrowDown' && typeButtons.length > 0) {
      e.preventDefault()
      typeButtons[0].focus()
    }
  })

  typeButtons.forEach((btn, idx) => {
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        typeButtons[(idx + 1) % typeButtons.length].focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (idx === 0) {
          input.focus()
        } else {
          typeButtons[idx - 1].focus()
        }
      }
    })
  })

  activeCloseFn = cancel
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', handleOutsideMouseDown, true)
      doc.addEventListener('keydown', handleDocKeyDown, true)
      win.addEventListener('scroll', handleScroll, true)
      input.focus()
    }
  }, 0)

  return cancel
}
