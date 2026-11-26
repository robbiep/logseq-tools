import { normalizeVideoPlaybackUrl, type ImageDimensions } from '../markdown/imageUtils'
import { createIcon } from './icons'
import { positionAnchoredElement, stopEvents, type AnchorRect } from './popoverPosition'

export interface ImageDimensionPopoverOptions {
  currentWidth: number
  currentHeight: number
  naturalWidth?: number
  naturalHeight?: number
  onApply: (dims: ImageDimensions) => void
  onResetOriginal: () => void
}

let activePopoverClose: (() => void) | null = null

export function closeActiveImagePopover(): void {
  if (activePopoverClose) {
    activePopoverClose()
    activePopoverClose = null
  }
}

export function openImageDimensionPopover(
  doc: Document,
  anchor: AnchorRect,
  opts: ImageDimensionPopoverOptions
): () => void {
  closeActiveImagePopover()

  const ratio =
    opts.naturalWidth && opts.naturalHeight && opts.naturalHeight > 0
      ? opts.naturalWidth / opts.naturalHeight
      : opts.currentHeight > 0
        ? opts.currentWidth / opts.currentHeight
        : 1

  let locked = true

  const pop = doc.createElement('div')
  pop.className = 'nt-img-popover forbid-edit'
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Image dimensions')

  stopEvents(pop, ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'input'])

  const header = doc.createElement('div')
  header.className = 'nt-img-pop-header'
  header.textContent = 'Image Size'
  if (opts.naturalWidth && opts.naturalHeight) {
    const nat = doc.createElement('span')
    nat.className = 'nt-img-pop-natural'
    nat.textContent = `${opts.naturalWidth} × ${opts.naturalHeight}`
    header.appendChild(nat)
  }
  pop.appendChild(header)

  const fields = doc.createElement('div')
  fields.className = 'nt-img-pop-fields'

  const wGroup = doc.createElement('label')
  wGroup.className = 'nt-img-pop-field'
  const wLabel = doc.createElement('span')
  wLabel.textContent = 'W (px)'
  const wInput = doc.createElement('input')
  wInput.type = 'number'
  wInput.min = '24'
  wInput.max = '2400'
  wInput.className = 'nt-img-pop-input forbid-edit'
  wInput.value = String(Math.max(24, Math.round(opts.currentWidth || 200)))
  wGroup.append(wLabel, wInput)

  const lockBtn = doc.createElement('button')
  lockBtn.type = 'button'
  lockBtn.className = 'nt-img-lock-btn nt-active forbid-edit'
  lockBtn.title = 'Lock aspect ratio'
  lockBtn.setAttribute('aria-label', 'Lock aspect ratio')
  lockBtn.appendChild(createIcon(doc, 'lock', 13))

  lockBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    locked = !locked
    lockBtn.classList.toggle('nt-active', locked)
    lockBtn.textContent = ''
    lockBtn.appendChild(createIcon(doc, locked ? 'lock' : 'unlock', 13))
  })

  const hGroup = doc.createElement('label')
  hGroup.className = 'nt-img-pop-field'
  const hLabel = doc.createElement('span')
  hLabel.textContent = 'H (px)'
  const hInput = doc.createElement('input')
  hInput.type = 'number'
  hInput.min = '24'
  hInput.max = '2400'
  hInput.className = 'nt-img-pop-input forbid-edit'
  hInput.value = String(Math.max(24, Math.round(opts.currentHeight || 150)))
  hGroup.append(hLabel, hInput)

  wInput.addEventListener('input', () => {
    if (!locked) return
    const w = Number(wInput.value)
    if (Number.isFinite(w) && w > 0 && ratio > 0) {
      hInput.value = String(Math.max(24, Math.round(w / ratio)))
    }
  })

  hInput.addEventListener('input', () => {
    if (!locked) return
    const h = Number(hInput.value)
    if (Number.isFinite(h) && h > 0 && ratio > 0) {
      wInput.value = String(Math.max(24, Math.round(h * ratio)))
    }
  })

  fields.append(wGroup, lockBtn, hGroup)
  pop.appendChild(fields)

  const presets = doc.createElement('div')
  presets.className = 'nt-img-pop-presets'

  const presetSpecs: Array<{ label: string; width: number }> = [
    { label: 'S (100)', width: 100 },
    { label: 'M (200)', width: 200 },
    { label: 'L (320)', width: 320 },
  ]
  for (const preset of presetSpecs) {
    const pBtn = doc.createElement('button')
    pBtn.type = 'button'
    pBtn.className = 'nt-img-preset-btn forbid-edit'
    pBtn.textContent = preset.label
    pBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const w = preset.width
      const h = Math.max(24, Math.round(w / (ratio || 1)))
      close()
      opts.onApply({ width: w, height: h })
    })
    presets.appendChild(pBtn)
  }

  const origBtn = doc.createElement('button')
  origBtn.type = 'button'
  origBtn.className = 'nt-img-preset-btn forbid-edit'
  origBtn.textContent = 'Original'
  origBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    close()
    opts.onResetOriginal()
  })
  presets.appendChild(origBtn)
  pop.appendChild(presets)

  const footer = doc.createElement('div')
  footer.className = 'nt-img-pop-footer'

  const applyBtn = doc.createElement('button')
  applyBtn.type = 'button'
  applyBtn.className = 'nt-img-apply-btn forbid-edit'
  applyBtn.textContent = 'Apply'
  const commitInputs = () => {
    const w = Math.max(24, Math.min(2400, Math.round(Number(wInput.value) || opts.currentWidth || 200)))
    const h = Math.max(24, Math.min(2400, Math.round(Number(hInput.value) || opts.currentHeight || 150)))
    close()
    opts.onApply({ width: w, height: h })
  }
  applyBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    commitInputs()
  })
  footer.appendChild(applyBtn)
  pop.appendChild(footer)

  const handleInputKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      commitInputs()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }
  wInput.addEventListener('keydown', handleInputKey)
  hInput.addEventListener('keydown', handleInputKey)

  pop.style.visibility = 'hidden'
  pop.style.left = '0px'
  pop.style.top = '0px'
  doc.body.appendChild(pop)

  positionAnchoredElement(doc, pop, anchor)
  pop.style.visibility = 'visible'

  let closed = false
  const onOutside = (e: MouseEvent) => {
    if (!pop.contains(e.target as Node)) {
      close()
    }
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
    if (activePopoverClose === close) activePopoverClose = null
  }

  activePopoverClose = close
  setTimeout(() => {
    if (!closed) {
      doc.addEventListener('mousedown', onOutside, true)
      doc.addEventListener('keydown', onDocKey, true)
      wInput.focus()
      wInput.select()
    }
  }, 0)

  return close
}

export function openImageLightbox(
  doc: Document,
  src: string,
  alt: string,
  isVideo = false
): () => void {
  const overlay = doc.createElement('div')
  overlay.className = 'nt-img-lightbox forbid-edit'

  let mediaEl: HTMLElement
  if (isVideo) {
    const video = doc.createElement('video')
    video.src = normalizeVideoPlaybackUrl(src)
    video.controls = true
    video.playsInline = true
    video.autoplay = true
    video.className = 'nt-img-lightbox-img nt-img-lightbox-video forbid-edit'
    video.addEventListener('click', (e) => e.stopPropagation())
    mediaEl = video
  } else {
    const img = doc.createElement('img')
    img.src = src
    img.alt = alt
    img.className = 'nt-img-lightbox-img forbid-edit'
    img.addEventListener('click', (e) => e.stopPropagation())
    mediaEl = img
  }

  const closeBtn = doc.createElement('button')
  closeBtn.type = 'button'
  closeBtn.className = 'nt-img-lightbox-close forbid-edit'
  closeBtn.setAttribute('aria-label', 'Close preview')
  closeBtn.appendChild(createIcon(doc, 'x', 16))

  const close = () => {
    doc.removeEventListener('keydown', onKey, true)
    overlay.remove()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    }
  }

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    close()
  })
  overlay.addEventListener('mousedown', (e) => e.stopPropagation())
  overlay.addEventListener('click', (e) => {
    e.stopPropagation()
    close()
  })

  doc.addEventListener('keydown', onKey, true)
  overlay.append(mediaEl, closeBtn)
  doc.body.appendChild(overlay)
  return close
}

export interface CornerResizeOptions {
  doc: Document
  imgEl: HTMLImageElement | HTMLVideoElement
  wrapEl: HTMLElement
  handleEl: HTMLElement
  initialWidth?: number
  initialHeight?: number
  onCommitSize: (dims: { width: number; height: number }) => void
}

export function attachImageCornerResize(opts: CornerResizeOptions): void {
  const { doc, imgEl, wrapEl, handleEl, initialWidth, initialHeight, onCommitSize } = opts
  const win = doc.defaultView || window

  handleEl.addEventListener('mousedown', (downEv) => {
    if (downEv.button !== 0) return
    downEv.preventDefault()
    downEv.stopPropagation()

    const rect = imgEl.getBoundingClientRect()
    const intrinsicW =
      imgEl instanceof HTMLVideoElement ? imgEl.videoWidth : imgEl.naturalWidth
    const intrinsicH =
      imgEl instanceof HTMLVideoElement ? imgEl.videoHeight : imgEl.naturalHeight
    const startW = Math.max(24, Math.round(rect.width || initialWidth || intrinsicW || 180))
    const startH = Math.max(24, Math.round(rect.height || initialHeight || intrinsicH || 120))
    const ratio =
      intrinsicW > 0 && intrinsicH > 0
        ? intrinsicW / intrinsicH
        : startW / startH

    const startX = downEv.clientX
    const startY = downEv.clientY
    let curW = startW
    let curH = startH

    const badge = doc.createElement('div')
    badge.className = 'nt-img-size-badge'
    badge.textContent = `${curW} × ${curH}`
    wrapEl.appendChild(badge)
    wrapEl.classList.add('nt-img-resizing')

    const onMove = (moveEv: MouseEvent) => {
      const dx = moveEv.clientX - startX
      const dy = moveEv.clientY - startY
      const freeform = moveEv.shiftKey

      curW = Math.max(24, Math.min(1200, Math.round(startW + dx)))
      if (freeform) {
        curH = Math.max(24, Math.min(1200, Math.round(startH + dy)))
      } else {
        curH = Math.max(24, Math.min(1200, Math.round(curW / (ratio || 1))))
      }

      imgEl.style.width = `${curW}px`
      imgEl.style.height = `${curH}px`
      badge.textContent = `${curW} × ${curH}`
    }

    const onUp = (upEv: MouseEvent) => {
      upEv.preventDefault()
      upEv.stopPropagation()
      win.removeEventListener('mousemove', onMove, true)
      win.removeEventListener('mouseup', onUp, true)
      badge.remove()
      wrapEl.classList.remove('nt-img-resizing')
      if (curW !== startW || curH !== startH) {
        onCommitSize({ width: curW, height: curH })
      }
    }

    win.addEventListener('mousemove', onMove, true)
    win.addEventListener('mouseup', onUp, true)
  })
}
