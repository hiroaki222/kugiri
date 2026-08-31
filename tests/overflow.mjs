import { chromium } from 'playwright'

const PAPER = `既存の IAA モデルのほとんどは，大規模な事前学習済モデル [1, 2, 3] に基づいて構築されている．これらは，高い予測性能を有する一方で，推論プロセスはブラックボックスである．線形プローブや勾配・注意などに基づく事後説明は可能であるが，これらの説明は，介入可能な IAA モデルに求められる説明と乖離している．視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。実際にはサッケードと呼ばれる跳躍運動を繰り返している。

We present a lightweight phrase segmentation model that runs entirely in the browser. It completes in under twenty milliseconds. See https://example.com/very/long/path/that/goes/on for details.`

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 1024, height: 700 },
  { name: 'phone-land', width: 740, height: 400 },
]
const SETTINGS = [
  { name: '既定', sizePx: 30, ls: 0.02, span: 7 },
  { name: '最大サイズ', sizePx: 64, ls: 0.02, span: 7 },
  { name: '最大字間', sizePx: 30, ls: 0.3, span: 7 },
  { name: '広スパン', sizePx: 30, ls: 0.02, span: 14 },
  { name: '狭スパン', sizePx: 18, ls: 0, span: 4 },
]

const browser = await chromium.launch()
let failures = 0
let checked = 0

for (const vp of VIEWPORTS) {
  for (const st of SETTINGS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } })
    await page.addInitScript((s) => {
      localStorage.setItem('kugiri.settings', JSON.stringify({
        v: 1, sizePx: s.sizePx, letterSpacing: s.ls, spanChars: s.span,
        bg: 'hakuji', cpm: 1200, summaryOn: true, summaryRatio: 0.4,
        dimSurround: false,
      }))
    }, st)
    await page.goto('http://localhost:3000/')
    await page.fill('textarea', PAPER)
    await page.getByRole('button', { name: '読む' }).click()
    await page.waitForSelector('.kg-card', { timeout: 15000 })
    await page.waitForTimeout(300)

    // 全カードを順に送って、そのたびに矩形の包含を検査する。
    // scrollWidth <= clientWidth は inline-block では常に真なので使えない。
    const result = await page.evaluate(async () => {
      const bad = []
      let n = 0
      let summaries = 0
      let scrolls = 0
      let lastPct = -1
      let stuck = 0
      for (let i = 0; i < 600; i++) {
        const card = document.querySelector('.kg-card')
        if (card) {
          // 全文カードのときは .kg-card が無い。break せず送り続ける。
          const stage = card.closest('.kg-type')
          const scroller = card.parentElement?.matches('[data-hotkeys-off]')
            ? card.parentElement
            : null
          if (stage) {
            n++
            if (scroller) {
              // 収まらないカードは横スクロール領域に隔離されていること (仕様どおりの例外)
              scrolls++
              const sb = scroller.getBoundingClientRect()
              const b = stage.getBoundingClientRect()
              if (sb.left < b.left - 1 || sb.right > b.right + 1) {
                bad.push({ i, text: card.textContent?.slice(0, 24), over: Math.round(sb.right - b.right) })
              }
            } else {
              const b = stage.getBoundingClientRect()
              const t = card.getBoundingClientRect()
              if (t.left < b.left - 1 || t.right > b.right + 1) {
                bad.push({ i, text: card.textContent?.slice(0, 24), over: Math.round(t.right - b.right) })
              }
            }
          }
        } else summaries++
        // 末尾に着いたら止める
        const slider = document.querySelector('[role="slider"]')
        const pct = Number(slider?.getAttribute('aria-valuenow') ?? -1)
        stuck = pct === lastPct ? stuck + 1 : 0
        lastPct = pct
        if (pct >= 100 && stuck > 2) break
        if (stuck > 8) break
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }))
        await new Promise((r) => setTimeout(r, 6))
      }
      return { bad, n, summaries, scrolls }
    })
    checked += result.n
    const tag = `${vp.name.padEnd(11)} ${st.name.padEnd(10)}`
    if (result.bad.length) {
      failures += result.bad.length
      console.log(`❌ ${tag} ${result.n}枚中 ${result.bad.length}枚が溢れた`)
      for (const b of result.bad.slice(0, 3)) console.log(`     "${b.text}" が ${b.over}px はみ出し`)
    } else {
      console.log(
        `✅ ${tag} 通常 ${String(result.n - result.scrolls).padStart(3)}枚 + 全文 ${String(result.summaries).padStart(2)}枚` +
          (result.scrolls ? ` + 横スクロール ${result.scrolls}枚` : '') + ' すべて収まった',
      )
    }
    await page.close()
  }
}
await browser.close()
console.log(`\n${checked} 枚を検査 / 溢れ ${failures} 件`)
process.exit(failures ? 1 : 0)
