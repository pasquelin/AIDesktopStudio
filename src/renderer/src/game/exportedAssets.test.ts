import { gzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { expandCompressedAssets } from './exportedAssets'

afterEach(() => vi.unstubAllGlobals())

describe('compressed exported assets', () => {
  it('exposes exact decompressed bytes through a disposable object URL', async () => {
    const original = Uint8Array.of(1, 2, 3, 4)
    const revokeObjectURL = vi.fn()
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:asset')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(gzipSync(original))),
    )
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })

    const expanded = await expandCompressedAssets(
      { texture: 'assets/texture.svg.gz', plain: 'assets/plain.png' },
      ['texture'],
    )

    expect(expanded.files).toEqual({ texture: 'blob:asset', plain: 'assets/plain.png' })
    const received: unknown = createObjectURL.mock.calls[0]?.[0]
    if (!(received instanceof Blob)) throw new Error('expected a decompressed asset blob')
    expect(received.type).toBe('image/svg+xml')
    expect(new Uint8Array(await received.arrayBuffer())).toEqual(original)
    expanded.dispose()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:asset')
  })

  it('leaves no object URL live when one asset cannot be read', async () => {
    const live = new Set<string>()
    let next = 0
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(gzipSync(Uint8Array.of(1))))
        .mockResolvedValueOnce(new Response(Uint8Array.of(2))),
    )
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => {
        next += 1
        live.add(`blob:${next}`)
        return `blob:${next}`
      }),
      revokeObjectURL: vi.fn((url: string) => live.delete(url)),
    })

    await expect(
      expandCompressedAssets({ first: 'assets/first.png.gz', second: 'assets/second.png.gz' }, [
        'first',
        'second',
      ]),
    ).rejects.toThrow()

    expect([...live]).toEqual([])
  })
})
