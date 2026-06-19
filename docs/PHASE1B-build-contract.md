# Phase 1B — UE5 exporter — Build Contract

**Author:** Ren (CTO, gate-of-record) · **Date:** 2026-06-19 · **Builder:** Codex · **Reviewers:** M3 + Ren
**Builds on:** `docs/PHASE1-build-contract-v3.md` (decisions locked: **UE 5.5**, **manifest-primary**). Phase 1A is merged (PR #4).

## Verification split (READ FIRST — this determines what "done" means)
1B has two parts with **different verifiability**:
- **1B-forge** (TypeScript: the "Export for UE5" button + the coordinate conversion + the manifest emitter). **Headless-buildable + unit-testable** on the VPS, exactly like 1A. Ren gates fully (build/lint/unit).
- **1B-ue** (`import_lore_map.py`, the UE 5.5 Editor Python import script + the round-trip). The script is **authorable + M3-reviewable + code-reviewable now**, but its pass-criterion (round-trip into an empty UE 5.5 project) can **ONLY be validated in UE 5.5 (Windows + GPU + GUI + Python EditorScripting plugin) — i.e. Drew's laptop.** It is NOT closable headless. Do not claim the UE round-trip works until it has actually run in-engine.

## Coordinate contract (Three.js → UE5) — arithmetic locked; CHIRALITY resolved at round-trip
**Implement as ONE named function with the axis map as a single, one-line-flippable constant** — because the chirality (mirror) question below is genuinely contested and the in-engine round-trip is the only ground truth. Make flipping it a one-line change, not a hunt.

Default map (axis swap Y↔Z), scale ×100 (1 unit = 1 m → cm):
```
UE.X = three.x * 100
UE.Y = three.z * 100
UE.Z = three.y * 100
```

**CHIRALITY — do NOT claim this is "the correct handedness flip" (the prior spec did; that was an overclaim, M3 B3).** `det(M) = -1` proves only that the map is *orientation-reversing*. Whether that yields a *non-mirrored* world in UE is contested by two valid-looking analyses:
- (change-of-basis) re-expressing the same physical points from a RH basis into a LH basis is an orthogonal change of basis with `det = -1`, and a change of basis never mirrors the object → the `det=-1` swap is correct.
- (reflection) `det = -1` is a reflection across Y=Z, which mirrors asymmetric geometry → you need a proper rotation (`det=+1`) via a negated axis.
These conflict. **Resolution is EMPIRICAL, at the laptop round-trip, with an ASYMMETRIC test prop** (a mesh with readable "FRONT" text or an L-shape). If it imports mirrored, switch to the `det=+1` variant by negating one swapped axis — **`UE.Y = -three.z * 100`** (the documented one-line flip). For axis-aligned greybox cubes the mirror is invisible either way; it only matters for asymmetric props — which is exactly why the round-trip must use one.

**FORWARD direction (M3 B2 — pin it):** the default map puts Three's forward (−Z) onto UE +Y (right). For a greybox there is no inherent north, so this is cosmetic, but make it deliberate: documented default = "Three −Z → UE +Y." If design later wants player-forward = UE +X, that's a different map; note it but don't build it now.

**Unit-test vectors (assert the ARITHMETIC of the default map — these are deterministic regardless of the chirality debate):**
| three (x,y,z) | UE (X,Y,Z) cm | checks |
|---|---|---|
| (0,0,0) | (0,0,0) | origin |
| (1,0,0) | (100,0,0) | +x→+X, scale |
| (0,1,0) | (0,0,100) | **up: three-Y → UE-Z** |
| (0,0,1) | (0,100,0) | three-Z → UE-Y |
| (-9,0,5) | (-900,500,0) | sign + swap |
| (5.0526,6,5.0526) | (505.26,505.26,600) | continuous prop coord |
Scale sanity (assert): a 30-unit span → 3000 cm = **30 m** in UE (NOT 0.3 m). The ×100 is non-optional.

**Yaw:** `yawDeg = -degrees(rotY)` — **derived** (Three yaw about +Y → UE yaw about +Z; the orientation-reversal flips the sense), not "pending" (M3 B4). Assert it in the forge unit tests (rotY=π/2 → -90). The round-trip keeps it as a regression check. Pitch/Roll = 0 in v2. NOTE: if the chirality flip above changes the map, re-confirm the yaw sign with it.

**Rule (the M3-flagged trap):** the manifest is emitted **already in UE space** (conversion done in TS at export). The UE Python script applies transforms **RAW** — it must NOT re-convert. Manifest-primary (no glTF geometry export) means there is no second coordinate source to mis-align against.

---

## T1B.1 — Forge "Export for UE5" (TypeScript; headless-verifiable)
- New button "Export for UE5" (next to the existing JSON Export) → downloads `lore-placement.json`.
- Add `src/ueExport.ts` with a pure function `toUePlacement(world: WorldMap): UePlacement` (pure = unit-testable, no DOM). Schema:
```ts
interface UePlacement {
  manifestVersion: 1
  coordinateSpace: "ue5-zup-cm"        // explicit; UE script asserts this string
  sourceMap: { name: string; seed: number; exportedAt: string }
  greybox: { x: number; y: number; z: number; blockType: string }[]   // UE-space cm
  props:   { assetId: string; x: number; y: number; z: number; yawDeg: number; scale: number }[]  // UE-space
  zones:   { id: string; name: string; kind: string; x: number; z: number; width: number; depth: number; color: string; heightCm: number }[]
  spawn:   { x: number; y: number; z: number; yawDeg: number }
}
```
  - `greybox`: every voxel → `{ ...convert(x,y,z), blockType: type }`. (Zones keep x/z as ground-plane UE cm via the same scale; width/depth ×100; `heightCm` default 1000.)
  - `props`: each `PropPlacement` → converted position + `yawDeg = -degrees(rotY)` + `scale`.
  - `spawn`: converted + `yawDeg = -degrees(spawnYaw)`.
- **Unit tests (`src/ueExport.test.ts`, binding):** (a) every coordinate vector in the table above; (b) the 30-unit→30 m scale assertion; (c) a small full-map fixture (2 blocks + 1 prop + 1 zone + spawn) → assert the exact `UePlacement` object incl. `coordinateSpace: "ue5-zup-cm"` and counts; (d) a prop at `rotY = π/2` → `yawDeg = -90`.
- Gates: `npm run build`/`lint`/`test:unit` green.

## T1B.2 — UE 5.5 import script (`ue/import_lore_map.py`; authored now, round-trip is laptop-only)
- Entry: run inside UE 5.5 Editor (Python plugin enabled). Reads `--manifest <path>` (or a hardcoded dev path fallback). **Assert `manifest.coordinateSpace == "ue5-zup-cm"`; abort with a clear error otherwise** (guards against feeding a raw/forge-space file).
- Greybox: one cube `StaticMesh` + one `HISMC` per distinct `blockType`; add an instance per `greybox[]` entry at its transform (applied RAW). (A basic engine cube `/Engine/BasicShapes/Cube` is fine for greybox; per-blockType material optional.)
- Props: for each, resolve `/Game/LORE/Props/{assetId}`; **missing → `unreal.log_warning` + skip (never abort the whole import)**; else spawn a `StaticMeshActor` at `(x,y,z)`, yaw `yawDeg`, uniform scale.
- Zones → `unreal.AVolume` (or a documented subclass) sized `width×depth×heightCm`; write `kind` as an actor tag.
- Spawn → place/move an `APlayerStart` at the transform.
- **Round-trip pass criteria (LAPTOP, UE 5.5):** open empty project → run script → assert (a) HISMC instance count == `greybox.length`; (b) spawned prop-actor count == count of resolvable assetIds; (c) each prop actor location within ε (1 cm) of the manifest; (d) a known-yaw prop returns at the expected yaw (**confirms the yaw sign**); (e) zone-actor count == `zones.length`; (f) **CHIRALITY: place one ASYMMETRIC test prop (readable "FRONT" text or an L-shape); confirm it is NOT mirrored in the editor viewport** — if mirrored, apply the one-line `UE.Y = -three.z` flip and re-run (this is the empirical resolution of the det=±1 debate). Position-match ε = Euclidean ≤ 1 cm. Manual checklist acceptable for v1.

## Build routing for this phase
- **1B-forge:** Codex headless (build + report only); Ren gates fully + opens the PR (same as 1A).
- **1B-ue:** Codex authors `ue/import_lore_map.py` in the same pass; Ren + M3 code-review it; the **round-trip validation is a separate laptop step** (Drew / laptop-Codex on UE 5.5). The PR ships the forge (verified) + the UE script (authored, round-trip-pending) with the laptop step called out explicitly — NOT marked done until the round-trip runs.

## M3 gate — folded fixes (binding; these resolve the NOT-READY verdict)
**Forge (TS) — must be in the emitter + tests:**
- **B7/G1 — `blockType` is the 9-value union, not `string`:** type `UePlacement.greybox[].blockType` as the `BlockType` union (import from `src/world.ts`); add a unit test asserting every emitted `blockType` ∈ the known set.
- **B9 — `exportedAt` = ISO 8601 UTC** (`new Date().toISOString()`).
- **B6 — name the constant:** `ZONE_DEFAULT_HEIGHT_CM = 1000` (shared/duplicated with the UE script, commented as must-match).
- **B8 — `manifestVersion: 1` literal** (TS catches typos); the UE script asserts it (below).
- Yaw unit test (rotY=π/2 → -90) per above.

**UE script (`ue/import_lore_map.py`) — must be in the contract Codex writes:**
- **B5 — spawnable class:** use `unreal.BlockingVolume` (`ABlockingVolume`), NOT abstract `AVolume`.
- **B8 — guard:** assert `manifest["manifestVersion"] == 1` AND `manifest["coordinateSpace"] == "ue5-zup-cm"`; abort with a clear error otherwise.
- **G2 — asset resolution:** `unreal.EditorAssetLibrary.does_asset_exist(f"/Game/LORE/Props/{assetId}")` (case-sensitive; exact path, no fuzzy/sub-asset guessing); missing → `unreal.log_warning` + skip.
- **G4 — zone `kind` → tags:** `actor.tags = [unreal.Name(t) for t in kind.split("_")]` (pin underscore as delimiter).
- **G5 — spawn:** if a PlayerStart tagged `LORE_Spawn` exists, move it; else create one and tag it `LORE_Spawn`.
- **G6/G7 — transforms applied RAW:** `FRotator(pitch=0, yaw=yawDeg, roll=0)`; `FVector(scale, scale, scale)`.
- **G8 — cube origin:** `/Engine/BasicShapes/Cube` is 100³ cm centered; the manifest (x,y,z) IS the cube center (HISMC instance relative location = the manifest point, no half-cube offset).
- **G9 — zone vertical:** zone Y is the CENTER; the volume spans `Y ∈ [y - heightCm/2, y + heightCm/2]`.
- **G10 — idempotent re-import:** before importing, remove all actors tagged `LORE_*` (so re-runs don't accumulate).
- **B10 — round-trip ε:** position match = **Euclidean distance ≤ 1 cm**.

## HARD guardrails (Codex)
Build + report ONLY: no push / no PR / no fleet-msg / no deploy / no touching anything outside this repo. Commit to a local branch `ren/phase1b-impl`. Author the UE script under `ue/`. Final report: files, verbatim build/lint/test output, the coordinate-test results, deviations, anything incomplete.

## Open (Ren to route)
- UE 5.5 availability on Drew's laptop + whether a target UE project exists (needed only for the 1B-ue round-trip, not for the forge build or the script authoring).
