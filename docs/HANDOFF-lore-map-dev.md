# BlockForge Worlds → LORE Map Development — Handoff Spec v2

**Author:** Ren (CTO) · **Date:** 2026-06-18 · **Builder:** Codex (laptop) · **Verifiers:** Ren + M3
**Repo:** `QuantaAIBot/blockforge-worlds`

## Purpose
This repo is the **world-blockout + LORE-asset-placement tool** for **LORE** — a standalone game on
**Unreal Engine 5**. The forge authors `.bfworld.json` maps (block geometry + zones + LORE prop
placements) that export into UE5, where LORE is actually built. The **north star is the feel of
Fortnite / GTA-6** — that's the ambition, not a near-term deliverable. Those are AAA, multi-year
efforts; the realistic, honest path is incremental, and the forge is the *level-design / greybox
front-end*, not the engine.

---

## LOCKED DECISIONS (Drew, 2026-06-18)
1. **Target runtime: standalone Unreal Engine 5** (full UE5, NOT UEFN). LORE is its own game.
   UEFN/Fortnite islands can be a later distribution play, but the primary build is standalone UE5.
2. **Asset model: real 3D assets, not voxels-forever.** The forge must support importing + placing
   **LORE models / textures / props (glTF/GLB)** from a LORE asset library — voxel blocks become the
   greybox/terrain layer; props are real meshes.
3. **Export format: glTF/GLB geometry + a placement-manifest JSON**, consumed by a UE5 Editor import
   script that instances LORE assets at the recorded transforms (props as engine assets, not baked geometry).
4. **Map scale:** grow to larger **chunked** blockout maps (requires the perf rework — incremental
   instance updates, not full-rebuild-per-edit). True open-world streaming lives in **UE5 World Partition** downstream.
5. **Zone taxonomy:** `kind` stays an **extensible tag**; current 4 (safehouse/market/race/mission)
   are defaults, grow as LORE needs. Low-stakes, evolve later.
6. **Build routing: laptop Codex.**

---

## Verified current state (Ren, 2026-06-18 — ran it / viewed it, not trusted)
- Stack: React 19 + TS + Vite 8 + Three.js + Capacitor(Android). `src/world.ts` + `src/App.tsx`.
- `npm run build` → exit 0; `npm run lint` → exit 0 (both run on VPS). Code reviewed — forge/tools/
  save-load/export/share-code/raycast all correct.
- **Live GitHub Pages deploy VERIFIED from the VPS:** https://quantaaibot.github.io/blockforge-worlds/
  returns 200; path-portable build (relative `./assets/*`, both 200); **Three.js canvas renders on
  desktop 1440 AND mobile 390** (screenshotted — real island geometry, not blank). Independently
  closes the canvas-render gap.
- Light mobile-UX note: stacked panels eat the small screen (3D view is a middle band) → collapsible-panel pass.

---

## PHASE 0 — Harden + make verification reproducible (IN PROGRESS; Codex, no LORE dep)
- **T0.1** Commit the Playwright nonblank-canvas harness + `test:visual` script (1440 + 390 viewports,
  fail-on-blank, prove it's binding). The live Pages URL is now a stable target for it.
- **T0.2** Fix the two import crash-paths: `isWorldMap` must validate `Array.isArray(zones)`; reject/
  coerce unknown `block.type` (today → `undefined.push`). Add a fixture per case.
- **T0.3** One `npm test` chaining build + lint + visual (no cost-incurring CI beyond the existing Pages deploy).

## PHASE 1 — Voxel-toy → world-design tool feeding UE5 (next; M3-gated before build)
- **T1.1 — glTF/GLB asset import + LORE asset library.** Load external prop meshes (`three/examples
  GLTFLoader`), a browsable LORE asset palette alongside the block palette.
- **T1.2 — Prop placement tool.** Place/rotate/scale/delete LORE props on the blockout (new tool +
  schema: `props: [{assetId, x,y,z, rot, scale}]`); raycast placement like blocks. Bump `schemaVersion`
  with a forward-compat migration (unknown fields preserved, missing defaulted).
- **T1.3 — UE5 exporter.** Emit (a) glTF/GLB of the blockout geometry + (b) a `lore-placement.json`
  manifest (prop assetIds + transforms + zones) + (c) a UE5 **Editor Utility / Python import script**
  that spawns/instances the LORE assets at those transforms and tags zones as regions. Validate a
  round-trip into an empty UE5 project.

## PHASE 2 — Scale + game-world structure (after Phase 1)
- Larger **chunked** maps + the perf rework (incremental instance updates; dispose InstancedMesh
  buffers). Region/gameplay tagging aligned to UE5 **World Partition**. Streaming-aware export.

---

## Gates (every phase)
- **build + lint green**, and the **live-URL Playwright canvas check is a merge gate** once committed (T0.1).
- **M3 refute-first reviews this spec BEFORE Codex builds Phase 1** (fleet orchestrate-mode: spec →
  M3 → Codex codes → Ren+M3 verify). Ren stays gate-of-record; Drew merges.

## Notes
- `android:debug` is Windows-SDK-bound — keep APK builds on the laptop Codex node.
- Bundle is one 744 kB chunk (Three.js); code-split when it matters, not now.
- `escape`/`unescape` in the share-code path are deprecated (functional) → TextEncoder later.
- North-star honesty: Fortnite/GTA-6 = the bar for *feel*; deliver in increments, prove each phase against the live URL.
