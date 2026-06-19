import type { BlockType, WorldMap } from './world'

export const ZONE_DEFAULT_HEIGHT_CM = 1000 // Must match ue/import_lore_map.py.

const THREE_TO_UE_CM = { x: 100, yFromZ: 100, zFromY: 100 } as const // If mirrored in UE, switch yFromZ to -100.

interface ThreePosition {
  x: number
  y: number
  z: number
}

interface UeVector {
  x: number
  y: number
  z: number
}

export interface UePlacement {
  manifestVersion: 1
  coordinateSpace: 'ue5-zup-cm'
  sourceMap: { name: string; seed: number; exportedAt: string }
  greybox: { x: number; y: number; z: number; blockType: BlockType }[]
  props: { assetId: string; x: number; y: number; z: number; yawDeg: number; scale: number }[]
  zones: {
    id: string
    name: string
    kind: string
    x: number
    z: number
    width: number
    depth: number
    color: string
    heightCm: number
  }[]
  spawn: { x: number; y: number; z: number; yawDeg: number }
}

export function threeToUeCm({ x, y, z }: ThreePosition): UeVector {
  return { x: x * THREE_TO_UE_CM.x, y: z * THREE_TO_UE_CM.yFromZ, z: y * THREE_TO_UE_CM.zFromY }
}

export function toUePlacement(world: WorldMap): UePlacement {
  return {
    manifestVersion: 1,
    coordinateSpace: 'ue5-zup-cm',
    sourceMap: {
      name: world.name,
      seed: world.seed,
      exportedAt: new Date().toISOString(),
    },
    greybox: world.blocks.map((block) => ({
      ...threeToUeCm(block),
      blockType: block.type,
    })),
    props: world.props.map((prop) => ({
      assetId: prop.assetId,
      ...threeToUeCm(prop),
      yawDeg: toYawDeg(prop.rotY),
      scale: prop.scale,
    })),
    zones: world.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      kind: zone.kind,
      x: zone.x * THREE_TO_UE_CM.x,
      z: zone.z * THREE_TO_UE_CM.yFromZ,
      width: zone.width * Math.abs(THREE_TO_UE_CM.x),
      depth: zone.depth * Math.abs(THREE_TO_UE_CM.yFromZ),
      color: zone.color,
      heightCm: ZONE_DEFAULT_HEIGHT_CM,
    })),
    spawn: {
      ...threeToUeCm(world.spawn),
      yawDeg: toYawDeg(world.spawnYaw),
    },
  }
}

function toYawDeg(rotY: number) {
  return -(rotY * 180) / Math.PI
}
