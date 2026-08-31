export type NormalizeOptions = {
  /** Repairs text copied out of a paper or PDF. Off by default and never
   *  applied automatically, because it rewrites the text irreversibly. */
  unwrap?: boolean
}

/** How each code point is treated, kept in one place. Spread around, these
 *  rules drift out of agreement with each other. */
const STRIP = /[​﻿­‎‏⁦-⁩]/g
const FOLD_SPACE = /[   - 　]/g
const H_SPACE = /[ \t]+/g

const SENT_END = /[。．！？!?…][」』）)】〕》〉"'’”]*$/
const LIST = /^(?:[-*+・●○■]|\d+[.)]\s|#{1,6}\s|>|\|)/
const HAS_SCHEME = /https?:\/\//

const CJK_EDGE = /[぀-ヿ㐀-䶿一-鿿。、，．！？」』）]/

/** A line ending in a hyphen loses the break but keeps the hyphen. Dropping it
 *  turns `well-` + `known` into `wellknown`, and without a dictionary there is
 *  no way to tell a typesetter's hyphenation from a real compound. */
function joinLines(a: string, b: string): string {
  if (a.endsWith('-')) return a + b
  const needSpace = !CJK_EDGE.test(a.slice(-1)) && !CJK_EDGE.test(b.slice(0, 1))
  return needSpace ? `${a} ${b}` : a + b
}

/** Returns the reading text, fully pre-processed. Every offset in the app
 *  refers to this string. */
export function normalize(raw: string, opts: NormalizeOptions = {}): string {
  let t = raw.normalize('NFC').replace(/\r\n?/g, '\n')
  t = t.replace(STRIP, '').replace(FOLD_SPACE, ' ')

  // Line breaks survive this stage; collapsing them here would take away what
  // paragraph detection needs.
  const lines = t.split('\n').map((l) => l.replace(H_SPACE, ' ').trim())

  if (!opts.unwrap) {
    // Default: a single break becomes a space, paragraphs come from blank
    // lines, and nothing is inferred.
    return lines
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.split('\n').filter(Boolean).reduce((a, b) => (a ? joinLines(a, b) : b), ''))
      .filter(Boolean)
      .join('\n\n')
  }

  // The repair runs in two phases. Joining lines first and then looking for
  // paragraphs cannot work: the line boundaries and line lengths the decision
  // needs are exactly what joining destroys.
  const lens = lines.filter(Boolean).map((l) => l.length).toSorted((a, b) => a - b)
  const median = lens.length ? lens[lens.length >> 1] : 0
  const wrapped = median >= 20

  const paras: string[] = []
  let cur = ''
  let lastLen = 0
  const flush = () => {
    if (cur.trim()) paras.push(cur.trim())
    cur = ''
  }
  for (const ln of lines) {
    if (!ln) {
      flush()
      continue
    }
    if (!cur) {
      cur = ln
      lastLen = ln.length
      continue
    }
    // A paragraph ends only where a sentence ends AND the line is clearly
    // short. In a paper a line often happens to end on a full stop, and
    // treating that as a boundary invents paragraphs; under a hard wrap only
    // the last line of a paragraph comes up short.
    const looksLastLine = !wrapped || lastLen < median * 0.8
    if ((SENT_END.test(cur) && looksLastLine) || LIST.test(ln)) {
      flush()
      cur = ln
      lastLen = ln.length
      continue
    }
    // A line carrying a URL joins on the hyphen directly; joinLines is already
    // conservative, this just keeps the intent explicit.
    cur = HAS_SCHEME.test(cur) && cur.endsWith('-') ? cur + ln : joinLines(cur, ln)
    lastLen = ln.length
  }
  flush()
  return paras.join('\n\n')
}

/** Paragraph spans as half-open [start, end) ranges over the source. */
export function paragraphSpans(source: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  const re = /\n{2,}/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m.index > last) out.push({ start: last, end: m.index })
    last = m.index + m[0].length
  }
  if (last < source.length) out.push({ start: last, end: source.length })
  return out
}
