// @vitest-environment jsdom
import { BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it, vi } from 'vitest'
import type * as Diagnostics from '@/services/diagnostics'
import { SceneRenderer } from './SceneRenderer'

const reported = vi.hoisted(() => vi.fn())

vi.mock('@/services/diagnostics', async importOriginal => ({
  ...(await importOriginal<typeof Diagnostics>()),
  reportFailure: reported,
}))

// Read before it is routed, so the load needs bytes whatever the parser then does with them.
// `as`: jsdom has no fetch of its own, and only the two fields read here can be stood in for.
vi.stubGlobal('fetch', () =>
  Promise.resolve({
    ok: true,
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode('glTF____').buffer),
  } as unknown as Response),
)

vi.mock('three/addons/libs/meshopt_decoder.module.js', () => ({
  MeshoptDecoder: { supported: true, ready: Promise.resolve() },
}))

vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    dispose = () => {}
    setDecoderPath = () => this
  },
}))

vi.mock('three/addons/loaders/KTX2Loader.js', () => ({
  KTX2Loader: class {
    detectSupport = () => {}
    dispose = () => {}
    setTranscoderPath = () => this
  },
}))

/** A file declaring two maps and carrying neither: what a refused KTX2 or a missing `.bin` leaves. */
vi.mock('three/addons/loaders/GLTFLoader.js', () => {
  const material = new MeshStandardMaterial()
  const scene = new Group()
  scene.add(new Mesh(new BufferGeometry(), material))
  return {
    GLTFLoader: class {
      setDRACOLoader = () => this
      setKTX2Loader = () => this
      setMeshoptDecoder = () => this
      parseAsync = () =>
        Promise.resolve({
          scene,
          animations: [],
          parser: {
            json: {
              materials: [
                {
                  name: 'PBR',
                  pbrMetallicRoughness: {
                    baseColorTexture: { index: 0 },
                    normalTexture: { index: 1 },
                  },
                },
              ],
              textures: [{}, {}],
            },
            associations: new Map([[material, { materials: 0 }]]),
          },
        })
    },
  }
})

describe('a model the engine loads through its own glTF source', () => {
  it('writes the textures that did not resolve to the journal', async () => {
    const renderer = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })

    await renderer['gltf'].load('ai-desktop-studio://asset/mesh-1')

    expect(reported).toHaveBeenCalledWith(
      'scene.texture',
      'ai-desktop-studio://asset/mesh-1',
      expect.objectContaining({ message: '2/2' }),
    )
    renderer.dispose()
  })
})
