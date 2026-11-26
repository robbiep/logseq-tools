export interface AnchorRect {
  left: number
  top: number
  right?: number
  bottom?: number
}

export function toAnchorRect(el: HTMLElement): AnchorRect {
  const rect = el.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  }
}

export function stopEvents(el: HTMLElement, events: readonly string[]): void {
  const stop = (e: Event) => {
    e.stopPropagation()
  }
  for (const evt of events) {
    el.addEventListener(evt, stop)
  }
}

export interface PositionAnchoredOptions {
  margin?: number
  alignRightOnOverflow?: boolean
  clampAboveToViewport?: boolean
  clampLeftToViewport?: boolean
}

export function positionAnchoredElement(
  doc: Document,
  el: HTMLElement,
  anchor: AnchorRect,
  opts: PositionAnchoredOptions = {}
): void {
  const win = doc.defaultView || window
  const margin = opts.margin ?? 10
  const rect = el.getBoundingClientRect()
  const vw = win.innerWidth || doc.documentElement.clientWidth || 1024
  const vh = win.innerHeight || doc.documentElement.clientHeight || 768

  let left = anchor.left
  let top = anchor.bottom !== undefined ? anchor.bottom + 4 : anchor.top + 4

  if (left + rect.width > vw - margin) {
    left = opts.alignRightOnOverflow
      ? Math.max(8, (anchor.right ?? anchor.left) - rect.width)
      : Math.max(8, vw - rect.width - margin)
  }

  if (top + rect.height > vh - margin) {
    const aboveTop = anchor.top - rect.height - 4
    if (opts.clampAboveToViewport) {
      top =
        opts.clampLeftToViewport && aboveTop < 8
          ? Math.max(8, vh - rect.height - margin)
          : Math.max(8, aboveTop)
    } else if (aboveTop >= 8) {
      top = aboveTop
    }
  }

  const finalLeft = opts.clampLeftToViewport
    ? Math.min(Math.max(8, left), Math.max(8, vw - rect.width - 8))
    : Math.max(8, left)
  el.style.left = `${finalLeft}px`
  el.style.top = `${Math.max(8, top)}px`
}
