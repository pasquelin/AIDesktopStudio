import { SCATTER_DISTANCE } from '@shared/domain/renderPolicy'
import {
  BoxGeometry,
  InstancedMesh,
  LOD,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_WORLD,
  reliefLayer,
  scatterLayer,
  terrainEditLayer,
  type ScatterLayer,
} from '@shared/domain/scene'
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

describe('createScatterSurface', () => {
  it('draws every primitive of the loaded static asset as instanced batches', async () => {
    const scene = new Scene()
    const surface = createScatterSurface(scene, {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [
        scatterLayer({
          id: 'trees',
          assets: [{ assetId: 'pine', weight: 1 }],
          origin: { x: 0, z: 0 },
          size: { x: 10, z: 10 },
          rules: {
            density: 0.5,
            spacing: 2,
            minScale: 1,
            maxScale: 1,
            randomRotation: false,
            randomTilt: 0,
            slopeAlign: 0,
            altitudeMin: -10,
            altitudeMax: 10,
            slopeMin: 0,
            slopeMax: 90,
          },
        }),
      ],
    })
    const lods = surface.object.children.filter(child => child instanceof LOD)
    const meshes = lods.flatMap(lod =>
      lod.levels.flatMap(level => (level.object instanceof InstancedMesh ? [level.object] : [])),
    )
    expect(lods.length).toBeGreaterThan(0)
    expect(meshes.length).toBe(lods.length * 2)
    expect(new Set(meshes.map(mesh => mesh.geometry)).size).toBe(2)
    expect(meshes.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(1)
    expect(surface.object.children.length).toBe(lods.length)
    surface.dispose()
  })

  it('reports and excludes an animated asset instead of drawing a placeholder', async () => {
    const scene = new Scene()
    const animated = staticTree()
    animated.animations = [{ name: 'wind' }] as never
    const onUnsupported = vi.fn()
    const surface = createScatterSurface(scene, {
      models: createModelCache(
        async () => animated,
        () => undefined,
      ),
      onUnsupported,
    })
    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [scatterLayer({ id: 'trees', assets: [{ assetId: 'pine', weight: 1 }] })],
    })
    expect(onUnsupported).toHaveBeenCalledWith('pine', 'animatedModel')
    expect(surface.object.children).toEqual([])
    surface.dispose()
  })

  it('rebuilds only cells covered by a dirtied relief chunk', async () => {
    const samples = { width: 129, height: 129, values: new Float32Array(129 * 129) }
    const scatter = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 512, z: 256 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
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
    const west = surface.objectsInCell('trees', cellKey(0, 0))
    const east = surface.objectsInCell('trees', cellKey(1, 0))
    const sculpt = withChunkDelta(samples, undefined, {
      column: 0,
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
    expect(surface.objectsInCell('trees', cellKey(0, 0))).not.toEqual(west)
    expect(surface.objectsInCell('trees', cellKey(1, 0))).toEqual(east)
    expect(surface.objectsInCell('trees', cellKey(1, 0))[0]).toBe(east[0])
    surface.dispose()
  })

  it('uses the world partition to hide cells beyond what a scatter is drawn to', async () => {
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [
        scatterLayer({
          id: 'trees',
          assets: [{ assetId: 'pine', weight: 1 }],
          origin: { x: 0, z: 0 },
          size: { x: 512, z: 256 },
          rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
        }),
      ],
    })
    // 🛑 Past SCATTER_DISTANCE, and not past the far plane: the reach is the scatter's own, so an
    // eye whose lens sees no further than 200 still holds both cells of a layer at its feet.
    const camera = new PerspectiveCamera(50, 1, 0.1, 200)
    camera.position.set(0, 10, 0)
    camera.updateMatrixWorld(true)

    surface.updateVisibility(camera)

    expect(surface.objectsInCell('trees', cellKey(0, 0))[0]?.visible).toBe(true)
    expect(surface.objectsInCell('trees', cellKey(1, 0))[0]?.visible).toBe(true)

    camera.position.set(SCATTER_DISTANCE + 512, 10, 0)
    camera.updateMatrixWorld(true)
    surface.updateVisibility(camera)

    expect(surface.objectsInCell('trees', cellKey(0, 0))[0]?.visible).toBe(false)
    surface.dispose()
  })

  it('reuses visibility until the camera or rendered cells change', async () => {
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 512, z: 256 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
    })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({ ...DEFAULT_WORLD, layers: [layer] })
    const camera = new PerspectiveCamera(50, 1, 0.1, 200)
    camera.updateMatrixWorld(true)
    const query = vi.spyOn(surface.partition, 'query')

    surface.updateVisibility(camera)
    surface.updateVisibility(camera)
    await surface.sync({ ...DEFAULT_WORLD, layers: [{ ...layer, name: 'Forest' }] })
    surface.updateVisibility(camera)
    expect(query).toHaveBeenCalledTimes(1)

    camera.position.x = 1
    camera.updateMatrixWorld(true)
    surface.updateVisibility(camera)
    // A lens that changes asks for nothing: what a scatter is drawn to is not what a camera sees to.
    camera.far = 100
    surface.updateVisibility(camera)
    expect(query).toHaveBeenCalledTimes(2)

    await surface.sync({ ...DEFAULT_WORLD, layers: [{ ...layer, seed: layer.seed + 1 }] })
    surface.updateVisibility(camera)
    expect(query).toHaveBeenCalledTimes(3)
    surface.dispose()
  })

  it('keeps every drawn instance when only layer metadata changes', async () => {
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 512, z: 256 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
    })
    if (layer.category !== 'props') throw new Error('expected props')
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({ ...DEFAULT_WORLD, layers: [layer] })
    const west = surface.objectsInCell('trees', cellKey(0, 0))
    const east = surface.objectsInCell('trees', cellKey(1, 0))

    const metadata: ScatterLayer = { ...layer, name: 'Forest', locked: true, collision: true }
    await surface.sync({ ...DEFAULT_WORLD, layers: [metadata] })

    expect(surface.objectsInCell('trees', cellKey(0, 0))).toBe(west)
    expect(surface.objectsInCell('trees', cellKey(1, 0))).toBe(east)
    surface.dispose()
  })

  it('removes cells from the old extent when a layer moves', async () => {
    const layer = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 256, z: 256 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.01, spacing: 16 },
    })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({ ...DEFAULT_WORLD, layers: [layer] })
    expect(surface.objectsInCell('trees', cellKey(0, 0))).not.toEqual([])

    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [{ ...layer, origin: { x: 512, z: 0 } }],
    })

    expect(surface.objectsInCell('trees', cellKey(0, 0))).toEqual([])
    expect(surface.objectsInCell('trees', cellKey(2, 0))).not.toEqual([])
    surface.dispose()
  })

  it('rebuilds grounded scatter when its terrain is disabled', async () => {
    const samples = { width: 5, height: 5, values: new Float32Array(25).fill(8) }
    const scatter = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 32, z: 32 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.05, spacing: 8 },
    })
    const terrain = reliefLayer({ assetId: 'height' }, { id: 'ground' })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync(
      { ...DEFAULT_WORLD, layers: [terrain, scatter] },
      new Map([['height', samples]]),
    )
    const grounded = surface.objectsInCell('trees', cellKey(0, 0))[0]
    expect(grounded).toBeDefined()

    await surface.sync(
      { ...DEFAULT_WORLD, layers: [{ ...terrain, enabled: false }, scatter] },
      new Map([['height', samples]]),
    )

    const flat = surface.objectsInCell('trees', cellKey(0, 0))[0]
    expect(flat).not.toBe(grounded)
    expect(flat).toBeDefined()
    surface.dispose()
  })

  it('disposes instanced batches when a cell is rebuilt or the surface is dropped', async () => {
    const disposed: InstancedMesh[] = []
    const original = InstancedMesh.prototype.dispose
    InstancedMesh.prototype.dispose = function disposeMesh(this: InstancedMesh) {
      disposed.push(this)
      original.call(this)
    }
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const world = {
      ...DEFAULT_WORLD,
      layers: [
        scatterLayer({
          id: 'trees',
          assets: [{ assetId: 'pine', weight: 1 }],
          origin: { x: 0, z: 0 },
          size: { x: 10, z: 10 },
          rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.5, spacing: 2 },
        }),
      ],
    }
    try {
      await surface.sync(world)
      expect(disposed).toEqual([])
      await surface.sync({
        ...world,
        layers: world.layers.map(layer =>
          layer.kind === 'scatter' ? { ...layer, seed: layer.seed + 1 } : layer,
        ),
      })
      expect(disposed.length).toBeGreaterThan(0)
      const afterRebuild = disposed.length
      surface.dispose()
      expect(disposed.length).toBeGreaterThan(afterRebuild)
    } finally {
      InstancedMesh.prototype.dispose = original
    }
  })

  it('rebuilds poses when a heightmap arrives after the first sync', async () => {
    const scatter = scatterLayer({
      id: 'trees',
      assets: [{ assetId: 'pine', weight: 1 }],
      origin: { x: 0, z: 0 },
      size: { x: 32, z: 32 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.05, spacing: 8 },
    })
    const terrain = reliefLayer({ assetId: 'height' }, { id: 'ground' })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const world = { ...DEFAULT_WORLD, layers: [terrain, scatter] }
    await surface.sync(world)
    const before = surface.objectsInCell('trees', cellKey(0, 0))[0]
    const samples = { width: 5, height: 5, values: new Float32Array(25).fill(8) }
    await surface.sync(world, new Map([['height', samples]]))
    expect(surface.objectsInCell('trees', cellKey(0, 0))[0]).not.toBe(before)
    surface.dispose()
  })

  it('keeps shared source geometry until instanced batches leave the scene', async () => {
    const pine = staticTree()
    const geometries: Mesh['geometry'][] = []
    pine.traverse(object => {
      if (object instanceof Mesh) geometries.push(object.geometry)
    })
    const disposed: Mesh['geometry'][] = []
    for (const geometry of geometries) {
      const original = geometry.dispose.bind(geometry)
      geometry.dispose = () => {
        disposed.push(geometry)
        original()
      }
    }
    let revealBirch: ((tree: Object3D) => void) | undefined
    const birch = new Promise<Object3D>(resolve => {
      revealBirch = resolve
    })
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async url => (url.includes('pine') ? pine : birch),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const pineWorld = {
      ...DEFAULT_WORLD,
      layers: [
        scatterLayer({
          id: 'trees',
          assets: [{ assetId: 'pine', weight: 1 }],
          origin: { x: 0, z: 0 },
          size: { x: 10, z: 10 },
          rules: { ...scatterLayer({ id: 'rules' }).rules, density: 0.5, spacing: 2 },
        }),
      ],
    }
    await surface.sync(pineWorld)
    expect(surface.object.children.length).toBeGreaterThan(0)
    const pending = surface.sync({
      ...pineWorld,
      layers: pineWorld.layers.map(layer =>
        layer.kind === 'scatter' ? { ...layer, assets: [{ assetId: 'birch', weight: 1 }] } : layer,
      ),
    })
    await Promise.resolve()
    expect(surface.object.children).toEqual([])
    expect(disposed.length).toBeGreaterThan(0)
    revealBirch?.(staticTree())
    await pending
    surface.dispose()
  })

  it('keeps grass in finer persistent cells than props', async () => {
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [
        scatterLayer({
          id: 'meadow',
          category: 'grass',
          assets: [{ assetId: 'blade', weight: 1 }],
          origin: { x: 0, z: 0 },
          size: { x: 64, z: 64 },
          rules: { ...scatterLayer({ id: 'rules' }).rules, density: 1, spacing: 1 },
        }),
      ],
    })
    expect([
      surface.objectsInCell('meadow', cellKey(0, 0)).length,
      surface.objectsInCell('meadow', cellKey(1, 0)).length,
      surface.objectsInCell('meadow', cellKey(0, 1)).length,
      surface.objectsInCell('meadow', cellKey(1, 1)).length,
    ]).toEqual([2, 2, 2, 2])
    surface.dispose()
  })

  it('drops fine cells when a grass layer becomes props', async () => {
    const surface = createScatterSurface(new Scene(), {
      models: createModelCache(
        async () => staticTree(),
        () => undefined,
      ),
      onUnsupported: () => undefined,
    })
    const grass = scatterLayer({
      id: 'meadow',
      category: 'grass',
      assets: [{ assetId: 'blade', weight: 1 }],
      size: { x: 64, z: 32 },
      rules: { ...scatterLayer({ id: 'rules' }).rules, density: 1, spacing: 1 },
    })
    await surface.sync({ ...DEFAULT_WORLD, layers: [grass] })
    expect(surface.objectsInCell('meadow', cellKey(1, 0))).not.toEqual([])

    await surface.sync({
      ...DEFAULT_WORLD,
      layers: [scatterLayer({ ...grass, category: 'props' })],
    })

    expect(surface.objectsInCell('meadow', cellKey(1, 0))).toEqual([])
    surface.dispose()
  })
})
