# Synesthesia

A browser app that turns your webcam and microphone into a generative art instrument. You move your hands, the visuals respond. Sound in the room shifts color, density, and motion. There are five different visual modes you can switch between.

It's a side project I built to play with WebGL2 shaders, MediaPipe hand tracking, and the Web Audio API in one place.

## The five modes

- **Nebula** — about 10,000 GPU particles drift around your hands like a fluid. Trails persist via framebuffer feedback. Audio drives emission rate and color.
- **Mycelium** — branching networks grow out from your fingertips. More high-frequency sound, more branching. Clap and the network blooms.
- **Topology** — a grid mesh deforms under your hands. Hand height becomes peaks and valleys. Bass makes slow rolling waves, treble makes sharp ripples.
- **Calligraphy** — your index finger paints. Move fast and the stroke thins out, move slow and it pools. Open palm clears the canvas. Fist cycles brush styles.
- **Cosmos** — a small N-body system. Left hand is a star, right hand is a black hole. Bass pushes particles outward, treble pulls them in. Clap triggers a supernova.

There are also four color palettes (`aurora`, `ember`, `phantom`, `reef`) you can cycle with `P`.

## How it works

The render loop is a ping-pong framebuffer setup: each frame, the previous frame is copied forward with a decay factor toward the palette background, then the active mode draws on top, then a presentation pass adds bloom, mild chromatic aberration, film grain, and a vignette.

Hand landmarks come from MediaPipe Hands running in the browser. Audio analysis is a standard `AnalyserNode` pulling FFT data and deriving bass/mid/treble bands plus an RMS volume and a spectral centroid. A small classifier turns landmarks into discrete gestures (fist, open palm, pinch, point, clap, both fists).

Particle systems use SoA `Float32Array` pools and `gl.drawArraysInstanced`. Shaders are GLSL ES 3.00, inlined as TypeScript strings to keep the build simple. Float16 (`RGBA16F`) framebuffers when the browser supports them, with an automatic RGBA8 fallback for older Safari.

```
INPUT          PHYSICS         RENDER             OUTPUT
─────          ───────         ──────             ──────
MediaPipe ──▶  Particle    ──▶ WebGL2          ──▶ PNG / WebM
Hands          systems         fragment            export
                               shaders
WebAudio  ──▶  Flow fields ──▶ FBO ping-pong  ──▶ Canvas
spectral       Attractors      Bloom + grain
analysis       N-body
```

## Stack

React 18, TypeScript, Vite, raw WebGL2, MediaPipe Hands, Web Audio API. No Three.js, no TensorFlow.js, no model inference beyond what MediaPipe ships with.

## Controls

| Input | What it does |
|---|---|
| Move your hands | Whatever the current mode does with them |
| Both fists at once | Next mode |
| Clap (hands meet) | Mode-specific event (bloom, supernova, etc.) |
| Open palm in Calligraphy | Clear the canvas |
| Fist in Calligraphy | Cycle brush style |
| `M` / `1`–`5` | Switch mode |
| `P` | Next palette |
| `G` | Gallery mode (auto-cycles modes and palettes) |
| `Space` | Save a PNG screenshot |
| `R` | Start/stop recording a WebM video |
| `` ` `` | Toggle the FPS counter |

## Running it

```bash
git clone https://github.com/TonyOdhiambo-47/synesthesia
cd synesthesia
npm install
npm run dev
```

Then open http://localhost:5173 and allow camera + mic when prompted. If you'd rather not use the camera, click **Keyboard Only** on the landing page and your mouse will drive a single synthetic hand.

To build the static site:

```bash
npm run build
npm run preview
```

The output in `dist/` is a fully static bundle — no backend, no environment variables, no API keys. Drop it on Vercel, Netlify, GitHub Pages, or any static host.

## Performance notes

I was targeting 60fps at 1080p on an M1 MacBook Air. The big things that helped:

- Particles live in pre-allocated `Float32Array` SoA buffers, not arrays of objects, so there's no per-frame allocation churn.
- Only live particles are packed into the upload buffer each frame instead of always uploading the full pool.
- Mycelium uses a fixed-size branch pool with an integer free-list — no `Array.shift()`, no `filter()` reallocations.
- Calligraphy uses a ring buffer for ink stamps, again to avoid array shifts under input pressure.
- The feedback FBO is RGBA16F when available, so bloom doesn't band.

## Project layout

```
src/
├── main.tsx                  # React entry
├── App.tsx                   # Permissions, keyboard, recording, lifecycle
├── engine/
│   └── Engine.ts             # Render loop, FBO ping-pong, mode + palette state
├── input/
│   ├── HandTracker.ts        # MediaPipe Hands wrapper
│   ├── AudioAnalyzer.ts      # FFT bands, RMS, centroid, onset detection
│   └── GestureClassifier.ts  # Landmarks → discrete gestures
├── render/
│   ├── WebGLRenderer.ts      # WebGL2 context, shader compile, FBO management
│   └── shaders.ts            # GLSL ES 3.00 sources, inlined
├── modes/
│   ├── Mode.ts               # Abstract mode interface
│   ├── NebulaMode.ts
│   ├── MyceliumMode.ts
│   ├── TopologyMode.ts
│   ├── CalligraphyMode.ts
│   └── CosmosMode.ts
├── ui/
│   ├── Landing.tsx           # Title screen with an ambient canvas behind it
│   └── HUD.tsx               # Auto-hiding overlay
└── utils/
    ├── math.ts               # noise, flow, lerp, clamp
    ├── palettes.ts
    └── types.ts
```

## Known limitations

- Mobile is not really supported. The MediaPipe model and 60fps shader pipeline are too heavy on most phones, and the gesture vocabulary assumes a desktop framing.
- The screenshot is at the canvas's render resolution, not a separate 4K rerender. Good enough for most displays but it's not gallery-print quality.
- The MediaPipe Hands model is loaded from a CDN at startup, so the first run needs network access.

## Author

Tony Odhiambo
