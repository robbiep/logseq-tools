import { createIcon } from '../ui/icons'
import {
  attachImageCornerResize,
  openImageDimensionPopover,
  openImageLightbox,
} from '../ui/imageControls'
import { toAnchorRect } from '../ui/popoverPosition'
import {
  IMAGE_TOKEN_RE,
  isDirectAssetUrl,
  isSafeImageSrc,
  parseImageMeta,
  type ImageDimensions,
} from './imageUtils'

export interface InlineRenderCallbacks {
  readOnly?: boolean
  onPageClick?: (pageName: string, shiftKey: boolean) => void
  onExternalLinkClick?: (url: string) => void
  onCheckboxToggle?: (checkboxIndex: number, checked: boolean) => void
  resolveAssetUrl?: (rawSrc: string) => Promise<string>
  onImageResize?: (imageIndex: number, dims: ImageDimensions) => void
  onImageRemove?: (imageIndex: number) => void
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
  } catch {
    return false
  }
}

interface TokenMatch {
  index: number
  length: number
  build: (doc: Document) => Node
}

function appendTextOrFormatted(
  doc: Document,
  parent: Node,
  text: string,
  callbacks: InlineRenderCallbacks,
  counters: { checkboxes: number; images: number }
): void {
  let cursor = 0

  while (cursor < text.length) {
    const rest = text.slice(cursor)
    const candidates: TokenMatch[] = []

    // 1. Inline code: `...`
    const codeMatch = rest.match(/`([^`]+)`/)
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({
        index: codeMatch.index,
        length: codeMatch[0].length,
        build: (d) => {
          const el = d.createElement('code')
          el.className = 'nt-inline-code'
          el.textContent = codeMatch[1]
          return el
        },
      })
    }

    // 2. Image token: ![alt](src){:width ..., :height ...}
    const imgMatch = rest.match(IMAGE_TOKEN_RE)
    if (imgMatch && imgMatch.index !== undefined && isSafeImageSrc(imgMatch[2])) {
      const alt = imgMatch[1].replace(/\\\]/g, ']')
      const rawSrc = imgMatch[2]
      const dims = parseImageMeta(imgMatch[3])
      const imageIdx = counters.images++
      candidates.push({
        index: imgMatch.index,
        length: imgMatch[0].length,
        build: (d) => buildImageElement(d, alt, rawSrc, dims, imageIdx, callbacks),
      })
    }

    // 3. Checkbox: [ ] or [x] / [X] at start of line or preceded by whitespace
    const cbMatch = rest.match(/(?:^|(?<=\s))\[( |x|X)\](?=\s|$)/)
    if (cbMatch && cbMatch.index !== undefined) {
      const checked = cbMatch[1].toLowerCase() === 'x'
      const cbIdx = counters.checkboxes++
      candidates.push({
        index: cbMatch.index,
        length: cbMatch[0].length,
        build: (d) => {
          const input = d.createElement('input')
          input.type = 'checkbox'
          input.className = 'nt-checkbox forbid-edit'
          input.checked = checked
          input.disabled = Boolean(callbacks.readOnly)
          input.addEventListener('mousedown', (e) => e.stopPropagation())
          input.addEventListener('click', (e) => e.stopPropagation())
          input.addEventListener('change', (e) => {
            e.stopPropagation()
            callbacks.onCheckboxToggle?.(cbIdx, input.checked)
          })
          return input
        },
      })
    }

    // 4. Alias page link: [label]([[Page Name]])
    const aliasPageMatch = rest.match(/\[([^\]]+)\]\(\[\[([^\]]+)\]\]\)/)
    if (aliasPageMatch && aliasPageMatch.index !== undefined) {
      const label = aliasPageMatch[1]
      const pageName = aliasPageMatch[2].trim()
      candidates.push({
        index: aliasPageMatch.index,
        length: aliasPageMatch[0].length,
        build: (d) => buildPageLink(d, pageName, label, 'nt-page-ref forbid-edit', callbacks),
      })
    }

    // 5. Markdown external link: [label](https://...)
    const extLinkMatch = rest.match(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/)
    if (extLinkMatch && extLinkMatch.index !== undefined && isSafeExternalUrl(extLinkMatch[2])) {
      const label = extLinkMatch[1]
      const url = extLinkMatch[2]
      candidates.push({
        index: extLinkMatch.index,
        length: extLinkMatch[0].length,
        build: (d) => buildExternalLink(d, url, label, callbacks),
      })
    }

    // 6. Logseq page reference: [[Page Name]]
    const pageMatch = rest.match(/\[\[([^\]]+)\]\]/)
    if (pageMatch && pageMatch.index !== undefined) {
      const pageName = pageMatch[1].trim()
      candidates.push({
        index: pageMatch.index,
        length: pageMatch[0].length,
        build: (d) => buildPageLink(d, pageName, pageName, 'nt-page-ref forbid-edit', callbacks),
      })
    }

    // 7. Logseq multi-word tag: #[[Tag Name]]
    const multiTagMatch = rest.match(/#\[\[([^\]]+)\]\]/)
    if (multiTagMatch && multiTagMatch.index !== undefined) {
      const tagName = multiTagMatch[1].trim()
      candidates.push({
        index: multiTagMatch.index,
        length: multiTagMatch[0].length,
        build: (d) => buildPageLink(d, tagName, `#${tagName}`, 'nt-tag forbid-edit', callbacks),
      })
    }

    // 8. Simple #tag (preceded by start or whitespace)
    const tagMatch = rest.match(/(?:^|(?<=\s))#([A-Za-z0-9_\-/]+)/)
    if (tagMatch && tagMatch.index !== undefined) {
      const tagName = tagMatch[1]
      candidates.push({
        index: tagMatch.index,
        length: tagMatch[0].length,
        build: (d) => buildPageLink(d, tagName, `#${tagName}`, 'nt-tag forbid-edit', callbacks),
      })
    }

    // 9. Bare URL: https://... or http://...
    const bareUrlMatch = rest.match(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?"'\]]/)
    if (bareUrlMatch && bareUrlMatch.index !== undefined && isSafeExternalUrl(bareUrlMatch[0])) {
      const url = bareUrlMatch[0]
      candidates.push({
        index: bareUrlMatch.index,
        length: url.length,
        build: (d) => buildExternalLink(d, url, url, callbacks),
      })
    }

    // 10. Bold: **...**
    const boldMatch = rest.match(/\*\*(.+?)\*\*/)
    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({
        index: boldMatch.index,
        length: boldMatch[0].length,
        build: (d) => {
          const strong = d.createElement('strong')
          appendTextOrFormatted(d, strong, boldMatch[1], callbacks, counters)
          return strong
        },
      })
    }

    // 11. Highlight: ==...==
    const hlMatch = rest.match(/==(.+?)==/)
    if (hlMatch && hlMatch.index !== undefined) {
      candidates.push({
        index: hlMatch.index,
        length: hlMatch[0].length,
        build: (d) => {
          const mark = d.createElement('mark')
          mark.className = 'nt-highlight'
          appendTextOrFormatted(d, mark, hlMatch[1], callbacks, counters)
          return mark
        },
      })
    }

    // 12. Strikethrough: ~~...~~
    const strikeMatch = rest.match(/~~(.+?)~~/)
    if (strikeMatch && strikeMatch.index !== undefined) {
      candidates.push({
        index: strikeMatch.index,
        length: strikeMatch[0].length,
        build: (d) => {
          const del = d.createElement('del')
          appendTextOrFormatted(d, del, strikeMatch[1], callbacks, counters)
          return del
        },
      })
    }

    // 13. Italic: *...* (non-greedy, not starting/ending with space or *)
    const italicMatch = rest.match(/(?<!\*)\*([^\s*](?:[^*]*?[^\s*])?)\*(?!\*)/)
    if (italicMatch && italicMatch.index !== undefined) {
      candidates.push({
        index: italicMatch.index,
        length: italicMatch[0].length,
        build: (d) => {
          const em = d.createElement('em')
          appendTextOrFormatted(d, em, italicMatch[1], callbacks, counters)
          return em
        },
      })
    }

    if (candidates.length === 0) {
      parent.appendChild(doc.createTextNode(rest))
      break
    }

    // Pick earliest match; tie-break by longer match
    candidates.sort((a, b) => a.index - b.index || b.length - a.length)
    const winner = candidates[0]

    if (winner.index > 0) {
      parent.appendChild(doc.createTextNode(rest.slice(0, winner.index)))
    }
    parent.appendChild(winner.build(doc))
    cursor += winner.index + winner.length
  }
}

function buildImageElement(
  doc: Document,
  alt: string,
  rawSrc: string,
  dims: ImageDimensions,
  imageIdx: number,
  callbacks: InlineRenderCallbacks
): HTMLElement {
  const wrap = doc.createElement('span')
  wrap.className = 'nt-img-wrap forbid-edit'
  wrap.dataset.imageIndex = String(imageIdx)

  const img = doc.createElement('img')
  img.className = 'nt-cell-img forbid-edit'
  img.alt = alt
  img.loading = 'lazy'
  img.draggable = false
  if (dims.width) img.style.width = `${dims.width}px`
  if (dims.height) img.style.height = `${dims.height}px`

  const needsResolution = callbacks.resolveAssetUrl && !isDirectAssetUrl(rawSrc)

  if (needsResolution && callbacks.resolveAssetUrl) {
    void callbacks
      .resolveAssetUrl(rawSrc)
      .then((resolved) => {
        img.src = resolved || rawSrc
      })
      .catch(() => {
        img.src = rawSrc
      })
  } else {
    img.src = rawSrc
  }

  // Hover toolbar over image
  const actions = doc.createElement('span')
  actions.className = 'nt-img-actions forbid-edit'

  const resizeBtn = doc.createElement('button')
  resizeBtn.type = 'button'
  resizeBtn.className = 'nt-img-act-btn forbid-edit'
  resizeBtn.title = 'Customize image dimensions'
  resizeBtn.setAttribute('aria-label', 'Customize image dimensions')
  resizeBtn.appendChild(createIcon(doc, 'sliders', 12))
  resizeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  resizeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = img.getBoundingClientRect()
    const curW = Math.round(dims.width || rect.width || img.naturalWidth || 200)
    const curH = Math.round(dims.height || rect.height || img.naturalHeight || 150)
    openImageDimensionPopover(
      doc,
      toAnchorRect(resizeBtn),
      {
        currentWidth: curW,
        currentHeight: curH,
        naturalWidth: img.naturalWidth || undefined,
        naturalHeight: img.naturalHeight || undefined,
        onApply: (nextDims) => {
          callbacks.onImageResize?.(imageIdx, nextDims)
        },
        onResetOriginal: () => {
          callbacks.onImageResize?.(imageIdx, {})
        },
      }
    )
  })

  const previewBtn = doc.createElement('button')
  previewBtn.type = 'button'
  previewBtn.className = 'nt-img-act-btn forbid-edit'
  previewBtn.title = 'View full size'
  previewBtn.setAttribute('aria-label', 'View full size')
  previewBtn.appendChild(createIcon(doc, 'eye', 12))
  previewBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  previewBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    openImageLightbox(doc, img.currentSrc || img.src || rawSrc, alt)
  })

  const removeBtn = doc.createElement('button')
  removeBtn.type = 'button'
  removeBtn.className = 'nt-img-act-btn nt-img-act-danger forbid-edit'
  removeBtn.title = 'Remove image'
  removeBtn.setAttribute('aria-label', 'Remove image')
  removeBtn.appendChild(createIcon(doc, 'trash', 12))
  removeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    callbacks.onImageRemove?.(imageIdx)
  })

  if (callbacks.readOnly) {
    actions.append(previewBtn)
    wrap.addEventListener('click', (e) => {
      e.stopPropagation()
    })
    img.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      openImageLightbox(doc, img.currentSrc || img.src || rawSrc, alt)
    })
    wrap.append(img, actions)
    return wrap
  }

  actions.append(resizeBtn, previewBtn, removeBtn)

  // Bottom-right corner drag resizer
  const resizer = doc.createElement('span')
  resizer.className = 'nt-img-resizer forbid-edit'
  resizer.title = 'Drag to resize (hold Shift for freeform)'
  attachImageCornerResize({
    doc,
    imgEl: img,
    wrapEl: wrap,
    handleEl: resizer,
    initialWidth: dims.width,
    initialHeight: dims.height,
    onCommitSize: (nextDims) => {
      callbacks.onImageResize?.(imageIdx, nextDims)
    },
  })

  // Prevent clicking directly on image controls from entering raw text edit;
  // double-clicking the image opens full preview
  wrap.addEventListener('click', (e) => {
    e.stopPropagation()
  })
  img.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()
    openImageLightbox(doc, img.currentSrc || img.src || rawSrc, alt)
  })

  wrap.append(img, actions, resizer)
  return wrap
}

function buildPageLink(
  doc: Document,
  pageName: string,
  displayText: string,
  className: string,
  callbacks: InlineRenderCallbacks
): HTMLAnchorElement {
  const a = doc.createElement('a')
  a.className = className
  a.href = `#/page/${encodeURIComponent(pageName.toLowerCase())}`
  a.dataset.ref = pageName
  a.textContent = displayText
  a.addEventListener('mousedown', (e) => e.stopPropagation())
  a.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    callbacks.onPageClick?.(pageName, e.shiftKey)
  })
  return a
}

function buildExternalLink(
  doc: Document,
  url: string,
  label: string,
  callbacks: InlineRenderCallbacks
): HTMLAnchorElement {
  const a = doc.createElement('a')
  a.className = 'nt-ext-link forbid-edit'
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.textContent = label
  a.addEventListener('mousedown', (e) => e.stopPropagation())
  a.addEventListener('click', (e) => {
    e.stopPropagation()
    if (callbacks.onExternalLinkClick) {
      e.preventDefault()
      callbacks.onExternalLinkClick(url)
    }
  })
  return a
}

/**
 * Toggle the `targetIdx`-th checkbox marker (`[ ]` <-> `[x]`) in raw cell text.
 */
export function toggleCheckboxInRawText(
  raw: string,
  targetIdx: number,
  checked: boolean
): string {
  let current = 0
  return raw.replace(/(^|(?<=\s))\[( |x|X)\](?=\s|$)/gm, (full) => {
    if (current++ === targetIdx) {
      return checked ? '[x]' : '[ ]'
    }
    return full
  })
}

/**
 * Render markdown cell text safely into DOM nodes (no unsanitized innerHTML).
 */
export function renderCellContent(
  doc: Document,
  raw: string,
  callbacks: InlineRenderCallbacks = {}
): DocumentFragment {
  const frag = doc.createDocumentFragment()
  const lines = (raw ?? '').split('\n')
  const counters = { checkboxes: 0, images: 0 }

  lines.forEach((line, idx) => {
    if (idx > 0) {
      frag.appendChild(doc.createElement('br'))
    }
    if (line.length > 0) {
      appendTextOrFormatted(doc, frag, line, callbacks, counters)
    }
  })

  return frag
}
