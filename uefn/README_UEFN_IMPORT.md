# LORE UEFN Import

## Status

V1 fixture only. This package uses runtime SpawnProp for 6 small-fixture prop spawns. UEFN currently limits runtime spawning to 100 props per script device / 200 total per island. Real-map scaling is an OPEN DESIGN ITEM and must move to editor-time generation, Scene Graph/prefab assembly, or combined meshes before this becomes the production map pipeline.

## Package Files

- uefn/lore-placement.json: original manifest, preserved as source of truth.
- uefn/lore_placement_data.verse: generated placement rows compiled from the manifest.
- uefn/lore_blockout_device.verse: generated fixture device that calls SpawnProp.
- uefn/README_UEFN_IMPORT.md: this manual UEFN runbook.

## Manual UEFN Steps

1. Create or open a blank UEFN island project.
2. Import GLBs into /Content/LORE/Imported using Interchange. For the fixture, import the LORE block meshes plus public/lore-assets GLBs such as crate.glb.
3. Save All after import.
4. Convert each imported mesh that will be spawned with Verse to a Fortnite prop using convert-to-prop: right-click Static Mesh -> Scripted Asset Actions -> Convert to Prop.
5. Add lore_placement_data.verse and lore_blockout_device.verse to the project Verse files.
6. Build Verse so lore_blockout_device appears in the UEFN content browser.
7. Place one lore_blockout_device in the level.
8. Bind @editable slots on the device to the converted prop assets listed below.
9. Launch session and verify the spawned blockout. The roundtrip fixture should show five greybox blocks and one crate at x=200, y=0, z=0, yaw=-90.

## Editable Bindings

| Slot | Manifest key | Import note |
| --- | --- | --- |
| BlockGrassAsset | block:grass | Grass |
| BlockBrickAsset | block:brick | Brick |
| PropCrateAsset | prop:crate | Crate (./lore-assets/crate.glb) |

## Warnings And Preserved Metadata

- 1 zone(s) are preserved in lore-placement.json and README metadata; v1 does not create UEFN gameplay volumes.
- Spawn is preserved for manual UEFN player spawner placement: x=0, y=0, z=0, yaw=0.

## Scale Handling

Non-1 scale is recorded but not applied by the v1 SpawnProp fixture path. Do not block export on scale; use pre-baked asset variants or an editor-time assembly path later.

- None.

## Zones Preserved

Zones are preserved in lore-placement.json and this README. V1 does not create UEFN gameplay volumes.

- z1: Zone One (safehouse) x=0, z=0, width=300, depth=200, heightCm=1000

## Spawn Preserved

Place a player spawner manually at x=0, y=0, z=0, yaw=0.

## Source

- Map: RoundTrip-Fixture
- Seed: 1
- Exported: 2026-06-19T02:42:05.196Z
- Coordinate space: ue5-zup-cm
