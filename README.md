<div align="center">

# Flux Sandbox

**A falling-sand cellular automaton with a thermal field, chunked simulation, and 54 reactive materials.**

### [▶ Play live](https://mr-v1be.github.io/flux-sandbox/)

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss&logoColor=white)
[![CI](https://github.com/Mr-V1be/flux-sandbox/actions/workflows/ci.yml/badge.svg)](https://github.com/Mr-V1be/flux-sandbox/actions/workflows/ci.yml)
[![Deploy](https://github.com/Mr-V1be/flux-sandbox/actions/workflows/deploy.yml/badge.svg)](https://github.com/Mr-V1be/flux-sandbox/actions/workflows/deploy.yml)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

</div>

---

## Overview

Flux Sandbox simulates physical interactions between **54 materials** on a dense pixel grid. Every element is declared through a small thermal profile — conductivity, melting / freezing / boiling / ignition points, and state transitions — plus an optional movement behaviour.

The engine is built to hold **60 FPS on 160,000-cell grids** by combining:

- a **chunked grid** that processes only regions with recent activity,
- a **shared temperature field** that propagates heat and drives state transitions uniformly,
- a **dense typed-array element registry** with O(1) per-cell lookups, and
- a **decoupled event bus** so simulation logic never depends on visual effects (particles, screen shake, recipes).

The resulting playground supports everything from classic sand + water + lava, through electricity conducted via copper wires, to portals, magnets, antigravity zones, and a uranium chain reactor that goes nuclear when clustered.

## Highlights

- **54 materials** across six categories — powders, liquids, gases, solids, reactive, and exotic.
- **Thermal field** with ping-pong diffusion, emitters, and data-driven state transitions.
- **Electricity** — conductors, batteries, sparks; charge propagates through copper / iron with a configurable glow.
- **Camera** with pan and cursor-anchored zoom, clamped and fit-aware.
- **Chunk-based simulation** skips inactive regions entirely; a settled pile is effectively free.
- **Recipes panel** auto-derived from thermal profiles plus a hand-curated chemistry catalog.
- **Scenarios** for quick demos: Volcano, Reactor, Portal Loop, Acid Rain, Ice Cavern, Chem Lab, Mayhem.
- **Brush shapes** — circle, square, spray, line (rubber-band), replace — plus an element pipette (Ctrl + click).
- **Visual feedback** — event-driven particles and screen shake on every explosion.
- **Shareable URLs** — scene is serialized with `CompressionStream('gzip')`, base64url-encoded into the URL hash. Paste the link, the scene loads byte-for-byte.

## Tech stack

| Layer              | Choice                                   |
| ------------------ | ---------------------------------------- |
| Language           | TypeScript (strict)                      |
| Bundler            | Vite 6                                   |
| Styling            | Tailwind CSS v4 (`@tailwindcss/vite`)    |
| UI state           | Zustand (vanilla)                        |
| Icons              | Lucide                                   |
| Rendering          | Canvas 2D (`ImageData` + `drawImage`)    |

The simulation core and renderer have **zero runtime dependencies** — every hot path is a plain typed array.

## Getting started

Requires Node 20+ and `pnpm`.

```bash
pnpm install
pnpm dev
# then open http://localhost:5173
```

Production build:

```bash
pnpm build
pnpm preview
```

## Controls

| Action                  | Binding                           |
| ----------------------- | --------------------------------- |
| Paint                   | `LMB`                             |
| Erase                   | `RMB` or `Shift + LMB`            |
| Pipette (sample cell)   | `Ctrl + Click`                    |
| Pan                     | middle-drag or `Alt + drag`       |
| Zoom                    | `Ctrl + Wheel`, or `+` / `−`      |
| Brush size              | mouse wheel, or `[` / `]`         |
| Brush shape             | `Tab`                             |
| Pause                   | `Space`                           |
| Clear                   | `C`                               |
| Fit view                | `F`                               |
| Heat overlay            | `T`                               |
| Copy shareable link     | Share button in the top bar       |
| Element quick-select    | `S` sand · `D` water · `F` fire · `L` lava · `A` acid · `O` oil · `I` ice · `P` plant · `G` gas · `W` wall · `E` eraser |

## Architecture

```
src/
├── core/                 simulation, grid, temperature field, thermal engine
│   ├── Grid.ts           Uint32 cell storage + chunked activity double-buffer
│   ├── Simulation.ts     tick loop: element updates → diffusion → transitions
│   ├── TemperatureField  Int8 field + Int16 ping-pong buffer
│   ├── ThermalEngine.ts  data-driven state transitions (melt/freeze/ignite/...)
│   └── Lookups.ts        flat typed-array lookups for hot-path parameters
├── elements/
│   ├── registry.ts       array-backed O(1) registry
│   ├── behaviors/
│   │   ├── powder.ts     generic powder strategy
│   │   ├── liquid.ts     generic liquid strategy (density, dispersion)
│   │   ├── gas.ts        generic gas strategy
│   │   ├── reactions.ts  fire / acid / lava / plant / salt / virus / ...
│   │   ├── structures.ts copper / battery / cloner / void / torch / magnet
│   │   └── exotic.ts     black hole / portals / antigravity / rod / glue
│   └── definitions/      declarative element catalog (54 entries)
├── rendering/
│   ├── Renderer.ts       Canvas2D with screen-shake offset and heat tint
│   ├── Camera.ts         pan / zoom with cursor anchoring
│   └── BrushCursor.ts    overlay shapes for each brush mode
├── input/InputController shape-aware paint, pipette, pan/zoom, hotkeys
├── effects/
│   ├── EventBus.ts       typed pub/sub for simulation → visuals
│   ├── Particles.ts      struct-of-arrays pool (Float32 + swap-pop compact)
│   └── ScreenShake.ts    decay-based jitter
├── ui/                   sidebar, topbar, recipes tooltip, help strip
├── state/
│   ├── Store.ts          Zustand vanilla
│   ├── Scenarios.ts      scripted preset sandboxes
│   └── Recipes.ts        reaction catalog (auto-derived + curated)
├── main.ts               wires everything together
└── styles.css            Tailwind + theme tokens
```

### Cell encoding

Every cell is packed into a single `Uint32`:

```
bits  0 .. 11   element id         (up to 4096 elements)
bits 12 .. 19   life counter       (burn timer, projectile lifespan)
bits 20 .. 27   variant byte       (per-cell colour jitter / direction)
bit  28         updated flag       (per-tick dedup)
```

A parallel `Int8Array` holds per-cell temperature; diffusion ping-pongs through an `Int16` buffer to preserve precision.

### Share format

The Share button packs the simulation state as:

```
[4 bytes magic "FLX1"][4 bytes width][4 bytes height][4 bytes version]
[w*h * 4 bytes cells (Uint32)]
[w*h * 1 byte   temperature (Int8)]
```

The whole buffer is gzipped through the browser's native `CompressionStream('gzip')`, base64url-encoded, and written to `location.hash`. On load, any `#s=…` hash is decoded, verified, and applied to the running grid. A typical scene packs into ~10–60 KB of URL.

### Hot-path rules

- **No `Map.get` in per-cell loops.** Thermal parameters live in `Float32Array` / `Int8Array` indexed by element id. Element definitions are stored in a dense array too.
- **Bookkeeping writes never wake chunks.** Setting the updated-flag on a cell writes the typed array directly, skipping the `wake()` path.
- **Renderer has a fast path for empty cells.** Empty regions skip colour, variance, and `renderColor` entirely — 80 %+ of a typical grid.
- **Thermal diffusion waking is gated.** Only cells with `|temperature| > 3` keep their chunk alive next tick.

## Performance

On a **500 × 320** grid (160 000 cells), the Mayhem scenario — 40 000+ active cells spanning every registered element — holds around **60 FPS** on a mid-range laptop. Quiet grids are effectively free: an idle scene with a small heat source drops to a handful of active chunks.

Key optimisations:

1. Chunked simulation with 16 × 16 double-buffered activity flags.
2. Flat typed-array lookups for every thermal parameter.
3. Single-pass diffusion with a combined emitter step and memcpy-fast copy-back.
4. Array-backed registry (instead of `Map`) so `registry[id]` is a direct load.
5. Renderer fast path for empty cells.

## Scripts

- `pnpm dev` — Vite dev server with HMR
- `pnpm build` — TypeScript check and production build
- `pnpm preview` — serve the production build locally
- `pnpm typecheck` — TypeScript check only

## License

Released under the [MIT License](LICENSE).
