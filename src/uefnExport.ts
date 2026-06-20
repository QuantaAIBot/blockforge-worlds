import { blockDefinitions, type AssetDescriptor, type BlockType } from './world.ts'
import type { UePlacement } from './ueExport'

export const UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE = 100
export const UEFN_RUNTIME_PROP_LIMIT_PER_ISLAND = 200

export const UEFN_EXPORT_PATHS = [
  'uefn/lore-placement.json',
  'uefn/lore_placement_data.verse',
  'uefn/lore_blockout_device.verse',
  'uefn/README_UEFN_IMPORT.md',
] as const

export type UefnExportPath = (typeof UEFN_EXPORT_PATHS)[number]

export type UefnExportWarningCode =
  | 'runtime_spawn_prop_limit'
  | 'non_unit_scale'
  | 'zones_preserved_metadata'
  | 'spawn_preserved_metadata'
  | 'unknown_asset_catalog'

export interface UefnExportWarning {
  code: UefnExportWarningCode
  message: string
  ids: string[]
}

export interface UefnExportStats {
  greyboxCount: number
  propCount: number
  runtimeSpawnCount: number
  assetBindingCount: number
  scaledPropCount: number
  zoneCount: number
}

export interface UefnExportPackage {
  files: Record<UefnExportPath, string>
  warnings: UefnExportWarning[]
  stats: UefnExportStats
}

type SourceKind = 'block' | 'prop'

interface AssetBinding {
  sourceKey: string
  sourceKind: SourceKind
  sourceId: string
  verseKey: string
  propertyName: string
  displayName: string
  catalogEntry?: AssetDescriptor
}

const SUPPORTED_MANIFEST_VERSION = 1
const SUPPORTED_COORDINATE_SPACE = 'ue5-zup-cm'
const FLOAT_PRECISION = 3
const SCALE_EPSILON = 0.0001
const knownBlockTypes = new Set<BlockType>(blockDefinitions.map((block) => block.type))
const blockLabels = new Map<BlockType, string>(blockDefinitions.map((block) => [block.type, block.label]))
const verseReservedWords = new Set([
  'array',
  'block',
  'class',
  'else',
  'enum',
  'false',
  'for',
  'if',
  'logic',
  'map',
  'option',
  'return',
  'set',
  'true',
  'var',
  'void',
])

export function createUefnExportPackage(
  placement: UePlacement,
  assetCatalog: readonly AssetDescriptor[] = [],
): UefnExportPackage {
  assertSupportedPlacement(placement)

  const bindings = createAssetBindings(placement, assetCatalog)
  const stats = createStats(placement, bindings)
  const warnings = collectWarnings(placement, bindings, assetCatalog, stats)

  return {
    files: {
      'uefn/lore-placement.json': `${JSON.stringify(placement, null, 2)}\n`,
      'uefn/lore_placement_data.verse': renderVerseData(placement, bindings),
      'uefn/lore_blockout_device.verse': renderVerseDevice(placement, bindings, stats),
      'uefn/README_UEFN_IMPORT.md': renderReadme(placement, bindings, warnings, stats),
    },
    warnings,
    stats,
  }
}

function assertSupportedPlacement(placement: UePlacement) {
  if (placement.manifestVersion !== SUPPORTED_MANIFEST_VERSION) {
    throw new Error(`Unsupported LORE placement manifestVersion: ${placement.manifestVersion}`)
  }

  if (placement.coordinateSpace !== SUPPORTED_COORDINATE_SPACE) {
    throw new Error(`Unsupported LORE placement coordinateSpace: ${placement.coordinateSpace}`)
  }

  const unknownBlockTypes = unique(
    placement.greybox.map((block) => block.blockType).filter((blockType) => !knownBlockTypes.has(blockType)),
  )

  if (unknownBlockTypes.length > 0) {
    throw new Error(`Unsupported LORE blockType values: ${unknownBlockTypes.join(', ')}`)
  }
}

function createStats(placement: UePlacement, bindings: readonly AssetBinding[]): UefnExportStats {
  return {
    greyboxCount: placement.greybox.length,
    propCount: placement.props.length,
    runtimeSpawnCount: placement.greybox.length + placement.props.length,
    assetBindingCount: bindings.length,
    scaledPropCount: scaledProps(placement).length,
    zoneCount: placement.zones.length,
  }
}

function createAssetBindings(placement: UePlacement, assetCatalog: readonly AssetDescriptor[]) {
  const catalogById = new Map(assetCatalog.map((asset) => [asset.id, asset]))
  const bindings = new Map<string, AssetBinding>()
  const usedVerseKeys = new Set<string>()

  const addBinding = (sourceKind: SourceKind, sourceId: string) => {
    const sourceKey = `${sourceKind}:${sourceId}`

    if (bindings.has(sourceKey)) {
      return
    }

    const baseVerseKey = `${sourceKind}_${toVerseIdentifier(sourceId, sourceKind)}`
    const verseKey = uniqueIdentifier(baseVerseKey, usedVerseKeys)
    usedVerseKeys.add(verseKey)

    const catalogEntry = sourceKind === 'prop' ? catalogById.get(sourceId) : undefined
    const displayName =
      sourceKind === 'block' ? (blockLabels.get(sourceId as BlockType) ?? sourceId) : (catalogEntry?.displayName ?? sourceId)

    bindings.set(sourceKey, {
      sourceKey,
      sourceKind,
      sourceId,
      verseKey,
      propertyName: `${toPascalCase(verseKey)}Asset`,
      displayName,
      catalogEntry,
    })
  }

  for (const block of placement.greybox) {
    addBinding('block', block.blockType)
  }

  for (const prop of placement.props) {
    addBinding('prop', prop.assetId)
  }

  return [...bindings.values()]
}

function collectWarnings(
  placement: UePlacement,
  bindings: readonly AssetBinding[],
  assetCatalog: readonly AssetDescriptor[],
  stats: UefnExportStats,
): UefnExportWarning[] {
  const warnings: UefnExportWarning[] = []
  const overPerDevice = stats.runtimeSpawnCount > UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE
  const overPerIsland = stats.runtimeSpawnCount > UEFN_RUNTIME_PROP_LIMIT_PER_ISLAND

  if (overPerDevice || overPerIsland) {
    warnings.push({
      code: 'runtime_spawn_prop_limit',
      ids: [],
      message: `Runtime SpawnProp count is ${stats.runtimeSpawnCount}; UEFN currently caps runtime spawning at ${UEFN_RUNTIME_PROP_LIMIT_PER_DEVICE} props per script device and ${UEFN_RUNTIME_PROP_LIMIT_PER_ISLAND} total per island.`,
    })
  }

  const propsWithScale = scaledProps(placement)
  if (propsWithScale.length > 0) {
    warnings.push({
      code: 'non_unit_scale',
      ids: propsWithScale.map((prop) => prop.assetId),
      message: `Non-1 prop scale is recorded but not applied by the v1 SpawnProp fixture path: ${propsWithScale
        .map((prop) => `${prop.assetId} scale=${prop.scale}`)
        .join(', ')}.`,
    })
  }

  if (placement.zones.length > 0) {
    warnings.push({
      code: 'zones_preserved_metadata',
      ids: placement.zones.map((zone) => zone.id),
      message: `${placement.zones.length} zone(s) are preserved in lore-placement.json and README metadata; v1 does not create UEFN gameplay volumes.`,
    })
  }

  warnings.push({
    code: 'spawn_preserved_metadata',
    ids: ['spawn'],
    message: `Spawn is preserved for manual UEFN player spawner placement: x=${formatNumber(placement.spawn.x)}, y=${formatNumber(
      placement.spawn.y,
    )}, z=${formatNumber(placement.spawn.z)}, yaw=${formatNumber(placement.spawn.yawDeg)}.`,
  })

  const catalogIds = new Set(assetCatalog.map((asset) => asset.id))
  const unknownCatalogIds = bindings
    .filter((binding) => binding.sourceKind === 'prop' && !catalogIds.has(binding.sourceId))
    .map((binding) => binding.sourceId)

  if (unknownCatalogIds.length > 0) {
    warnings.push({
      code: 'unknown_asset_catalog',
      ids: unknownCatalogIds,
      message: `Prop assetId value(s) missing from the LORE asset catalog: ${unknownCatalogIds.join(', ')}.`,
    })
  }

  return warnings
}

function renderVerseData(placement: UePlacement, bindings: readonly AssetBinding[]) {
  const assetKeys = bindings.length > 0 ? bindings.map((binding) => `    ${binding.verseKey}`) : ['    empty_placeholder']
  const blockRows = placement.greybox.map((block) =>
    renderPlacementRow({
      assetKey: assetKeyFor(bindings, 'block', block.blockType),
      x: block.x,
      y: block.y,
      z: block.z,
      yawDeg: 0,
      label: `block:${block.blockType}`,
    }),
  )
  const propRows = placement.props.map((prop) =>
    renderPlacementRow({
      assetKey: assetKeyFor(bindings, 'prop', prop.assetId),
      x: prop.x,
      y: prop.y,
      z: prop.z,
      yawDeg: prop.yawDeg,
      label: `prop:${prop.assetId}`,
    }),
  )

  return `${[
    '# Generated from LORE placement manifest. Do not edit by hand.',
    `# Source map: ${placement.sourceMap.name}; seed=${placement.sourceMap.seed}; exportedAt=${placement.sourceMap.exportedAt}.`,
    `# Coordinate space: ${placement.coordinateSpace}. Values are centimeters in UEFN Z-up space.`,
    'using { /UnrealEngine.com/Temporary/SpatialMath }',
    '',
    'lore_asset_key := enum:',
    ...assetKeys,
    '',
    'lore_placement_row := struct:',
    '    AssetKey : lore_asset_key',
    '    Position : vector3',
    '    YawDeg : float',
    '    Label : string',
    '',
    `LORE_GREYBOX_ROWS<public> : []lore_placement_row = ${renderVerseArray(blockRows)}`,
    '',
    `LORE_PROP_ROWS<public> : []lore_placement_row = ${renderVerseArray(propRows)}`,
  ].join('\n')}\n`
}

function renderVerseDevice(
  placement: UePlacement,
  bindings: readonly AssetBinding[],
  stats: UefnExportStats,
) {
  const editableFields =
    bindings.length > 0
      ? bindings
          .map((binding) =>
            [
              '    @editable',
              `    ${binding.propertyName} : creative_prop_asset = DefaultCreativePropAsset # ${binding.sourceKind}:${binding.sourceId}`,
            ].join('\n'),
          )
          .join('\n\n')
      : [
          '    @editable',
          '    PlaceholderAsset : creative_prop_asset = DefaultCreativePropAsset # No LORE assets were present in this manifest.',
        ].join('\n')

  return `${[
    '# Generated from LORE placement manifest. Do not edit by hand.',
    '# V1 fixture path only: runtime SpawnProp is capped and is not the production real-map assembly path.',
    'using { /Fortnite.com/Devices }',
    'using { /Verse.org/Simulation }',
    'using { /UnrealEngine.com/Temporary/Diagnostics }',
    'using { /UnrealEngine.com/Temporary/SpatialMath }',
    '',
    'lore_blockout_device := class(creative_device):',
    editableFields,
    '',
    '    OnBegin<override>()<suspends>:void=',
    `        Print("LORE blockout fixture spawning ${stats.runtimeSpawnCount} prop(s) from ${verseStringContent(
      placement.sourceMap.name,
    )}")`,
    '        SpawnRows(LORE_GREYBOX_ROWS)',
    '        SpawnRows(LORE_PROP_ROWS)',
    '',
    '    SpawnRows(Rows : []lore_placement_row):void=',
    '        for (Row : Rows):',
    '            Asset := AssetForKey(Row.AssetKey)',
    '            Rotation := MakeRotationFromYawPitchRollDegrees(Row.YawDeg, 0.0, 0.0)',
    '            SpawnResult := SpawnProp(Asset, Row.Position, Rotation)',
    '            if (SpawnResult(0)?):',
    '                Print("LORE spawned {Row.Label}")',
    '            else:',
    '                Print("LORE SpawnProp failed for {Row.Label}; check asset binding and SpawnProp limits")',
    '',
    '    AssetForKey(Key : lore_asset_key):creative_prop_asset=',
    renderAssetSelector(bindings),
  ].join('\n')}\n`
}

function renderAssetSelector(bindings: readonly AssetBinding[]) {
  if (bindings.length === 0) {
    return '        PlaceholderAsset'
  }

  const selectorLines: string[] = []

  bindings.forEach((binding, index) => {
    const prefix = index === 0 ? 'if' : 'else if'
    selectorLines.push(`        ${prefix} (Key = lore_asset_key.${binding.verseKey}):`)
    selectorLines.push(`            ${binding.propertyName}`)
  })

  selectorLines.push('        else:')
  selectorLines.push('            DefaultCreativePropAsset')

  return selectorLines.join('\n')
}

function renderReadme(
  placement: UePlacement,
  bindings: readonly AssetBinding[],
  warnings: readonly UefnExportWarning[],
  stats: UefnExportStats,
) {
  const bindingRows =
    bindings.length > 0
      ? bindings
          .map(
            (binding) =>
              `| ${binding.propertyName} | ${binding.sourceKind}:${binding.sourceId} | ${binding.displayName}${binding.catalogEntry ? ` (${binding.catalogEntry.src})` : ''} |`,
          )
          .join('\n')
      : '| PlaceholderAsset | none | No assets were present in the source manifest. |'

  const warningsList =
    warnings.length > 0 ? warnings.map((warning) => `- ${warning.message}`).join('\n') : '- None for this fixture.'

  const scaledList =
    scaledProps(placement).length > 0
      ? scaledProps(placement)
          .map(
            (prop) =>
              `- ${prop.assetId} scale=${formatNumber(prop.scale)} at x=${formatNumber(prop.x)}, y=${formatNumber(
                prop.y,
              )}, z=${formatNumber(prop.z)}`,
          )
          .join('\n')
      : '- None.'

  const zonesList =
    placement.zones.length > 0
      ? placement.zones
          .map(
            (zone) =>
              `- ${zone.id}: ${zone.name} (${zone.kind}) x=${formatNumber(zone.x)}, z=${formatNumber(
                zone.z,
              )}, width=${formatNumber(zone.width)}, depth=${formatNumber(zone.depth)}, heightCm=${formatNumber(
                zone.heightCm,
              )}`,
          )
          .join('\n')
      : '- None.'

  return `${[
    '# LORE UEFN Import',
    '',
    '## Status',
    '',
    `V1 fixture only. This package uses runtime SpawnProp for ${stats.runtimeSpawnCount} small-fixture prop spawns. UEFN currently limits runtime spawning to 100 props per script device / 200 total per island. Real-map scaling is an OPEN DESIGN ITEM and must move to editor-time generation, Scene Graph/prefab assembly, or combined meshes before this becomes the production map pipeline.`,
    '',
    '## Package Files',
    '',
    '- uefn/lore-placement.json: original manifest, preserved as source of truth.',
    '- uefn/lore_placement_data.verse: generated placement rows compiled from the manifest.',
    '- uefn/lore_blockout_device.verse: generated fixture device that calls SpawnProp.',
    '- uefn/README_UEFN_IMPORT.md: this manual UEFN runbook.',
    '',
    '## Manual UEFN Steps',
    '',
    '1. Create or open a blank UEFN island project.',
    '2. Import GLBs into /Content/LORE/Imported using Interchange. For the fixture, import the LORE block meshes plus public/lore-assets GLBs such as crate.glb.',
    '3. Save All after import.',
    '4. Convert each imported mesh that will be spawned with Verse to a Fortnite prop using convert-to-prop: right-click Static Mesh -> Scripted Asset Actions -> Convert to Prop.',
    '5. Add lore_placement_data.verse and lore_blockout_device.verse to the project Verse files.',
    '6. Build Verse so lore_blockout_device appears in the UEFN content browser.',
    '7. Place one lore_blockout_device in the level.',
    '8. Bind @editable slots on the device to the converted prop assets listed below.',
    '9. Launch session and verify the spawned blockout. The roundtrip fixture should show five greybox blocks and one crate at x=200, y=0, z=0, yaw=-90.',
    '',
    '## Editable Bindings',
    '',
    '| Slot | Manifest key | Import note |',
    '| --- | --- | --- |',
    bindingRows,
    '',
    '## Warnings And Preserved Metadata',
    '',
    warningsList,
    '',
    '## Scale Handling',
    '',
    'Non-1 scale is recorded but not applied by the v1 SpawnProp fixture path. Do not block export on scale; use pre-baked asset variants or an editor-time assembly path later.',
    '',
    scaledList,
    '',
    '## Zones Preserved',
    '',
    'Zones are preserved in lore-placement.json and this README. V1 does not create UEFN gameplay volumes.',
    '',
    zonesList,
    '',
    '## Spawn Preserved',
    '',
    `Place a player spawner manually at x=${formatNumber(placement.spawn.x)}, y=${formatNumber(
      placement.spawn.y,
    )}, z=${formatNumber(placement.spawn.z)}, yaw=${formatNumber(placement.spawn.yawDeg)}.`,
    '',
    '## Source',
    '',
    `- Map: ${placement.sourceMap.name}`,
    `- Seed: ${placement.sourceMap.seed}`,
    `- Exported: ${placement.sourceMap.exportedAt}`,
    `- Coordinate space: ${placement.coordinateSpace}`,
  ].join('\n')}\n`
}

function renderPlacementRow(row: { assetKey: string; x: number; y: number; z: number; yawDeg: number; label: string }) {
  return `lore_placement_row{AssetKey := lore_asset_key.${row.assetKey}, Position := vector3{X := ${verseFloat(
    row.x,
  )}, Y := ${verseFloat(row.y)}, Z := ${verseFloat(row.z)}}, YawDeg := ${verseFloat(row.yawDeg)}, Label := ${verseString(
    row.label,
  )}}`
}

function renderVerseArray(rows: readonly string[]) {
  if (rows.length === 0) {
    return 'array{}'
  }

  return `array{\n${rows.map((row) => `    ${row},`).join('\n')}\n}`
}

function assetKeyFor(bindings: readonly AssetBinding[], sourceKind: SourceKind, sourceId: string) {
  const binding = bindings.find((candidate) => candidate.sourceKey === `${sourceKind}:${sourceId}`)

  if (!binding) {
    throw new Error(`Missing UEFN asset binding for ${sourceKind}:${sourceId}`)
  }

  return binding.verseKey
}

function scaledProps(placement: UePlacement) {
  return placement.props.filter((prop) => Math.abs(prop.scale - 1) > SCALE_EPSILON)
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)]
}

function uniqueIdentifier(base: string, used: ReadonlySet<string>) {
  let candidate = base
  let suffix = 2

  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`
    suffix += 1
  }

  return candidate
}

function toVerseIdentifier(value: string, fallback: string) {
  const identifier = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
  const withFallback = /^[a-z]/.test(identifier) ? identifier : `${fallback}_${identifier || 'asset'}`

  return verseReservedWords.has(withFallback) ? `${withFallback}_asset` : withFallback
}

function toPascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')
}

function verseFloat(value: number) {
  const normalized = Object.is(value, -0) ? 0 : Number(value.toFixed(FLOAT_PRECISION))
  return Number.isInteger(normalized) ? `${normalized}.0` : `${normalized}`
}

function formatNumber(value: number) {
  return `${Number(value.toFixed(FLOAT_PRECISION))}`
}

function verseString(value: string) {
  return JSON.stringify(value)
}

function verseStringContent(value: string) {
  return JSON.stringify(value).slice(1, -1)
}
