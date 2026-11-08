# Neuma v0.4

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

## Basic and detailed controls

The basic view contains playback, view navigation guidance, Sample/Upload model source, Duration, Half tone in model units, Pluck/Pad and Volume. Details contains axes, total pitch Range (1–96 semitones), linked minimum/maximum pitch, edge range, 3DM layers, dimensions and audio diagnostics. Range edits preserve the current musical midpoint. Details starts collapsed.

## Model and navigation

The supplied `Sample_UniteRooftop_Xenakis.glb` loads automatically. Sample opens a visual popup for the rooftop model, Plastic number, and Window, Stepped and Curve studies. The last three are abstract geometry, not named buildings. Upload or drag and drop loads a local GLB/3DM file. Local files are processed in the browser and are not uploaded. Drag or right drag to orbit, middle drag to pan, wheel to zoom. On mobile, open `[setting]` to access controls; pinch to zoom.

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

## Sound presets and dense models

Pluck (default) and Pad both use sine oscillators, with no sawtooth or rich harmonic layer. Pluck has a fast smoothed attack and exponential decay (0.28-second time constant); a short geometric event can ring out after the plane leaves it. Pad has a soft attack (0.09-second time constant), sustains at an intersection and releases over 0.18 seconds. Preset changes keep the scan position and rearticulate held notes. Pluck follows source-edge identity so moving pitch does not repeatedly retrigger its envelope. Coincident overlapping edges share one note; a later, separate edge can retrigger it. Pausing/stopping always silences all tails.

Audio follows the current timeline every 20ms using a fixed pool of up to 256 single-oscillator voices. All valid active edges contribute: nearly identical pitches are combined within one-cent bins, and if there are still more than 256 groups, adaptive bands merge them using an edge-count-weighted geometric mean frequency. This is an approximation for dense polyphony, not 256 randomly selected edges. Each pitch group has equal initial gain, normalized by the number of groups; duplicate edges do not increase its loudness. Above 440 Hz, a gentle gain reduction of `sqrt(440/frequency)` limits high-pitch dominance. A compressor controls the final mix.

Edges retain their actual Time-axis duration. Edges parallel to the scanning plane (zero Time-axis extent, with a numerical tolerance) are ignored during playback, avoiding artificial fast portamenti. Frequency changes, gain changes and voice transitions are smoothed.

## Edge range and manual scanning

Playback and direct scanning share one interface without a mode selector. The left menu scrolls vertically only. Playback controls sit at the top and remain visible while scrolling. Right drag orbits; middle drag is explicitly assigned to pan. Edge-range markers align with the track endpoints at 0% and 100%.

The Corda-style dual slider selects minimum and maximum edge-length percentiles, defaulting to 5–95%. Length is measured in the original model's world coordinates. Lowering the maximum excludes longer edges and their sustained notes. The displayed unit limits and playable-edge count update immediately; filtering keeps the model's full bounding box for time and pitch mapping.

Play advances the plane over Duration. Dragging in the 3D view freezes automatic playback and directly moves the plane along the projected Time axis, enabling sound. Pad holds at the released position; Pluck decays there. Play resumes automatic scanning from there; Pause mutes without resetting, and Stop mutes and resets. Right drag orbits, middle drag pans, and the wheel zooms. If the Time axis faces the camera, horizontal dragging is used instead. The Position slider remains available. Parallel edges remain visible but never produce sound.

For Pluck, events entirely between two 20ms updates are also collected once, using their midpoint pitch. This avoids missing very short edges; event timing remains quantized to the update interval.

The display separates oscillator voices from active edges. `edges voiced` counts all valid active edges represented by the mix; `combined` counts edges sharing voices. Frequencies outside the audio sample-rate limit are excluded. `Output` shows the post-compressor RMS level in dBFS; it measures the browser's audio signal, not the physical speaker volume. Pausing and stopping fade the pool to silence; seeking and resuming reuse it.

The Corda `collectPlayableEdges` implementation is reused, with an `EdgesGeometry` threshold of 15 degrees. Node world transforms are preserved and musical mapping uses the model's original coordinates and units. Only display geometry is centered.

Use embedded, uncompressed GLB static meshes. Draco/Meshopt compression, external referenced assets, line primitives, skinning and animated deformation are not supported. Maximum: 100 MB / 100,000 edges.

## Rhino 3DM

Uses locally bundled rhino3dm 8.4.0 (McNeel/openNURBS) in a disposable Web Worker. Native units and XYZ coordinates are preserved, without silently rescaling to meters. Details shows the source unit and X/Y/Z dimensions; Half tone uses that unit. Initial 3DM mapping is X=Time, Z=Pitch. GLB keeps X=Time, Y=Pitch and reports source coordinate units.

The first importer reads explicit lines and polylines (including exactly polylinear curves). Meshes, surfaces, blocks and curved NURBS are skipped, with a count shown in Details. It does not extract BRep edges or approximate curved NURBS. Instance-definition geometry is excluded to avoid playing untransformed block contents.

Details > Layers provides multiple layer checkboxes. Visible NEUMA layers are preferred initially; otherwise visible layers are selected. Hidden objects are skipped, hidden layers are initially unchecked, and locked visible curves can be read. Layer changes retain the original imported bounding box and linked pitch settings. Selecting no layers produces silence.

The file is decoded locally in the browser, with a 100MB file / 100,000-segment limit and a 60-second decoding timeout.

## Deployment

`.github/workflows/deploy.yml` tests and builds the app, then deploys `dist/` to GitHub Pages on pushes to `main`. Enable Pages with GitHub Actions as its source. Assets use relative paths and work under the repository URL. The sample model is included in `dist/models/`.

## Files

- `src/app.js`: Three.js scene, controls, GLB/3DM loading, layer selection and Web Audio.
- `src/mapping.js`: axis, duration and linked pitch calculations.
- `src/model-edges.js`: edge extraction reused from Corda.
- `dist/`: built static app, styles and sample model.
- `src/live-audio.js`: bounded reusable voice pool, duplicate-aware pitch grouping and sine-based envelopes.
- `tests.mjs`, `glb-test.mjs`, `audio-tests.mjs`, `rhino-tests.mjs`: transformation, parsing and dense audio-pool regression tests.

Three.js and rhino3dm JS/WASM are bundled locally. rhino3dm license: `dist/vendor/rhino/LICENSE`. Google Fonts supplies the same fonts as Corda, with monospace fallbacks if unavailable.
