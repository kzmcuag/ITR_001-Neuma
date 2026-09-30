# Neuma v0.1

ブラウザ上で3Dモデルのエッジを時間・音高・音色へ変換する実験的な楽器。

## 起動

Node.js 22以降。`npm ci` → `npm run build` → `npm run dev`。表示されたローカルURLをブラウザで開く。

## 操作

- Open .glb またはドロップでモデルを読み込む。読み込んだファイルはブラウザ内で処理し、サーバーへ送信しない。
- X/Y/ZにTIME/PITCH/TIMBREを割り当てる。割当の重複は自動交換で防ぐ。
- Duration: モデルのTime軸全長を走査する秒数、または `m:ss`。デフォルト `1:00`。
- Half tone: Pitch軸全長÷100を初期値とし、半音相当距離をunitsで入力。手入力後は軸変更でも値を保持。Resetで自動設定へ戻す。新しいモデルでは初期化。
- Pitch軸の最小座標をA4=440Hzとし、`440 * 2^((coordinate-min)/halfTone/12)`で連続音高へ変換。
- TIMBRE: 正規化座標によるsineとsawtoothの連続混合。
- Play/Pause、Stop、再生位置、Volume。走査平面と現在交差しているエッジを表示。
- ドラッグで回転、ホイールでズーム、2本指で拡大・移動。背景タブに移ると一時停止。

## 範囲と制約

Cordaの `collectPlayableEdges` を再利用（EdgesGeometryの角度閾値15°、ワールド座標）。モデルの表示だけを中心に移動し、音への変換は元の座標と単位を使用。静止メッシュを対象とし、アニメーションやスキニングの再生は未対応。GLBの線プリミティブは未対応。Draco/Meshopt等の圧縮モデル、外部参照テクスチャは対象外。埋込データの非圧縮GLBを使用。

時間幅0のエッジは約45msの短いイベント。音高のデフォルトは100半音の幅となり、A4を起点に高域まで広がるため、AudioContextのNyquist上限に達する線は省略または上限で制限。Half toneを大きくすると音域が狭くなる。音声負荷を抑えるため同時64音まで、最大100 MB / 100,000 edges。省略数はステータスに表示。

## 構成

`src/app.js`: Three.js / GLTFLoader / OrbitControls / Web Audio。`src/mapping.js`: 変換計算。`src/model-edges.js`: Corda由来の抽出処理。`dist/`: ビルド済みの静的アプリ。

`npm test`で変換とエッジ抽出を検証。`npm run build`でローカル依存を含めて配布ファイルにまとめる。実行時CDN依存なし。
