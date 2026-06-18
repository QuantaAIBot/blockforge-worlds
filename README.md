# BlockForge Worlds

BlockForge Worlds is a browser-first block map forge for building exportable game worlds. The first slice is a playable Three.js editor with procedural terrain, block painting, terrain raise/lower tools, spawn placement, local save/load, import/export, and an Android APK wrapper through Capacitor.

The project is intentionally kept separate from the earlier browser game repo.

## Public Web Build

The public browser build is served through GitHub Pages:

```text
https://quantaaibot.github.io/blockforge-worlds/
```

That URL is reachable from normal browsers, VPS boxes, Spark, Hetzner hosts, and other external services without depending on a local dev server.

## Current Build

- 3D voxel island rendered with Three.js
- Orbit camera for desktop and touch screens
- Block palette: grass, soil, stone, sand, water, road, brick, glass, light
- Tools: paint, erase, raise, lower, set spawn
- Local save/load in browser storage
- `.bfworld.json` export/import
- Share-code copy for moving maps between machines
- Android debug APK build through Capacitor

## Local Commands

```bash
npm install
npm run dev
npm run build
npm run android:debug
```

The debug APK is generated at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Android Notes

This repo uses Capacitor, so the web build in `dist` is copied into the native Android shell before Gradle builds the APK.

On this Windows machine the Android SDK lives at:

```text
C:\Users\14172\AppData\Local\Android\Sdk
```

If Gradle cannot find it, set `ANDROID_HOME` and `JAVA_HOME` before building.

## Map Format

Exported maps are JSON objects with:

- `schemaVersion`
- `name`
- `seed`
- `spawn`
- `zones`
- `blocks`

Blocks are stored as `{ x, y, z, type }` voxels. Zones are simple rectangles with a `kind` field so later exporters can map them to mission areas, shops, safe houses, races, or other game-specific concepts.

The format is designed to support future exporters for our own game runtime, UEFN-style workflows, FiveM/Cfx-style map pipelines, Godot, Unreal, or Blender.
