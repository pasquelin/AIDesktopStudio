import { HalfFloatType, NoColorSpace, SRGBColorSpace, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { NEUTRAL_ADJUSTMENTS } from '@shared/domain/adjustments'
import { createSkyboxExportPort, type SkyboxExportRequest } from './exportPort'

/**
 * Everything below the pass needs a GPU, and jsdom has none: a run reaches the renderer and then
 * throws. What is readable from here is what the port decides before that — which picture it
 * asks for, how many times, and how it decides to read it.
 */

const decoded = (width: number, height: number): Texture => {
  const texture = new Texture()
  texture.image = { width, height }
  // What `loadSource` leaves on every picture it hands over: right for a PBR channel, and the
  // thing this port has to undo.
  texture.colorSpace = NoColorSpace
  return texture
}

const request: SkyboxExportRequest = {
  assetId: 'a-sky',
  adjustments: NEUTRAL_ADJUSTMENTS,
  name: 'Ciel',
  command: { kind: 'faces', size: 1024 },
}

describe('the skybox export port', () => {
  it('asks for the source by its asset url, and for nothing else', async () => {
    const loadTexture = vi.fn((_url: string) => Promise.resolve(decoded(4096, 2048)))
    const port = createSkyboxExportPort({ loadTexture })

    await expect(port(request)).rejects.toThrow()

    expect(loadTexture).toHaveBeenCalledTimes(1)
    expect(loadTexture.mock.calls[0]?.[0]).toContain('a-sky')
  })

  /**
   * The viewport reloads a rewritten panorama under `?v=…`; a bare URL here is where the browser
   * keeps the picture that edit replaced. Without the stamp, what one sees and what one exports
   * were two different skies.
   */
  it('asks for the version the viewport is showing, not for the bare url', async () => {
    const loadTexture = vi.fn((_url: string) => Promise.resolve(decoded(4096, 2048)))
    const port = createSkyboxExportPort({ loadTexture, assetVersion: () => 'after' })

    await expect(port(request)).rejects.toThrow()

    expect(loadTexture.mock.calls[0]?.[0]).toBe('ai-desktop-studio://asset/a-sky?v=after')
  })

  it('decodes the sky as a colour, which is what the shared loader does not do', async () => {
    const texture = decoded(4096, 2048)
    const port = createSkyboxExportPort({ loadTexture: () => Promise.resolve(texture) })

    await expect(port(request)).rejects.toThrow()

    // Left as stored, the grading would work on sRGB numbers and the pass would encode them a
    // second time on the way out — a sky visibly washed out, with nothing to point at.
    expect(texture.colorSpace).toBe(SRGBColorSpace)
    // `needsUpdate` is write-only in three — it bumps `version`, and reading it back gives
    // nothing. The version is what tells the renderer to upload again under the new colour
    // space; set without it, the decode would stay the one the loader asked for.
    expect(texture.version).toBeGreaterThan(0)
  })

  /**
   * A `.hdr` sky decodes LINEAR already. Stamped sRGB all the same, the grading works on numbers
   * nobody meant and the six faces leave visibly darker than the panorama they were cut from.
   */
  it('leaves a float decode as the colour it already is', async () => {
    const texture = decoded(4096, 2048)
    texture.type = HalfFloatType
    const port = createSkyboxExportPort({ loadTexture: () => Promise.resolve(texture) })

    await expect(port(request)).rejects.toThrow()

    expect(texture.colorSpace).not.toBe(SRGBColorSpace)
  })

  it('decodes the panorama once for all six faces, never once per face', async () => {
    const loadTexture = vi.fn((_url: string) => Promise.resolve(decoded(2048, 1024)))
    const port = createSkyboxExportPort({ loadTexture })

    await expect(port(request)).rejects.toThrow()
    await expect(port({ ...request, command: { kind: 'faces', size: 512 } })).rejects.toThrow()

    // Once per export, not once per face: a 4K panorama is 32 MB decoded, and six of them at a
    // time is what a browser evicts a live viewport's context to make room for.
    expect(loadTexture).toHaveBeenCalledTimes(2)
  })

  /**
   * Decoding a 4K panorama is the first long thing here, so a stop pressed while it downloads
   * must not be answered by six faces of it.
   *
   * The check BETWEEN faces is not reachable from a test: it lives inside the pass, past the
   * line this file's header draws — jsdom has no GPU, and nothing here gets that far.
   */
  it('asks for nothing at all when the export was already stopped', async () => {
    const loadTexture = vi.fn((_url: string) => Promise.resolve(decoded(2048, 1024)))
    const port = createSkyboxExportPort({ loadTexture })

    await expect(port(request, { signal: AbortSignal.abort() })).rejects.toThrow()
    expect(loadTexture).not.toHaveBeenCalled()
  })
})
