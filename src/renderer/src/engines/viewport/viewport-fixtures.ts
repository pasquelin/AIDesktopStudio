import { Texture, type WebGLRenderer } from 'three'
import { vi, type Mock } from 'vitest'
import type { TextureSource } from '../scene/textureCache'
import type { ViewportEnvironment } from './environment'

/**
 * What the three 3D workspaces need to stand in for the GPU, in one place. A member added to
 * `ViewportEnvironment` then fails to compile here once, rather than at run time in each of the
 * three suites, on an opaque "is not a function".
 */
export function fakeEnvironment(): ViewportEnvironment {
  return {
    setTexture: vi.fn(),
    setAdjustments: vi.fn(),
    refresh: vi.fn(),
    shownTexture: vi.fn(() => null),
    setStudio: vi.fn(),
    borrowStudio: vi.fn(),
    setIntensity: vi.fn(),
    setRotation: vi.fn(),
    setBackgroundVisible: vi.fn(),
    setBackgroundBlur: vi.fn(),
    dispose: vi.fn(),
  }
}

/**
 * A renderer for a suite that never draws: jsdom gives no graphics context, and the three 3D
 * workspaces only ask their renderer what the CARD allows before uploading a texture.
 *
 * `as`: a real `WebGLRenderer` cannot be built here, and what an engine reads off one is this.
 */
export function fakeRenderer(): WebGLRenderer {
  return { capabilities: { getMaxAnisotropy: () => 16 } } as WebGLRenderer
}

export type FakeTextureSource = {
  load: Mock<TextureSource>
  /** One spy per texture handed out, in the order they were asked for. */
  freed: ReturnType<typeof vi.spyOn>[]
  /**
   * The spy on the LAST texture served for a URL, for an engine reading more than one picture.
   * A test asking about an earlier one of the same URL wants `freed` and its order.
   */
  freedFor: (url: string) => ReturnType<typeof vi.spyOn> | undefined
}

/** A source whose textures report their own disposal — how a leak is caught in a cache test. */
export function fakeTextureSource(): FakeTextureSource {
  const freed: ReturnType<typeof vi.spyOn>[] = []
  const byUrl = new Map<string, ReturnType<typeof vi.spyOn>>()

  return {
    load: vi.fn<TextureSource>(async url => {
      const texture = new Texture()
      const spy = vi.spyOn(texture, 'dispose')
      freed.push(spy)
      byUrl.set(url, spy)
      return texture
    }),
    freed,
    freedFor: url => byUrl.get(url),
  }
}
