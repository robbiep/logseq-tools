export type IconName =
  | 'grip'
  | 'plus'
  | 'trash'
  | 'copy'
  | 'sortAsc'
  | 'sortDesc'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'duplicate'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowLeft'
  | 'arrowRight'
  | 'eraser'
  | 'maximize'
  | 'minimize'
  | 'code'
  | 'check'
  | 'sliders'
  | 'lock'
  | 'unlock'
  | 'eye'
  | 'x'
  | 'typeText'
  | 'calendar'
  | 'select'
  | 'multiSelect'
  | 'checkbox'
  | 'link'
  | 'chevronLeft'
  | 'chevronRight'
  | 'edit'
  | 'file'
  | 'undo'
  | 'redo'
  | 'filter'
  | 'hash'
  | 'clock'
  | 'clockEdit'
  | 'search'
  | 'image'

interface PathSpec {
  tag: 'path' | 'circle' | 'rect' | 'line'
  attrs: Record<string, string>
}

const ICON_SPECS: Record<IconName, PathSpec[]> = {
  grip: [
    { tag: 'circle', attrs: { cx: '5.5', cy: '4', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: '10.5', cy: '4', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: '5.5', cy: '8', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: '10.5', cy: '8', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: '5.5', cy: '12', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'circle', attrs: { cx: '10.5', cy: '12', r: '1.1', fill: 'currentColor', stroke: 'none' } },
  ],
  plus: [
    { tag: 'path', attrs: { d: 'M8 3v10M3 8h10' } },
  ],
  trash: [
    { tag: 'path', attrs: { d: 'M2.5 4.5h11M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5' } },
  ],
  copy: [
    { tag: 'rect', attrs: { x: '5.5', y: '5.5', width: '8', height: '8', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M3.5 10.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5' } },
  ],
  sortAsc: [
    { tag: 'path', attrs: { d: 'M4.5 3v10M4.5 3L2.5 5M4.5 3l2 2M9 5h4.5M9 8h3M9 11h1.5' } },
  ],
  sortDesc: [
    { tag: 'path', attrs: { d: 'M4.5 13V3M4.5 13l-2-2M4.5 13l2-2M9 5h4.5M9 8h3M9 11h1.5' } },
  ],
  alignLeft: [
    { tag: 'path', attrs: { d: 'M2.5 4h11M2.5 7h7.5M2.5 10h11M2.5 13h6' } },
  ],
  alignCenter: [
    { tag: 'path', attrs: { d: 'M2.5 4h11M4.5 7h7M2.5 10h11M5 13h6' } },
  ],
  alignRight: [
    { tag: 'path', attrs: { d: 'M2.5 4h11M6 7h7.5M2.5 10h11M7.5 13h6' } },
  ],
  duplicate: [
    { tag: 'rect', attrs: { x: '5.5', y: '5.5', width: '8', height: '8', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M3.5 10.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.5M9.5 8v3M8 9.5h3' } },
  ],
  arrowUp: [
    { tag: 'path', attrs: { d: 'M8 13V3M8 3L4 7M8 3l4 4' } },
  ],
  arrowDown: [
    { tag: 'path', attrs: { d: 'M8 3v10M8 13l-4-4M8 13l4-4' } },
  ],
  arrowLeft: [
    { tag: 'path', attrs: { d: 'M13 8H3M3 8l4-4M3 8l4 4' } },
  ],
  arrowRight: [
    { tag: 'path', attrs: { d: 'M3 8h10M13 8l-4-4M13 8l-4 4' } },
  ],
  eraser: [
    { tag: 'path', attrs: { d: 'M7 13h6.5M3 9.5l5.5-5.5a1.5 1.5 0 0 1 2.1 0l2.4 2.4a1.5 1.5 0 0 1 0 2.1L8.5 13H5.2L3 10.8a1 1 0 0 1 0-1.3z' } },
  ],
  maximize: [
    { tag: 'path', attrs: { d: 'M10 2.5h3.5V6M6 13.5H2.5V10M13.5 2.5L9.5 6.5M2.5 13.5l4-4' } },
  ],
  minimize: [
    { tag: 'path', attrs: { d: 'M13.5 6H10V2.5M2.5 10H6v3.5M10 6l3.5-3.5M6 10l-3.5 3.5' } },
  ],
  code: [
    { tag: 'path', attrs: { d: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9 3.5l-2 9' } },
  ],
  check: [
    { tag: 'path', attrs: { d: 'M3.5 8.5l3 3 6-7' } },
  ],
  sliders: [
    { tag: 'path', attrs: { d: 'M2.5 5h11M2.5 11h11' } },
    { tag: 'circle', attrs: { cx: '6', cy: '5', r: '1.5', fill: 'currentColor' } },
    { tag: 'circle', attrs: { cx: '10', cy: '11', r: '1.5', fill: 'currentColor' } },
  ],
  lock: [
    { tag: 'rect', attrs: { x: '3.5', y: '7.5', width: '9', height: '6', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2' } },
  ],
  unlock: [
    { tag: 'rect', attrs: { x: '3.5', y: '7.5', width: '9', height: '6', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M5.5 7.5V5.5a2.5 2.5 0 0 1 4.8-1' } },
  ],
  eye: [
    { tag: 'path', attrs: { d: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z' } },
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '1.8' } },
  ],
  x: [
    { tag: 'path', attrs: { d: 'M4 4l8 8M12 4l-8 8' } },
  ],
  typeText: [
    { tag: 'path', attrs: { d: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h6.5' } },
  ],
  calendar: [
    { tag: 'rect', attrs: { x: '2.5', y: '3.5', width: '11', height: '10', rx: '1.5' } },
    { tag: 'path', attrs: { d: 'M5.5 2v2.5M10.5 2v2.5M2.5 7h11' } },
  ],
  select: [
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '5.5' } },
    { tag: 'path', attrs: { d: 'M5.8 7.2L8 9.6l2.2-2.4' } },
  ],
  multiSelect: [
    { tag: 'circle', attrs: { cx: '3.5', cy: '4.2', r: '1.05', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M6.5 4.2h7' } },
    { tag: 'circle', attrs: { cx: '3.5', cy: '8', r: '1.05', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M6.5 8h7' } },
    { tag: 'circle', attrs: { cx: '3.5', cy: '11.8', r: '1.05', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M6.5 11.8h7' } },
  ],
  checkbox: [
    { tag: 'rect', attrs: { x: '2.5', y: '2.5', width: '11', height: '11', rx: '2' } },
    { tag: 'path', attrs: { d: 'M5.2 8.2l2 2 3.8-4.2' } },
  ],
  link: [
    { tag: 'path', attrs: { d: 'M6.8 9.2l2.4-2.4M9.5 10.5l1.5-1.5a2.5 2.5 0 0 0-3.5-3.5L6 7M6.5 5.5L5 7a2.5 2.5 0 0 0 3.5 3.5L10 9' } },
  ],
  chevronLeft: [
    { tag: 'path', attrs: { d: 'M10 3.5L5.5 8 10 12.5' } },
  ],
  chevronRight: [
    { tag: 'path', attrs: { d: 'M6 3.5L10.5 8 6 12.5' } },
  ],
  edit: [
    { tag: 'path', attrs: { d: 'M11 2.5l2.5 2.5L5.5 13H3v-2.5l8-8z' } },
  ],
  file: [
    { tag: 'path', attrs: { d: 'M4 2.5h5.5L12.5 5.5v8h-8.5z' } },
    { tag: 'path', attrs: { d: 'M9.5 2.5v3h3' } },
  ],
  undo: [
    { tag: 'path', attrs: { d: 'M4.5 6.5H10a3.5 3.5 0 1 1 0 7H7.5' } },
    { tag: 'path', attrs: { d: 'M6.5 4L4 6.5 6.5 9' } },
  ],
  redo: [
    { tag: 'path', attrs: { d: 'M11.5 6.5H6a3.5 3.5 0 1 0 0 7h2.5' } },
    { tag: 'path', attrs: { d: 'M9.5 4L12 6.5 9.5 9' } },
  ],
  filter: [
    { tag: 'path', attrs: { d: 'M2.5 3.5h11l-4.2 5v4l-2.6 1.3V8.5l-4.2-5z' } },
  ],
  hash: [
    { tag: 'path', attrs: { d: 'M3.5 6h9M3.5 10h9M6.5 2.5l-1.5 11M11 2.5l-1.5 11' } },
  ],
  clock: [
    { tag: 'circle', attrs: { cx: '8', cy: '8', r: '5.5' } },
    { tag: 'path', attrs: { d: 'M8 4.8V8l2.2 1.5' } },
  ],
  clockEdit: [
    { tag: 'path', attrs: { d: 'M13.5 8A5.5 5.5 0 1 1 8 2.5a5.5 5.5 0 0 1 3.8 1.5' } },
    { tag: 'path', attrs: { d: 'M12 2.2v2.3H9.7' } },
    { tag: 'path', attrs: { d: 'M8 5.2V8l2 1.3' } },
  ],
  search: [
    { tag: 'circle', attrs: { cx: '7.2', cy: '7.2', r: '4.7' } },
    { tag: 'path', attrs: { d: 'M10.7 10.7L14 14' } },
  ],
  image: [
    { tag: 'rect', attrs: { x: '2.5', y: '3', width: '11', height: '10', rx: '1.5' } },
    { tag: 'circle', attrs: { cx: '6', cy: '6.5', r: '1.1', fill: 'currentColor', stroke: 'none' } },
    { tag: 'path', attrs: { d: 'M3 11.5l3-3 2.2 2.2 1.8-1.8 3 2.6' } },
  ],
}

export function createIcon(doc: Document, name: IconName, size = 14): SVGSVGElement {
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  const specs = ICON_SPECS[name] || []
  for (const spec of specs) {
    const node = doc.createElementNS(svgNS, spec.tag)
    for (const [k, v] of Object.entries(spec.attrs)) {
      node.setAttribute(k, v)
    }
    svg.appendChild(node)
  }
  return svg
}
