export type BlockType =
  | 'grass'
  | 'soil'
  | 'stone'
  | 'sand'
  | 'water'
  | 'road'
  | 'brick'
  | 'glass'
  | 'light'

export type ToolMode = 'paint' | 'erase' | 'raise' | 'lower' | 'spawn' | 'prop'

export type ZoneKind = 'safehouse' | 'market' | 'race' | 'mission'

export interface Voxel {
  x: number
  y: number
  z: number
  type: BlockType
}

export type Vec3 = {
  x: number
  y: number
  z: number
}

export interface SpawnPoint {
  x: number
  y: number
  z: number
}

export interface MapZone {
  id: string
  name: string
  kind: ZoneKind
  color: string
  x: number
  z: number
  width: number
  depth: number
}

export interface PropPlacement {
  id: string
  assetId: string
  x: number
  y: number
  z: number
  rotY: number
  scale: number
}

export interface AssetDescriptor {
  id: string
  displayName: string
  category: string
  src: string
  defaultScale: number
  thumbnailUrl?: string
}

export interface WorldMapV1 {
  schemaVersion: 1
  name: string
  seed: number
  size: number
  createdAt: string
  updatedAt: string
  spawn: SpawnPoint
  zones: MapZone[]
  blocks: Voxel[]
}

export interface WorldMap extends Omit<WorldMapV1, 'schemaVersion'> {
  schemaVersion: 2
  props: PropPlacement[]
  spawnYaw: number
}

export interface BlockDefinition {
  type: BlockType
  label: string
  color: string
}

export const blockDefinitions: BlockDefinition[] = [
  { type: 'grass', label: 'Grass', color: '#6fb34d' },
  { type: 'soil', label: 'Soil', color: '#8a5a38' },
  { type: 'stone', label: 'Stone', color: '#8f9692' },
  { type: 'sand', label: 'Sand', color: '#d5c079' },
  { type: 'water', label: 'Water', color: '#39a7d8' },
  { type: 'road', label: 'Road', color: '#3f3b36' },
  { type: 'brick', label: 'Brick', color: '#b65b42' },
  { type: 'glass', label: 'Glass', color: '#82d7c6' },
  { type: 'light', label: 'Light', color: '#f4cb52' },
]

export const blockLabels = blockDefinitions.reduce(
  (labels, block) => ({ ...labels, [block.type]: block.label }),
  {} as Record<BlockType, string>,
)

export function blockKey(voxel: Pick<Voxel, 'x' | 'y' | 'z'>) {
  return `${voxel.x}:${voxel.y}:${voxel.z}`
}

export function createBlockMap(blocks: Voxel[]) {
  return new Map(blocks.map((block) => [blockKey(block), block]))
}

export function getTopBlock(blocks: Voxel[], x: number, z: number) {
  let top: Voxel | undefined

  for (const block of blocks) {
    if (block.x !== x || block.z !== z) {
      continue
    }

    if (!top || block.y > top.y) {
      top = block
    }
  }

  return top
}

export function getTopY(blocks: Voxel[], x: number, z: number) {
  return getTopBlock(blocks, x, z)?.y ?? -1
}

export function createWorld(seed = Math.floor(Math.random() * 999_999)): WorldMap {
  const size = 30
  const blocks: Voxel[] = []
  const half = Math.floor(size / 2)

  for (let x = -half; x <= half; x += 1) {
    for (let z = -half; z <= half; z += 1) {
      const distance = Math.sqrt(x * x + z * z) / half
      const ridge = seededNoise(seed, x * 0.18, z * 0.18)
      const detail = seededNoise(seed + 91, x * 0.47, z * 0.47) * 0.8
      const height = Math.max(0, Math.floor(4.7 - distance * 5 + ridge * 2.6 + detail))

      if (height <= 1) {
        blocks.push({ x, y: 0, z, type: 'sand' })
        blocks.push({ x, y: 1, z, type: 'water' })
        continue
      }

      for (let y = 0; y < height; y += 1) {
        blocks.push({ x, y, z, type: y < height - 2 ? 'stone' : 'soil' })
      }

      const onRoad = Math.abs(x) <= 1 || Math.abs(z) <= 1
      const topType = onRoad ? 'road' : height > 4 ? 'stone' : 'grass'
      blocks.push({ x, y: height, z, type: topType })
    }
  }

  addStarterBuild(blocks)

  const topAtCenter = getTopY(blocks, 0, 0)
  const now = new Date().toISOString()

  return {
    schemaVersion: 2,
    name: `BlockForge-${seed}`,
    seed,
    size,
    createdAt: now,
    updatedAt: now,
    spawn: { x: 0, y: topAtCenter + 1, z: 0 },
    spawnYaw: 0,
    zones: [
      {
        id: 'safehouse-01',
        name: 'Safehouse',
        kind: 'safehouse',
        color: '#f4cb52',
        x: -8,
        z: -8,
        width: 6,
        depth: 6,
      },
      {
        id: 'market-01',
        name: 'Market',
        kind: 'market',
        color: '#82d7c6',
        x: 5,
        z: -7,
        width: 7,
        depth: 5,
      },
      {
        id: 'race-01',
        name: 'Race Loop',
        kind: 'race',
        color: '#e46f50',
        x: -9,
        z: 5,
        width: 18,
        depth: 5,
      },
    ],
    blocks,
    props: [],
  }
}

export function withUpdatedTimestamp(world: WorldMap): WorldMap {
  return {
    ...world,
    updatedAt: new Date().toISOString(),
  }
}

function addStarterBuild(blocks: Voxel[]) {
  const blockMap = createBlockMap(blocks)
  const add = (voxel: Voxel) => {
    blockMap.set(blockKey(voxel), voxel)
  }

  for (let x = -8; x <= -4; x += 1) {
    for (let z = -8; z <= -4; z += 1) {
      const y = getTopY(Array.from(blockMap.values()), x, z) + 1
      const wall = x === -8 || x === -4 || z === -8 || z === -4
      add({ x, y, z, type: wall ? 'brick' : 'road' })

      if (wall && !((x === -6 || x === -5) && z === -4)) {
        add({ x, y: y + 1, z, type: 'brick' })
      }
    }
  }

  for (let x = 5; x <= 9; x += 1) {
    for (let z = -7; z <= -4; z += 1) {
      const y = getTopY(Array.from(blockMap.values()), x, z) + 1
      add({ x, y, z, type: 'glass' })

      if ((x + z) % 2 === 0) {
        add({ x, y: y + 1, z, type: 'light' })
      }
    }
  }

  blocks.splice(0, blocks.length, ...Array.from(blockMap.values()))
}

function seededNoise(seed: number, x: number, z: number) {
  const value = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.0001) * 43_758.5453
  return value - Math.floor(value)
}
