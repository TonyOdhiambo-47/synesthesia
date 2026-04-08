# Synesthesia

**A real-time gesture-controlled generative art engine.**

Move your hands. Listen to the room. The screen paints itself.

---

## What Is This

Synesthesia turns your webcam and microphone into a generative art instrument. Hand
movements drive particle systems, organic growth networks, mathematical surfaces,
physics-driven calligraphy, and orbital mechanics — all rendered in real time via
custom WebGL2 shaders. Ambient sound shapes color, density, speed, and behavior.

**Five modes. Four palettes. Infinite compositions. Zero AI.**

## Modes

| Mode | What Happens |
|------|--------------|
| **Nebula** | 10,000 instanced GPU particles form a fluid nebula around your hands. Audio drives emission, color, and turbulence. Framebuffer feedback bakes luminous trails. |
| **Mycelium** | Branching organic networks grow from your fingertips. Treble frequencies boost branching density; claps trigger blooms. |
| **Topology** | A 96×56 mesh deforms under your palms. Hand height becomes peak/valley; bass and treble drive ripple speed. |
| **Calligraphy** | Index finger paints physics-driven ink. Fast strokes thin out; volume controls boldness; gravity drips fresh ink. |
| **Cosmos** | N-body orbital system. Left hand is a star, right hand is a black hole. Bass expands the system; treble collapses it. Clap triggers a supernova. |

## Tech

MediaPipe Hands · Web Audio API · WebGL2 (raw GLSL ES 3.00) · React 18 · TypeScript · Vite

No Three.js. No TensorFlow.js. No AI. Pure math, physics, and shaders.

## Architecture

```
INPUT          PHYSICS         RENDER             OUTPUT
─────          ───────         ──────             ──────
MediaPipe ──▶  Particle    ──▶ WebGL2          ──▶ PNG / WebM
Hands          Systems         Fragment            Export
                               Shaders
WebAudio  ──▶  Flow Fields ──▶ FBO Ping-Pong  ──▶ Canvas
Spectral       Attractors      Bloom + Grain
Analysis       N-Body
```

The engine uses a ping-pong framebuffer: each frame, the previous frame is decayed
toward the palette background and the active mode renders on top. A presentation
pass adds chromatic aberration, gaussian bloom, film grain, and a vignette.

## Controls

| Input | Action |
|-------|--------|
| Move hands | Primary interaction (mode-specific) |
| Both fists | Next mode |
| Open palm (Calligraphy) | Clear canvas |
| Fist (Calligraphy) | Cycle brush style |
| Clap (hands meet) | Trigger event — bloom / supernova / clear |
| `M` | Next mode |
| `1`–`5` | Jump to specific mode |
| `P` | Next palette |
| `G` | Gallery / auto-cycle mode |
| `Space` | Screenshot (PNG) |
| `R` | Start/stop video recording (WebM) |
| `` ` `` | Toggle FPS counter |

## Run Locally

```bash
git clone https://github.com/TonyOdhiambo-47/synesthesia
cd synesthesia
npm install
npm run dev
```

Then open http://localhost:5173. Allow camera and microphone when prompted.
Choose **Keyboard Only** on the landing page to skip the camera and drive the
synthetic hand with your mouse.

## Build

```bash
npm run build
npm run preview
```

Output is a static site in `dist/` — drop it on Vercel, Netlify, or any static host.
No backend, no environment variables, no API keys.

## Performance

Targets 60fps at 1080p on a 2020 MacBook Air (M1). Particle physics runs on the
CPU in pre-allocated `Float32Array` SoA buffers and uploads as instance data each
frame. Rendering uses `gl.drawArraysInstanced` for the particle modes and
`gl.drawElements` for the topology mesh. Float16 framebuffers (`RGBA16F`) keep
HDR bloom believable.

## Project Structure

```
src/
├── main.tsx                 # React entry point
├── App.tsx                  # Permission flow, keyboard, recording
├── engine/
│   └── Engine.ts            # Render loop, FBO ping-pong, mode/palette state
├── input/
│   ├── HandTracker.ts       # MediaPipe Hands wrapper
│   ├── AudioAnalyzer.ts     # Spectral analysis: bass/mid/treble/centroid/onset
│   └── GestureClassifier.ts # Landmarks → gesture events
├── render/
│   ├── WebGLRenderer.ts     # WebGL2 context, FBOs, shader compilation
│   └── shaders.ts           # All GLSL ES 3.00 sources (inlined)
├── modes/
│   ├── Mode.ts              # Abstract mode interface
│   ├── NebulaMode.ts        # 10K instanced particles
│   ├── MyceliumMode.ts      # Branching organic networks
│   ├── TopologyMode.ts      # Deforming mesh grid
│   ├── CalligraphyMode.ts   # Ink physics
│   └── CosmosMode.ts        # Orbital N-body
├── ui/
│   ├── Landing.tsx          # Title screen with ambient canvas
│   └── HUD.tsx              # Auto-hiding overlay
└── utils/
    ├── math.ts              # noise, flow, lerp, clamp
    ├── palettes.ts          # aurora · ember · phantom · reef
    └── types.ts             # shared types
```

## Author

**Tony Odhiambo** · MIT '28
