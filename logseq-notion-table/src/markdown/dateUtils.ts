const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

const WEEKDAY_ALIASES: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
}

const MONTH_ALIASES: Record<string, number> = {}
MONTHS_SHORT.forEach((m, i) => {
  MONTH_ALIASES[m.toLowerCase()] = i
})
MONTHS_FULL.forEach((m, i) => {
  MONTH_ALIASES[m.toLowerCase()] = i
})
MONTH_ALIASES.sept = 8

function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function makeValidDate(year: number, monthIdx: number, day: number): Date | null {
  if (year < 1 || year > 9999 || monthIdx < 0 || monthIdx > 11 || day < 1 || day > 31) {
    return null
  }
  const d = new Date(year, monthIdx, day)
  if (d.getFullYear() !== year || d.getMonth() !== monthIdx || d.getDate() !== day) {
    return null
  }
  return d
}

/**
 * Format a Date using Logseq's `preferredDateFormat` (date-fns token set).
 */
export function formatLogseqDate(date: Date, pattern = 'MMM do, yyyy'): string {
  const pat = pattern || 'MMM do, yyyy'
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  const dow = date.getDay()

  const tokenRe = /'([^']*)'|yyyy|yy|MMMM|MMM|MM|M|do|dd|d|EEEE|EEE|E/g
  return pat.replace(tokenRe, (tok, quoted: string | undefined) => {
    if (quoted !== undefined) return quoted
    switch (tok) {
      case 'yyyy':
        return String(y).padStart(4, '0')
      case 'yy':
        return String(y % 100).padStart(2, '0')
      case 'MMMM':
        return MONTHS_FULL[m]
      case 'MMM':
        return MONTHS_SHORT[m]
      case 'MM':
        return pad2(m + 1)
      case 'M':
        return String(m + 1)
      case 'do':
        return ordinal(d)
      case 'dd':
        return pad2(d)
      case 'd':
        return String(d)
      case 'EEEE':
        return WEEKDAYS_FULL[dow]
      case 'EEE':
      case 'E':
        return WEEKDAYS_SHORT[dow]
      default:
        return tok
    }
  })
}

export function formatJournalDateLink(date: Date, pattern = 'MMM do, yyyy'): string {
  return `[[${formatLogseqDate(date, pattern)}]]`
}

/**
 * Format a Date as a plaintext date + time string without [[page]] brackets,
 * using Logseq's `preferredDateFormat` for the date portion and 24-hour HH:mm for time.
 */
export function formatTimestamp(date: Date, pattern = 'MMM do, yyyy'): string {
  const datePart = formatLogseqDate(date, pattern)
  const timePart = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  return `${datePart} ${timePart}`
}

/**
 * Parse a plaintext date+time timestamp (or date-only expression) into a local Date.
 * Supports 24h (`16:24`, `16:24:19`), 12h (`4:24 PM`), and ISO (`2026-11-25T16:24:19`) formats.
 */
export function parseTimestamp(
  input: string,
  referenceDate: Date = new Date()
): Date | null {
  let clean = (input || '').trim()
  if (!clean) return null

  const bracketMatch = clean.match(/^\[\[(.+)\]\]$/)
  if (bracketMatch) {
    clean = bracketMatch[1].trim()
  }
  if (!clean) return null

  // ISO-like datetime with optional seconds / timezone
  const isoDateTimeMatch = clean.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i
  )
  if (isoDateTimeMatch) {
    if (isoDateTimeMatch[7]) {
      const parsed = new Date(clean)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    const base = makeValidDate(
      Number(isoDateTimeMatch[1]),
      Number(isoDateTimeMatch[2]) - 1,
      Number(isoDateTimeMatch[3])
    )
    if (!base) return null
    const h = Number(isoDateTimeMatch[4])
    const m = Number(isoDateTimeMatch[5])
    const s = Number(isoDateTimeMatch[6] || 0)
    if (h > 23 || m > 59 || s > 59) return null
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, s)
  }

  // Date expression followed by a time suffix (24h or AM/PM)
  const suffixMatch = clean.match(
    /^(.*?)(?:,\s*|\s+(?:at\s+|@\s*)?)(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i
  )
  if (suffixMatch && suffixMatch[1].trim()) {
    const datePart = suffixMatch[1].trim()
    let h = Number(suffixMatch[2])
    const m = Number(suffixMatch[3])
    const s = Number(suffixMatch[4] || 0)
    const ampm = suffixMatch[5]?.toLowerCase()

    if (ampm) {
      if (h < 1 || h > 12 || m > 59 || s > 59) return null
      if (ampm === 'am') {
        if (h === 12) h = 0
      } else if (h < 12) {
        h += 12
      }
    } else if (h > 23 || m > 59 || s > 59) {
      return null
    }

    const baseDate = parsePlaintextDate(datePart, referenceDate)
    if (baseDate) {
      return new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
        h,
        m,
        s
      )
    }
  }

  return parsePlaintextDate(clean, referenceDate)
}

/**
 * Parse plaintext or `[[Journal Link]]` date expressions into a local Date.
 */
export function parsePlaintextDate(
  input: string,
  referenceDate: Date = new Date()
): Date | null {
  let clean = (input || '').trim()
  if (!clean) return null

  const bracketMatch = clean.match(/^\[\[(.+)\]\]$/)
  if (bracketMatch) {
    clean = bracketMatch[1].trim()
  }
  if (!clean) return null

  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  )
  const lower = clean.toLowerCase().replace(/\s+/g, ' ')

  // Relative single words
  if (lower === 'today' || lower === 'tod' || lower === 'now') {
    return ref
  }
  if (lower === 'tomorrow' || lower === 'tom' || lower === 'tmr') {
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
  }
  if (lower === 'yesterday' || lower === 'yest') {
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 1)
  }

  // "in N days/weeks/months" or "+Nd"
  const inRelMatch = lower.match(/^(?:in\s+|\+)(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months)$/)
  if (inRelMatch) {
    const n = Number(inRelMatch[1])
    const unit = inRelMatch[2][0]
    if (unit === 'd') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n)
    if (unit === 'w') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + n * 7)
    if (unit === 'm') return new Date(ref.getFullYear(), ref.getMonth() + n, ref.getDate())
  }

  // "N days/weeks/months ago" or "-Nd"
  const agoRelMatch = lower.match(/^(?:-)?(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months)(?:\s+ago)?$/)
  if (agoRelMatch && (lower.startsWith('-') || lower.endsWith('ago'))) {
    const n = Number(agoRelMatch[1])
    const unit = agoRelMatch[2][0]
    if (unit === 'd') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - n)
    if (unit === 'w') return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - n * 7)
    if (unit === 'm') return new Date(ref.getFullYear(), ref.getMonth() - n, ref.getDate())
  }

  // "next friday", "last monday", "friday"
  const wdMatch = lower.match(/^(?:(next|last|this)\s+)?([a-z]+)$/)
  if (wdMatch && wdMatch[2] in WEEKDAY_ALIASES) {
    const targetDow = WEEKDAY_ALIASES[wdMatch[2]]
    const curDow = ref.getDay()
    let delta = targetDow - curDow
    if (wdMatch[1] === 'last') {
      if (delta >= 0) delta -= 7
    } else if (wdMatch[1] === 'next') {
      if (delta <= 0) delta += 7
    } else {
      if (delta < 0) delta += 7
    }
    return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + delta)
  }

  // Strip optional leading weekday prefix like "Wed, Nov 25, 2026"
  const withoutWeekday = clean.replace(
    /^(?:sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday),?\s+/i,
    ''
  )

  // YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  const isoMatch = withoutWeekday.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoMatch) {
    return makeValidDate(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]))
  }

  // M/D/YYYY or M/D/YY or M/D (or M-D-YYYY)
  const slashMatch = withoutWeekday.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
  if (slashMatch) {
    const a = Number(slashMatch[1])
    const b = Number(slashMatch[2])
    let year = ref.getFullYear()
    if (slashMatch[3]) {
      const yNum = Number(slashMatch[3])
      year = slashMatch[3].length === 2 ? 2000 + yNum : yNum
    }
    // If first number > 12, treat as DD/MM
    if (a > 12) {
      return makeValidDate(year, b - 1, a)
    }
    return makeValidDate(year, a - 1, b)
  }

  // Month name first: "Nov 25, 2026", "Nov 25th 2026", "November 25"
  const monthFirstMatch = withoutWeekday.match(
    /^([a-zA-Z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{2,4}))?$/
  )
  if (monthFirstMatch) {
    const mIdx = MONTH_ALIASES[monthFirstMatch[1].toLowerCase()]
    if (mIdx !== undefined) {
      const day = Number(monthFirstMatch[2])
      let year = ref.getFullYear()
      if (monthFirstMatch[3]) {
        const yNum = Number(monthFirstMatch[3])
        year = monthFirstMatch[3].length === 2 ? 2000 + yNum : yNum
      }
      return makeValidDate(year, mIdx, day)
    }
  }

  // Day first with month name: "25 Nov 2026", "25th November, 2026", "25 Nov"
  const dayFirstMatch = withoutWeekday.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-zA-Z]+)(?:,?\s+(\d{2,4}))?$/
  )
  if (dayFirstMatch) {
    const mIdx = MONTH_ALIASES[dayFirstMatch[2].toLowerCase()]
    if (mIdx !== undefined) {
      const day = Number(dayFirstMatch[1])
      let year = ref.getFullYear()
      if (dayFirstMatch[3]) {
        const yNum = Number(dayFirstMatch[3])
        year = dayFirstMatch[3].length === 2 ? 2000 + yNum : yNum
      }
      return makeValidDate(year, mIdx, day)
    }
  }

  return null
}

/**
 * Normalize a relative date expression (e.g., "today", "in 7 days", "-7d", "next friday")
 * into a canonical relative token for dynamic date filters, or return null for concrete/invalid dates.
 */
export function normalizeRelativeDateToken(input: string): string | null {
  const raw = (input || '').trim()
  if (!raw || /^\[\[.*\]\]$/.test(raw)) return null

  const lower = raw.toLowerCase().replace(/\s+/g, ' ')
  if (lower === 'today' || lower === 'tod' || lower === 'now') return 'today'
  if (lower === 'tomorrow' || lower === 'tom' || lower === 'tmr') return 'tomorrow'
  if (lower === 'yesterday' || lower === 'yest') return 'yesterday'

  const inRelMatch = lower.match(
    /^(?:in\s+|\+)(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months)$/
  )
  if (inRelMatch) {
    const n = Number(inRelMatch[1])
    const unit = inRelMatch[2][0]
    return `+${n}${unit}`
  }

  const agoRelMatch = lower.match(
    /^(?:-)?(\d+)\s*(d|day|days|w|wk|wks|week|weeks|m|mo|mos|month|months)(?:\s+ago)?$/
  )
  if (agoRelMatch && (lower.startsWith('-') || lower.endsWith('ago'))) {
    const n = Number(agoRelMatch[1])
    const unit = agoRelMatch[2][0]
    return `-${n}${unit}`
  }

  const wdMatch = lower.match(/^(?:(next|last|this)\s+)?([a-z]+)$/)
  if (wdMatch && wdMatch[2] in WEEKDAY_ALIASES) {
    return wdMatch[1] ? `${wdMatch[1]} ${wdMatch[2]}` : wdMatch[2]
  }

  return null
}

export function isRelativeDateExpression(input: string): boolean {
  return normalizeRelativeDateToken(input) !== null
}

export function formatRelativeDateLabel(token: string): string {
  const norm = normalizeRelativeDateToken(token) ?? token.trim().toLowerCase()
  if (norm === 'today') return 'Today'
  if (norm === 'tomorrow') return 'Tomorrow'
  if (norm === 'yesterday') return 'Yesterday'

  const offsetMatch = norm.match(/^([+-])(\d+)([dwm])$/)
  if (offsetMatch) {
    const sign = offsetMatch[1]
    const n = Number(offsetMatch[2])
    const unitCode = offsetMatch[3]
    const base = unitCode === 'd' ? 'day' : unitCode === 'w' ? 'week' : 'month'
    const unit = n === 1 ? base : `${base}s`
    return sign === '+' ? `In ${n} ${unit}` : `${n} ${unit} ago`
  }

  return norm
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Convert Logseq's preferredStartOfWeek (0 = Monday..6 = Sunday, or string)
 * into JS Date.getDay() index (0 = Sunday..6 = Saturday).
 */
export function normalizeLogseqStartOfWeek(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) {
    const n = Math.floor(val)
    if (n >= 0 && n <= 6) {
      return (n + 1) % 7
    }
  }
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase()
    if (lower in WEEKDAY_ALIASES) {
      return WEEKDAY_ALIASES[lower]
    }
    const asNum = Number(lower)
    if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 6) {
      return (Math.floor(asNum) + 1) % 7
    }
  }
  return 0 // Default Sunday
}

export function getWeekdayShortHeaders(startOfWeek = 0): string[] {
  const start = ((startOfWeek % 7) + 7) % 7
  return Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(start + i) % 7].slice(0, 2))
}

export function getMonthTitle(year: number, monthIdx: number): string {
  return `${MONTHS_FULL[monthIdx]} ${year}`
}

export function getMonthCalendarGrid(
  year: number,
  monthIdx: number,
  startOfWeek = 0
): Array<{ date: Date; inCurrentMonth: boolean }> {
  const start = ((startOfWeek % 7) + 7) % 7
  const firstDay = new Date(year, monthIdx, 1)
  const firstDow = firstDay.getDay()
  const leading = (firstDow - start + 7) % 7

  const grid: Array<{ date: Date; inCurrentMonth: boolean }> = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, monthIdx, 1 - leading + i)
    grid.push({
      date: d,
      inCurrentMonth: d.getMonth() === monthIdx && d.getFullYear() === year,
    })
  }
  return grid
}
