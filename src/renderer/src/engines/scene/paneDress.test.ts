import {
  BoxGeometry,
  DirectionalLight,
  InstancedMesh,
  Layers,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPaneMemory, dressForPane, forgetDress, type PaneEye } from './paneDress'
import { createPaneMaterials, type PaneMaterials } from './paneMaterials'
import { EDGE_LAYER } from './sceneView'

/** A camera reduced to what dressing a view actually reads of one. */
function eye(): PaneEye & { layers: Layers } {
  return { layers: new Layers() }
}

let materials: PaneMaterials
let memory: ReturnType<typeof createPaneMemory>

beforeEach(() => {
  materials = createPaneMaterials()
  memory = createPaneMemory()
})

const cube = (): Mesh => new Mesh(new BoxGeometry(), new MeshStandardMaterial())

describe('dressing a view before it is drawn', () => {
  it('leaves the real materials alone in a shaded view', () => {
    const mesh = cube()
    const own = mesh.material

    dressForPane([mesh], 'shaded', false, materials, memory, eye())

    expect(mesh.material).toBe(own)
  })

  it('paints every surface with one stand-in in a solid view, and gives them back after', () => {
    const mesh = cube()
    const own = mesh.material

    dressForPane([mesh], 'solid', false, materials, memory, eye())
    expect(mesh.material).not.toBe(own)

    dressForPane([mesh], 'shaded', false, materials, memory, eye())
    expect(mesh.material).toBe(own)
  })

  /** The trap the memory exists for: a second pass must not remember the first pass's clay. */
  it('never mistakes a previous pass for the model own material', () => {
    const mesh = cube()
    const own = mesh.material

    dressForPane([mesh], 'solid', false, materials, memory, eye())
    dressForPane([mesh], 'matcap', false, materials, memory, eye())
    dressForPane([mesh], 'shaded', false, materials, memory, eye())

    expect(mesh.material).toBe(own)
  })

  it('puts the scene lights out for the material preview, and back afterwards', () => {
    const light = new DirectionalLight()

    dressForPane([light], 'material', false, materials, memory, eye())
    expect(light.visible).toBe(false)

    dressForPane([light], 'shaded', false, materials, memory, eye())
    expect(light.visible).toBe(true)
  })

  it('leaves a light the document itself hides hidden', () => {
    const light = new DirectionalLight()
    light.visible = false

    dressForPane([light], 'material', false, materials, memory, eye())
    dressForPane([light], 'shaded', false, materials, memory, eye())

    expect(light.visible).toBe(false)
  })

  it('shows the edge overlay to the view that asked for it, and to no other', () => {
    const both = eye()
    const shaded = eye()

    dressForPane([cube()], 'both', false, materials, memory, both)
    dressForPane([cube()], 'shaded', false, materials, memory, shaded)

    expect(both.layers.isEnabled(EDGE_LAYER)).toBe(true)
    expect(shaded.layers.isEnabled(EDGE_LAYER)).toBe(false)
  })

  /**
   * A wireframe read as quads is its overlay and nothing else: the material's own flag draws
   * every triangle, diagonals included, which is exactly what the quad reading removes.
   */
  it('hides the surfaces of a wireframe view asked for quads, and shows its edges', () => {
    const mesh = cube()
    const camera = eye()

    dressForPane([mesh], 'wireframe', true, materials, memory, camera)

    expect(camera.layers.isEnabled(EDGE_LAYER)).toBe(true)
    expect(mesh.material).not.toBe(new MeshStandardMaterial())
    expect(Array.isArray(mesh.material) ? false : mesh.material.visible).toBe(false)
  })

  it('keeps the surfaces of a wireframe view reading triangles', () => {
    const mesh = cube()
    const own = mesh.material
    const camera = eye()

    dressForPane([mesh], 'wireframe', false, materials, memory, camera)

    expect(mesh.material).toBe(own)
    expect(camera.layers.isEnabled(EDGE_LAYER)).toBe(false)
  })

  it('colours by density, so the crowded object and the plain one differ', () => {
    const dense = new Mesh(new BoxGeometry(0.1, 0.1, 0.1, 8, 8, 8), new MeshStandardMaterial())
    const plain = new Mesh(new BoxGeometry(10, 10, 10), new MeshStandardMaterial())

    dressForPane([dense, plain], 'density', false, materials, memory, eye())

    expect(dense.material).not.toBe(plain.material)
  })

  /**
   * The whole reason the memory carries what the scene wears: this runs per pane AND per frame,
   * and a still viewport in the plainest mode must not walk every mesh sixty times a second.
   */
  it('walks nothing when the scene already wears what the view asks for', () => {
    const mesh = cube()
    let walked = 0
    // A stand-in that counts: `traverse` is what the walk costs, whatever it then does.
    const counting = new Proxy(mesh, {
      get(target, key, receiver) {
        if (key === 'traverse') walked += 1
        return Reflect.get(target, key, receiver)
      },
    })

    dressForPane([counting], 'shaded', false, materials, memory, eye())
    const afterFirst = walked

    dressForPane([counting], 'shaded', false, materials, memory, eye())
    dressForPane([counting], 'shaded', false, materials, memory, eye())

    expect(afterFirst).toBeGreaterThan(0)
    expect(walked).toBe(afterFirst)
  })

  it('still answers for the camera it is handed, even when the scene does not change', () => {
    const first = eye()
    const second = eye()

    dressForPane([cube()], 'both', false, materials, memory, first)
    // Same mode, other camera: the scene is left alone but this view still has to show edges.
    dressForPane([cube()], 'both', false, materials, memory, second)

    expect(second.layers.isEnabled(EDGE_LAYER)).toBe(true)
  })

  // The two modes phase 8 wants: the skeleton lives beside the scene rather than inside it, so
  // taking the surfaces away — or thinning them — is what makes the bones readable.
  it('thins the surfaces without hiding them, and lets what is behind show through', () => {
    const mesh = cube()

    dressForPane([mesh], 'ghost', false, materials, memory, eye())

    const worn = mesh.material
    expect(Array.isArray(worn) ? worn[0] : worn).toMatchObject({
      transparent: true,
      visible: true,
      depthWrite: false,
    })
  })

  it('takes the surfaces away entirely for the skeleton view', () => {
    const mesh = cube()

    dressForPane([mesh], 'skeleton', false, materials, memory, eye())

    const worn = mesh.material
    expect(Array.isArray(worn) ? worn[0] : worn).toMatchObject({ visible: false })
  })

  it('gives a mesh its own material back when the view leaves those modes', () => {
    const mesh = cube()
    const own = mesh.material

    dressForPane([mesh], 'skeleton', false, materials, memory, eye())
    dressForPane([mesh], 'shaded', false, materials, memory, eye())

    expect(mesh.material).toBe(own)
  })

  it('walks a model, which arrives as a tree rather than a mesh', () => {
    const model = new Object3D()
    const inside = cube()
    model.add(inside)
    const own = inside.material

    dressForPane([model], 'solid', false, materials, memory, eye())

    expect(inside.material).not.toBe(own)
  })
})

describe('dressing a pane environment', () => {
  /**
   * Per PANE and not per document. `scene.environment` is one reference, but it is read at draw
   * time — which is what lets a studio view and a rendered view stand side by side in a quad
   * layout. Settled globally, one pane in studio re-lit the other three.
   */
  describe('what lights a pane', () => {
    it('borrows the studio room for the studio view alone', () => {
      const light = vi.fn()

      dressForPane([cube()], 'studio', false, materials, memory, eye(), light)
      expect(light).toHaveBeenCalledWith(true)

      dressForPane([cube()], 'shaded', false, materials, memory, eye(), light)
      expect(light).toHaveBeenLastCalledWith(false)
    })

    it("keeps the document's own sky for the material preview, which judges against it", () => {
      const light = vi.fn()
      dressForPane([cube()], 'material', false, materials, memory, eye(), light)

      expect(light).toHaveBeenCalledWith(false)
    })

    // Every pass, like the layers: what the previous pane left is not what this one wants, and
    // the dress itself short-circuits when the mode has not moved.
    it('says so on every pass, even when the dress is already worn', () => {
      const light = vi.fn()
      dressForPane([cube()], 'studio', false, materials, memory, eye(), light)
      dressForPane([cube()], 'studio', false, materials, memory, eye(), light)

      expect(light).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * The frame reads this to know whether its shadow maps are worth drawing again: a pane that
   * puts the scene's lights out draws different shadows from the one beside it, and one that
   * wears what is already on has nothing to say.
   */
  it('says whether it changed what the scene wears', () => {
    const mesh = cube()

    expect(dressForPane([mesh], 'solid', false, materials, memory, eye())).toBe(true)
    expect(dressForPane([mesh], 'solid', false, materials, memory, eye())).toBe(false)
    expect(dressForPane([mesh], 'shaded', false, materials, memory, eye())).toBe(true)
  })

  /**
   * An `InstancedMesh` draws in the place of the meshes it stands for, and they are the ones
   * this walk used to see. Left out, sixty-four copies went on drawing shaded while everything
   * around them wore the stand-in of a solid view — measured, and no gate went red on it.
   */
  it('replaces the material of an instance as it does of a mesh', () => {
    const own = new MeshStandardMaterial()
    const instance = new InstancedMesh(new BoxGeometry(1, 1, 1), own, 4)

    dressForPane([instance], 'solid', false, materials, memory, eye())

    expect(instance.material).not.toBe(own)
  })

  it('dresses the scene again once told to forget what it wears', () => {
    const mesh = cube()
    dressForPane([mesh], 'solid', false, materials, memory, eye())

    // What a rebuilt instance needs: it is a NEW object wearing what its source wore, and a pass
    // that believed the scene already dressed would walk past it.
    forgetDress(memory)

    expect(dressForPane([mesh], 'solid', false, materials, memory, eye())).toBe(true)
  })
})
