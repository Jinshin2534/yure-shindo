# SPEC — yure-shindo

## 2. ゆれ震度計 (`yure-shindo`) — センサー×公式アルゴリズム
- **一行**: スマホを机に置くと、ドアを閉めた・足踏みした・トラックが通った揺れを**気象庁の計測震度アルゴリズムそのまま**で数値化する。
- **核**: 「いまの足踏みは震度0.8」— 日常の揺れに公式の物差しを当てる面白さ。3成分加速度→周波数フィルタ(周期効果/ハイカット/ローカット)→0.3秒ルール→計測震度、の計算過程を図で開示。
- **正直さ**: 「スマホは地震計ではない」(サンプリング・固定の甘さ・ノイズ床)を数値で示し、ノイズ床以下は「測れない」と表示。
- **技術**: Vite+素のJS / DeviceMotionEvent(iOSは許可ボタン) / FFTフィルタは自前 / Canvas2D波形。計測震度計算は純粋関数で、**気象庁公開の観測波形で既知の震度が出ることをテスト固定**。
- **公開**: Vercel(スマホで開く前提、PCは記録波形デモ再生)
- **難所**: DeviceMotion のサンプリング周期が端末依存で不安定 → 時刻刻みで再サンプリング。公式波形データの取得と形式変換。

---

# 共通ルール(アプリ20本量産フェーズ)

- **規模**: 1〜2日で「公開まで」行ける範囲に絞る。上の仕様で一点突破し、機能を足さない。
- **作風**: 一点突破のコンセプト / ブラウザ内で完結(サーバ不要) / カメラ・センサー・数理を使った遊び心 / 「正直さ」を設計で守る(測れないときは測れないと言う、根拠と誤差を見せる) / 純粋ロジック+テスト。
- **構成(Webアプリ)**: Vite + 素のJS + pnpm。中核ロジックは `src/lib/` の純粋関数にして Vitest で固くテストし、配線・描画と分ける。`window.__app` を公開して、ヘッドレスでも検証できるようにする。
- **カメラ/マイク/センサー**: 実機がなくても検証できるよう、合成データやデモ入力で動くモードを用意する。
- **ポート**: 下に指定した番号を `strictPort` で固定する(既存アプリとの衝突回避)。
- **参考になる既存作**: `~/ranzo_project/` 配下(例: takibiban, otomon, uchikeshi, sokomi, shikisougi)。品質の基準はこれらに合わせる。
- **公開**: GitHub(public) `Jinshin2534/<slug>` を gh で作成して push。Webアプリは Vercel に GitHub 連携でデプロイする(push で自動デプロイ)。Vercel 向きでないもの(CLI等)は簡素なLPを GitHub Pages で公開する。
- **完了時**: 公開URLを確かめたうえで、メモリ `/Users/nokokoro/.claude/projects/-Users-nokokoro-ranzo-project/memory/` に `<slug>.md` を追加し、`MEMORY.md` に既存の行と同じ形式で1行追記する(公開URL・port・テスト数・ハマりどころ)。
- **コミット**: 末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` をつける。
- **仕様は確定済み**。細部は自分で判断して進め、ユーザーに聞くのは本当に決められないときだけにする。
- **このアプリのポート**: 5840
- **slug**: `yure-shindo`

# リポジトリ構成と公開手順

- このワークツリーは `app-ideas` リポジトリのブランチ `yure-shindo`。アプリはこのワークツリー直下に作る。
- main から引き継いだ `README.md` はこのアプリ用に書き換え、`IDEAS.md` は削除してよい(main 側には影響しない)。
- 公開用の GitHub リポジトリはアプリごとに別に作る:
  1. `gh repo create Jinshin2534/yure-shindo --public`
  2. `git remote add yure-shindo https://github.com/Jinshin2534/yure-shindo.git`
  3. `git push yure-shindo HEAD:main`(以後の更新も `git push yure-shindo HEAD:main`)
- `app-ideas` 自体には push しない。リモート名はアプリの slug にして、ほかのアプリのリモートと混ぜない。
- Vercel は GitHub の `Jinshin2534/yure-shindo` を連携し、main への push で自動デプロイされるようにする。
