import { BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Texture } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createModelCache, disposeTree, instanceOf, modelKeyOf } from './modelCache'

/** The failure port, silent unless a test watches it — the renderer's log is not this module's. */
const silent = () => {}

/** A stand-in for what `GLTFLoader` hands back: a tree, never one mesh. */
function loaded(): Object3D {
  const root = new Object3D()
  root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  return root
}

describe('modelKeyOf', () => {
  // A ⌘S that rewrote the file must be another entry, or every scene keeps the model it read.
  it('tells two versions of one asset apart', () => {
    expect(modelKeyOf('mesh-1', 'v2')).not.toBe(modelKeyOf('mesh-1', 'v1'))
  })

  it('is the bare studio url when no version is known', () => {
    expect(modelKeyOf('mesh-1')).toBe('ia-studio://asset/mesh-1')
  })
})

// The counting itself is `ref-cache`'s, and tested there. What is this module's is the url it
// asks for and what it frees.
describe('createModelCache', () => {
  it('reads the file at the key, which is its url', async () => {
    const urls: string[] = []
    await createModelCache(async url => {
      urls.push(url)
      return loaded()
    }, silent).acquire(modelKeyOf('mesh-1', 'v1'))

    expect(urls).toEqual(['ia-studio://asset/mesh-1?v=v1'])
  })

  // A compressed or corrupt GLB leaves a node in the outliner drawing nothing: what the engine
  // is told is the only trace there is — by key; the engine turns it back into an asset.
  it('tells which key failed to load', async () => {
    const onFailure = vi.fn()
    const gone = new Error('unreadable')

    await createModelCache(() => Promise.reject(gone), onFailure).acquire(modelKeyOf('mesh-1'))

    expect(onFailure).toHaveBeenCalledWith(modelKeyOf('mesh-1'), gone)
  })

  it('frees the whole tree at the last release, not just its root', async () => {
    const object = loaded()
    const mesh = object.children[0]
    const dispose = mesh instanceof Mesh ? vi.spyOn(mesh.geometry, 'dispose') : null
    const cache = createModelCache(async () => object, silent)

    await cache.acquire(modelKeyOf('mesh-1'))
    cache.release(modelKeyOf('mesh-1'))

    expect(dispose).toHaveBeenCalled()
  })
})

describe('instanceOf', () => {
  // A hundred trees are one upload: the copies share what the file brought.
  it('shares the geometry and the material with the source', () => {
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial()
    const source = new Object3D()
    source.add(new Mesh(geometry, material))

    const mesh = instanceOf(source).children[0]

    expect(mesh).not.toBe(source.children[0])
    expect(mesh instanceof Mesh && mesh.geometry).toBe(geometry)
    expect(mesh instanceof Mesh && mesh.material).toBe(material)
  })

  it('copies the whole tree, not only the root', () => {
    const source = new Object3D()
    const branch = new Object3D()
    branch.add(new Object3D())
    source.add(branch)

    expect(instanceOf(source).children[0]?.children).toHaveLength(1)
  })

  // Each copy is placed by its own node, so moving one must not move the others.
  it('gives each copy its own transform', () => {
    const source = new Object3D()
    const copy = instanceOf(source)
    copy.position.x = 5

    expect(source.position.x).toBe(0)
    expect(instanceOf(source).position.x).toBe(0)
  })
})

describe('disposeTree', () => {
  // A `dispose` on the root of a GLB frees nothing: that is how an afternoon of browsing runs
  // the GPU out of memory.
  it('frees every geometry and every material of the tree, not only the root', () => {
    const root = new Object3D()
    const material = new MeshStandardMaterial()
    const geometry = new BoxGeometry()
    const branch = new Object3D()
    branch.add(new Mesh(geometry, material))
    root.add(branch)

    const onGeometry = vi.spyOn(geometry, 'dispose')
    const onMaterial = vi.spyOn(material, 'dispose')

    disposeTree(root)

    expect(onGeometry).toHaveBeenCalled()
    expect(onMaterial).toHaveBeenCalled()
  })

  // They came with the file rather than from the texture cache: nobody else counts them.
  it('frees the maps the file brought with it', () => {
    const texture = new Texture()
    const root = new Object3D()
    root.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture })))

    const onTexture = vi.spyOn(texture, 'dispose')
    disposeTree(root)

    expect(onTexture).toHaveBeenCalled()
  })

  it('walks a tree of plain objects without tripping', () => {
    const root = new Object3D()
    root.add(new Object3D())

    expect(() => disposeTree(root)).not.toThrow()
  })

  it('frees every material of a mesh that carries several', () => {
    const materials = [new MeshStandardMaterial(), new MeshStandardMaterial()]
    const root = new Object3D()
    root.add(new Mesh(new BoxGeometry(), materials))

    const spies = materials.map(material => vi.spyOn(material, 'dispose'))
    disposeTree(root)

    for (const spy of spies) expect(spy).toHaveBeenCalled()
  })
})
