import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD, reliefLayer, scatterLayer, terrainEditLayer } from '@shared/domain/scene'
import { withChunkDelta } from '@shared/domain/relief'
import { createScatterSurface } from './scatterSurface'
import { createModelCache } from './modelCache'
import { cellKey } from './worldPartition'

function staticTree(): Object3D {
  const root = new Object3D()
  const trunk = new Mesh(new BoxGeometry(0.4, 2, 0.4), new MeshBasicMaterial())
  const crown = new Mesh(new BoxGeometry(1.5, 1.5, 1.5), new MeshBasicMaterial())
  crown.position.y = 1.5
  root.add(trunk, crown)
  return root
}

describe('createScatterSurface sync', () => {
  it('does not rebuild a cell whose layer misses the dirtied relief chunk', async () => {
    const samples = { width: 129, height: 129, values: new Float32Array(129 * 129) }
    const scatter = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 32, z: 32 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.05, spacing: 8 },
    })
    const terrain = reliefLayer(
      { assetId: 'height' },
      {
        id: 'ground',
        origin: { x: 0, z: 0 },
        size: { x: 512, z: 512 },
        grain: 64,
        edits: [terrainEditLayer({ id: 'sculpt' })],
      },
    )
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const before = { ...DEFAULT_WORLD, layers: [terrain, scatter] }
    await surface.sync(before, new Map([['height', samples]]))
    const held = surface.objectsInCell('trees', cellKey(0, 0))
    const sculpt = withChunkDelta(samples, undefined, {
      column: 6,
      row: 0,
      localX: 1,
      localZ: 1,
      delta: 1,
    })
    await surface.sync(
      {
        ...before,
        layers: [{ ...terrain, edits: [terrainEditLayer({ id: 'sculpt', sculpt })] }, scatter],
      },
      new Map([['height', samples]]),
    )
    expect(surface.objectsInCell('trees', cellKey(0, 0))).toEqual(held)
    expect(surface.objectsInCell('trees', cellKey(0, 0))[0]).toBe(held[0])
    surface.dispose()
  })

  it('keeps drawn cells when a metadata sync starts while a rebuild is still loading', async () => {
    const pine = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 512, z: 256 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
    })
    const tree = staticTree()
    let revealBirch: ((tree: Object3D) => void) | undefined
    const birch = new Promise<Object3D>(resolve => {
      revealBirch = resolve
    })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async url => (url.includes('pine') ? tree : birch),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const pineWorld = { ...DEFAULT_WORLD, layers: [pine] }
    await surface.sync(pineWorld)
    expect(surface.objectsInCell('trees', cellKey(0, 0)).length).toBeGreaterThan(0)

    const pending = surface.sync({
      ...pineWorld,
      layers: [{ ...pine, assets: [{ assetId: 'birch', weight: 1 }] }],
    })
    await Promise.resolve()
    const named = surface.sync({ ...pineWorld, layers: [{ ...pine, name: 'Forest' }] })
    revealBirch?.(staticTree())
    await pending
    await named
    expect(surface.objectsInCell('trees', cellKey(0, 0)).length).toBeGreaterThan(0)
    surface.dispose()
  })

  it('lets a sync settle after disposal instead of stranding the ones behind it', async () => {
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })

    surface.dispose()
    await surface.sync(DEFAULT_WORLD)

    // The one behind a disposed sync must not wait on a lock that was never released.
    await expect(
      Promise.race([
        surface.sync(DEFAULT_WORLD).then(() => 'settled'),
        new Promise(resolve => setTimeout(() => resolve('stranded'), 50)),
      ]),
    ).resolves.toBe('settled')
  })
})
