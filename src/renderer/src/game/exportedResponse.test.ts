import { gzipSync, strToU8 } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportedJson, exportedText } from './exportedResponse'

afterEach(() => vi.unstubAllGlobals())

describe('exported responses', () => {
  it('decodes gzip scene data and script source without changing their content', async () => {
    const scene = JSON.stringify({ scene: 'Forest', exact: 1.25 })
    const script = 'export const exact = 1.25\n'.repeat(20)
    const bodies = [scene, script].map(value => gzipSync(strToU8(value), { level: 9, mtime: 0 }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(bodies.shift(), { status: 200 })),
    )

    expect(await exportedJson<unknown>('scene.gltf.gz', 'gzip')).toEqual({
      scene: 'Forest',
      exact: 1.25,
    })
    expect(await exportedText('Walk.js.gz', 'gzip')).toBe(script)
  })

  it('keeps historical uncompressed JSON and text readable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (file: string) =>
        file.endsWith('.json')
          ? new Response('{"legacy":true}', { status: 200 })
          : new Response('legacy source', { status: 200 }),
      ),
    )

    expect(await exportedJson<unknown>('game.json')).toEqual({ legacy: true })
    expect(await exportedText('Legacy.js')).toBe('legacy source')
  })

  it('rejects corrupt compressed bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Uint8Array.of(1, 2, 3), { status: 200 })),
    )

    await expect(exportedText('broken.gz', 'gzip')).rejects.toBeTruthy()
  })
})
