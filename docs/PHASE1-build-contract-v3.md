# Phase 1 — Build Contract v3 (post-M3 gate)

**Author:** Ren (CTO, gate-of-record) · **Date:** 2026-06-18 · **Builder:** Codex (laptop) · **Reviewers:** M3 + Ren
**Supersedes:** the PHASE 1 section of `docs/HANDOFF-lore-map-dev.md` (spec v2). v2 stays the source for Purpose / Locked Decisions / Phase 0 / Phase 2.

## Why this doc exists
M3 refute-first review of spec-v2 Phase 1 returned **NOT-READY**. Verified against verbatim source (gate-of-record, not rubber-stamped) — the blockers are real:
- `WorldMap.schemaVersion` is the **TS literal `1`** (`src/world.ts:41`) and `isWorldMap` validates `value.schemaVersion === 1` (`src/App.tsx:702`). Bumping to v2 to add `props` (a) fails to type-check and (b) makes the validator **silently drop every v2 save to `null`** on load. No migration path exists.
- `isWorldMap` checks `Array.isArray(value.blocks)` but **never checks `zones`** (`src/App.tsx:705`); there is no field-defaulting path. "missing defaulted" in v2 is asserted but absent.
- `ZoneKind` is a **closed union** (`src/world.ts:14`) — contradicts Locked Decision #5 ("extensible tag").
- **No `props` field, no asset registry** anywhere in the source (grep-confirmed clean slate — no partial prop/asset/gltf/migration code).
- The **Three.js → UE5 coordinate / units / rotation contract is entirely unspecified** — the single highest-risk area for the UE5 exporter, and exactly the bug-class the M3 gate exists to catch.

## Gate-of-record decisions (Ren — beyond M3)

**D1 — Split Phase 1 into 1A (build now) + 1B (build after contract-pin).**
1A (schema v2 + migration + asset registry + glTF prop import + placement tool) is **pure browser/Three.js work with zero UE5 dependency** and ships visible, testable value (import + place real LORE props in the forge). 1B (the UE5 exporter) is genuinely not-buildable until the coordinate contract is pinned, a UE5 version is chosen, and a round-trip harness exists. Carving the contract-complete subset is standard incremental delivery and matches the spec's own "deliver in increments" north-star-honesty note. **Codex builds 1A now; 1B waits on the two open decisions below.**

**D2 — RESOLVED (Drew, 2026-06-19): Locked Decision #3 AMENDED to manifest-primary, assets-by-reference.**
Spec-v2 LD#3 = "glTF/GLB geometry + a placement-manifest JSON." Now amended to the **manifest-primary, assets-by-reference** model:
- The LORE asset library (glTF/GLB) is imported **once into UE5** as native assets under `/Game/LORE/Props/`. It is ALSO loaded by the forge for in-browser visualization. It is the *shared source*, imported into each side once — **not re-exported by the forge per map.**
- The forge's export for UE5 is **one manifest JSON** carrying: greybox voxel list, prop placements (`assetId` + transform), zones, spawn — all in pinned UE coordinate space.
- The UE5 import script reads the manifest → rebuilds greybox as a UE `HISMC` per block type (cubes are trivially reconstructable from `{x,y,z,type}`) → spawns `/Game/LORE/Props/{assetId}` actors at the transforms → builds zone volumes → sets `PlayerStart`.
- **Why:** dissolves M3's GLTFExporter-↔-`InstancedMesh` round-trip risk entirely (no geometry export), gives UE-native instancing + per-type materials + editor-swappable greybox, and keeps prop geometry lossless (UE imports the original glTF once, not a re-serialized copy). glTF/GLB stays load-bearing as the **asset-library source format**, just not as a per-map export artifact.
- If Drew prefers to keep LD#3 as-written (glTF geometry export), 1B must additionally pin: merge-instances vs per-type bake, BlockType→material mapping in glTF, GLB-single-file, and UE's `EXT_mesh_gpu_instancing` import support must be engine-verified (currently UNCERTAIN). The manifest-primary model avoids all of that.

**OPEN-1 — RESOLVED (Drew, 2026-06-19): UE5 version target = UE 5.5.** (glTF Interchange + Python EditorScripting mature.) Applies to 1B. Not needed for 1A.

---

# PHASE 1A — Schema v2 + asset import + placement (BUILD NOW)

## T1A.0 — Schema v2 + versioned validator + migration (do this FIRST; everything else depends on it)
`src/world.ts`:
- Change `schemaVersion: 1` → `schemaVersion: 2` on the `WorldMap` interface. Keep a `WorldMapV1` type (the current shape) for the migrator's input.
- Add the props field + types:
  ```ts
  export type Vec3 = { x: number; y: number; z: number }
  export interface PropPlacement {
    id: string            // stable uuid for select/delete
    assetId: string       // slug, references AssetDescriptor.id; case-sensitive
    x: number; y: number; z: number    // Three.js world space (Y-up), continuous (NOT grid-snapped)
    rotY: number          // radians, Y-axis yaw only (v2 scope; full Euler deferred — see note)
    scale: number         // uniform scalar; clamp [0.05, 50]
  }
  ```
  Rotation is **Y-yaw only** in v2 (one number, human-editable, covers ~all level-design placement). Full Euler/quaternion is a deferred v3 field — the migration rule below preserves unknown fields so v3 can add it without breaking v2.
- Add `props: PropPlacement[]` to `WorldMap`. Add `spawn` already has `{x,y,z}` — add `spawnYaw: number` (radians) to `WorldMap` (UE `PlayerStart` needs a yaw; default `0`).
- `createWorld()` returns `schemaVersion: 2`, `props: []`, `spawnYaw: 0`.

`src/App.tsx`:
- Replace `isWorldMap` with a **two-step parse**: `migrateWorld(raw: unknown): WorldMap | null` runs BEFORE validation inside `parseWorldText`:
  - If `raw.schemaVersion === 1`: map to v2 by setting `props: []`, `spawnYaw: 0`, bump `schemaVersion: 2`. **Preserve any unknown keys** (spread `...raw` first, then set defaults) so future fields survive an editor round-trip.
  - If `raw.schemaVersion === 2`: pass through; **default any missing field** (`zones ?? []`, `blocks ?? []`, `props ?? []`, `spawnYaw ?? 0`).
  - Else (no/unknown version): return `null`.
- New `isWorldMapV2`: validates `schemaVersion === 2`, `typeof name === 'string'`, `typeof seed === 'number'`, **`Array.isArray(zones)`** (the Phase-0 T0.2 fix, folded here), `Array.isArray(blocks)`, `Array.isArray(props)`, `value.spawn` present.
- **Tests (Vitest — add `vitest` to devDeps + `"test:unit"` script):** (a) v1 fixture migrates → v2 with `props:[]`; (b) v2-with-unknown-key round-trips with the key preserved; (c) v2 missing `zones` defaults to `[]` not `null`; (d) garbage/no-version → `null`. These must be **binding** (assert the migrated object, not just "no throw").

## T1A.1 — LORE asset registry + glTF/GLB import
- Create `public/lore-assets/` + a manifest `public/lore-assets/catalog.json`:
  ```ts
  export interface AssetDescriptor {
    id: string            // slug, matches PropPlacement.assetId
    displayName: string
    category: string      // free string (palette grouping)
    src: string           // relative path under public/lore-assets/, e.g. "./lore-assets/crate.glb"
    defaultScale: number  // applied on first placement
    thumbnailUrl?: string
  }
  ```
  Seed it with **2–3 real placeholder GLBs** (a crate, a barrel, a tree — any CC0 GLB; commit them) so the palette and round-trip are testable on a clean checkout. The catalog is **read at runtime** (`fetch('./lore-assets/catalog.json')`) — path-relative like the existing build (Pages-portable), NOT hardcoded.
- Load meshes with `GLTFLoader` from `three/examples/jsm/addons/loaders/GLTFLoader.js`. **Cache by `assetId`** (load each GLB once, clone per placement). Dispose on scene teardown (the existing cleanup pattern in `BlockScene`).
- **Do NOT seed/hardcode any specific asset into logic** — read the catalog at runtime, render whatever is in it (general capability, per the fleet "read the artifact, don't tune to it" rule).

## T1A.2 — Prop placement tool
- New `ToolMode` member `'prop'` (extend the union at `src/world.ts:12`). Active when an asset is selected in the palette.
- Asset palette UI alongside the block palette (same panel pattern as `blockDefinitions`).
- **Raycast target for props (M3 flagged this as unspecified — pinned here):** props raycast against the **voxel `InstancedMesh`** (same `targetsRef` as blocks) AND place at the **continuous `hit.point`** (NOT grid-snapped like blocks — props are real meshes, free placement). Use `hit.point` for x/z, and the hit surface for y. The current handler (`src/App.tsx:422-449`) only returns `{voxel, normal}` grid-snapped — extend `actionRef`'s payload to also carry `point: Vec3` for the prop path. Keep the block path grid-snapped unchanged.
- Place → push a `PropPlacement` (new uuid, selected `assetId`, `hit.point`, `rotY:0`, `scale: defaultScale`). Render placed props as cloned GLTF scenes in a separate `THREE.Group` (not the voxel InstancedMesh).
- Rotate (Y-yaw step, e.g. 15°) / scale (± step, clamped) / delete the selected prop. Selection via raycast against the props group.
- `withUpdatedTimestamp` on every prop mutation (existing pattern).

## T1A — Gates (merge)
- `npm run build` + `npm run lint` green.
- `npm run test:unit` (new Vitest) green — the 4 migration tests above are binding.
- Live-URL Playwright canvas check (Phase-0 T0.1 harness) still green at 1440 + 390; add one assertion that a placed prop renders (non-empty props group) so the palette path is screenshot-proven, mock + live.
- Forward-compat proven: load a committed v1 `.bfworld.json` fixture in the running app → it migrates, renders, and re-exports as v2 with no data loss.

---

# PHASE 1B — UE5 exporter (BUILD AFTER 1A; decisions RESOLVED → **UE 5.5 + manifest-primary**)

Both gating decisions are now locked (OPEN-1 = UE 5.5, D2 = manifest-primary). Remaining before 1B build: a UE 5.5 project to round-trip against (Ren to confirm/stand up), the final UE Python import script, and an M3 refute-first pass on the 1B contract with that real script embedded.

## Coordinate / units / rotation contract (Three.js → UE5) — PIN THIS, do not let the implementer guess
| axis/quantity | Three.js (source) | UE5 (target) | conversion (applied at manifest-emit time, so the UE script consumes UE-space directly) |
|---|---|---|---|
| handedness / up | right-handed, **Y-up** | left-handed, **Z-up** | `ue.x = three.x`, `ue.y = three.z`, `ue.z = three.y` (Y↔Z swap produces the RH→LH flip for this convention). Document the chosen "north" axis in the manifest header. |
| unit scale | "1 unit per block" (unitless) | 1 uu = **1 cm** | **`× 100`** on every position → 1 voxel = 1 m in UE. (Without this a 30×30 map is 30 cm — toy-sized. This is non-optional.) |
| prop rotation | `rotY` radians (Y-yaw) | `FRotator` Yaw degrees | `ue.yaw = degrees(three.rotY)` (then apply the Z-up sign convention; verify sign in-engine on the round-trip). Pitch/Roll = 0 in v2. |
| spawn yaw | `spawnYaw` radians | `PlayerStart` Yaw degrees | same as prop yaw. |
| scale | uniform scalar | `FVector` scale3d | uniform `(s,s,s)`. |

**Rule:** the manifest is emitted **already in UE space** (conversion done in TS at export). The UE Python script applies transforms raw — it must NOT re-convert. This is the exact trap M3 flagged: glTF auto-converted by UE's importer + manifest transforms applied raw = props misaligned with geometry. Manifest-primary (D2) means there is no glTF geometry to mis-convert against — one source of truth.

## `lore-placement.json` schema (manifest-primary model, D2-recommended)
```ts
{
  manifestVersion: 1,
  coordinateSpace: "ue5-zup-cm",     // explicit, so the UE script never guesses
  sourceMap: { name, seed, exportedAt },
  greybox: [ { x, y, z, blockType } ],          // UE-space cm; UE rebuilds via HISMC per blockType
  props:   [ { assetId, x, y, z, yawDeg, scale } ],  // UE-space; assetId → /Game/LORE/Props/{assetId}
  zones:   [ { id, name, kind, x, z, width, depth, color, heightCm: 1000 } ],  // extruded volumes
  spawn:   { x, y, z, yawDeg }
}
```

## UE5 import script contract
- Entry: a Python script (`import_lore_map.py`) run via UE's Python plugin (EditorScriptingUtilities + Python enabled — note this prereq), `unreal.SystemLibrary`-style, takes `--manifest <path>`.
- Greybox: one `StaticMesh` cube + one `HISMC` per `blockType`; add an instance per `greybox[]` entry.
- Props: for each, resolve `/Game/LORE/Props/{assetId}`; if missing → **log + skip (don't abort)**; else spawn at transform.
- Zones → `AVolume` (or chosen subclass) sized `width×depth×heightCm`; `kind` written as an actor tag.
- Spawn → move/create `APlayerStart` at transform.
- **Round-trip validation (pass criterion):** open empty UE5 project → run script → assert (a) `HISMC` instance count == `greybox.length`, (b) spawned prop actor count == resolvable `props.length`, (c) each prop actor location within ε of the manifest transform, (d) zone count == `zones.length`. Manual checklist acceptable for v1; headless-UE automation is a stretch goal.

## 1B gates
- All of 1A's gates + the round-trip validation above passes in the chosen UE version.
- M3 refute-first on the FINAL 1B contract (with the real UE script embedded) before merge; Ren gate-of-record.

---

## Verification gaps still open (Ren to close before 1B build)
- A **UE 5.5** project to round-trip against (OPEN-1 version resolved; the project itself may need standing up).
- (D2 resolved → manifest-primary; the `EXT_mesh_gpu_instancing` / GLTFExporter-InstancedMesh risk is now moot — no geometry export.)
