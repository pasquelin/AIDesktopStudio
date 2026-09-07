import { describe, expect, it } from 'vitest'
import { glbChunksOf, glbFrom, glbJson } from '@shared/domain/glbContainer'
import { isRecord } from '@shared/guards'
import { optimizedGlbTextures } from './lossyGlbTextures'

type ReadGlb = { bin: Uint8Array; views: unknown[]; images: unknown[] }

function glbOf(imageBytes: Uint8Array, meshBytes: Uint8Array): Uint8Array {
  const bin = new Uint8Array(meshBytes.byteLength + imageBytes.byteLength)
  bin.set(meshBytes)
  bin.set(imageBytes, meshBytes.byteLength)
  const document = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bin.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: meshBytes.byteLength },
      { buffer: 0, byteOffset: meshBytes.byteLength, byteLength: imageBytes.byteLength },
    ],
    images: [{ bufferView: 1, mimeType: 'image/png' }],
  }
  return glbFrom({ json: new TextEncoder().encode(JSON.stringify(document)), bin })
}

function readGlb(file: Uint8Array): ReadGlb {
  const chunks = glbChunksOf(file)
  const document = chunks ? glbJson(chunks.json) : null
  if (!chunks || !isRecord(document)) throw new Error('expected a GLB')
  return {
    bin: chunks.bin,
    views: Array.isArray(document.bufferViews) ? document.bufferViews : [],
    images: Array.isArray(document.images) ? document.images : [],
  }
}

describe('embedded GLB textures optimized for an export', () => {
  it('replaces an embedded image while preserving the rest of its binary buffer', async () => {
    const source = glbOf(new Uint8Array([5, 6, 7, 8]), new Uint8Array([1, 2, 3, 4]))

    const optimized = await optimizedGlbTextures('model', source, async id => ({
      id,
      bytes: new Uint8Array([9, 10]),
      extension: 'jpg',
    }))
    const output = optimized ? readGlb(optimized.bytes) : null

    expect(optimized?.extension).toBe('glb')
    expect(output?.views[0]).toMatchObject({ byteOffset: 0, byteLength: 4 })
    expect(output?.views[1]).toMatchObject({ byteOffset: 4, byteLength: 2 })
    expect(output?.images[0]).toMatchObject({ mimeType: 'image/jpeg' })
    expect([...(output?.bin.slice(0, 6) ?? [])]).toEqual([1, 2, 3, 4, 9, 10])
  })

  it('shrinks a texture-dominant model instead of trailing its original images', async () => {
    const source = glbOf(new Uint8Array(4_000).fill(7), new Uint8Array([1, 2, 3, 4]))

    const optimized = await optimizedGlbTextures('model', source, async id => ({
      id,
      bytes: new Uint8Array(1_000).fill(3),
      extension: 'jpg',
    }))

    expect(optimized).not.toBeNull()
    expect(optimized?.bytes.byteLength).toBeLessThan(source.byteLength / 3)
  })

  it('carries a lossless reduction into the container as a PNG image', async () => {
    const source = glbOf(new Uint8Array([5, 6, 7, 8]), new Uint8Array([1, 2, 3, 4]))

    const optimized = await optimizedGlbTextures('model', source, async id => ({
      id,
      bytes: new Uint8Array([9, 10]),
      extension: 'png',
    }))

    expect(optimized ? readGlb(optimized.bytes).images[0] : null).toMatchObject({
      mimeType: 'image/png',
    })
  })

  it('leaves the file untouched when no embedded image was reduced', async () => {
    const source = glbOf(new Uint8Array([5, 6, 7, 8]), new Uint8Array([1, 2, 3, 4]))

    expect(await optimizedGlbTextures('model', source, async () => null)).toBeNull()
  })
})
