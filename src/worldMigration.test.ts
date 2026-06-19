import { describe, expect, it } from 'vitest'
import { migrateWorld } from './worldMigration'

const v1Fixture = {
  schemaVersion: 1,
  name: 'Legacy map',
  seed: 120626,
  size: 30,
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
  spawn: { x: 0, y: 2, z: 0 },
  zones: [],
  blocks: [{ x: 0, y: 0, z: 0, type: 'grass' }],
}

describe('migrateWorld', () => {
  it('migrates a v1 world to v2 with empty props', () => {
    expect(migrateWorld(v1Fixture)).toEqual({
      ...v1Fixture,
      schemaVersion: 2,
      props: [],
      spawnYaw: 0,
    })
  })

  it('preserves unknown keys on v2 worlds', () => {
    const source = {
      ...v1Fixture,
      schemaVersion: 2,
      props: [],
      spawnYaw: 0,
      futureEuler: { x: 0, y: 1, z: 0 },
    }

    expect(migrateWorld(source)).toEqual(source)
  })

  it('coerces unknown v2 block types and preserves block count', () => {
    const source = {
      ...v1Fixture,
      schemaVersion: 2,
      blocks: [
        { x: 0, y: 0, z: 0, type: 'lava' },
        { x: 1, y: 0, z: 0, type: 'grass' },
      ],
      props: [],
      spawnYaw: 0,
    }

    const migrated = migrateWorld(source)

    expect(migrated?.blocks).toHaveLength(source.blocks.length)
    expect(migrated?.blocks[0].type).toBe('stone')
    expect(migrated?.blocks[1].type).toBe('grass')
  })

  it('defaults missing v2 zones to an empty array', () => {
    const source = {
      ...v1Fixture,
      schemaVersion: 2,
      props: [],
      spawnYaw: 0,
    }
    delete (source as Partial<typeof source>).zones

    expect(migrateWorld(source)).toEqual({
      ...source,
      zones: [],
    })
  })

  it('returns null for garbage or missing versions', () => {
    expect(migrateWorld('not a world')).toBeNull()
    expect(migrateWorld({ name: 'No version' })).toBeNull()
  })
})
