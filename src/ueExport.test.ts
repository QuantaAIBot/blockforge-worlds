import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockDefinitions } from './world'
import { ZONE_DEFAULT_HEIGHT_CM, threeToUeCm, toUePlacement } from './ueExport'
import type { BlockType, WorldMap } from './world'

const blockTypes = new Set<BlockType>(blockDefinitions.map((block) => block.type))

describe('threeToUeCm', () => {
  it.each([
    [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
    [{ x: 1, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }],
    [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 100 }],
    [{ x: 0, y: 0, z: 1 }, { x: 0, y: 100, z: 0 }],
    [{ x: -9, y: 0, z: 5 }, { x: -900, y: 500, z: 0 }],
    [{ x: 5.0526, y: 6, z: 5.0526 }, { x: 505.26, y: 505.26, z: 600 }],
  ])('converts %o to %o', (three, ue) => {
    expect(threeToUeCm(three)).toEqual(ue)
  })

  it('scales a 30-unit span to 3000 cm', () => {
    expect(threeToUeCm({ x: 30, y: 0, z: 0 }).x - threeToUeCm({ x: 0, y: 0, z: 0 }).x).toBe(3000)
  })
})

describe('toUePlacement', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits the exact UE placement manifest for a v2 world', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-19T12:34:56.789Z'))

    const world: WorldMap = {
      schemaVersion: 2,
      name: 'Fixture',
      seed: 120626,
      size: 30,
      createdAt: '2026-06-19T00:00:00.000Z',
      updatedAt: '2026-06-19T00:00:00.000Z',
      spawn: { x: -9, y: 0, z: 5 },
      spawnYaw: Math.PI / 2,
      zones: [
        {
          id: 'race_loop_01',
          name: 'Race Loop',
          kind: 'race',
          color: '#e46f50',
          x: 1,
          z: 2,
          width: 3,
          depth: 4,
        },
      ],
      blocks: [
        { x: 0, y: 0, z: 0, type: 'grass' },
        { x: 0, y: 1, z: 0, type: 'brick' },
      ],
      props: [
        {
          id: 'prop-01',
          assetId: 'crate',
          x: 5.0526,
          y: 6,
          z: 5.0526,
          rotY: Math.PI / 2,
          scale: 1.25,
        },
      ],
    }

    const placement = toUePlacement(world)

    expect(placement).toEqual({
      manifestVersion: 1,
      coordinateSpace: 'ue5-zup-cm',
      sourceMap: {
        name: 'Fixture',
        seed: 120626,
        exportedAt: '2026-06-19T12:34:56.789Z',
      },
      greybox: [
        { x: 0, y: 0, z: 0, blockType: 'grass' },
        { x: 0, y: 0, z: 100, blockType: 'brick' },
      ],
      props: [
        {
          assetId: 'crate',
          x: 505.26,
          y: 505.26,
          z: 600,
          yawDeg: -90,
          scale: 1.25,
        },
      ],
      zones: [
        {
          id: 'race_loop_01',
          name: 'Race Loop',
          kind: 'race',
          x: 100,
          z: 200,
          width: 300,
          depth: 400,
          color: '#e46f50',
          heightCm: ZONE_DEFAULT_HEIGHT_CM,
        },
      ],
      spawn: { x: -900, y: 500, z: 0, yawDeg: -90 },
    })
    expect(placement.greybox).toHaveLength(2)
    expect(placement.props).toHaveLength(1)
    expect(placement.zones).toHaveLength(1)
    expect(placement.greybox.every((block) => blockTypes.has(block.blockType))).toBe(true)
  })
})
