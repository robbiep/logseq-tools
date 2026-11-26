import { describe, expect, it } from 'vitest'
import {
  createEmptyTable,
  isDelimiterRow,
  looksLikeMarkdownTable,
  parseAlignments,
  parseBlockSegments,
  serializeBlockSegments,
  serializeTable,
  splitRowCells,
} from '../markdown/tableParser'

describe('tableParser', () => {
  it('splits row cells while respecting escaped pipes and inline code', () => {
    expect(splitRowCells('| Name | Value | Code |')).toEqual(['Name', 'Value', 'Code'])
    expect(splitRowCells('| a \\| b | `c|d` | e |')).toEqual(['a | b', '`c|d`', 'e'])
    expect(splitRowCells('| line1<br>line2 | old[:br]break |')).toEqual([
      'line1\nline2',
      'old\nbreak',
    ])
  })

  it('validates delimiter rows and parses alignments', () => {
    expect(isDelimiterRow('---')).toBe(false)
    expect(isDelimiterRow('| --- | :--- | :---: | ---: |')).toBe(true)
    expect(parseAlignments('| --- | :--- | :---: | ---: |')).toEqual([
      null,
      'left',
      'center',
      'right',
    ])
  })

  it('ignores tables inside fenced code blocks', () => {
    const md = [
      'Here is an example:',
      '```markdown',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '```',
    ].join('\n')

    expect(looksLikeMarkdownTable(md)).toBe(false)
    const segments = parseBlockSegments(md)
    expect(segments).toHaveLength(1)
    expect(segments[0].type).toBe('text')
  })

  it('parses and round-trips multi-table blocks with properties and text intact', () => {
    const md = [
      'tags:: project',
      '',
      '| Task | Status |',
      '| :--- | ---: |',
      '| Design | Done |',
      '',
      'Middle note',
      '',
      '| Item | Notes |',
      '| --- | --- |',
      '| Alpha | line1<br>line2 |',
    ].join('\n')

    expect(looksLikeMarkdownTable(md)).toBe(true)
    const segments = parseBlockSegments(md)
    expect(segments.map((s) => s.type)).toEqual(['text', 'table', 'text', 'table'])

    const serialized = serializeBlockSegments(segments)
    expect(serialized).toContain('tags:: project')
    expect(serialized).toContain('Middle note')
    expect(serialized).toContain('line1<br>line2')
    expect(serialized).toContain(':---')
    expect(serialized).toContain('---:')
  })

  it('normalizes ragged body rows and preserves escaped pipes on serialize', () => {
    const md = ['| Col 1 | Col 2 | Col 3 |', '| --- | --- | --- |', '| only one |'].join('\n')
    const segments = parseBlockSegments(md)
    expect(segments).toHaveLength(1)
    if (segments[0].type !== 'table') throw new Error('Expected table segment')
    expect(segments[0].table.rows[0]).toEqual(['only one', '', ''])

    const out = serializeTable({
      headers: ['A|B', 'Code'],
      alignments: ['left', 'center'],
      rows: [['x\ny', '`a|b`']],
    })
    expect(out).toContain('A\\|B')
    expect(out).toContain('`a|b`')
    expect(out).toContain('x<br>y')
  })

  it('creates empty tables with default header + body rows', () => {
    const t = createEmptyTable(3, 3)
    expect(t.headers).toEqual(['Column 1', 'Column 2', 'Column 3'])
    expect(t.rows).toEqual([
      ['', '', ''],
      ['', '', ''],
    ])
  })
})
