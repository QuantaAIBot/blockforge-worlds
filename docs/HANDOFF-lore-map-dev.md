# BlockForge Worlds → LORE Map Development — Handoff Spec v1

**Author:** Ren (CTO) · **Date:** 2026-06-18 · **Builder:** Codex · **Verifiers:** Ren + M3
**Repo:** `QuantaAIBot/blockforge-worlds` (`2f79f4c` "Initial BlockForge Worlds prototype")

## Purpose
This repo is the foundation for **LORE map development**: the in-browser block-map forge that
authors `.bfworld.json` maps which feed the LORE runtime. This spec hands the next phase to Codex,
gated by Ren + M3 review.

---

## Verified current state (Ren, 2026-06-18 — ran it, did not trust the report)
- **Stack:** React 19 + TS + Vite 8 + Three.js + Capacitor(Android). `src/world.ts` (222L map/schema/noise) + `src/App.tsx` (710L UI + scene + tools + I/O).
- **`npm run build` → exit 0** (1769 modules, `dist/` = 744 kB JS / 200 kB gzip).
- **`npm run lint` → exit 0** (ESLint clean).
- **Code review:** forge logic, tool semantics (paint-on-normal / raise / lower / erase / spawn), save/load, JSON export/import, base64 share-code round-trip, and raycast→`instanceId`→voxel mapping are all correct. Seeded noise deterministic. Renderer set up once (refs avoid rebuild-on-state-change).
- **NOT verifiable on VPS (honest gaps):** `android:debug` (needs the Windows Android SDK); the Playwright "nonblank canvas" check (**harness is not committed** — `playwright`+`pngjs` are in devDeps but no spec/config/script in the repo).

---

## PHASE 0 — Harden + make verification reproducible (DO FIRST; no LORE input needed)

**T0.1 — Commit the Playwright canvas-pixel harness.**
The headline verification (proves Three.js renders pixels, not just compiles) lives only on Drew's
machine. Commit a `tests/visual/*.spec.ts` + a `test:visual` npm script that: launches the built
app, screenshots at **1440** (desktop) and **375** (mobile) viewports, and asserts the canvas has
**non-uniform, non-blank pixels** (sample N pixels via pngjs; fail if all equal / all background).
*Acceptance:* a fresh clone → `npm i && npm run build && npm run test:visual` passes; deliberately
blanking the canvas makes it FAIL (prove the check is binding, not a tautology).

**T0.2 — Fix import robustness (two real crash paths on malformed/foreign maps).**
- `isWorldMap` (App.tsx:699) does not validate `zones`. A valid-looking map missing `zones` passes
  the guard then crashes render (`world.zones.map`, line 279) + `addZones`. Add `Array.isArray(value.zones)`.
- `blocksByType` (line 495) assumes every `block.type` ∈ the 9 known types; an unknown type throws
  `undefined.push`. Reject (or coerce/drop) unknown block types during import validation.
*Acceptance:* importing JSON that (a) omits `zones` or (b) carries an unknown block type shows the
"Import failed" notice — no white-screen crash. Add a test fixture for each.

**T0.3 — One-command verification.** Add `npm test` (or `verify`) chaining `build` + `lint` +
`test:visual`. No cost-incurring CI — **GitHub Actions are disabled fleet-wide**; keep verification
as local npm scripts the reviewer runs.

---

## PHASE 1 — Repo foundation for LORE (light; some needs Drew input)
- README: state the LORE purpose + the map→runtime pipeline. Branch namespace `<agent>/<topic>`.
- **Map schema versioning:** LORE will add fields → define the `schemaVersion` bump + migration
  rule now (forward-compat import: unknown fields preserved, missing fields defaulted).
- **First LORE exporter:** the schema already carries `zones[{kind}]` (safehouse/market/race/mission).
  Write `.bfworld.json → <LORE target>` once the target is decided (see Q1).

## PHASE 2 — LORE map-dev features (BLOCKED on the open questions below)
Scope TBD on LORE direction. Likely candidates pending answers: larger/chunked maps, multi-layer,
entity/prop/NPC placement, mission/region scripting hooks, biomes, asset pipeline.

---

## OPEN QUESTIONS for Drew (these gate Phase 1–2 scope — I won't invent LORE canon)
1. **What is the LORE target runtime?** The README lists our-own-runtime / UEFN / FiveM / Godot /
   Unreal / Blender. Which one does LORE export to (or is LORE its own runtime)? → drives the exporter.
2. **What map-dev features does LORE need** beyond today's forge? (entities/NPCs/items? mission or
   region scripting? biomes? multi-layer? co-editing?)
3. **Zone taxonomy:** are safehouse/market/race/mission the LORE canon, or placeholders? What's the
   real LORE region/zone vocabulary?
4. **Map scale:** current is 30×30 (~900 blocks). LORE target size? → decides whether Phase 2 needs
   the perf rework (incremental scene/instance updates instead of today's full-rebuild-per-edit).
5. **Asset pipeline:** blocks-only, or LORE-specific models/textures/props?
6. **Build routing:** Codex on the laptop, or fleet `codex exec` on the VPS?

---

## Verification gates (every phase)
- **build + lint green** + (once committed) the **Playwright visual gate is a merge gate**.
- **Ren + M3 review before merge.** This spec itself goes through **M3 refute-first** before Codex
  starts (per fleet orchestrate-mode), once the open questions above are answered enough to scope it.

## Notes
- `android:debug` is Windows-SDK-bound; keep APK builds on Drew's machine / the desktop Codex node.
- Bundle is one 744 kB chunk (Three.js); code-split later, not now.
- `escape`/`unescape` in the share-code path are deprecated (functional) — swap to TextEncoder when convenient.
