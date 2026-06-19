import { coerceBlockType } from './world'
import type { WorldMap, WorldMapV1 } from './world'

type MigratableWorld = (Partial<WorldMap> | Partial<WorldMapV1>) & {
  schemaVersion?: unknown
}

export function migrateWorld(raw: unknown): WorldMap | null {
  if (!isObject(raw)) {
    return null
  }

  const source = raw as MigratableWorld

  if (source.schemaVersion === 1) {
    const migrated = {
      ...source,
      blocks: sanitizeBlocks(source.blocks),
      props: [],
      spawnYaw: 0,
      schemaVersion: 2,
    }

    return isWorldMapV2(migrated) ? migrated : null
  }

  if (source.schemaVersion === 2) {
    const migrated = {
      ...source,
      zones: source.zones ?? [],
      blocks: sanitizeBlocks(source.blocks),
      props: source.props ?? [],
      spawnYaw: source.spawnYaw ?? 0,
    }

    return isWorldMapV2(migrated) ? migrated : null
  }

  return null
}

export function parseWorldText(text: string): WorldMap | null {
  const source = text.trim()

  try {
    return migrateWorld(JSON.parse(source))
  } catch {
    try {
      const decoded = decodeURIComponent(escape(window.atob(source)))
      return migrateWorld(JSON.parse(decoded))
    } catch {
      return null
    }
  }
}

export function isWorldMapV2(value: unknown): value is WorldMap {
  if (!isObject(value)) {
    return false
  }

  const candidate = value as Partial<WorldMap>

  return Boolean(
    candidate.schemaVersion === 2 &&
      typeof candidate.name === 'string' &&
      typeof candidate.seed === 'number' &&
      Array.isArray(candidate.zones) &&
      Array.isArray(candidate.blocks) &&
      Array.isArray(candidate.props) &&
      candidate.spawn,
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sanitizeBlocks(blocks: unknown): WorldMap['blocks'] {
  if (!Array.isArray(blocks)) {
    return []
  }

  return blocks.map((block) => {
    if (!isObject(block)) {
      return block
    }

    return {
      ...block,
      type: coerceBlockType(block.type),
    }
  }) as WorldMap['blocks']
}
