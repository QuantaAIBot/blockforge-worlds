import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    })
  }
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assetDir = join(root, 'public', 'lore-assets')

const assets = [
  {
    id: 'crate',
    displayName: 'Crate',
    category: 'Props',
    src: './lore-assets/crate.glb',
    defaultScale: 1,
    build: createCrate,
  },
  {
    id: 'barrel',
    displayName: 'Barrel',
    category: 'Props',
    src: './lore-assets/barrel.glb',
    defaultScale: 1,
    build: createBarrel,
  },
  {
    id: 'tree',
    displayName: 'Tree',
    category: 'Nature',
    src: './lore-assets/tree.glb',
    defaultScale: 1.35,
    build: createTree,
  },
]

await mkdir(assetDir, { recursive: true })

for (const asset of assets) {
  const scene = new THREE.Scene()
  scene.name = asset.displayName
  scene.add(asset.build())

  const exporter = new GLTFExporter()
  const glb = await exporter.parseAsync(scene, { binary: true })
  await writeFile(join(assetDir, `${asset.id}.glb`), Buffer.from(glb))
}

await writeFile(
  join(assetDir, 'catalog.json'),
  `${JSON.stringify(
    assets.map(({ build: _build, ...asset }) => asset),
    null,
    2,
  )}\n`,
)

function createCrate() {
  const group = new THREE.Group()
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.95, 0.95),
    new THREE.MeshStandardMaterial({ color: '#9f6b3f', roughness: 0.88 }),
  )
  const bandMaterial = new THREE.MeshStandardMaterial({ color: '#5a3724', roughness: 0.82 })

  for (const z of [-0.51, 0.51]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.12, 0.04), bandMaterial)
    band.position.set(0, 0, z)
    group.add(band)
  }

  group.add(crate)
  return group
}

function createBarrel() {
  const group = new THREE.Group()
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.95, 24),
    new THREE.MeshStandardMaterial({ color: '#7f4d32', roughness: 0.8 }),
  )
  const rimMaterial = new THREE.MeshStandardMaterial({ color: '#2f3536', roughness: 0.55 })

  for (const y of [-0.35, 0.35]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 8, 24), rimMaterial)
    rim.rotation.x = Math.PI / 2
    rim.position.y = y
    group.add(rim)
  }

  group.add(barrel)
  return group
}

function createTree() {
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.17, 0.9, 10),
    new THREE.MeshStandardMaterial({ color: '#6b4429', roughness: 0.9 }),
  )
  trunk.position.y = 0.45

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 1.25, 12),
    new THREE.MeshStandardMaterial({ color: '#2f7b45', roughness: 0.86 }),
  )
  canopy.position.y = 1.32

  group.add(trunk, canopy)
  return group
}
