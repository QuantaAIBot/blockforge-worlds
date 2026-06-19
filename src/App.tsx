import {
  Box,
  Crosshair,
  Download,
  Maximize2,
  Eraser,
  Package,
  Minus,
  Paintbrush,
  Plus,
  RefreshCcw,
  RotateCw,
  Save,
  Share2,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
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
import { parseWorldText } from './worldMigration'
import type {
  AssetDescriptor,
  BlockType,
  MapZone,
  PropPlacement,
  ToolMode,
  Vec3,
  Voxel,
  WorldMap,
} from './world'

const storageKey = 'blockforge-worlds.active-map'

interface VoxelAction {
  voxel: Voxel
  normal: { x: number; y: number; z: number }
  point: Vec3
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
  { mode: 'prop', label: 'Prop', icon: Package },
]

const propYawStep = Math.PI / 12
const propScaleStep = 0.1
const minPropScale = 0.05
const maxPropScale = 50

function App() {
  const [world, setWorld] = useState<WorldMap>(() => loadStoredWorld() ?? createWorld(120_626))
  const [selectedBlock, setSelectedBlock] = useState<BlockType>('brick')
  const [assets, setAssets] = useState<AssetDescriptor[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null)
  const [tool, setTool] = useState<ToolMode>('paint')
  const [notice, setNotice] = useState('Map forge online')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )
  const selectedProp = useMemo(
    () => world.props.find((prop) => prop.id === selectedPropId) ?? null,
    [selectedPropId, world.props],
  )

  const stats = useMemo(() => {
    const typeCounts = world.blocks.reduce<Record<string, number>>((counts, block) => {
      counts[block.type] = (counts[block.type] ?? 0) + 1
      return counts
    }, {})

    return {
      blocks: world.blocks.length.toLocaleString(),
      zones: world.zones.length,
      props: world.props.length,
      topMaterial:
        Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'none',
    }
  }, [world.blocks, world.props.length, world.zones.length])

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice('Ready'), 1800)
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch('./lore-assets/catalog.json')
      .then((response) => (response.ok ? response.json() : Promise.reject(response.statusText)))
      .then((catalog: AssetDescriptor[]) => {
        if (cancelled) {
          return
        }

        setAssets(catalog)
        setSelectedAssetId((current) => current ?? catalog[0]?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          showNotice('Asset catalog unavailable')
        }
      })

    return () => {
      cancelled = true
    }
  }, [showNotice])

  const handleWorldAction = useCallback(
    ({ voxel, normal, point }: VoxelAction) => {
      setWorld((current) => {
        if (tool === 'prop') {
          if (!selectedAsset) {
            return current
          }

          const prop: PropPlacement = {
            id: crypto.randomUUID(),
            assetId: selectedAsset.id,
            x: point.x,
            y: point.y,
            z: point.z,
            rotY: 0,
            scale: clampPropScale(selectedAsset.defaultScale),
          }

          setSelectedPropId(prop.id)

          return withUpdatedTimestamp({
            ...current,
            props: [...current.props, prop],
          })
        }

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
    [selectedAsset, selectedBlock, tool],
  )

  const updateSelectedProp = useCallback(
    (update: (prop: PropPlacement) => PropPlacement | null) => {
      if (!selectedPropId) {
        return
      }

      setWorld((current) => {
        let changed = false
        const props = current.props.flatMap((prop) => {
          if (prop.id !== selectedPropId) {
            return [prop]
          }

          const next = update(prop)
          changed = true
          return next ? [next] : []
        })

        if (!changed) {
          return current
        }

        if (!props.some((prop) => prop.id === selectedPropId)) {
          setSelectedPropId(null)
        }

        return withUpdatedTimestamp({
          ...current,
          props,
        })
      })
    },
    [selectedPropId],
  )

  const rotateSelectedProp = useCallback(() => {
    updateSelectedProp((prop) => ({ ...prop, rotY: prop.rotY + propYawStep }))
  }, [updateSelectedProp])

  const scaleSelectedProp = useCallback(
    (direction: 1 | -1) => {
      updateSelectedProp((prop) => ({
        ...prop,
        scale: clampPropScale(prop.scale + propScaleStep * direction),
      }))
    },
    [updateSelectedProp],
  )

  const deleteSelectedProp = useCallback(() => {
    updateSelectedProp(() => null)
  }, [updateSelectedProp])

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
        assetCatalog={assets}
        selectedPropId={selectedPropId}
        tool={tool}
        onVoxelAction={handleWorldAction}
        onPropSelect={setSelectedPropId}
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
          <Metric label="Props" value={String(stats.props)} />
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

      <section className="asset-palette" aria-label="LORE asset palette">
        <div className="asset-list">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={selectedAssetId === asset.id ? 'active' : ''}
              title={asset.displayName}
              onClick={() => {
                setSelectedAssetId(asset.id)
                setTool('prop')
              }}
            >
              <Package aria-hidden="true" />
              <span>
                <strong>{asset.displayName}</strong>
                <em>{asset.category}</em>
              </span>
            </button>
          ))}
        </div>
        <div className="prop-controls">
          <IconButton label="Rotate selected prop" onClick={rotateSelectedProp}>
            <RotateCw aria-hidden="true" />
          </IconButton>
          <IconButton label="Scale selected prop down" onClick={() => scaleSelectedProp(-1)}>
            <Minus aria-hidden="true" />
          </IconButton>
          <IconButton label="Scale selected prop up" onClick={() => scaleSelectedProp(1)}>
            <Maximize2 aria-hidden="true" />
          </IconButton>
          <IconButton label="Delete selected prop" onClick={deleteSelectedProp}>
            <Trash2 aria-hidden="true" />
          </IconButton>
        </div>
        <div className="prop-readout">
          {selectedProp
            ? `${selectedProp.assetId} · ${selectedProp.scale.toFixed(2)}x`
            : selectedAsset
              ? selectedAsset.displayName
              : 'No assets'}
        </div>
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
  assetCatalog,
  selectedPropId,
  onVoxelAction,
  onPropSelect,
}: {
  world: WorldMap
  tool: ToolMode
  selectedBlock: BlockType
  assetCatalog: AssetDescriptor[]
  selectedPropId: string | null
  onVoxelAction: (action: VoxelAction) => void
  onPropSelect: (id: string | null) => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const blockGroupRef = useRef<THREE.Group | null>(null)
  const overlayGroupRef = useRef<THREE.Group | null>(null)
  const propsGroupRef = useRef<THREE.Group | null>(null)
  const loaderRef = useRef(new GLTFLoader())
  const assetCacheRef = useRef(new Map<string, Promise<THREE.Object3D>>())
  const targetsRef = useRef<THREE.Object3D[]>([])
  const actionRef = useRef(onVoxelAction)
  const propSelectRef = useRef(onPropSelect)
  const selectedRef = useRef(selectedBlock)
  const toolRef = useRef(tool)

  useEffect(() => {
    actionRef.current = onVoxelAction
    propSelectRef.current = onPropSelect
    selectedRef.current = selectedBlock
    toolRef.current = tool
  }, [onPropSelect, onVoxelAction, selectedBlock, tool])

  useEffect(() => {
    const mount = mountRef.current

    if (!mount) {
      return undefined
    }

    const assetCache = assetCacheRef.current
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
    const propsGroup = new THREE.Group()
    blockGroupRef.current = blockGroup
    overlayGroupRef.current = overlayGroup
    propsGroupRef.current = propsGroup
    scene.add(blockGroup, propsGroup, overlayGroup)

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

      if (toolRef.current === 'prop') {
        const propGroup = propsGroupRef.current
        const [propHit] = propGroup ? raycaster.intersectObjects(propGroup.children, true) : []
        const propId = getHitPropId(propHit?.object)

        if (propId) {
          propSelectRef.current(propId)
          return
        }
      }

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
        point: {
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
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
      clearGroup(propsGroup)
      for (const asset of assetCache.values()) {
        asset.then(disposeObject).catch(() => undefined)
      }
      assetCache.clear()
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

  useEffect(() => {
    const propsGroup = propsGroupRef.current

    if (!propsGroup) {
      return undefined
    }

    let cancelled = false
    clearGroup(propsGroup)

    const assetsById = new Map(assetCatalog.map((asset) => [asset.id, asset]))

    const renderProps = async () => {
      for (const prop of world.props) {
        const asset = assetsById.get(prop.assetId)

        if (!asset) {
          continue
        }

        const source = await loadAsset(asset, loaderRef.current, assetCacheRef.current)

        if (cancelled) {
          return
        }

        const object = source.clone(true)
        object.position.set(prop.x, prop.y, prop.z)
        object.rotation.y = prop.rotY
        object.scale.setScalar(clampPropScale(prop.scale))
        markPropObject(object, prop.id)
        propsGroup.add(object)

        if (prop.id === selectedPropId) {
          const helper = new THREE.BoxHelper(object, '#f4cb52')
          helper.userData.propId = prop.id
          propsGroup.add(helper)
        }
      }
    }

    void renderProps()

    return () => {
      cancelled = true
      clearGroup(propsGroup)
    }
  }, [assetCatalog, selectedPropId, world.props])

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

function loadAsset(
  asset: AssetDescriptor,
  loader: GLTFLoader,
  cache: Map<string, Promise<THREE.Object3D>>,
) {
  const cached = cache.get(asset.id)

  if (cached) {
    return cached
  }

  const load = loader.loadAsync(asset.src).then((gltf) => gltf.scene)
  cache.set(asset.id, load)
  return load
}

function markPropObject(object: THREE.Object3D, propId: string) {
  object.userData.propId = propId
  object.traverse((child) => {
    child.userData.propId = propId
  })
}

function getHitPropId(object: THREE.Object3D | undefined) {
  let current: THREE.Object3D | null | undefined = object

  while (current) {
    const propId = current.userData.propId

    if (typeof propId === 'string') {
      return propId
    }

    current = current.parent
  }

  return null
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

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      disposeMaterial(child.material)
    }
  })
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose())
    return
  }

  material.dispose()
}

function clampPropScale(scale: number) {
  return Math.min(maxPropScale, Math.max(minPropScale, scale))
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

function encodeWorld(world: WorldMap) {
  return window.btoa(unescape(encodeURIComponent(JSON.stringify(world))))
}

export default App
