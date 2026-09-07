import { describe, expect, it } from 'vitest'
import { withChunkDelta } from '@shared/domain/relief'
import {
  DEFAULT_EDIT_NAME,
  DEFAULT_RELIEF_NAME,
  DEFAULT_SCATTER_NAME,
  DEFAULT_SCATTER_RULES,
  DEFAULT_WORLD,
  enabledScatters,
  GROUND_MATERIAL_CHANNELS,
  reliefLayer,
  scatterLayer,
  SCATTER_COLLISION_CAP,
  SCATTER_MASK_TEXELS,
  STUDIO_ENVIRONMENT,
  terrainEditLayer,
  UNLOCKED_TERRAIN,
} from '@shared/domain/scene'
import { backgroundOfKind, environmentOfKind, fogOfKind, readWorld } from './sceneWorld'

describe('reading a world back', () => {
  it('opens a document written before the world existed on the defaults', () => {
    expect(readWorld(undefined, undefined)).toEqual(DEFAULT_WORLD)
  })

  it('keeps the sky of a document that spelled it at the root', () => {
    // Every scene saved so far: `environment` beside `nodes`, with no `world` at all.
    const held = readWorld(undefined, { kind: 'skybox', assetId: 'sky-1' })

    expect(held.environment).toEqual({ kind: 'skybox', assetId: 'sky-1' })
    expect(held.exposure).toBe(DEFAULT_WORLD.exposure)
  })

  it('lets the nested sky win over the one at the root', () => {
    const held = readWorld({ environment: STUDIO_ENVIRONMENT }, { kind: 'skybox', assetId: 'old' })

    expect(held.environment).toEqual(STUDIO_ENVIRONMENT)
  })

  it('holds a hand-edited number to the bounds a slider offers', () => {
    expect(readWorld({ envIntensity: 900 }, undefined).envIntensity).toBe(3)
    expect(readWorld({ exposure: -4 }, undefined).exposure).toBe(0)
  })

  // Nothing flies a scene yet, so this is what keeps a template's intent alive across a save.
  it('keeps the play settings a template wrote, and bounds a hand-edited one', () => {
    expect(readWorld({ play: { camera: 'topDown', moveSpeed: 6 } }, undefined).play).toEqual({
      camera: 'topDown',
      eyeHeight: 1.7,
      moveSpeed: 6,
      gravity: 0,
    })
    expect(readWorld({ play: { moveSpeed: 4000 } }, undefined).play.moveSpeed).toBe(50)
  })

  it('opens a document written before the play settings existed on the studio default', () => {
    expect(readWorld({ envIntensity: 1 }, undefined).play).toEqual(DEFAULT_WORLD.play)
  })

  it('refuses a camera mode no player could honour', () => {
    expect(readWorld({ play: { camera: 'helicopter' } }, undefined).play.camera).toBe('orbit')
  })

  it('refuses a colour background with no colour rather than painting black', () => {
    expect(readWorld({ background: { kind: 'color' } }, undefined).background).toEqual({
      kind: 'environment',
      blur: 0,
    })
  })

  it('opens a backdrop written before the softening on a sharp one', () => {
    expect(readWorld({ background: { kind: 'environment' } }, undefined).background).toEqual({
      kind: 'environment',
      blur: 0,
    })
  })

  it('holds a hand-edited softening to what three.js actually takes', () => {
    expect(
      readWorld({ background: { kind: 'environment', blur: 40 } }, undefined).background,
    ).toEqual({ kind: 'environment', blur: 1 })
  })

  it('reads both forms of fog, and nothing else', () => {
    expect(
      readWorld({ fog: { kind: 'linear', color: '#fff', near: 1, far: 9 } }, undefined).fog,
    ).toEqual({ kind: 'linear', color: '#fff', near: 1, far: 9 })
    expect(
      readWorld({ fog: { kind: 'exp2', color: '#fff', density: 0.1 } }, undefined).fog,
    ).toEqual({ kind: 'exp2', color: '#fff', density: 0.1 })
    expect(readWorld({ fog: { kind: 'volumetric' } }, undefined).fog).toEqual({ kind: 'none' })
  })

  it('reads a tone mapping this build knows, and falls back on one it does not', () => {
    expect(readWorld({ toneMapping: 'reinhard' }, undefined).toneMapping).toBe('reinhard')
    expect(readWorld({ toneMapping: 'agx' }, undefined).toneMapping).toBe('none')
  })

  it('opens a document written before layers existed on none', () => {
    expect(readWorld({ envIntensity: 1 }, undefined).layers).toEqual([])
    expect(readWorld(undefined, undefined).layers).toEqual([])
  })

  it('keeps a relief that names a heightmap, and drops one that does not', () => {
    const layers = readWorld(
      { layers: [{ kind: 'relief', heightmap: { assetId: 'asset_height' } }] },
      undefined,
    ).layers
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({
      kind: 'relief',
      heightmap: { assetId: 'asset_height' },
      name: DEFAULT_RELIEF_NAME,
      enabled: true,
      locked: UNLOCKED_TERRAIN,
    })
    expect(layers[0]?.kind === 'relief' ? layers[0].id.length : 0).toBeGreaterThan(0)
    expect(readWorld({ layers: [{ kind: 'relief', heightmap: {} }] }, undefined).layers).toEqual([])
    expect(readWorld({ layers: [{ kind: 'biome' }] }, undefined).layers).toEqual([])
  })

  it('keeps the placement a relief wrote', () => {
    expect(
      readWorld(
        {
          layers: [
            {
              kind: 'relief',
              heightmap: { assetId: 'asset_height' },
              origin: { x: -40, z: 8 },
              size: { x: 128, z: 64 },
              elevation: { min: -12, max: 48 },
            },
          ],
        },
        undefined,
      ).layers,
    ).toMatchObject([
      {
        kind: 'relief',
        heightmap: { assetId: 'asset_height' },
        origin: { x: -40, z: 8 },
        size: { x: 128, z: 64 },
        elevation: { min: -12, max: 48 },
      },
    ])
  })

  it('round-trips packed sculpt deltas without expanding them to JSON floats', () => {
    const samples = { width: 4, height: 4, values: new Float32Array(16) }
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 2,
    })
    const held = readWorld(
      { layers: [{ kind: 'relief', heightmap: { assetId: 'asset_height' }, sculpt }] },
      undefined,
    )
    const layer = held.layers[0]
    if (!layer || layer.kind !== 'relief') throw new Error('expected a relief')

    expect(layer.edits).toHaveLength(1)
    expect(layer.edits[0]?.name).toBe(DEFAULT_EDIT_NAME)
    expect(layer.edits[0]?.alpha).toBe(1)
    expect(layer.edits[0]?.enabled).toBe(true)
    expect(layer.edits[0]?.sculpt).toEqual(sculpt)
    expect(JSON.stringify(layer)).not.toMatch(/"delta"|2\.0/)
  })

  it('opens a sculpt-only document as one implicit edit layer named Sculpt', () => {
    const samples = { width: 4, height: 4, values: new Float32Array(16) }
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 0,
      localZ: 0,
      delta: 1,
    })
    const held = readWorld(
      {
        layers: [
          {
            kind: 'relief',
            heightmap: { assetId: 'asset_height' },
            sculpt: { grain: 64, chunks: sculpt.chunks },
          },
        ],
      },
      undefined,
    )
    const layer = held.layers[0]
    if (!layer || layer.kind !== 'relief') throw new Error('expected a relief')

    expect(layer.grain).toBe(64)
    expect(layer.name).toBe(DEFAULT_RELIEF_NAME)
    expect(layer.enabled).toBe(true)
    expect(layer.locked).toEqual(UNLOCKED_TERRAIN)
    expect(layer.edits).toEqual([
      expect.objectContaining({
        name: DEFAULT_EDIT_NAME,
        enabled: true,
        locked: false,
        alpha: 1,
        sculpt,
      }),
    ])
    expect(layer.id.length).toBeGreaterThan(0)
    expect(layer.edits[0]?.id.length).toBeGreaterThan(0)
  })

  it('round-trips a terrain with several named edits, keeping their identity', () => {
    const samples = { width: 4, height: 4, values: new Float32Array(16) }
    const hills = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 1,
      localZ: 0,
      delta: 2,
    })
    const valley = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 2,
      localZ: 0,
      delta: -1,
    })
    const written = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'island',
        name: 'Island',
        grain: 64,
        edits: [
          terrainEditLayer({ id: 'hills', name: 'Hills', sculpt: hills }),
          terrainEditLayer({ id: 'valley', name: 'Valley', alpha: 0.5, sculpt: valley }),
        ],
      },
    )
    const held = readWorld({ layers: [written] }, undefined)

    expect(held.layers).toEqual([written])
  })

  it('round-trips an edit mask', () => {
    const written = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'island',
        edits: [
          terrainEditLayer({
            id: 'hills',
            mask: { kind: 'height', min: 100, max: 800 },
          }),
        ],
      },
    )
    expect(readWorld({ layers: [written] }, undefined).layers).toEqual([written])
  })

  it('gives a ground with no colour the studio one rather than a string', () => {
    expect(readWorld({ ground: { visible: true } }, undefined).ground).toEqual({
      visible: true,
      color: null,
      size: 20,
      opacity: 1,
      receiveShadow: true,
    })
  })

  it('round-trips a scatter layer, including inert water and road distances', () => {
    const written = scatterLayer({
      id: 'pines',
      name: 'Pines',
      assets: [
        { assetId: 'tree-a', weight: 2 },
        { assetId: 'tree-b', weight: 1 },
      ],
      seed: 17,
      collision: true,
      followRelief: 'layer',
      mask: { kind: 'height', min: 4, max: 40 },
      rules: {
        ...DEFAULT_SCATTER_RULES,
        density: 0.4,
        spacing: 3,
        slopeAlign: 60,
        waterDistance: 8,
        roadDistance: 2,
      },
    })
    expect(readWorld({ layers: [written] }, undefined).layers).toEqual([written])
  })

  it('keeps a scatter with no assets, and fills the defaults a file omitted', () => {
    const layers = readWorld({ layers: [{ kind: 'scatter' }] }, undefined).layers
    expect(layers).toHaveLength(1)
    expect(layers[0]).toMatchObject({
      kind: 'scatter',
      name: DEFAULT_SCATTER_NAME,
      enabled: true,
      locked: false,
      assets: [],
      seed: 1,
      category: 'props',
      collision: false,
      followRelief: 'brush',
      rules: DEFAULT_SCATTER_RULES,
    })
    expect(layers[0]?.kind === 'scatter' ? layers[0].id.length : 0).toBeGreaterThan(0)
  })

  it('normalizes stored grass collision while existing scatters remain props', () => {
    const layers = readWorld(
      {
        layers: [
          { kind: 'scatter', id: 'legacy', collision: true },
          { kind: 'scatter', id: 'meadow', category: 'grass', collision: true },
        ],
      },
      undefined,
    ).layers
    expect(layers).toMatchObject([
      { id: 'legacy', category: 'props', collision: true },
      { id: 'meadow', category: 'grass', collision: false },
    ])
  })

  it('loads a relief-only document identically when a scatter kind exists', () => {
    const written = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'island',
        name: 'Island',
        grain: 64,
        edits: [terrainEditLayer({ id: 'hills', name: 'Hills' })],
      },
    )
    expect(readWorld({ layers: [written] }, undefined).layers).toEqual([written])
  })

  it('keeps mixed relief and scatter in the order they were written', () => {
    const terrain = reliefLayer({ assetId: 'asset_height' }, { id: 'ground' })
    const scatter = scatterLayer({ id: 'rocks', assets: [{ assetId: 'boulder', weight: 1 }] })
    expect(readWorld({ layers: [terrain, scatter] }, undefined).layers).toEqual([terrain, scatter])
    expect(enabledScatters([terrain, scatter]).map(layer => layer.id)).toEqual(['rocks'])
  })

  it('round-trips a ground material array reserved for later splat layers', () => {
    const written = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'island',
        groundMaterials: [{ albedo: { assetId: 'dirt' }, normal: null, channel: 'r' }],
      },
    )
    expect(readWorld({ layers: [written] }, undefined).layers).toEqual([written])
    expect(
      readWorld({ layers: [{ kind: 'relief', heightmap: { assetId: 'asset_height' } }] }, undefined)
        .layers[0],
    ).toMatchObject({ groundMaterials: [], groundWeights: null })
  })

  it('migrates a legacy ground picture without enabling splat blending', () => {
    const layer = readWorld(
      {
        layers: [
          {
            kind: 'relief',
            heightmap: { assetId: 'height' },
            groundMaterials: [{ texture: { assetId: 'painted' }, weight: 1 }],
          },
        ],
      },
      undefined,
    ).layers[0]

    expect(layer).toMatchObject({
      groundMaterials: [{ albedo: { assetId: 'painted' }, normal: null, channel: 'r' }],
      groundWeights: null,
    })
  })

  it('round-trips four channelled materials and shared weights', () => {
    const written = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: GROUND_MATERIAL_CHANNELS.map((channel, index) => ({
          albedo: { assetId: `albedo-${index}` },
          normal: index === 0 ? null : { assetId: `normal-${index}` },
          channel,
        })),
        groundWeights: { assetId: 'weights' },
      },
    )

    expect(readWorld({ layers: [written] }, undefined).layers).toEqual([written])
  })

  it('publishes the scatter collision cap and the painted-mask texel count', () => {
    expect(SCATTER_COLLISION_CAP).toBe(4096)
    expect(SCATTER_MASK_TEXELS).toBe(256)
  })
})

describe('switching the form of a fog', () => {
  it('carries the colour across and nothing else', () => {
    const held = fogOfKind('exp2', { kind: 'linear', color: '#abcdef', near: 3, far: 7 })

    expect(held).toEqual({ kind: 'exp2', color: '#abcdef', density: 0.02 })
  })

  it('opens on something visible when turned on from nothing', () => {
    expect(fogOfKind('linear', { kind: 'none' })).toMatchObject({
      kind: 'linear',
      near: 10,
      far: 60,
    })
  })

  it('keeps no colour at all when turned off', () => {
    expect(fogOfKind('none', { kind: 'exp2', color: '#abcdef', density: 0.1 })).toEqual({
      kind: 'none',
    })
  })
})

describe('switching what lights a scene', () => {
  const offered = { pictures: [{ id: 'asset-1' }, { id: 'asset-2' }], skies: [{ id: 'sky-1' }] }
  const nothing = { pictures: [], skies: [] }

  it('hangs the first picture of the project when one is asked for', () => {
    expect(environmentOfKind('skybox', offered)).toEqual({ kind: 'skybox', assetId: 'asset-1' })
  })

  it('follows the first sky DOCUMENT of the project when one is asked for', () => {
    expect(environmentOfKind('sky', offered)).toEqual({ kind: 'sky', documentId: 'sky-1' })
  })

  // Both are REFERENCES: with none to point at, the answer is the studio rather than a link
  // to nothing.
  it('stays on the studio when the project holds neither', () => {
    expect(environmentOfKind('skybox', nothing)).toEqual(STUDIO_ENVIRONMENT)
    expect(environmentOfKind('sky', nothing)).toEqual(STUDIO_ENVIRONMENT)
  })

  it('goes back to the studio whatever the project holds', () => {
    expect(environmentOfKind('studio', offered)).toEqual(STUDIO_ENVIRONMENT)
  })
})

describe('switching the form of a backdrop', () => {
  it('carries the colour across, so leaving and coming back keeps what was chosen', () => {
    const chosen = backgroundOfKind('color', { kind: 'environment', blur: 0 })
    const away = backgroundOfKind('transparent', chosen)

    expect(backgroundOfKind('color', away)).toEqual(chosen)
  })

  it('opens on a colour of its own when none was ever chosen', () => {
    expect(backgroundOfKind('color', { kind: 'environment', blur: 0 })).toMatchObject({
      kind: 'color',
    })
  })

  it('carries nothing back to the environment', () => {
    expect(backgroundOfKind('environment', { kind: 'color', color: '#123456' })).toEqual({
      kind: 'environment',
      blur: 0,
    })
  })
})
