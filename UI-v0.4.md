# Neuma v0.4.1 — UI編集用

以前の `UI-feedback.md` にある追記は残しています。以下が今回の構成です。

## 基本画面

```text
NEUMA v0.4.1

▶   ⏸   ■
0:00 / 1:00               0.0%
──────────────────────────────  Position
Ready
──────────────────────────────

VIEW
Drag: Scan
Right drag: Orbit
Middle drag: Pan
Wheel: Zoom
Fit model

MODEL
[ Sample ]      [ Upload ]
Model: Sample_UniteRooftop_Xenakis.glb
GLB / 3DM

TIME / PITCH
Duration                [1:00]
Half tone =         [数値] units

SOUND
  Pluck           Pad          選択中は緑の文字のみ
Sine · quick decay
Volume       ─────│───────────

▸ Details
```

Sampleを押すとポップアップ。各モデルの形状プレビュー付きカードから選択。
屋上幼稚園 / Plastic number / Window study / Stepped study / Curve study。
Uploadを押すとファイル選択。`.glb` / `.3dm` に対応。

## Detailsを開いたとき

```text
MODEL INFO
単位 · X × Y × Z寸法
読み込みの種類・スキップしたオブジェクト数
発音可能な線分数 / 選択レイヤーの全線分数

LAYERS                    3DMのみ
[✓] NEUMA
[ ] Context
3DM: curves / mesh edges / saved surface meshes

AXES
Time                    [X ▼]
Pitch                   [Y ▼]  3DM初期値はZ

PITCH
Range                 [48] semitones
Minimum               [値] D2
Maximum               [値] D6
Note or Hz · e.g. D4 / 293.665
Midpoint: D4 / 293.665 Hz
Reset: midpoint D4

EDGE RANGE              5–95%
│────────────────────────────│
線長の範囲 · 再生面と平行な線の除外数

AUDIO
0 voices
0 intersecting edges
Output: silent
```

## 操作・音色

- 初期音色：Pluck。サイン波の素早い立ち上がりと指数減衰。減衰時定数0.28秒。
- Pad：サイン波の緩やかな立ち上がり、交差中の持続、短いリリース。
- 音色を切り替えても走査位置は変えない。
- ドラッグすると手動走査。離した位置でPadは持続、Pluckは減衰。
- ▶は現在位置から自動再生。⏸は消音、■は消音して先頭へ戻る。
- 同音高の重なりは一音にまとめる。斜線の音高変化ではPluckを再発音しない。
- 基本画面のHalf toneは、半音あたりの寸法を直接入力する。3DMではmm等の元単位を表示。
- DetailsのRangeは音高の中央値を保って音域幅を変更する。どちらも最低・最高音と連動。
- 3DMは線・ポリライン、メッシュ、保存済み表示用メッシュのある面・ポリサーフェス・押し出しとレイヤー選択に対応。ブロック・SubD・単独の曲がったNURBSカーブは今回対象外。
- Window / Stepped / Curveは抽象的な形状サンプル。特定の建築の再現モデルではない。

## デザイン

- Corda由来の色・フォント・文字サイズは維持（IBM Plex Mono、12 / 11 / 10px）。
- 黒背景 `#111111`、灰色の文字・線、緑の選択表示 `#00ff00`。
- 再生3アイコンはすべて16×16pxのSVG、同じ28×32pxの操作領域。
- 再生欄は上部固定。縦スクロールのみ、右余白16px、スクロールバー3px。
- Detailsは初期状態で閉じる。初見で必要な操作と専門的な設定を分ける。
- ビューナビゲーションは再生欄の直下。
- 音色の選択表示は緑色のみ。枠・選択背景なし。キーボードフォーカスは下線。
- Edge Rangeの初期値を5–95%に変更。

## 変更希望

- 項目順：
- 表示文言：
- 非表示にしたい情報：
- 色・サイズ・余白：
- 操作・音色：

## 0.4.1の読み込み処理

- 面の表示用メッシュから外周と15度以上の稜線を読み込み時に抽出。三角形分割の対角線は除外。
- 同じレイヤー内の重複線を除去し、分岐のない一直線の線分を結合。
- 表示用メッシュのない面は件数と対処方法を表示。RhinoでShaded表示してメッシュを含めて保存、またはMeshで変換。
- 詳細欄に読み込み元の種類、重複除去数、直線結合数、スキップ数を表示。
