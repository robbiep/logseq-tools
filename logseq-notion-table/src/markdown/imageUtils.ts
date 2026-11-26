export interface ImageDimensions {
  width?: number
  height?: number
}

export interface SmartSizeOptions {
  naturalWidth: number
  naturalHeight: number
  maxWidth: number
  maxHeight: number
  cellWidth?: number
}

export const IMAGE_TOKEN_RE = /!\[((?:\\.|[^\]])*)\]\(([^)\s]+)\)(\{[^}]*\})?/

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.avif',
])

const VIDEO_EXTS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.ogv',
  '.ogg',
])

const MEDIA_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS])

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-m4v': '.m4v',
  'video/ogg': '.ogv',
}

/**
 * Compute intelligent display dimensions for an image inside a table cell,
 * preserving aspect ratio, respecting cell width & configured ceilings,
 * and never upscaling small images.
 */
export function computeSmartImageSize(opts: SmartSizeOptions): {
  width: number
  height: number
} {
  const { naturalWidth, naturalHeight, maxWidth, maxHeight, cellWidth } = opts
  const safeMaxW = Math.max(48, Math.round(maxWidth))
  const safeMaxH = Math.max(48, Math.round(maxHeight))

  const effectiveMaxW =
    cellWidth && cellWidth > 0
      ? Math.min(safeMaxW, Math.max(120, Math.floor(cellWidth - 20)))
      : safeMaxW

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return {
      width: effectiveMaxW,
      height: Math.round(effectiveMaxW * 0.66),
    }
  }

  const scale = Math.min(1, effectiveMaxW / naturalWidth, safeMaxH / naturalHeight)
  return {
    width: Math.max(24, Math.round(naturalWidth * scale)),
    height: Math.max(24, Math.round(naturalHeight * scale)),
  }
}

/**
 * Parse Logseq EDN-style image metadata like `{:height 120, :width 200}`.
 */
export function parseImageMeta(metaStr?: string): ImageDimensions {
  if (!metaStr) return {}
  const widthMatch = metaStr.match(/:width\s+(\d+(?:\.\d+)?)/)
  const heightMatch = metaStr.match(/:height\s+(\d+(?:\.\d+)?)/)
  const dims: ImageDimensions = {}
  if (widthMatch) {
    const w = Math.round(Number(widthMatch[1]))
    if (Number.isFinite(w) && w > 0) dims.width = w
  }
  if (heightMatch) {
    const h = Math.round(Number(heightMatch[1]))
    if (Number.isFinite(h) && h > 0) dims.height = h
  }
  return dims
}

/**
 * Format an image reference into Logseq-native Markdown syntax.
 */
export function formatImageMarkdown(
  alt: string,
  src: string,
  dims?: ImageDimensions
): string {
  const cleanAlt = (alt || 'image').replace(/\\\]/g, ']').replace(/\]/g, '\\]')
  const parts: string[] = []
  if (dims?.width && dims.width > 0) {
    parts.push(`:width ${Math.round(dims.width)}`)
  }
  if (dims?.height && dims.height > 0) {
    parts.push(`:height ${Math.round(dims.height)}`)
  }
  const meta = parts.length > 0 ? `{${parts.join(', ')}}` : ''
  return `![${cleanAlt}](${src})${meta}`
}

/**
 * Update the dimensions metadata of the `imageIndex`-th image token inside raw cell text.
 */
export function updateImageDimensionsInRawText(
  raw: string,
  imageIndex: number,
  dims: ImageDimensions
): string {
  const globalRe = new RegExp(IMAGE_TOKEN_RE.source, 'g')
  let idx = 0
  return raw.replace(globalRe, (full, alt: string, src: string) => {
    if (idx++ !== imageIndex) return full
    return formatImageMarkdown(alt, src, dims)
  })
}

/**
 * Remove the `imageIndex`-th image token from raw cell text and clean redundant whitespace.
 */
export function removeImageInRawText(raw: string, imageIndex: number): string {
  const globalRe = new RegExp(IMAGE_TOKEN_RE.source, 'g')
  let idx = 0
  const keptLines: string[] = []

  for (const line of raw.split('\n')) {
    let removedHere = false
    const updated = line.replace(globalRe, (full) => {
      if (idx++ === imageIndex) {
        removedHere = true
        return ''
      }
      return full
    })
    const cleaned = updated.replace(/[ \t]{2,}/g, ' ').trim()
    if (removedHere && !cleaned) {
      continue
    }
    keptLines.push(cleaned)
  }

  return keptLines.join('\n').trim()
}

/**
 * Check whether a File is a supported image by MIME type or filename extension.
 */
export function isImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type && file.type.toLowerCase().startsWith('image/')) {
    return true
  }
  const name = (file.name || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot !== -1) {
    return IMAGE_EXTS.has(name.slice(dot))
  }
  return false
}

/**
 * Check whether a File is a supported video by MIME type or filename extension.
 */
export function isVideoFile(file: Pick<File, 'name' | 'type'>): boolean {
  if (file.type && file.type.toLowerCase().startsWith('video/')) {
    return true
  }
  const name = (file.name || '').toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot !== -1) {
    return VIDEO_EXTS.has(name.slice(dot))
  }
  return false
}

/**
 * Check whether a File is a supported image or video.
 */
export function isMediaFile(file: Pick<File, 'name' | 'type'>): boolean {
  return isImageFile(file) || isVideoFile(file)
}

/**
 * Check whether a media src points to a video file or video data URL.
 */
export function isVideoSrc(src: string): boolean {
  const trimmed = (src || '').trim().toLowerCase()
  if (!trimmed) return false
  if (trimmed.startsWith('data:video/')) return true
  const pathOnly = trimmed.split(/[?#]/)[0]
  const dot = pathOnly.lastIndexOf('.')
  return dot !== -1 && VIDEO_EXTS.has(pathOnly.slice(dot))
}

/**
 * Generate a safe, collision-resistant filename for storing an image or video asset.
 */
export function sanitizeImageFilename(originalName: string, mimeType?: string): string {
  const rawName = (originalName || 'image').split(/[\\/]/).pop() || 'image'
  const dot = rawName.lastIndexOf('.')
  let stem = dot > 0 ? rawName.slice(0, dot) : rawName
  let ext = dot > 0 ? rawName.slice(dot).toLowerCase() : ''

  if (!ext || !MEDIA_EXTS.has(ext)) {
    ext = (mimeType && MIME_TO_EXT[mimeType.toLowerCase()]) || '.png'
  }

  stem = stem
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!stem) stem = 'image'

  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 7)
  return `${stem}_${stamp}_${rand}${ext}`
}

/**
 * Read natural pixel dimensions of an image File using an ObjectURL and HTMLImageElement.
 * Returns null if measurement fails or is unsupported in the current environment.
 */
export function measureImageFile(
  file: File
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof Image === 'undefined') {
      resolve(null)
      return
    }
    let url = ''
    try {
      url = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }

    const img = new Image()
    const done = (res: { width: number; height: number } | null) => {
      try {
        URL.revokeObjectURL(url)
      } catch {
        // Ignore cleanup errors
      }
      resolve(res)
    }

    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        done({ width: img.naturalWidth, height: img.naturalHeight })
      } else {
        done(null)
      }
    }
    img.onerror = () => done(null)
    img.src = url
  })
}

/**
 * Extract a safe http/https image URL from a DataTransfer payload (e.g. browser image drag).
 */
export function extractDroppedImageUrl(dt: DataTransfer | null | undefined): string | null {
  if (!dt) return null

  const html = dt.getData?.('text/html') || ''
  if (html) {
    const mediaSrcMatch = html.match(/<(?:img|video)[^>]+src=["']([^"']+)["']/i)
    if (mediaSrcMatch && isSafeHttpUrl(mediaSrcMatch[1])) {
      return mediaSrcMatch[1]
    }
  }

  const uriList = dt.getData?.('text/uri-list') || ''
  for (const line of uriList.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (isSafeHttpUrl(trimmed)) return trimmed
  }

  const plain = (dt.getData?.('text/plain') || '').trim()
  if (
    plain &&
    isSafeHttpUrl(plain) &&
    /\.(png|jpe?g|gif|webp|svg|bmp|avif|mp4|webm|mov|m4v|ogv|ogg)(?:\?.*)?$/i.test(plain)
  ) {
    return plain
  }

  return null
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isDirectAssetUrl(src: string): boolean {
  return (
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('file://') ||
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('assets://')
  )
}

/**
 * Rewrite Logseq's `assets://` URLs to `file://` for HTML5 `<video>` playback.
 * Electron registers `assets://` via a non-streaming file protocol that fails
 * Chromium range/media requests, whereas Logseq's own media players use `file://`.
 */
export function normalizeVideoPlaybackUrl(src: string): string {
  return src.startsWith('assets://') ? `file://${src.slice('assets://'.length)}` : src
}

/**
 * Check whether a media src is safe to render inside a cell.
 * Allows http:, https:, assets:, blob:, data:image/*, data:video/*, and relative graph paths.
 */
export function isSafeImageSrc(src: string): boolean {
  const trimmed = (src || '').trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('data:video/')) return true
  if (trimmed.startsWith('assets://') || trimmed.startsWith('blob:')) return true
  if (trimmed.startsWith('../') || trimmed.startsWith('./') || trimmed.startsWith('assets/')) {
    return !trimmed.includes('..//')
  }
  return isSafeHttpUrl(trimmed)
}
