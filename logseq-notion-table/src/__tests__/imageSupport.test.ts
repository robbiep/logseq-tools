import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DomObserver } from '../host/domObserver'
import {
  computeSmartImageSize,
  extractDroppedImageUrl,
  formatImageMarkdown,
  isImageFile,
  parseImageMeta,
  removeImageInRawText,
  sanitizeImageFilename,
  updateImageDimensionsInRawText,
} from '../markdown/imageUtils'
import { renderCellContent } from '../markdown/inlineRenderer'

function createBlockDom(uuid: string): HTMLElement {
  const blockContent = document.createElement('div')
  blockContent.className = 'block-content inline'
  blockContent.setAttribute('blockid', uuid)

  const body = document.createElement('div')
  body.className = 'block-body'

  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  wrapper.innerHTML =
    '<table class="table-auto"><thead><tr><th>Item</th><th>Preview</th></tr></thead><tbody><tr><td>Logo</td><td></td></tr></tbody></table>'

  body.appendChild(wrapper)
  blockContent.appendChild(body)
  return blockContent
}

describe('imageUtils', () => {
  it('intelligently downscales large landscape and portrait images without upscaling small icons', () => {
    // Large 1600x900 screenshot inside a ~240px cell
    expect(
      computeSmartImageSize({
        naturalWidth: 1600,
        naturalHeight: 900,
        maxWidth: 220,
        maxHeight: 160,
        cellWidth: 240,
      })
    ).toEqual({ width: 220, height: 124 })

    // Tall portrait image constrained by maxHeight
    expect(
      computeSmartImageSize({
        naturalWidth: 600,
        naturalHeight: 1200,
        maxWidth: 220,
        maxHeight: 160,
      })
    ).toEqual({ width: 80, height: 160 })

    // Small 48x48 icon is never upscaled
    expect(
      computeSmartImageSize({
        naturalWidth: 48,
        naturalHeight: 48,
        maxWidth: 220,
        maxHeight: 160,
      })
    ).toEqual({ width: 48, height: 48 })

    // Fallback when natural dimensions are unknown
    expect(
      computeSmartImageSize({
        naturalWidth: 0,
        naturalHeight: 0,
        maxWidth: 220,
        maxHeight: 160,
        cellWidth: 180,
      })
    ).toEqual({ width: 160, height: 106 })
  })

  it('formats, parses, updates, and removes Logseq image metadata cleanly', () => {
    const md = formatImageMarkdown('mock]shot', '../assets/storages/logseq-notion-table/a.png', {
      width: 200,
      height: 120,
    })
    expect(md).toBe('![mock\\]shot](../assets/storages/logseq-notion-table/a.png){:width 200, :height 120}')

    expect(parseImageMeta('{:height 140, :width 210}')).toEqual({ width: 210, height: 140 })

    const raw = `Note\n${md}\nFooter`
    const resized = updateImageDimensionsInRawText(raw, 0, { width: 320, height: 192 })
    expect(resized).toContain('{:width 320, :height 192}')

    const reset = updateImageDimensionsInRawText(resized, 0, {})
    expect(reset).toBe('Note\n![mock\\]shot](../assets/storages/logseq-notion-table/a.png)\nFooter')

    const removed = removeImageInRawText(resized, 0)
    expect(removed).toBe('Note\nFooter')
  })

  it('validates image files, sanitizes filenames, and extracts dropped image URLs', () => {
    expect(isImageFile({ name: 'photo.png', type: 'image/png' })).toBe(true)
    expect(isImageFile({ name: 'diagram.WEBP', type: '' })).toBe(true)
    expect(isImageFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)

    const cleaned = sanitizeImageFilename('My Screen Shot (1).PNG', 'image/png')
    expect(cleaned).toMatch(/^My_Screen_Shot_1_\d+_[a-z0-9]+\.png$/)

    const mockDt = {
      getData: (type: string) =>
        type === 'text/html' ? '<img src="https://example.com/pic.png" />' : '',
    } as unknown as DataTransfer
    expect(extractDroppedImageUrl(mockDt)).toBe('https://example.com/pic.png')
  })
})

describe('inlineRenderer image support', () => {
  it('renders Logseq image tokens, resolves asset URLs, rejects unsafe schemes, and exposes controls', async () => {
    const resolveAssetUrl = vi.fn(async (src: string) => `assets://graph/${src.replace('../', '')}`)
    const onImageResize = vi.fn()
    const onImageRemove = vi.fn()

    const div = document.createElement('div')
    div.appendChild(
      renderCellContent(
        document,
        '![pic](../assets/storages/logseq-notion-table/pic.png){:width 180, :height 100} ![bad](javascript:alert(1))',
        { resolveAssetUrl, onImageResize, onImageRemove }
      )
    )

    await new Promise((r) => setTimeout(r, 10))

    const imgs = div.querySelectorAll('img.nt-cell-img')
    expect(imgs).toHaveLength(1)
    const img = imgs[0] as HTMLImageElement
    expect(img.src).toBe('assets://graph/assets/storages/logseq-notion-table/pic.png')
    expect(img.style.width).toBe('180px')
    expect(img.style.height).toBe('100px')

    const removeBtn = div.querySelector('.nt-img-act-danger') as HTMLButtonElement
    removeBtn.click()
    expect(onImageRemove).toHaveBeenCalledWith(0)
  })
})

describe('TableView drag-and-drop image & dimension customization', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('accepts dropped image files, auto-sizes them, customizes dimensions via popover, and supports drag resize', async () => {
    const blocks: Record<string, string> = {
      'uuid-img': '| Item | Preview |\n| --- | --- |\n| Logo |  |',
    }
    const saveImageAsset = vi.fn(async () => ({
      markdownPath: '../assets/storages/logseq-notion-table/logo_1.png',
    }))
    const resolveAssetUrl = vi.fn(async () => 'assets://graph/assets/storages/logseq-notion-table/logo_1.png')

    document.body.appendChild(createBlockDom('uuid-img'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: async (uuid, content) => {
          blocks[uuid] = content
        },
        editBlock: vi.fn(),
        openPage: vi.fn(),
        saveImageAsset,
        resolveAssetUrl,
      },
      () => ({
        autoSaveDelayMs: 0,
        fullWidthByDefault: false,
        monospaceRawSource: true,
        defaultImageMaxWidth: 220,
        defaultImageMaxHeight: 160,
      })
    )

    await observer.scan()

    const host = document.querySelector('.nt-host') as HTMLElement
    const targetCell = host.querySelector('tbody tr td[data-col="1"]') as HTMLElement

    const file = new File(['png-bytes'], 'company-logo.png', { type: 'image/png' })
    const dt = {
      types: ['Files'],
      files: [file],
      dropEffect: 'none',
    } as unknown as DataTransfer

    const dragOverEv = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(dragOverEv, 'dataTransfer', { value: dt })
    targetCell.dispatchEvent(dragOverEv)
    expect(dragOverEv.defaultPrevented).toBe(true)
    expect(targetCell.classList.contains('nt-cell-drop-target')).toBe(true)

    const dropEv = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEv, 'dataTransfer', { value: dt })
    targetCell.dispatchEvent(dropEv)
    expect(dropEv.defaultPrevented).toBe(true)
    expect(targetCell.classList.contains('nt-cell-drop-target')).toBe(false)

    await new Promise((r) => setTimeout(r, 30))

    expect(saveImageAsset).toHaveBeenCalledTimes(1)
    expect(blocks['uuid-img']).toContain(
      '![company-logo](../assets/storages/logseq-notion-table/logo_1.png){:width 220, :height 145}'
    )

    const img = targetCell.querySelector('img.nt-cell-img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toBe('assets://graph/assets/storages/logseq-notion-table/logo_1.png')

    // Customize dimensions via the hover dimension popover
    const slidersBtn = targetCell.querySelector('button[aria-label="Customize image dimensions"]') as HTMLButtonElement
    slidersBtn.click()

    const popover = document.querySelector('.nt-img-popover') as HTMLElement
    expect(popover).not.toBeNull()
    const inputs = popover.querySelectorAll('input.nt-img-pop-input')
    const wInput = inputs[0] as HTMLInputElement
    const hInput = inputs[1] as HTMLInputElement

    wInput.value = '110'
    wInput.dispatchEvent(new Event('input', { bubbles: true }))
    // Aspect ratio locked (220 / 145 -> ~73)
    expect(Number(hInput.value)).toBeGreaterThan(70)
    expect(Number(hInput.value)).toBeLessThan(76)

    const applyBtn = popover.querySelector('.nt-img-apply-btn') as HTMLButtonElement
    applyBtn.click()

    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-img']).toContain('{:width 110, :height 73}')

    // Drag corner resizer updates dimensions and persists
    const resizer = targetCell.querySelector('.nt-img-resizer') as HTMLElement
    resizer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 110, clientY: 73, button: 0 }))
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 160, clientY: 100 }))
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))

    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-img']).toContain('{:width 160, :height 106}')

    // Remove image button deletes markdown image
    const removeBtn = targetCell.querySelector('button[aria-label="Remove image"]') as HTMLButtonElement
    removeBtn.click()
    await new Promise((r) => setTimeout(r, 20))
    expect(blocks['uuid-img']).not.toContain('logo_1.png')

    observer.destroy()
  })

  it('allows image drops only on Text body cells and ignores Date/Select/Multi-select/Checkbox/URL cells', async () => {
    const blocks: Record<string, string> = {
      'uuid-img-types': [
        '| Notes | Due | Status | Tags | Done | Link |',
        '| --- | --- | --- | --- | --- | --- |',
        '|  |  |  |  |  |  |',
        '<!-- nt-schema: {"v":1,"columns":[{"type":"text"},{"type":"date"},{"type":"select"},{"type":"multi-select"},{"type":"checkbox"},{"type":"url"}]} -->',
      ].join('\n'),
    }
    const saveImageAsset = vi.fn(async () => ({
      markdownPath: '../assets/storages/logseq-notion-table/only_text.png',
    }))

    document.body.appendChild(createBlockDom('uuid-img-types'))

    const observer = new DomObserver(
      document,
      {
        getBlock: async (uuid) => ({ uuid, content: blocks[uuid], format: 'markdown' }),
        updateBlock: async (uuid, content) => {
          blocks[uuid] = content
        },
        editBlock: vi.fn(),
        openPage: vi.fn(),
        saveImageAsset,
      },
      () => ({
        autoSaveDelayMs: 0,
        fullWidthByDefault: false,
        monospaceRawSource: true,
      })
    )

    await observer.scan()
    const host = document.querySelector('.nt-host') as HTMLElement
    const file = new File(['png-bytes'], 'snap.png', { type: 'image/png' })

    // Try dropping onto Date, Select, Multi-select, Checkbox, URL, and Header cell
    const nonTextCells = [
      host.querySelector('thead th[data-col="0"]') as HTMLElement,
      ...([1, 2, 3, 4, 5].map(
        (c) => host.querySelector(`tbody tr td[data-col="${c}"]`) as HTMLElement
      )),
    ]

    for (const cell of nonTextCells) {
      const dt = { types: ['Files'], files: [file], dropEffect: 'copy' } as unknown as DataTransfer
      const overEv = new Event('dragover', { bubbles: true, cancelable: true })
      Object.defineProperty(overEv, 'dataTransfer', { value: dt })
      cell.dispatchEvent(overEv)
      expect(cell.classList.contains('nt-cell-drop-target')).toBe(false)
      expect(dt.dropEffect).toBe('none')

      const dropEv = new Event('drop', { bubbles: true, cancelable: true })
      Object.defineProperty(dropEv, 'dataTransfer', { value: dt })
      cell.dispatchEvent(dropEv)
    }

    await new Promise((r) => setTimeout(r, 20))
    expect(saveImageAsset).not.toHaveBeenCalled()

    // Dropping onto the Text body cell works
    const textCell = host.querySelector('tbody tr td[data-col="0"]') as HTMLElement
    const dtText = { types: ['Files'], files: [file], dropEffect: 'none' } as unknown as DataTransfer
    const overText = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(overText, 'dataTransfer', { value: dtText })
    textCell.dispatchEvent(overText)
    expect(textCell.classList.contains('nt-cell-drop-target')).toBe(true)

    const dropText = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropText, 'dataTransfer', { value: dtText })
    textCell.dispatchEvent(dropText)

    await new Promise((r) => setTimeout(r, 20))
    expect(saveImageAsset).toHaveBeenCalledTimes(1)
    expect(blocks['uuid-img-types']).toContain('only_text.png')

    observer.destroy()
  })
})
