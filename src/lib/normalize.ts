export type NormalizeOptions = {
  /** 論文・PDF からのコピー向けの補正。既定オフ。不可逆なので自動では効かせない。 */
  fixPdfWrap?: boolean
}

/** コードポイントごとの扱いを1箇所に集める。散らすと必ず矛盾する。 */
const STRIP = /[​﻿­‎‏⁦-⁩]/g
const FOLD_SPACE = /[   - 　]/g
const H_SPACE = /[ \t]+/g

const SENT_END = /[。．！？!?…][」』）)】〕》〉"'’”]*$/
const LIST = /^(?:[-*+・●○■]|\d+[.)]\s|#{1,6}\s|>|\|)/
const HAS_SCHEME = /https?:\/\//

const CJK_EDGE = /[぀-ヿ㐀-䶿一-鿿。、，．！？」』）]/

/** 行末がハイフンなら改行だけ除去し、ハイフンは残す。
 *  消すと `well-` + `known` が `wellknown` に壊れる。辞書が無い以上、
 *  組版由来の分綴と元からの複合語ハイフンは区別できない。 */
function joinLines(a: string, b: string): string {
  if (a.endsWith('-')) return a + b
  const needSpace = !CJK_EDGE.test(a.slice(-1)) && !CJK_EDGE.test(b.slice(0, 1))
  return needSpace ? `${a} ${b}` : a + b
}

/** 前処理を終えた「読書用テキスト」を返す。全 offset はこの文字列を指す。 */
export function normalize(raw: string, opts: NormalizeOptions = {}): string {
  let t = raw.normalize('NFC').replace(/\r\n?/g, '\n')
  t = t.replace(STRIP, '').replace(FOLD_SPACE, ' ')

  // この段階では改行を潰さない。潰すと段落判定ができなくなる。
  const lines = t.split('\n').map((l) => l.replace(H_SPACE, ' ').trim())

  if (!opts.fixPdfWrap) {
    // 既定: 単一改行は空白1個、段落は空行だけで切る。何も推測しない。
    return lines
      .join('\n')
      .split(/\n{2,}/)
      .map((p) => p.split('\n').filter(Boolean).reduce((a, b) => (a ? joinLines(a, b) : b), ''))
      .filter(Boolean)
      .join('\n\n')
  }

  // PDF 補正は二相に分ける。行を結合してから段落を判定しようとすると、
  // 判定に必要な元の行境界と行長が既に失われている。
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
    // 段落末とみなすのは「文末で終わり、かつその行が明らかに短い」ときだけ。
    // 論文では行末がたまたま句点になることが頻繁にあり、それを段落境界に
    // すると偽の段落が量産される。hard wrap は最終行だけが短くなる。
    const looksLastLine = !wrapped || lastLen < median * 0.8
    if ((SENT_END.test(cur) && looksLastLine) || LIST.test(ln)) {
      flush()
      cur = ln
      lastLen = ln.length
      continue
    }
    // URL を含む行はハイフン結合の対象にしない (joinLines が既に安全側)
    cur = HAS_SCHEME.test(cur) && cur.endsWith('-') ? cur + ln : joinLines(cur, ln)
    lastLen = ln.length
  }
  flush()
  return paras.join('\n\n')
}

/** 段落の span。source 上の half-open [start, end)。 */
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
