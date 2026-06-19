// Generates the canonical round-trip test manifest from the REAL toUePlacement().
// Run: npx tsx ue/test-fixtures/gen-fixture.ts  (writes roundtrip-manifest.json)
import { writeFileSync } from 'node:fs'
import { toUePlacement } from '../../src/ueExport'
import type { WorldMap } from '../../src/world'

// L-shaped greybox (asymmetric in the ground plane -> reveals global mirror/forward),
// two block types (HISMC-count check), one prop at rotY=PI/2 (yaw-sign check), a zone, a spawn.
const world: WorldMap = {
  schemaVersion: 2,
  name: 'RoundTrip-Fixture',
  seed: 1,
  size: 8,
  createdAt: '2026-06-19T00:00:00.000Z',
  updatedAt: '2026-06-19T00:00:00.000Z',
  spawn: { x: 0, y: 0, z: 0 },
  spawnYaw: 0,
  zones: [{ id: 'z1', name: 'Zone One', kind: 'safehouse', color: '#f4cb52', x: 0, z: 0, width: 3, depth: 2 }],
  blocks: [
    { x: 0, y: 0, z: 0, type: 'grass' }, // L: long arm along +x ...
    { x: 1, y: 0, z: 0, type: 'grass' },
    { x: 2, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 0, z: 1, type: 'grass' }, // ... foot along +z (asymmetric -> mirror-revealing)
    { x: 0, y: 1, z: 0, type: 'brick' }, // 2nd type -> expect 2 HISMC actors
  ],
  props: [{ id: 'p1', assetId: 'crate', x: 2, y: 0, z: 0, rotY: Math.PI / 2, scale: 1 }],
}

const manifest = toUePlacement(world)
writeFileSync(new URL('./roundtrip-manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n')
console.log('greybox=%d props=%d zones=%d', manifest.greybox.length, manifest.props.length, manifest.zones.length)
console.log('prop yawDeg=%s (expect -90)  prop pos=(%s,%s,%s) expect (200,0,0)', manifest.props[0].yawDeg, manifest.props[0].x, manifest.props[0].y, manifest.props[0].z)
