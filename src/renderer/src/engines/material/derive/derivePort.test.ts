import { localizedError } from '@shared/localizedError'
import { LinearFilter, NoColorSpace, SRGBColorSpace, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { fakeTextureSource } from '../../viewport/viewport-fixtures'
import { createDerivePort } from './derivePort'

/** Everything a GPU is needed for is below this line; everything above it is testable in jsdom. */
describe('the derivation port', () => {
  it('reads the source as stored, whatever colour space it arrived in', async () => {
    const source = new Texture()
    source.colorSpace = SRGBColorSpace
    const port = createDerivePort({ loadTexture: () => Promise.resolve(source) })

    // It goes no further in jsdom — there is no WebGL — and that is enough to see the decision.
    await expect(port({ channel: 'normal', sourceUrl: 'asset://a' })).rejects.toThrow()

    expect(source.colorSpace).toBe(NoColorSpace)
  })

  /** The frame is the source's own size, so nothing reads a mip and building one is 22 MB wasted. */
  it('leaves the mip pyramid unbuilt, and stops the filter from asking for one', async () => {
    const source = new Texture()
    const port = createDerivePort({ loadTexture: () => Promise.resolve(source) })

    await expect(port({ channel: 'normal', sourceUrl: 'asset://a' })).rejects.toThrow()

    expect(source.generateMipmaps).toBe(false)
    // Both, or neither works: three's default minFilter samples a chain that is no longer built.
    expect(source.minFilter).toBe(LinearFilter)
  })

  /**
   * A decoded 4K channel is 64 MB. Everything between taking the pixels and giving them back can
   * throw — sizing, building the pass, and asking for a context on a machine whose GPU process
   * has died — and each of those used to pin that picture for the life of the window.
   */
  it('gives the decoded picture back even when it never reaches the GPU', async () => {
    const { load, freed } = fakeTextureSource()
    const port = createDerivePort({ loadTexture: load })

    await expect(port({ channel: 'normal', sourceUrl: 'asset://a' })).rejects.toThrow()

    expect(freed).toHaveLength(1)
    expect(freed[0]).toHaveBeenCalled()
  })

  it('gives it back for a channel no shader derives, too', async () => {
    const source = new Texture()
    source.image = { width: 8, height: 8 }
    const freed = vi.spyOn(source, 'dispose')
    const port = createDerivePort({ loadTexture: () => Promise.resolve(source) })

    await expect(port({ channel: 'baseColor', sourceUrl: 'asset://a' })).rejects.toThrow(
      localizedError('channelShaderMissing', { channel: 'baseColor' }).message,
    )

    expect(freed).toHaveBeenCalled()
  })

  /**
   * A texture whose image never decoded has no size, and a zero divides into an infinite texel
   * step. Refused before a context is opened, so a bad source costs nothing.
   */
  it('refuses a source that decoded to nothing, before opening a context', async () => {
    const { load } = fakeTextureSource()
    const port = createDerivePort({ loadTexture: load })

    await expect(port({ channel: 'normal', sourceUrl: 'asset://a' })).rejects.toThrow(
      localizedError('decodedSourceEmpty').message,
    )
  })

  it('refuses a source whose picture claims no pixels', async () => {
    const source = new Texture()
    source.image = { width: 0, height: 512 }
    const port = createDerivePort({ loadTexture: () => Promise.resolve(source) })

    await expect(port({ channel: 'normal', sourceUrl: 'asset://a' })).rejects.toThrow(
      localizedError('decodedSourceEmpty').message,
    )
  })

  it('asks the loader for the picture it was pointed at', async () => {
    const { load } = fakeTextureSource()
    const port = createDerivePort({ loadTexture: load })

    await expect(port({ channel: 'normal', sourceUrl: 'asset://brick' })).rejects.toThrow()

    expect(load).toHaveBeenCalledWith('asset://brick')
  })
})
