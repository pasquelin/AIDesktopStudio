import { DataTexture, MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { emptyGroundPaint } from '@shared/domain/groundPaint'
import { reliefLayer } from '@shared/domain/scene'
import {
  applyGroundPaint,
  disposeGroundMaterial,
  syncGroundMaterial,
  type ReliefGroundMaterial,
} from './reliefGroundMaterial'

describe('relief ground material', () => {
  it('loads the persisted ground picture onto the terrain material', async () => {
    const texture = new Texture()
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
      },
    )

    syncGroundMaterial(terrain, layer, { loadGround: async () => texture })

    await vi.waitFor(() => expect(terrain.material.map).toBe(texture))
  })

  it('keeps the legacy material on the unpatched standard path', async () => {
    const texture = new Texture()
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const legacyProgramKey = terrain.material.customProgramCacheKey()
    const layer = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
      },
    )

    syncGroundMaterial(terrain, layer, { loadGround: async () => texture })
    await vi.waitFor(() => expect(terrain.material.map).toBe(texture))

    expect(terrain.material.customProgramCacheKey()).toBe(legacyProgramKey)
    expect(terrain.groundUniforms).toBeUndefined()
  })

  it('binds the first albedo unchanged when splat weights appear', async () => {
    const textures = Array.from({ length: 4 }, () => new Texture())
    let loaded = 0
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [
          { albedo: { assetId: 'legacy' }, normal: null, channel: 'r' },
          { albedo: { assetId: 'grass' }, normal: { assetId: 'grass-normal' }, channel: 'g' },
        ],
        groundWeights: { assetId: 'weights' },
      },
    )

    syncGroundMaterial(terrain, layer, {
      loadGround: async () => textures[loaded++] ?? new Texture(),
    })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())

    expect(terrain.groundUniforms?.albedos[0]?.value).toBe(textures[0])
    expect(terrain.material.map).toBeNull()
    applyGroundPaint(terrain, emptyGroundPaint(2, 2))
    expect(terrain.groundUniforms?.weights.value).not.toBe(textures[3])
  })

  it('owns and disposes the latest painted weights', async () => {
    const albedo = new Texture()
    const initialWeights = new Texture()
    const textures = [albedo, initialWeights]
    const initialDispose = vi.spyOn(initialWeights, 'dispose')
    let loaded = 0
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
        groundWeights: { assetId: 'weights' },
      },
    )

    syncGroundMaterial(terrain, layer, {
      loadGround: async () => textures[loaded++] ?? new Texture(),
    })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())
    applyGroundPaint(terrain, emptyGroundPaint(2, 2))
    const painted = terrain.groundUniforms?.weights.value
    const paintedDispose = painted ? vi.spyOn(painted, 'dispose') : undefined
    disposeGroundMaterial(terrain)

    expect(initialDispose).toHaveBeenCalledOnce()
    expect(paintedDispose).toHaveBeenCalledOnce()
  })

  it('disposes textures loaded beside a failed splat asset', async () => {
    const albedo = new Texture()
    const weights = new Texture()
    const disposeAlbedo = vi.spyOn(albedo, 'dispose')
    const disposeWeights = vi.spyOn(weights, 'dispose')
    let loaded = 0
    const failure = new Error('normal failed')
    const onFailure = vi.fn()
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [
          { albedo: { assetId: 'ground' }, normal: { assetId: 'normal' }, channel: 'r' },
        ],
        groundWeights: { assetId: 'weights' },
      },
    )

    syncGroundMaterial(terrain, layer, {
      loadGround: async () => {
        const call = loaded++
        if (call === 1) throw failure
        return call === 0 ? albedo : weights
      },
      onFailure,
    })
    await vi.waitFor(() => expect(onFailure).toHaveBeenCalled())

    expect(disposeAlbedo).toHaveBeenCalledOnce()
    expect(disposeWeights).toHaveBeenCalledOnce()
    expect(terrain.groundUniforms).toBeUndefined()
  })

  it('reloads bindings when an existing material changes channel', async () => {
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const first = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
        groundWeights: { assetId: 'weights' },
      },
    )
    const loadGround = async () => new Texture()
    syncGroundMaterial(terrain, first, { loadGround })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())
    const generation = terrain.groundGeneration

    syncGroundMaterial(
      terrain,
      {
        ...first,
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'g' }],
      },
      { loadGround },
    )

    expect(terrain.groundGeneration).toBe(generation + 1)
  })

  it('writes a changed albedo into the uniform three already compiled a program for', async () => {
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const first = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
        groundWeights: { assetId: 'weights' },
      },
    )
    syncGroundMaterial(terrain, first, { loadGround: async () => new Texture() })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())
    const bound = terrain.groundUniforms?.albedos[0]
    const key = terrain.material.customProgramCacheKey()
    const replacement = new Texture()

    syncGroundMaterial(
      terrain,
      {
        ...first,
        groundMaterials: [{ albedo: { assetId: 'other' }, normal: null, channel: 'r' }],
      },
      { loadGround: async () => replacement },
    )
    await vi.waitFor(() => expect(terrain.groundUniforms?.albedos[0]?.value).toBe(replacement))

    // The SAME object, so the program three cached for it keeps sampling what this call wrote:
    // only the cache-miss branch installs a new uniform set, and the key has not changed.
    expect(terrain.groundUniforms?.albedos[0]).toBe(bound)
    expect(terrain.material.customProgramCacheKey()).toBe(key)
  })

  it('asks three for another program when the uniform set is rebuilt from scratch', async () => {
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const splat = reliefLayer(
      { assetId: 'height' },
      {
        id: 'terrain',
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
        groundWeights: { assetId: 'weights' },
      },
    )
    const loadGround = async () => new Texture()
    syncGroundMaterial(terrain, splat, { loadGround })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())
    const key = terrain.material.customProgramCacheKey()

    syncGroundMaterial(terrain, { ...splat, groundWeights: null }, { loadGround })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeUndefined())
    syncGroundMaterial(terrain, splat, { loadGround })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())

    expect(terrain.material.customProgramCacheKey()).not.toBe(key)
  })

  it('decodes persisted weights the way a live DataTexture samples them', async () => {
    const loadGround = vi.fn(async () => new Texture())
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = splatLayer('weights')

    syncGroundMaterial(terrain, layer, { loadGround })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())

    expect(loadGround).toHaveBeenCalledWith(expect.stringContaining('ground'), 'flipY')
    expect(loadGround).toHaveBeenCalledWith(expect.stringContaining('weights'), 'from-image')
  })

  it('keeps a texel painted at the origin after the persisted weights arrive', async () => {
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const layer = splatLayer('weights')
    syncGroundMaterial(terrain, layer, { loadGround: async () => new Texture() })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())

    const paint = emptyGroundPaint(2, 2)
    paint.pixels[0] = 77
    applyGroundPaint(terrain, paint)
    const painted = terrain.groundUniforms?.weights.value
    const loadGround = vi.fn(async () => new Texture())
    syncGroundMaterial(terrain, splatLayer('weights-saved'), {
      loadGround,
      keepLiveWeights: true,
    })
    await Promise.resolve()

    expect(loadGround).not.toHaveBeenCalled()
    expect(painted instanceof DataTexture).toBe(true)
    if (painted instanceof DataTexture) {
      expect(painted.image.data?.[0]).toBe(77)
      expect(painted.flipY).toBe(false)
    }
    expect(terrain.groundUniforms?.weights.value).toBe(painted)
  })

  it('keeps a live paint when a slower splat load lands afterwards', async () => {
    let finish!: (texture: Texture) => void
    const loading = new Promise<Texture>(resolve => {
      finish = resolve
    })
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const first = splatLayer('weights')
    syncGroundMaterial(terrain, first, { loadGround: async () => new Texture() })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())

    syncGroundMaterial(
      terrain,
      {
        ...first,
        groundMaterials: [{ albedo: { assetId: 'other' }, normal: null, channel: 'r' }],
      },
      { loadGround: () => loading },
    )
    applyGroundPaint(terrain, emptyGroundPaint(2, 2))
    const painted = terrain.groundUniforms?.weights.value
    finish(new Texture())
    await vi.waitFor(() => expect(terrain.groundUniforms?.weights.value).toBe(painted))
  })

  it('reloads splat pictures after a paint once the stroke no longer holds them', async () => {
    const terrain: ReliefGroundMaterial = {
      material: new MeshStandardMaterial(),
      groundAssetId: null,
      groundGeneration: 0,
    }
    const first = splatLayer('weights')
    syncGroundMaterial(terrain, first, { loadGround: async () => new Texture() })
    await vi.waitFor(() => expect(terrain.groundUniforms).toBeDefined())
    applyGroundPaint(terrain, emptyGroundPaint(2, 2))
    const loadGround = vi.fn(async () => new Texture())

    syncGroundMaterial(
      terrain,
      {
        ...first,
        groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'g' }],
      },
      { loadGround },
    )

    expect(loadGround).toHaveBeenCalled()
    await vi.waitFor(() => expect(terrain.groundUniforms?.albedos[0]?.value).toBeDefined())
  })
})

function splatLayer(weights: string) {
  return reliefLayer(
    { assetId: 'height' },
    {
      id: 'terrain',
      groundMaterials: [{ albedo: { assetId: 'ground' }, normal: null, channel: 'r' }],
      groundWeights: { assetId: weights },
    },
  )
}
