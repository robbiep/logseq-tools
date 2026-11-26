export interface DragReorderOptions {
  doc: Document
  handle: HTMLElement
  axis: 'row' | 'col'
  sourceIndex: number
  getTargets: () => HTMLElement[]
  getSourceElements: () => HTMLElement[]
  createDragGhost?: (sourceElements: HTMLElement[]) => HTMLElement | null
  onClick: (ev: MouseEvent) => void
  onReorder: (fromIndex: number, toIndex: number, insertBeforeIndex: number) => void
}

const DRAG_THRESHOLD_PX = 4

/**
 * Attach pointer-based drag-to-reorder on a row or column handle.
 * Short clicks (< 4px travel) trigger `onClick` to open the Notion menu;
 * dragging shows an accent drop indicator line, optional floating drag ghost,
 * and invokes `onReorder`.
 */
export function attachHandleDragReorder(opts: DragReorderOptions): () => void {
  const {
    doc,
    handle,
    axis,
    sourceIndex,
    getTargets,
    getSourceElements,
    createDragGhost,
    onClick,
    onReorder,
  } = opts
  const win = doc.defaultView || window
  let activeCleanup: (() => void) | null = null

  const onMouseDown = (downEv: MouseEvent) => {
    if (downEv.button !== 0) return
    downEv.preventDefault()
    downEv.stopPropagation()

    const startX = downEv.clientX
    const startY = downEv.clientY
    let dragging = false
    let indicator: HTMLElement | null = null
    let ghost: HTMLElement | null = null
    let targetIndex = sourceIndex
    let insertBeforeIndex = sourceIndex
    let sourceEls: HTMLElement[] = []

    const positionGhost = (clientX: number, clientY: number) => {
      if (!ghost) return
      ghost.style.left = `${clientX - 12}px`
      ghost.style.top = `${clientY - 14}px`
    }

    const updateIndicator = (clientX: number, clientY: number) => {
      const targets = getTargets()
      if (targets.length === 0) return

      if (!indicator) {
        indicator = doc.createElement('div')
        indicator.className = 'nt-drop-indicator'
        doc.body.appendChild(indicator)
      }

      if (axis === 'row') {
        let bestIdx = targets.length - 1
        let insertBefore = targets.length
        let lineY = targets[bestIdx].getBoundingClientRect().bottom
        let refRect = targets[0].getBoundingClientRect()

        for (let i = 0; i < targets.length; i++) {
          const r = targets[i].getBoundingClientRect()
          const mid = r.top + r.height / 2
          if (clientY < mid) {
            bestIdx = i > sourceIndex ? i - 1 : i
            insertBefore = i
            lineY = r.top
            refRect = r
            break
          }
          if (i === targets.length - 1) {
            bestIdx = targets.length - 1
            insertBefore = targets.length
            lineY = r.bottom
            refRect = r
          }
        }
        targetIndex = Math.max(0, Math.min(targets.length - 1, bestIdx))
        insertBeforeIndex = insertBefore
        indicator.style.left = `${refRect.left}px`
        indicator.style.top = `${lineY - 1}px`
        indicator.style.width = `${refRect.width}px`
        indicator.style.height = '2px'
      } else {
        let bestIdx = targets.length - 1
        let insertBefore = targets.length
        let lineX = targets[bestIdx].getBoundingClientRect().right
        const firstRect = targets[0].getBoundingClientRect()
        const tableRect = targets[0].closest('table')?.getBoundingClientRect() || firstRect

        for (let i = 0; i < targets.length; i++) {
          const r = targets[i].getBoundingClientRect()
          const mid = r.left + r.width / 2
          if (clientX < mid) {
            bestIdx = i > sourceIndex ? i - 1 : i
            insertBefore = i
            lineX = r.left
            break
          }
          if (i === targets.length - 1) {
            bestIdx = targets.length - 1
            insertBefore = targets.length
            lineX = r.right
          }
        }
        targetIndex = Math.max(0, Math.min(targets.length - 1, bestIdx))
        insertBeforeIndex = insertBefore
        indicator.style.left = `${lineX - 1}px`
        indicator.style.top = `${tableRect.top}px`
        indicator.style.width = '2px'
        indicator.style.height = `${tableRect.height}px`
      }
    }

    const onMouseMove = (moveEv: MouseEvent) => {
      const dx = moveEv.clientX - startX
      const dy = moveEv.clientY - startY
      if (!dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        dragging = true
        sourceEls = getSourceElements()
        for (const el of sourceEls) el.classList.add('nt-drag-source')
        doc.body?.classList.add('nt-dragging')
        if (createDragGhost) {
          ghost = createDragGhost(sourceEls)
          if (ghost) {
            ghost.classList.add('nt-drag-ghost')
            doc.body.appendChild(ghost)
            positionGhost(moveEv.clientX, moveEv.clientY)
          }
        }
      }
      if (dragging) {
        updateIndicator(moveEv.clientX, moveEv.clientY)
        positionGhost(moveEv.clientX, moveEv.clientY)
      }
    }

    const cleanup = () => {
      win.removeEventListener('mousemove', onMouseMove, true)
      win.removeEventListener('mouseup', onMouseUp, true)
      if (indicator) {
        indicator.remove()
        indicator = null
      }
      if (ghost) {
        ghost.remove()
        ghost = null
      }
      doc.body?.classList.remove('nt-dragging')
      for (const el of sourceEls) el.classList.remove('nt-drag-source')
      if (activeCleanup === cleanup) {
        activeCleanup = null
      }
    }

    const onMouseUp = (upEv: MouseEvent) => {
      upEv.preventDefault()
      upEv.stopPropagation()
      const wasDragging = dragging
      const finalTarget = targetIndex
      const finalInsertBefore = insertBeforeIndex
      const hasMultiSource = sourceEls.length > 1
      cleanup()

      if (!wasDragging) {
        onClick(upEv)
      } else if (axis === 'row' || finalTarget !== sourceIndex || hasMultiSource) {
        onReorder(sourceIndex, finalTarget, finalInsertBefore)
      }
    }

    activeCleanup = cleanup
    win.addEventListener('mousemove', onMouseMove, true)
    win.addEventListener('mouseup', onMouseUp, true)
  }

  handle.addEventListener('mousedown', onMouseDown)
  return () => {
    activeCleanup?.()
    handle.removeEventListener('mousedown', onMouseDown)
  }
}
