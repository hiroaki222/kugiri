/** All user-facing copy. Nothing else in the app should hold a display string. */
export const ja = {
  app: {
    name: 'Kugiri',
    reading: 'くぎり',
    settings: '詳細設定',
    help: 'キー操作',
    close: '閉じる',
    backToInput: '入力に戻る',
  },

  compose: {
    headlineBefore: '読みたい文章を貼ると、',
    headlineAccent: '目を一箇所に置いたまま',
    headlineAfter: '読めます',
    lede: '一目で読める大きさに区切って、1枚ずつ表示します。日本語と英語に対応。本文はこの端末の中だけで処理され、どこへも送信されません。',
    tooLongTitle: '長すぎます',
    tooLong: (limit: number) =>
      `${limit.toLocaleString()} 字までにしてください。分けて読むと快適です。`,
    bodyLabel: '本文',
    placeholder: 'ここに貼り付け',
    charCount: (n: number) => `${n.toLocaleString()} 字`,
    unwrap: 'テキストの改行を取り除く',
    unwrapHelp:
      'PDF などからコピーすると文の途中に残る改行をつなぎ、一文に戻します。改行そのものに意味がある詩や箇条書きでは、オフのままにしてください。',
    sample: 'サンプルを入れる',
    read: '読む',
  },

  reading: {
    building: '区切っています…',
    errorTitle: '読み込めませんでした',
    startHintBefore: '右下の再生ボタンか ',
    startHintKey: 'Space',
    startHintAfter: ' で始まります',
    startHintSub: '自分のペースで送るなら ← → 、止めると前後の文が出ます',
    context: '文脈',
    summaryOne: 'この文の全体',
    summaryMany: (n: number) => `直前の ${n} 文`,
    overflowCard:
      '内容が横幅に収まっていません。Shift キーと左右の矢印キーで横にスクロールできます',
    overflowNotice: '横に収まりません ・ スペースキーで次へ',
    progress: '読書の進み具合',
    progressValue: (pct: number) => `本文の${pct}%`,
    prev: '前へ',
    next: '次へ',
    play: '再生',
    stop: '停止',
    speed: '読み上げ速度',
    speedDown: '速度を下げる',
    speedUp: '速度を上げる',
    cpm: (v: number) => `${v} cpm`,
  },

  settings: {
    title: '詳細設定',
    readability: {
      title: 'カードの読みやすさ',
      note: '文字サイズ・文字間隔・知覚スパンを変えると、カードを組み直します。読んでいた位置はそのままです。',
      size: '文字サイズ',
      sizeValue: (px: number) => `${px} px`,
      spacing: '文字間隔',
      spacingValue: (em: number) => `${em.toFixed(2)} em`,
      spacingNote: '広げると、隣り合う文字を見分けやすくなります。',
      span: '知覚スパン',
      spanValue: (chars: number) => `全角 ${chars} 字`,
      spanNote:
        '1枚に表示する文字数の目安です。初期値の7字は、一度に読み取りやすい範囲を基準にしています。',
      background: '背景色',
      swatch: {
        light: '明るい灰',
        cream: '明るいクリーム',
        navy: '濃い紺',
        black: '黒',
      } as Record<string, string>,
    },
    pace: {
      title: '読む速さ',
      speed: '読み上げ速度',
      speedField: '読み上げ速度（1分あたりの文字量）',
      speedNote: '1分あたりに送る文字量です。全角1字を2、半角1字を1として数えます。',
      review: '戻ったときの間',
      reviewOff: 'なし',
      reviewValue: (times: number) => `${times.toFixed(1)} 倍`,
      reviewNote:
        '前のカードへ戻ったとき、そのカードを長めに表示します。自動再生は止まりません。',
    },
    review: {
      title: '読み返しと集中',
      summary: '文を読み終えたら文全体を表示する',
      summaryRatio: '文全体の表示時間',
      summaryRatioValue: (pct: number) => `${pct} %`,
      summaryRatioNote:
        'その文を読む時間に対する割合です。長い文ほど表示時間も長くなります。',
      context: '文脈に出す前後の文',
      contextValue: (n: number) => `前後 ${n} 文`,
      contextNote: '停止したときに出る文脈で、前後それぞれ何文まで並べるかです。',
      dim: '周辺を暗くする',
    },
    reset: 'すべて初期値に戻す',
    resetConfirm: '文字サイズから速度まで、この画面のすべての設定が初期値に戻ります。',
    resetCancel: 'やめる',
    resetOk: '初期値に戻す',
  },

  help: {
    title: 'キー操作',
    cardStep: '前／次のカードへ。h は長押しすると、だんだん速く巻き戻ります',
    sentenceStep: '前／次の文の先頭へ',
    paragraphStep: '前／次の段落へ',
    edges: '文書の先頭／末尾へ',
    play: '再生／停止。停止すると、今の文の全体を表示します',
    speed: '速度を下げる／上げる（Shift キーを押しながら）',
    context: '押している間だけ、今の文の全体を表示（Shift + k）',
    scroll: '長い URL などで横に収まらないカードをスクロール',
    panels: 'この画面／詳細設定',
    escape: '再生を止めて、開いている表示を閉じる',
    footnote:
      '自動再生中に前のカードへ戻っても、再生は止まりません。戻ったカードを通常より長く表示したあと、そのまま自動再生を続けます。',
  },

  sample: `視覚的な情報処理において、人間の眼球は連続的に文字列を追っているわけではない。実際にはサッケードと呼ばれる跳躍運動と、停留と呼ばれる短い静止を繰り返している。この停留のあいだにだけ、我々は文字を読み取っている。したがって一度の停留で捉えられる範囲を超えた長さの行を追わせることは、それ自体が余分な運動負荷になる。

読む速さを決めているのは眼の動きの速さではない。一度の停留でどれだけの範囲を語として同定できるか、その幅のほうが効いている。漢字かな交じりの日本語では、その幅はおよそ五文字から八文字とされる。これは短い。かなり短い。行の長さとは無関係である。`,
}
