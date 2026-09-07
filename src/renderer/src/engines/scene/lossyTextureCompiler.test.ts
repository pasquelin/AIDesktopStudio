import { describe, expect, it, vi } from 'vitest'
import { NO_LOSSY_OPTIMIZATION, type ExportedAssetOverride } from '@shared/domain/gameExport'
import { glbFrom } from '@shared/domain/glbContainer'
import { compileLossyModelTextures, compileLossyTextures } from './lossyTextureCompiler'

function modelWithOneImage(imageBytes: number): Uint8Array {
  const bin = new Uint8Array(imageBytes).fill(7)
  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    images: [{ bufferView: 0, mimeType: 'image/png' }],
  }
  return glbFrom({ json: new TextEncoder().encode(JSON.stringify(document)), bin })
}

describe('LOSSY textures compiled for a game export', () => {
  it('does no asset work while every texture choice is off', async () => {
    const read = vi.fn()
    const transform = vi.fn()

    expect(
      await compileLossyTextures(['texture'], NO_LOSSY_OPTIMIZATION, {}, { read, transform }),
    ).toEqual([])
    expect(read).not.toHaveBeenCalled()
    expect(transform).not.toHaveBeenCalled()
  })

  it('reads and transforms each texture with policy values and reports progress', async () => {
    const onProgress = vi.fn()
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => ({
      id,
      bytes: new Uint8Array([7]),
      extension: 'jpg',
    }))

    const compiled = await compileLossyTextures(
      ['one', 'two'],
      {
        ...NO_LOSSY_OPTIMIZATION,
        textureReduction: 'half',
        textureCompression: 'balanced',
      },
      { onProgress },
      { read: async () => new Uint8Array([1]), transform },
    )

    expect(compiled.map(asset => asset.id)).toEqual(['one', 'two'])
    expect(transform).toHaveBeenCalledWith(
      'one',
      new Uint8Array([1]),
      0.5,
      { format: 'jpg', quality: 0.75 },
      undefined,
    )
    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('writes lossless images while only the resolution is reduced', async () => {
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => ({
      id,
      bytes: new Uint8Array([7]),
      extension: 'png',
    }))

    await compileLossyTextures(
      ['one'],
      { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'quarter' },
      {},
      { read: async () => new Uint8Array([1]), transform },
    )

    expect(transform).toHaveBeenCalledWith(
      'one',
      new Uint8Array([1]),
      0.25,
      { format: 'png' },
      undefined,
    )
  })

  it('keeps as many textures in flight as the pool has workers', async () => {
    const started: string[] = []
    let release = (): void => undefined
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => {
      started.push(id)
      await held
      return { id, bytes: new Uint8Array([7]), extension: 'jpg' }
    })

    const compiling = compileLossyTextures(
      ['one', 'two', 'three'],
      { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'half' },
      {},
      { read: async () => new Uint8Array([1]), transform, concurrency: 3 },
    )
    await vi.waitFor(() => expect(started).toHaveLength(3))
    release()

    expect((await compiling).map(asset => asset.id)).toEqual(['one', 'two', 'three'])
  })

  it('keeps the transparency the worker refused to flatten, whatever was asked', async () => {
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => ({
      id,
      bytes: new Uint8Array([7]),
      extension: 'png',
    }))

    const compiled = await compileLossyTextures(
      ['leaves'],
      { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'half', textureCompression: 'aggressive' },
      {},
      { read: async () => new Uint8Array([1]), transform },
    )

    expect(compiled[0]?.extension).toBe('png')
  })

  it('stops before reading another texture after cancellation', async () => {
    const controller = new AbortController()
    const read = vi.fn(async () => new Uint8Array([1]))
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => {
      controller.abort()
      return { id, bytes: new Uint8Array([2]), extension: 'png' }
    })

    await expect(
      compileLossyTextures(
        ['one', 'two'],
        { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'half' },
        { signal: controller.signal },
        { read, transform },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('leaves a missing texture for the package report instead of failing preparation', async () => {
    const transform = vi.fn()

    expect(
      await compileLossyTextures(
        ['lost'],
        { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'half' },
        {},
        { read: async () => null, transform },
      ),
    ).toEqual([])
    expect(transform).not.toHaveBeenCalled()
  })

  it('shrinks a model by reducing the images embedded in its container', async () => {
    const file = modelWithOneImage(2_000)
    const transform = vi.fn(async (id: string): Promise<ExportedAssetOverride> => ({
      id,
      bytes: new Uint8Array(200),
      extension: 'jpg',
    }))

    const compiled = await compileLossyModelTextures(
      ['tree'],
      { ...NO_LOSSY_OPTIMIZATION, textureReduction: 'quarter', textureCompression: 'balanced' },
      {},
      { read: async () => file, transform },
    )

    expect(compiled.map(asset => asset.id)).toEqual(['tree'])
    expect(compiled[0]?.extension).toBe('glb')
    expect(compiled[0]?.bytes.byteLength).toBeLessThan(file.byteLength)
    expect(transform).toHaveBeenCalledWith(
      'tree:0',
      expect.any(Uint8Array),
      0.25,
      { format: 'jpg', quality: 0.75 },
      undefined,
    )
  })
})
