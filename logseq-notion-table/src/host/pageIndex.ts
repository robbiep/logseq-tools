export interface RawPageEntity {
  originalName?: string
  name?: string
  'journal?'?: boolean
  properties?: Record<string, unknown>
  updatedAt?: number
}

export interface PageCandidate {
  name: string
  lowerName: string
  aliases: string[]
  isJournal: boolean
  updatedAt: number
}

export interface PageSearchResult {
  name: string
  matchedAlias?: string
  isJournal?: boolean
  isNew?: boolean
}

export interface AutocompleteTrigger {
  mode: 'page' | 'tag'
  start: number
  end: number
  query: string
}

/**
 * Detect whether the caret at `cursorPos` inside `value` is inside an unclosed
 * `[[...` page link or `#tag` / `#[[...` tag reference on the current line.
 */
export function detectPageTrigger(
  value: string,
  cursorPos: number
): AutocompleteTrigger | null {
  if (cursorPos < 0 || cursorPos > value.length) return null

  const lineStart = value.lastIndexOf('\n', Math.max(0, cursorPos - 1)) + 1
  const beforeCursor = value.slice(lineStart, cursorPos)

  // Check unclosed [[... (or #[[...)
  const openRel = beforeCursor.lastIndexOf('[[')
  if (openRel !== -1) {
    const afterOpen = beforeCursor.slice(openRel + 2)
    if (!afterOpen.includes(']]') && !afterOpen.includes('[[')) {
      const isHashBracket = openRel > 0 && beforeCursor[openRel - 1] === '#'
      const start = lineStart + (isHashBracket ? openRel - 1 : openRel)
      const end = value.slice(cursorPos, cursorPos + 2) === ']]' ? cursorPos + 2 : cursorPos
      return {
        mode: isHashBracket ? 'tag' : 'page',
        start,
        end,
        query: afterOpen,
      }
    }
  }

  // Check #tag at start of line or after whitespace
  const tagMatch = beforeCursor.match(/(?:^|\s)#([^\s[\]#]*)$/)
  if (tagMatch) {
    const query = tagMatch[1]
    const hashRel = beforeCursor.length - query.length - 1
    return {
      mode: 'tag',
      start: lineStart + hashRel,
      end: cursorPos,
      query,
    }
  }

  return null
}

/**
 * Format a selected page name for insertion back into markdown cell text.
 */
export function formatCompletionInsertion(
  mode: 'page' | 'tag',
  pageName: string
): string {
  const clean = pageName.trim()
  if (mode === 'tag') {
    return /\s/.test(clean) ? `#[[${clean}]]` : `#${clean}`
  }
  return `[[${clean}]]`
}

function extractAliases(properties?: Record<string, unknown>): string[] {
  if (!properties) return []
  const raw = properties.alias
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

/**
 * Normalize Logseq PageEntity objects into deduplicated searchable candidates.
 */
export function normalizePageEntities(
  pages: RawPageEntity[] | null | undefined
): PageCandidate[] {
  if (!Array.isArray(pages)) return []
  const seen = new Set<string>()
  const out: PageCandidate[] = []

  for (const page of pages) {
    if (!page) continue
    const name = String(page.originalName || page.name || '').trim()
    if (!name) continue
    const lowerName = name.toLowerCase()
    if (seen.has(lowerName)) continue
    seen.add(lowerName)

    out.push({
      name,
      lowerName,
      aliases: extractAliases(page.properties),
      isJournal: Boolean(page['journal?']),
      updatedAt: typeof page.updatedAt === 'number' ? page.updatedAt : 0,
    })
  }

  return out
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true
  let ni = 0
  for (let hi = 0; hi < haystack.length && ni < needle.length; hi++) {
    if (haystack[hi] === needle[ni]) ni++
  }
  return ni === needle.length
}

function scoreCandidate(
  candidate: PageCandidate,
  lowerQuery: string
): { score: number; matchedAlias?: string } | null {
  const { lowerName, aliases } = candidate

  if (lowerName === lowerQuery) {
    return { score: 1000 }
  }
  if (lowerName.startsWith(lowerQuery)) {
    return { score: 850 - Math.min(100, lowerName.length - lowerQuery.length) }
  }
  // Word / hierarchy segment prefix match (e.g. "foo/bar" or "Foo Bar" matching "bar")
  const segmentIdx = Math.max(
    lowerName.indexOf(`/${lowerQuery}`),
    lowerName.indexOf(` ${lowerQuery}`),
    lowerName.indexOf(`-${lowerQuery}`),
    lowerName.indexOf(`_${lowerQuery}`)
  )
  if (segmentIdx !== -1) {
    return { score: 700 - Math.min(80, segmentIdx) }
  }

  const subIdx = lowerName.indexOf(lowerQuery)
  if (subIdx !== -1) {
    return { score: 550 - Math.min(100, subIdx) }
  }

  for (const alias of aliases) {
    const lowerAlias = alias.toLowerCase()
    if (lowerAlias === lowerQuery) return { score: 650, matchedAlias: alias }
    if (lowerAlias.startsWith(lowerQuery)) return { score: 500, matchedAlias: alias }
    if (lowerAlias.includes(lowerQuery)) return { score: 400, matchedAlias: alias }
  }

  if (lowerQuery.length >= 2 && isSubsequence(lowerQuery, lowerName)) {
    return { score: 200 - Math.min(100, lowerName.length) }
  }

  return null
}

/**
 * Rank page candidates against a query string and optionally include a
 * "New page" entry when no exact match exists.
 */
export function rankPageMatches(
  candidates: PageCandidate[],
  query: string,
  limit = 12
): PageSearchResult[] {
  const trimmed = query.trim()
  const lowerQuery = trimmed.toLowerCase()

  if (!lowerQuery) {
    const sorted = [...candidates].sort((a, b) => {
      if (a.isJournal !== b.isJournal) return a.isJournal ? 1 : -1
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
      return a.name.localeCompare(b.name)
    })
    return sorted.slice(0, limit).map((c) => ({
      name: c.name,
      isJournal: c.isJournal,
    }))
  }

  interface ScoredEntry {
    candidate: PageCandidate
    score: number
    matchedAlias?: string
  }

  const scored: ScoredEntry[] = []
  let hasExact = false

  for (const candidate of candidates) {
    if (candidate.lowerName === lowerQuery) hasExact = true
    const match = scoreCandidate(candidate, lowerQuery)
    if (match) {
      scored.push({
        candidate,
        score: match.score,
        matchedAlias: match.matchedAlias,
      })
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.candidate.isJournal !== b.candidate.isJournal) {
      return a.candidate.isJournal ? 1 : -1
    }
    if (b.candidate.updatedAt !== a.candidate.updatedAt) {
      return b.candidate.updatedAt - a.candidate.updatedAt
    }
    return a.candidate.name.localeCompare(b.candidate.name)
  })

  const results: PageSearchResult[] = scored.slice(0, limit).map((entry) => ({
    name: entry.candidate.name,
    matchedAlias: entry.matchedAlias,
    isJournal: entry.candidate.isJournal,
  }))

  if (trimmed && !hasExact) {
    results.push({
      name: trimmed,
      isNew: true,
    })
  }

  return results
}

export class PageIndex {
  private fetchAllPages: () => Promise<RawPageEntity[] | null>
  private cached: PageCandidate[] | null = null
  private inflight: Promise<PageCandidate[]> | null = null

  constructor(fetchAllPages: () => Promise<RawPageEntity[] | null>) {
    this.fetchAllPages = fetchAllPages
  }

  public invalidate(): void {
    this.cached = null
  }

  public async getCandidates(): Promise<PageCandidate[]> {
    if (this.cached) return this.cached
    if (this.inflight) return this.inflight

    this.inflight = this.fetchAllPages()
      .then((pages) => {
        const normalized = normalizePageEntities(pages)
        this.cached = normalized
        return normalized
      })
      .catch((err) => {
        console.error('[logseq-notion-table] Failed to fetch graph pages:', err)
        return this.cached || []
      })
      .finally(() => {
        this.inflight = null
      })

    return this.inflight
  }

  public async search(query: string, limit = 12): Promise<PageSearchResult[]> {
    const candidates = await this.getCandidates()
    return rankPageMatches(candidates, query, limit)
  }
}
