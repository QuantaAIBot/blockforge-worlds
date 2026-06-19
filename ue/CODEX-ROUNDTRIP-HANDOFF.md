# Codex handoff — execute the LORE 1B UE round-trip (laptop; UE 5.8 installed)

You are Codex on Drew's laptop, where **Unreal Engine 5.8 is installed** (the importer/runbook were
authored against UE 5.5 — see the version-drift note below). Task: run the BlockForge→LORE
Phase 1B UE round-trip validation and report results. This is the one step that can't run on the
fleet VPS (needs the UE editor). Ren (CTO, VPS) authored the importer + runbook + fixture and gates
your result. Cold-start context — everything you need is below + in the repo.

## STEP 0 — verify the install (it's tripped us once)
Confirm the engine binary actually exists before anything else, e.g.:
`Get-ChildItem -Path I:\,C:\,H:\ -Recurse -Filter UnrealEditor.exe -ErrorAction SilentlyContinue -Depth 6 | Select FullName`
(or check Epic's `LauncherInstalled.dat`). Report the exact `...\Engine\Binaries\Win64\UnrealEditor.exe` path you'll use. If it's not found, STOP and report — don't proceed.

## ⚠️ UE 5.8 version drift (importer was written for 5.5)
`ue/import_lore_map.py` uses `unreal.EditorLevelLibrary` + `unreal.EditorAssetLibrary`. Across 5.5→5.8
these are progressively deprecated in favor of **subsystems**. If you hit `AttributeError`/deprecation:
- `EditorLevelLibrary.get_all_level_actors / spawn_actor_from_class / destroy_actor` → `unreal.get_editor_subsystem(unreal.EditorActorSubsystem)` equivalents.
- `EditorAssetLibrary.does_asset_exist / load_asset` → `unreal.get_editor_subsystem(unreal.EditorAssetSubsystem)` (or `EditorAssetLibrary` may still work).
Apply the minimal swap to make it run on 5.8, **keep the logic identical**, note every change, and (per the remediation section) commit to `codex/lore-roundtrip-fix` + push (do NOT merge). Ren reviews the diff.

## Setup (in your `blockforge-worlds` clone)
```
git fetch origin
git checkout ren/lore-roundtrip-runbook    # has the importer, runbook, fixture, hardening (PR #7; not yet on main)
```
Key files:
- `ue/ROUND-TRIP-RUNBOOK.md` — **the full procedure; follow it.** Detail lives here.
- `ue/import_lore_map.py` — the importer you'll run inside UE 5.8 (see version-drift note).
- `ue/test-fixtures/roundtrip-manifest.json` — the deterministic input (already in UE-space cm).
- `public/lore-assets/crate.glb` — the prop asset to import.

## What to do (the runbook has step-by-step; this is the spine)
1. UE 5.8: enable **Python Editor Script Plugin** + **Editor Scripting Utilities**; open an empty project.
2. Import `public/lore-assets/crate.glb` so the resulting **StaticMesh is at exactly `/Game/LORE/Props/crate`** (case-sensitive; rename if the importer prefixes it). Script it via `unreal.AssetImportTask` or do it in the Content Browser — your call. (If you genuinely can't get the prop asset in, the greybox/zone/chirality checks still validate — but the **yaw** check needs `crate`, so get it in if you can.)
3. Run the importer against the fixture (editor `py` cmd or `-run=pythonscript` commandlet):
   `import_lore_map.py --manifest ue/test-fixtures/roundtrip-manifest.json`
4. Run the **programmatic assertion** snippet from §3 of the runbook (counts/positions/yaw).

## The two questions this resolves (the whole point)
- **Yaw sign:** the crate (placed at `rotY=π/2`) must come back at **yaw ≈ -90°**. (Confirms `yawDeg=-degrees(rotY)`.)
- **Chirality / mirror:** the grass **L** must read long-arm-along-**+X**, foot-along-**+Y** (matching the forge). If the foot points **−Y**, the world is mirrored.

## Expected UE values (pinned by the fixture)
- 2 HISMC actors: `LORE_Greybox_grass` (4 instances) + `LORE_Greybox_brick` (1) → **5 instances total**.
- grass instances at (0,0,0),(100,0,0),(200,0,0),(0,100,0); brick at (0,0,100).
- 1 prop `LORE_Prop_crate` at **(200,0,0)** (Euclidean ≤1 cm), **yaw ≈ -90**.
- 1 `LORE_Zone_z1` BlockingVolume, center (150,100,500), scale (1.5,1,5), tagged `safehouse`.
- 1 `PlayerStart` tagged `LORE_Spawn` at (0,0,0), yaw 0.

## Remediation (only if a check fails) — apply, RE-CONFIRM in-engine, then report
- **Mirrored (f):** in `src/ueExport.ts` change `THREE_TO_UE_CM.yFromZ` from `100` → `-100` (the documented `UE.Y = -three.z` flip). Then regenerate + re-run: `npx tsx ue/test-fixtures/gen-fixture.ts`, re-import, re-validate (c)/(d) too (yaw may flip with it).
- **Yaw wrong sign (d):** flip the sign in `toYawDeg` in `src/ueExport.ts`. Regenerate + re-run.
- If you applied a fix and re-confirmed it works in-engine: commit to a branch **`codex/lore-roundtrip-fix`**, **push it, do NOT merge** (Ren reviews the one-line diff + lands the PR).

## Report back (print clearly for Drew to relay to Ren; do NOT merge anything)
1. Per-check pass/fail: (a) instances=5, (b) prop count, (c) crate pos within 1cm, (d) **yaw value**, (e) zone count, (f) **chirality: mirrored? yes/no + which way the L foot points**.
2. The verbatim output of the programmatic-assertion snippet.
3. One viewport screenshot showing the L + the crate (path or attach).
4. Whether any remediation flip was applied + which + the branch name if pushed.
5. UE 5.8 Python API gotchas hit + every deprecation swap you made (so the importer can be hardened), if any.

Guardrails: round-trip validation + (optional) the documented one-line flip only. No merges, no other repos, no unrelated changes. Branch is parked correctly; the blocker was always this in-engine step.
