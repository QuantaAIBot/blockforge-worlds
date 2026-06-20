import { describe, expect, it } from 'vitest'
import assetCatalogJson from '../public/lore-assets/catalog.json'
import roundtripManifestJson from '../ue/test-fixtures/roundtrip-manifest.json'
import type { AssetDescriptor } from './world'
import type { UePlacement } from './ueExport'
import {
  createUefnExportPackage,
  UEFN_EXPORT_PATHS,
  UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE,
  UEFN_RUNTIME_PROP_LIMIT_PER_ISLAND,
} from './uefnExport'

const roundtripManifest = roundtripManifestJson as UePlacement
const assetCatalog = assetCatalogJson as AssetDescriptor[]

describe('createUefnExportPackage', () => {
  it('creates the expected UEFN package files from the roundtrip manifest fixture', () => {
    const uefnPackage = createUefnExportPackage(roundtripManifest, assetCatalog)

    expect(Object.keys(uefnPackage.files)).toEqual([...UEFN_EXPORT_PATHS])
    expect(JSON.parse(uefnPackage.files['uefn/lore-placement.json'])).toEqual(roundtripManifestJson)
    expect(uefnPackage.stats).toMatchObject({
      greyboxCount: 5,
      propCount: 1,
      runtimeSpawnCount: 6,
      assetBindingCount: 3,
      scaledPropCount: 0,
      zoneCount: 1,
    })
  })

  it('generates Verse data rows with manifest positions, asset keys, and yaw', () => {
    const uefnPackage = createUefnExportPackage(roundtripManifest, assetCatalog)
    const dataVerse = uefnPackage.files['uefn/lore_placement_data.verse']

    expect(dataVerse).toContain('lore_asset_key := enum:')
    expect(dataVerse).toContain('block_grass')
    expect(dataVerse).toContain('block_brick')
    expect(dataVerse).toContain('prop_crate')
    expect(dataVerse).toContain('Position := vector3{X := 200.0, Y := 0.0, Z := 0.0}')
    expect(dataVerse).toContain('YawDeg := -90.0')
    expect(dataVerse).toContain('Label := "prop:crate"')
  })

  it('generates a fixture device with editable prop bindings and SpawnProp placement', () => {
    const uefnPackage = createUefnExportPackage(roundtripManifest, assetCatalog)
    const deviceVerse = uefnPackage.files['uefn/lore_blockout_device.verse']

    expect(deviceVerse).toContain('BlockGrassAsset : creative_prop_asset = DefaultCreativePropAsset')
    expect(deviceVerse).toContain('BlockBrickAsset : creative_prop_asset = DefaultCreativePropAsset')
    expect(deviceVerse).toContain('PropCrateAsset : creative_prop_asset = DefaultCreativePropAsset')
    expect(deviceVerse).toContain('MakeRotationFromYawPitchRollDegrees(Row.YawDeg, 0.0, 0.0)')
    expect(deviceVerse).toContain('SpawnProp(Asset, Row.Position, Rotation)')
    expect(deviceVerse).toContain('Print("LORE blockout fixture spawning 6 prop(s) from RoundTrip-Fixture")')
    expect(deviceVerse).not.toContain('from "RoundTrip-Fixture"')
  })

  it('makes the UEFN human handoff explicit in the generated README', () => {
    const uefnPackage = createUefnExportPackage(roundtripManifest, assetCatalog)
    const readme = uefnPackage.files['uefn/README_UEFN_IMPORT.md']

    expect(readme).toContain('V1 fixture only')
    expect(readme).toContain(
      `100 props per script device / ${UEFN_RUNTIME_PROP_LIMIT_PER_ISLAND} total per island`,
    )
    expect(readme).toContain('Real-map scaling is an OPEN DESIGN ITEM')
    expect(readme).toContain('Import GLBs')
    expect(readme).toContain('convert-to-prop')
    expect(readme).toContain('Bind @editable slots')
    expect(readme).toContain('five greybox blocks and one crate at x=200, y=0, z=0, yaw=-90')
    expect(readme).toContain('Place a player spawner manually at x=0, y=0, z=0, yaw=0')
    expect(readme).toContain('Zones are preserved in lore-placement.json')
  })

  it('warns and records non-1 scale without blocking generation', () => {
    const scaledManifest: UePlacement = {
      ...roundtripManifest,
      props: [{ ...roundtripManifest.props[0], scale: 1.25 }],
    }

    const uefnPackage = createUefnExportPackage(scaledManifest, assetCatalog)

    expect(uefnPackage.warnings).toContainEqual(
      expect.objectContaining({
        code: 'non_unit_scale',
        ids: ['crate'],
      }),
    )
    expect(uefnPackage.files['uefn/README_UEFN_IMPORT.md']).toContain('crate scale=1.25')
    expect(uefnPackage.files['uefn/lore_placement_data.verse']).toContain('prop_crate')
  })

  it('warns when a fixture exceeds documented runtime SpawnProp limits', () => {
    const overloadedManifest: UePlacement = {
      ...roundtripManifest,
      greybox: Array.from({ length: UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE + 1 }, (_, index) => ({
        x: index * 100,
        y: 0,
        z: 0,
        blockType: 'grass',
      })),
    }

    const uefnPackage = createUefnExportPackage(overloadedManifest, assetCatalog)

    expect(uefnPackage.warnings).toContainEqual(
      expect.objectContaining({
        code: 'runtime_spawn_prop_limit',
      }),
    )
    expect(uefnPackage.warnings.find((warning) => warning.code === 'runtime_spawn_prop_limit')?.message).toContain(
      `${UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE} props per script device`,
    )
  })
})
