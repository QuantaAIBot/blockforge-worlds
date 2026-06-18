import {
  Box,
  Crosshair,
  Download,
  Eraser,
  Minus,
  Paintbrush,
  Plus,
  RefreshCcw,
  Save,
  Share2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import './App.css'
import {
  blockDefinitions,
  blockKey,
  blockLabels,
  createBlockMap,
  createWorld,
  getTopBlock,
  getTopY,
  withUpdatedTimestamp,
} from './world'
import type { BlockType, MapZone, ToolMode, Voxel, WorldMap } from './world'

const storageKey = 'blockforge-worlds.active-map'

interface VoxelAction {
  voxel: Voxel
  normal: { x: number; y: number; z: number }
}

const tools: Array<{
  mode: ToolMode
  label: string
  icon: typeof Paintbrush
}> = [
  { mode: 'paint', label: 'Paint', icon: Paintbrush },
  { mode: 'erase', label: 'Erase', icon: Eraser },
  { mode: 'raise', label: 'Raise', icon: Plus },
  { mode: 'lower', label: 'Lower', icon: Minus },
  { mode: 'spawn', label: 'Spawn', icon: Crosshair },
]

function App() {
  const [world, setWorld] = useState<WorldMap>(() => loadStoredWorld() ?? createWorld(120_626))
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('brick')
  const [tool, setTool] = useState<ToolMode>('paint')
  const [notice, setNotice] = useState('Map forge online')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => {
    const typeCounts = world.blocks.reduce<Record<string, number>>((counts, block) => {
      counts[block.type] = (counts[block.type] ?? 0) + 1
      return counts
    }, {})

    return {
      blocks: world.blocks.length.toLocaleString(),
      zones: world.zones.length,
      topMaterial:
        Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'none',
    }
  }, [world.blocks, world.zones.length])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice('Ready'), 1800)
  }, [])

  const handleWorldAction = useCallback(
    ({ voxel, normal }: VoxelAction) => {
      setWorld((current) => {
        const blockMap = createBlockMap(current.blocks)
        const commit = () =>
          withUpdatedTimestamp({
            ...current,
            blocks: Array.from(blockMap.values()).sort(sortVoxels),
          })

        if (tool === 'erase') {
          blockMap.delete(blockKey(voxel))
          return commit()
        }

        if (tool === 'raise') {
          const y = getTopY(current.blocks, voxel.x, voxel.z) + 1
          blockMap.set(blockKey({ x: voxel.x, y, z: voxel.z }), {
            x: voxel.x,
            y,
            z: voxel.z,
            type: selectedBlock,
          })
          return commit()
        }

        if (tool === 'lower') {
          const top = getTopBlock(current.blocks, voxel.x, voxel.z)

          if (top) {
            blockMap.delete(blockKey(top))
          }

          return commit()
        }

        if (tool === 'spawn') {
          const y = getTopY(current.blocks, voxel.x, voxel.z) + 1
          return withUpdatedTimestamp({
            ...current,
            spawn: { x: voxel.x, y, z: voxel.z },
          })
        }

        const target = {
          x: voxel.x + normal.x,
          y: Math.max(0, voxel.y + normal.y),
          z: voxel.z + normal.z,
        }

        blockMap.set(blockKey(target), {
          ...target,
          type: selectedBlock,
        })

        return commit()
      })
    },
    [selectedBlock, tool],
  )

  const saveWorld = useCallback(() => {
    localStorage.setItem(storageKey, JSON.stringify(world))
    showNotice('Saved locally')
  }, [showNotice, world])

  const loadWorld = useCallback(() => {
    const stored = loadStoredWorld()

    if (!stored) {
      showNotice('No local save yet')
      return
    }

    setWorld(stored)
    showNotice('Loaded local save')
  }, [showNotice])

  const generateWorld = useCallback(() => {
    const seed = Math.floor(Math.random() * 900_000) + 100_000
    setWorld(createWorld(seed))
    showNotice(`Generated seed ${seed}`)
  }, [showNotice])

  const renameWorld = useCallback((name: string) => {
    setWorld((current) =>
      withUpdatedTimestamp({
        ...current,
        name,
      }),
    )
  }, [])

  const exportWorld = useCallback(() => {
    const json = JSON.stringify(world, null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${world.name || 'blockforge-world'}.bfworld.json`
    link.click()
    URL.revokeObjectURL(url)
    showNotice('Map JSON exported')
  }, [showNotice, world])

  const copyShareCode = useCallback(async () => {
    const code = encodeWorld(world)
    await navigator.clipboard.writeText(code)
    showNotice('Share code copied')
  }, [showNotice, world])

  const importWorld = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return
      }

      const text = await file.text()
      const parsed = parseWorldText(text)

      if (!parsed) {
        showNotice('Import failed')
        return
      }

      setWorld(withUpdatedTimestamp(parsed))
      showNotice('Map imported')
    },
    [showNotice],
  )

  return (
    <main className="app-shell">
      <BlockScene
        world={world}
        selectedBlock={selectedBlock}
        tool={tool}
        onVoxelAction={handleWorldAction}
      />

      <header className="topbar">
        <div className="brand">
          <Box aria-hidden="true" />
          <div>
            <strong>BlockForge Worlds</strong>
            <span>Seed {world.seed}</span>
          </div>
        </div>
        <label className="map-name">
          <span>Map</span>
          <input
            value={world.name}
            aria-label="Map name"
            onChange={(event) => renameWorld(event.target.value)}
          />
        </label>
        <div className="top-actions">
          <IconButton label="New seed" onClick={generateWorld}>
            <RefreshCcw aria-hidden="true" />
          </IconButton>
          <IconButton label="Save" onClick={saveWorld}>
            <Save aria-hidden="true" />
          </IconButton>
          <IconButton label="Load" onClick={loadWorld}>
            <Upload aria-hidden="true" />
          </IconButton>
          <IconButton label="Export" onClick={exportWorld}>
            <Download aria-hidden="true" />
          </IconButton>
          <IconButton label="Copy share code" onClick={copyShareCode}>
            <Share2 aria-hidden="true" />
          </IconButton>
        </div>
      </header>

      <nav className="toolrail" aria-label="World tools">
        {tools.map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            type="button"
            className={tool === mode ? 'active' : ''}
            aria-label={label}
            title={label}
            onClick={() => setTool(mode)}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </nav>

      <aside className="inspector" aria-label="Map manifest">
        <div className="manifest-grid">
          <Metric label="Blocks" value={stats.blocks} />
          <Metric label="Zones" value={String(stats.zones)} />
          <Metric label="Top" value={blockLabels[stats.topMaterial as BlockType] ?? stats.topMaterial} />
        </div>

        <div className="spawn-readout">
          <Crosshair aria-hidden="true" />
          <span>
            {world.spawn.x}, {world.spawn.y}, {world.spawn.z}
          </span>
        </div>

        <div className="zone-list">
          {world.zones.map((zone) => (
            <ZonePill key={zone.id} zone={zone} />
          ))}
        </div>

        <button
          type="button"
          className="import-button"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload aria-hidden="true" />
          Import Map
        </button>
        <input
          ref={fileInputRef}
          className="file-input"
          type="file"
          accept=".json,.bfworld"
          onChange={(event) => importWorld(event.currentTarget.files?.[0])}
        />
      </aside>

      <section className="hotbar" aria-label="Block palette">
        {blockDefinitions.map((block) => (
          <button
            key={block.type}
            type="button"
            className={selectedBlock === block.type ? 'active' : ''}
            aria-label={block.label}
            title={block.label}
            onClick={() => {
              setSelectedBlock(block.type)
              setTool('paint')
            }}
          >
            <span style={{ background: block.color }} />
            <em>{block.label}</em>
          </button>
        ))}
      </section>

      <div className="notice" aria-live="polite">
        {notice}
      </div>
    </main>
  )
}

function BlockScene({
  world,
  tool,
  selectedBlock,
  onVoxelAction,
}: {
  world: WorldMap
  tool: ToolMode
  selectedBlock: BlockType
  onVoxelAction: (action: VoxelAction) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const blockGroupRef = useRef<THREE.Group | null>(null)
  const overlayGroupRef = useRef<THREE.Group | null>(null)
  const targetsRef = useRef<THREE.Object3D[]>([])
  const actionRef = useRef(onVoxelAction)
  const selectedRef = useRef(selectedBlock)
  const toolRef = useRef(tool)

  useEffect(() => {
    actionRef.current = onVoxelAction
    selectedRef.current = selectedBlock
    toolRef.current = tool
  }, [onVoxelAction, selectedBlock, tool])

  useEffect(() => {
    const mount = mountRef.current

    if (!mount) {
      return undefined
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#9bd7d2')
    scene.fog = new THREE.Fog('#9bd7d2', 32, 82)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
    camera.position.set(24, 21, 24)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = false
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.maxPolarAngle = Math.PI * 0.48
    controls.minDistance = 9
    controls.maxDistance = 54

    const sun = new THREE.DirectionalLight('#ffe1a4', 2.8)
    sun.position.set(12, 24, 10)
    scene.add(sun)
    scene.add(new THREE.HemisphereLight('#e9ffff', '#6c5a4a', 1.7))

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 30, 1.2, 8),
      new THREE.MeshStandardMaterial({ color: '#5a6c52', roughness: 0.9 }),
    )
    base.position.y = -0.75
    scene.add(base)

    const blockGroup = new THREE.Group()
    const overlayGroup = new THREE.Group()
    blockGroupRef.current = blockGroup
    overlayGroupRef.current = overlayGroup
    scene.add(blockGroup, overlayGroup)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pointerMoved = false

    const resize = () => {
      const { clientWidth, clientHeight } = mount
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(clientWidth, clientHeight)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const handlePointerMove = () => {
      pointerMoved = true
    }

    const handlePointerDown = () => {
      pointerMoved = false
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (pointerMoved) {
        return
      }

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
      raycaster.setFromCamera(pointer, camera)

      const [hit] = raycaster.intersectObjects(targetsRef.current, false)

      const voxel = getHitVoxel(hit)

      if (!hit?.face || !voxel) {
        return
      }

      const normal = hit.face.normal
      actionRef.current({
        voxel,
        normal: {
          x: Math.round(normal.x),
          y: Math.round(normal.y),
          z: Math.round(normal.z),
        },
      })
    }

    const preventMenu = (event: MouseEvent) => event.preventDefault()
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('contextmenu', preventMenu)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('contextmenu', preventMenu)
      controls.dispose()
      clearGroup(blockGroup)
      clearGroup(overlayGroup)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  useEffect(() => {
    const blockGroup = blockGroupRef.current
    const overlayGroup = overlayGroupRef.current

    if (!blockGroup || !overlayGroup) {
      return
    }

    clearGroup(blockGroup)
    clearGroup(overlayGroup)

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
    const materials = createMaterials()
    const targets: THREE.Object3D[] = []
    const blocksByType = world.blocks.reduce<Record<BlockType, Voxel[]>>(
      (groups, block) => {
        groups[block.type].push(block)
        return groups
      },
      {
        grass: [],
        soil: [],
        stone: [],
        sand: [],
        water: [],
        road: [],
        brick: [],
        glass: [],
        light: [],
      },
    )
    const matrix = new THREE.Matrix4()

    for (const [type, blocks] of Object.entries(blocksByType) as Array<[BlockType, Voxel[]]>) {
      if (blocks.length === 0) {
        continue
      }

      const mesh = new THREE.InstancedMesh(boxGeometry, materials[type], blocks.length)
      blocks.forEach((block, index) => {
        matrix.makeTranslation(block.x, block.y + 0.5, block.z)
        mesh.setMatrixAt(index, matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.userData.voxels = blocks
      blockGroup.add(mesh)
      targets.push(mesh)
    }

    targetsRef.current = targets
    addSpawnMarker(overlayGroup, world.spawn)
    addZones(overlayGroup, world.zones, world.blocks)

    return () => {
      boxGeometry.dispose()
      Object.values(materials).forEach((material) => material.dispose())
    }
  }, [world])

  return <div ref={mountRef} className="scene-mount" />
}

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ZonePill({ zone }: { zone: MapZone }) {
  return (
    <div className="zone-pill">
      <span style={{ background: zone.color }} />
      <strong>{zone.name}</strong>
      <em>{zone.kind}</em>
    </div>
  )
}

function addSpawnMarker(group: THREE.Group, spawn: { x: number; y: number; z: number }) {
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#f4cb52',
    emissive: '#6f4b00',
    emissiveIntensity: 0.35,
    roughness: 0.4,
  })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), markerMaterial)
  pole.position.set(spawn.x, spawn.y + 0.7, spawn.z)
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.08), markerMaterial)
  flag.position.set(spawn.x + 0.34, spawn.y + 1.18, spawn.z)
  group.add(pole, flag)
}

function addZones(group: THREE.Group, zones: MapZone[], blocks: Voxel[]) {
  for (const zone of zones) {
    const top = Math.max(
      ...blocks
        .filter(
          (block) =>
            block.x >= zone.x &&
            block.x < zone.x + zone.width &&
            block.z >= zone.z &&
            block.z < zone.z + zone.depth,
        )
        .map((block) => block.y),
      0,
    )
    const material = new THREE.MeshBasicMaterial({
      color: zone.color,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
    const zonePlane = new THREE.Mesh(new THREE.BoxGeometry(zone.width, 0.05, zone.depth), material)
    zonePlane.position.set(zone.x + zone.width / 2 - 0.5, top + 1.05, zone.z + zone.depth / 2 - 0.5)
    group.add(zonePlane)
  }
}

function getHitVoxel(hit: THREE.Intersection<THREE.Object3D> | undefined) {
  if (!hit) {
    return null
  }

  const voxels = hit.object.userData.voxels as Voxel[] | undefined

  if (voxels && typeof hit.instanceId === 'number') {
    return voxels[hit.instanceId] ?? null
  }

  return (hit.object.userData.voxel as Voxel | undefined) ?? null
}

function createMaterials(): Record<BlockType, THREE.MeshStandardMaterial> {
  return {
    grass: material('#6fb34d', '#426c2f'),
    soil: material('#8a5a38', '#523523'),
    stone: material('#8f9692', '#535a57'),
    sand: material('#d5c079', '#8f7e46'),
    water: material('#39a7d8', '#12648a', 0.72),
    road: material('#3f3b36', '#171512'),
    brick: material('#b65b42', '#703829'),
    glass: material('#82d7c6', '#2f8275', 0.58),
    light: material('#f4cb52', '#8f6717'),
  }
}

function material(color: string, emissive: string, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.08,
    metalness: 0,
    roughness: 0.78,
    transparent: opacity < 1,
    opacity,
  })
}

function clearGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    group.remove(group.children[0])
  }
}

function sortVoxels(a: Voxel, b: Voxel) {
  return a.y - b.y || a.x - b.x || a.z - b.z
}

function loadStoredWorld() {
  const raw = localStorage.getItem(storageKey)

  if (!raw) {
    return null
  }

  return parseWorldText(raw)
}

function parseWorldText(text: string): WorldMap | null {
  const source = text.trim()

  try {
    const direct = JSON.parse(source) as WorldMap
    return isWorldMap(direct) ? direct : null
  } catch {
    try {
      const decoded = decodeURIComponent(escape(window.atob(source)))
      const parsed = JSON.parse(decoded) as WorldMap
      return isWorldMap(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}

function encodeWorld(world: WorldMap) {
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(world))))
}

function isWorldMap(value: WorldMap | null): value is WorldMap {
  return Boolean(
    value &&
      value.schemaVersion === 1 &&
      typeof value.name === 'string' &&
      typeof value.seed === 'number' &&
      Array.isArray(value.blocks) &&
      value.spawn,
  )
}

export default App
