# LORE 1B — UE 5.5 round-trip runbook

This is the **laptop-only** validation step for Phase 1B (UE 5.5 + GUI required; cannot run on the
headless VPS). It validates `ue/import_lore_map.py` against a committed deterministic fixture and
resolves the two open questions: the **yaw sign** and the **chirality/forward** orientation.

**Executor:** laptop-Codex (preferred — most checks are programmatic) or Drew manually.
**Inputs (in this repo):** `ue/import_lore_map.py`, `ue/test-fixtures/roundtrip-manifest.json`,
`public/lore-assets/{crate,barrel,tree}.glb`.

---

## 0. Prereqs (once)
1. UE 5.5 installed (confirmed on the laptop).
2. New or existing **empty** UE 5.5 project. Enable **Edit → Plugins → "Python Editor Script Plugin"** + **"Editor Scripting Utilities"**, restart the editor.
3. This repo cloned on the laptop (Phase 1B is on `main`).

## 1. Import the LORE prop assets (one-time)
Import `public/lore-assets/crate.glb` (and `barrel.glb`, `tree.glb`) into the project's Content Browser so the resulting **StaticMesh** lands at exactly:
- `/Game/LORE/Props/crate`  ← required for this fixture (case-sensitive, exact name)
- `/Game/LORE/Props/barrel`, `/Game/LORE/Props/tree` (optional, for later)

(glTF import: drag into a `Content/LORE/Props` folder; rename the imported mesh asset to `crate` if the importer prefixes it, e.g. `SM_crate` → `crate`. The importer resolves `/Game/LORE/Props/{assetId}`.)

## 2. Run the importer against the fixture
In the editor **Output Log → Cmd: `py`** (or `Tools → Execute Python Script`):
```
py "<repo>/ue/import_lore_map.py" --manifest "<repo>/ue/test-fixtures/roundtrip-manifest.json"
```
(Or headless commandlet: `UnrealEditor-Cmd.exe "<.uproject>" -run=pythonscript -script="<repo>/ue/import_lore_map.py -- --manifest <repo>/ue/test-fixtures/roundtrip-manifest.json"`.)

## 3. Validate — expected values are pinned by the fixture (T1B.2 a–f)
The fixture is an **L-shaped greybox** (long arm +X, foot +Y), a 2nd block type up in +Z, a prop at yaw, a zone, a spawn. Expected UE results:

| # | Check | Expected |
|---|---|---|
| a | HISMC instance total / actor count | **5 instances across 2 HISMC actors** — `LORE_Greybox_grass` (4 instances) + `LORE_Greybox_brick` (1) |
| a | grass instance locations (cm) | (0,0,0), (100,0,0), (200,0,0), (0,100,0) |
| a | brick instance location | (0,0,100) — up in +Z |
| b | prop actors | **1** — `LORE_Prop_crate` (only if `/Game/LORE/Props/crate` exists; else log_warning + skip → 0) |
| c | crate actor location | within **Euclidean ≤ 1 cm** of **(200, 0, 0)** |
| d | crate actor **yaw** | **≈ -90°** (confirms the `yawDeg = -degrees(rotY)` sign; rotY was π/2) |
| e | zone BlockingVolume | **1** — `LORE_Zone_z1`, center (150, 100, 500), scale (1.5, 1, 5), tagged `safehouse` |
| e | spawn | 1 `PlayerStart` tagged `LORE_Spawn` at (0,0,0), yaw 0 |
| f | **chirality / forward** | The grass **L** must read the same handedness as in the forge: long arm along **+X**, foot along **+Y**. If the foot points along **−Y** (mirrored), the world is flipped — see remediation below. |

### Programmatic assertion (laptop-Codex — paste into the same Python run)
```python
import unreal, json, math
M = json.load(open(r"<repo>/ue/test-fixtures/roundtrip-manifest.json"))
acts = unreal.EditorLevelLibrary.get_all_level_actors()
his = [a for a in acts if any(str(t)=="LORE_Greybox" for t in a.tags)]
inst = sum(c.get_instance_count() for a in his for c in a.get_components_by_class(unreal.HierarchicalInstancedStaticMeshComponent))
props = [a for a in acts if any(str(t)=="LORE_Prop" for t in a.tags)]
zones = [a for a in acts if any(str(t)=="LORE_Zone" for t in a.tags)]
print("a instances:", inst, "expect", len(M["greybox"]))
print("e zones:", len(zones), "expect", len(M["zones"]))
for p in props:
    loc = p.get_actor_location(); rot = p.get_actor_rotation()
    exp = M["props"][0]
    d = math.dist((loc.x,loc.y,loc.z),(exp["x"],exp["y"],exp["z"]))
    print("c prop dist(cm):", round(d,3), "<=1 ?", d<=1.0, "| d yaw:", round(rot.yaw,2), "expect", exp["yawDeg"])
```

## 4. Remediation if a check fails
- **(f) mirrored** (foot points −Y, or text on an asymmetric prop reads backwards): apply the one-line flip in `src/ueExport.ts` — change `THREE_TO_UE_CM.yFromZ` from `100` to `-100` (this is the documented `UE.Y = -three.z` chirality flip). Re-run `npx tsx ue/test-fixtures/gen-fixture.ts`, re-export, re-import. Re-confirm (c)/(d) too (the yaw sign may flip with it).
- **(d) yaw wrong sign**: if the crate faces +90 instead of -90, flip the sign in `toYawDeg` (`src/ueExport.ts`). (Derivation says -90; this is the in-engine regression confirm.)
- **(b/c) prop missing**: ensure `/Game/LORE/Props/crate` exists (step 1) — the importer skips (logs warning) if absent; that's by design, not a bug.

## 5. Report back (to Ren)
Per-check pass/fail (a–f), the programmatic-assert output, one viewport screenshot showing the L + the crate, and whether any remediation (flip) was applied. Ren gates the result and, if a flip was needed, lands it as a one-line PR.
