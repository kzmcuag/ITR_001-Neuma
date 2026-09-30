# Neuma v0.2

Browser instrument mapping the edges of a 3D model to time and pitch.

**Live app:** https://kzmcuag.github.io/ITR_001-Neuma/

## Run locally

Node.js 22 or later:

```sh
npm ci
npm run build
npm run dev
```

Open `http://127.0.0.1:4173/`. `npm test` checks mapping, linked pitch controls, GLB parsing and transformed edge extraction.

## Model and navigation

The supplied `test_plasticNumber.glb` loads automatically. Sample reloads it; Replace or drag and drop loads a local GLB. Local files are processed in the browser and are not uploaded. Drag or right drag to orbit, middle drag to pan, wheel to zoom. On mobile, open `[setting]` to access controls; pinch to zoom.

The interface follows Corda's design tokens: `#111111` background, IBM Plex Mono, 12px main text, 11px controls, 10px section labels, 220px panel at top 26px / left 28px, and green interaction accents. All app text is English. Instrumentarium uses Inter as in Corda.

## Axis assignment and time

Choose one Time axis and one Pitch axis from X/Y/Z. They cannot overlap; selecting the other role's axis swaps the two. The remaining axis only contributes to the 3D view and does not control sound. Duration is the time to scan the entire selected Time axis. Default: `1:00` (60 seconds). Enter seconds or `m:ss`, up to 60 minutes. The scanning plane follows the selected axis; active edges are highlighted. Play/Pause, Stop and the position slider control playback. Leaving the tab pauses playback.

## Linked pitch controls

Default: **48 semitones**, centered on **D4 = 293.664768 Hz** in musical pitch space:

- Minimum: D2 = 73.416192 Hz.
- Maximum: D6 = 1174.659072 Hz.
- Half tone: Pitch-axis bounding-box length / 48 units.

Minimum and Maximum accept note names such as `D3`, `F#4`, `Bb2`, or frequencies such as `220` / `220 Hz`. The adjacent label shows the corresponding note, including cents for intermediate pitches.

- Editing Minimum keeps Maximum fixed and recalculates Half tone.
- Editing Maximum keeps Minimum fixed and recalculates Half tone.
- Editing Half tone keeps the current musical midpoint fixed and recalculates both endpoints.
- Reset restores the 48-semitone range centered on D4.
- Axis changes keep a manually entered Half tone and the current midpoint, updating endpoints for the new axis length. Before a manual pitch edit, axis changes restore the default range. New models reset pitch controls to the default range.

The midpoint is the geometric mean of the two frequencies, corresponding to the midpoint in semitone space, rather than the arithmetic mean of Hz.

```text
semitones = 12 * log2(maximumHz / minimumHz)
halfToneUnits = pitchAxisLength / semitones
frequency = minimumHz * 2 ^ ((coordinate - axisMinimum) / halfToneUnits / 12)
```

Nonpositive values, reversed ranges and excessive ranges are rejected. A pitch axis with zero length maps all edges to one frequency (D4 by default).

## Waveform and dense models

Sine and Sawtooth are global waveform choices, using Corda-style buttons. There is no Timbre-axis mapping. The default is Sine; switching waveform during playback does not reset the timeline.

Audio follows the current timeline every 20ms using a fixed pool of up to 256 single-oscillator voices. All valid active edges contribute: nearly identical pitches are combined within one-cent bins, and if there are still more than 256 groups, adaptive bands merge them using an edge-count-weighted geometric mean frequency. This is an approximation for dense polyphony, not 256 randomly selected edges. Group energy follows edge count (amplitude scales with its square root), so dense window details have more weight than a lone top edge. Above 440 Hz, a gentle gain reduction of `sqrt(440/frequency)` limits high-pitch dominance. A compressor controls the final mix.

Short edges have a minimum event duration of 140ms (previously 45ms), making brief window edges easier to perceive. The overall scan duration and logarithmic pitch mapping remain the same. Frequency changes, gain changes and voice transitions are smoothed.

The display separates oscillator voices from active edges. `edges voiced` counts all valid active edges represented by the mix; `combined` counts edges sharing voices. Frequencies outside the audio sample-rate limit are excluded. `Output` shows the post-compressor RMS level in dBFS; it measures the browser's audio signal, not the physical speaker volume. Pausing and stopping fade the pool to silence; seeking and resuming reuse it.

The Corda `collectPlayableEdges` implementation is reused, with an `EdgesGeometry` threshold of 15 degrees. Node world transforms are preserved and musical mapping uses the model's original coordinates and units. Only display geometry is centered.

Use embedded, uncompressed GLB static meshes. Draco/Meshopt compression, external referenced assets, line primitives, skinning and animated deformation are not supported. Maximum: 100 MB / 100,000 edges.

## Deployment

`.github/workflows/deploy.yml` tests and builds the app, then deploys `dist/` to GitHub Pages on pushes to `main`. Enable Pages with GitHub Actions as its source. Assets use relative paths and work under the repository URL. The sample model is included in `dist/models/`.

## Files

- `src/app.js`: Three.js scene, controls, GLB loading and Web Audio.
- `src/mapping.js`: axis, duration and linked pitch calculations.
- `src/model-edges.js`: edge extraction reused from Corda.
- `dist/`: built static app, styles and sample model.
- `src/live-audio.js`: bounded reusable voice pool, density-aware pitch grouping and waveform selection.
- `tests.mjs`, `glb-test.mjs`, `audio-tests.mjs`: transformation, parsing and dense audio-pool regression tests.

Three.js is bundled locally. Google Fonts supplies the same fonts as Corda, with monospace fallbacks if unavailable.
