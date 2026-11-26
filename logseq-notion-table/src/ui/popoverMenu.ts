import { createIcon, type IconName } from './icons'

export type PopoverMenuItem =
  | {
      type?: 'item'
      label: string
      icon?: IconName
      shortcut?: string
      active?: boolean
      checked?: boolean
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }
  | { type: 'separator' }
  | { type: 'header'; label: string }

let activeCloseFn: (() => void) | null = null

export function closeActivePopover(): void {
  if (activeCloseFn) {
    activeCloseFn()
    activeCloseFn = null
  }
}

export function openPopoverMenu(
  doc: Document,
  anchor: { left: number; top: number; right?: number; bottom?: number },
  items: PopoverMenuItem[],
  onClose?: () => void
): () => void {
  closeActivePopover()

  const win = doc.defaultView || window
  const menu = doc.createElement('div')
  menu.className = 'nt-popover forbid-edit'
  menu.setAttribute('role', 'menu')

  const stop = (e: Event) => {
    e.stopPropagation()
  }
  menu.addEventListener('mousedown', stop)
  menu.addEventListener('click', stop)

  for (const item of items) {
    if (item.type === 'separator') {
      const sep = doc.createElement('div')
      sep.className = 'nt-popover-sep'
      menu.appendChild(sep)
      continue
    }

    if (item.type === 'header') {
      const hdr = doc.createElement('div')
      hdr.className = 'nt-popover-header'
      hdr.textContent = item.label
      menu.appendChild(hdr)
      continue
    }

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'nt-popover-item forbid-edit'
    if (item.danger) btn.classList.add('nt-danger')
    if (item.active) btn.classList.add('nt-active')
    if (typeof item.checked === 'boolean') {
      btn.setAttribute('role', 'menuitemcheckbox')
      btn.setAttribute('aria-checked', item.checked ? 'true' : 'false')
    }
    btn.disabled = Boolean(item.disabled)

    if (item.icon) {
      const iconSpan = doc.createElement('span')
      iconSpan.className = 'nt-popover-icon'
      iconSpan.appendChild(createIcon(doc, item.icon, 14))
      btn.appendChild(iconSpan)
    }

    const labelSpan = doc.createElement('span')
    labelSpan.className = 'nt-popover-label'
    labelSpan.textContent = item.label
    btn.appendChild(labelSpan)

    if (typeof item.checked === 'boolean') {
      const toggleEl = doc.createElement('span')
      toggleEl.className = item.checked ? 'nt-popover-switch nt-on' : 'nt-popover-switch'
      toggleEl.setAttribute('aria-hidden', 'true')
      btn.appendChild(toggleEl)
    } else if (item.shortcut) {
      const kbd = doc.createElement('span')
      kbd.className = 'nt-popover-shortcut'
      kbd.textContent = item.shortcut
      btn.appendChild(kbd)
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (item.disabled) return
      close()
      item.onSelect()
    })

    menu.appendChild(btn)
  }

  menu.style.visibility = 'hidden'
  menu.style.left = '0px'
  menu.style.top = '0px'
  doc.body.appendChild(menu)

  // Position within viewport bounds
  const rect = menu.getBoundingClientRect()
  const vw = win.innerWidth || doc.documentElement.clientWidth || 1024
  const vh = win.innerHeight || doc.documentElement.clientHeight || 768

  let left = anchor.left
  let top = anchor.bottom !== undefined ? anchor.bottom + 4 : anchor.top + 4

  if (left + rect.width > vw - 8) {
    left = Math.max(8, (anchor.right ?? anchor.left) - rect.width)
  }
  if (top + rect.height > vh - 8) {
    top = Math.max(8, anchor.top - rect.height - 4)
  }

  menu.style.left = `${Math.max(8, left)}px`
  menu.style.top = `${Math.max(8, top)}px`
  menu.style.visibility = 'visible'

  let closed = false
  const handleOutsideMouseDown = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) {
      close()
    }
  }
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  const handleScroll = () => {
    close()
  }

  const close = () => {
    if (closed) return
    closed = true
    doc.removeEventListener('mousedown', handleOutsideMouseDown, true)
    doc.removeEventListener('keydown', handleKeyDown, true)
    win.removeEventListener('scroll', handleScroll, true)
    menu.remove()
    if (activeCloseFn === close) activeCloseFn = null
    onClose?.()
  }

  activeCloseFn = close
  // Defer binding outside-click slightly so current click cycle finishes
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', handleOutsideMouseDown, true)
      doc.addEventListener('keydown', handleKeyDown, true)
      win.addEventListener('scroll', handleScroll, true)
    }
  }, 0)

  return close
}
