# Neuma v0.4.3 — 左メニュー編集用

操作案内を上部に常設し、基本操作を3群に整理。

```text
NEUMA v0.4.3

▶   ⏸   ■
0:00 / 1:00               0.0%
──────────────────────────────  再生位置
Ready

VIEW                  Fit model
Drag: Scan        Right: Orbit
Middle: Pan       Wheel: Zoom

MODEL
[ Sample ]       [ Upload ]
Model: Unité rooftop
GLB / 3DM

SCALE / SOUND
1 beat    =       [数値] units
BPM                       [60]
Half tone =       [数値] units

[ Pluck ]        [ Pad ]
Sine · quick decay
Volume        ─────│──────────

▸ Details
```

## 基本操作

- ▶：現在位置から自動再生。⏸：位置を保持して消音。■：消音して先頭へ。
- 再生欄は縦スクロール時も上端に固定。
- 上部のビュー操作案内は常設。右ドラッグは回転、中ドラッグはパン。
- Sample：形状プレビュー付きポップアップから5モデルを選択。Upload：GLB / 3DMファイルを選択。
- 1 beat：1拍に相当するモデル上の距離を手入力。3DMではmm等のネイティブ単位を表示。
- BPM：初期値60。拍の寸法を固定してテンポを変更。
- Half tone：半音に相当する距離を手入力。中央値を保ちながら最低・最高音が連動。
- Pluck / Pad：Sample / Uploadと同じ一重枠。選択中は緑の枠・文字・薄い背景。二重の外枠は出さない。
- 初期状態：全長を60拍、BPM60で走査＝全体1分。
- 時間・寸法の設定変更時は、再生を停止して先頭へ戻る。

## Details

```text
MODEL INFO   読み込み元、単位、寸法、線分数・省略の内訳
LAYERS       3DMレイヤー選択
AXES         Time / Pitchの軸割り当て
TIME         Durationを直接入力、総拍数を表示
PITCH        Range、Minimum、Maximum、中央値、Reset
EDGE RANGE   Min / Max、初期値5–95%
AUDIO        声部数・交差線数・出力レベルなどの診断
```

Durationを直接変更すると、現在のBPMを保って1拍の寸法が再計算される。
明示的に1拍の寸法を入力した後は、軸を変えてもその寸法を保つ。
新しいモデルを読み込むと、現在のBPMと全体時間を保って、そのモデルの単位に合わせて拍の寸法を再計算。

## 維持するデザイン

- IBM Plex Mono、本文12px、入力・ラベル11px、見出し・補足10px。
- 背景#111111、灰色の文字・線、アクセント#00ff00。
- 左28px / 上26px、幅220px、右余白16px。縦スクロールのみ。
- 3DMはZ-up、GLBはY-up。表示だけを対応させ、座標・音高の軸は変換しない。

## 変更希望

- 順序：
- 文言：
- 省略したい情報：
- 余白・サイズ：
- 操作：
