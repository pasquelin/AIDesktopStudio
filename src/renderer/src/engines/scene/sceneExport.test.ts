import {
  AnimationClip,
  Bone,
  BoxGeometry,
  CompressedTexture,
  DirectionalLight,
  GridHelper,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
  Vector3,
  VectorKeyframeTrack,
  type Object3D,
} from 'three'
import { describe, expect, it, vi } from 'vitest'
import { exportTargetOf, lossesExportingTo } from '@shared/domain/exportRegistry'
import { applyWireOverlay } from './sceneView'
import { exportObjects, placedCopy } from './sceneExport'

type GltfFile = {
  meshes?: { name?: string }[]
  nodes?: { name?: string }[]
  animations?: { name?: string; channels?: { target?: { path?: string } }[] }[]
  materials?: unknown[]
  cameras?: unknown[]
  extensions?: Record<string, unknown>
}

async function gltfOf(
  objects: Parameters<typeof exportObjects>[0],
  options?: Parameters<typeof exportObjects>[2],
): Promise<GltfFile> {
  const bytes = await exportObjects(objects, 'gltf', options)
  // `as`: what a `.gltf` file holds is glTF, and the two fields read here are the ones a reader
  // would look at. A guard would restate the schema to learn nothing more.
  return JSON.parse(new TextDecoder().decode(bytes)) as GltfFile
}

function named(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial())
  mesh.name = name
  return mesh
}

describe('exportObjects', () => {
  it('writes the objects it was handed', async () => {
    const file = await gltfOf([named('box-1')])

    expect(file.nodes?.map(node => node.name)).toContain('box-1')
  })

  it('writes several roots into one file', async () => {
    const file = await gltfOf([named('box-1'), named('box-2')])

    const names = file.nodes?.map(node => node.name) ?? []
    expect(names).toContain('box-1')
    expect(names).toContain('box-2')
  })

  it('carries what hangs from a root along with it', async () => {
    const root = named('parent')
    root.add(named('child'))

    const file = await gltfOf([root])

    expect(file.nodes?.map(node => node.name)).toContain('child')
  })

  it('leaves out what it was not handed, grid included', async () => {
    const viewport = new Scene()
    const grid = new GridHelper(10, 10)
    grid.name = 'grid'
    const mesh = named('box-1')
    viewport.add(grid, mesh)

    const file = await gltfOf([mesh])

    const names = file.nodes?.map(node => node.name) ?? []
    expect(names).toContain('box-1')
    expect(names).not.toContain('grid')
  })

  it('leaves the wireframe overlay out of the file', async () => {
    const mesh = named('box-1')
    applyWireOverlay(mesh, true, new LineBasicMaterial())
    expect(mesh.children).toHaveLength(1)

    const file = await gltfOf([mesh])

    expect(file.nodes?.map(node => node.name)).not.toContain('wireframe-overlay')
  })

  it('leaves the live objects exactly as they were', async () => {
    const mesh = named('box-1')
    applyWireOverlay(mesh, true, new LineBasicMaterial())
    mesh.position.set(1, 2, 3)

    await gltfOf([mesh])

    expect(mesh.children).toHaveLength(1)
    expect(mesh.position.toArray()).toEqual([1, 2, 3])
  })

  it('writes a selected child where it stands in the world', async () => {
    const parent = named('parent')
    parent.position.set(10, 0, 0)
    const child = named('child')
    parent.add(child)

    const bytes = await exportObjects([child], 'gltf')
    // `as`: parsed glTF matrices are column-major, with x at index 12.
    const file = JSON.parse(new TextDecoder().decode(bytes)) as {
      nodes?: { name?: string; matrix?: number[]; translation?: number[] }[]
    }
    const node = file.nodes?.[0]

    expect(node?.translation?.[0] ?? node?.matrix?.[12]).toBe(10)
  })

  // `glb` is one binary file: it opens with the four bytes every reader looks for first.
  it('writes a binary glTF that says it is one', async () => {
    const bytes = await exportObjects([named('box-1')], 'glb')

    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('glTF')
  })

  it('writes nothing at all for an empty selection', async () => {
    const file = await gltfOf([])

    expect(file.nodes ?? []).toEqual([])
  })
})

/**
 * KTX2 is wired into the model loader, so an imported model routinely wears textures glTF cannot
 * hold. Both exporters throw on one rather than skip it — the whole file is lost over a picture —
 * so the decoder the renderer supplies has to reach them.
 */
describe('exportObjects with a compressed texture', () => {
  function boxWearing(map: Texture): Mesh {
    const material = new MeshStandardMaterial()
    material.map = map
    return new Mesh(new BoxGeometry(), material)
  }

  it('hands it to the decoder', async () => {
    const decompress = vi.fn(() => new Texture())
    const mesh = boxWearing(new CompressedTexture([], 4, 4))

    try {
      await exportObjects([mesh], 'gltf', { decoder: { decompress } })
    } catch {
      // jsdom cannot encode the decoded canvas.
    }

    expect(decompress).toHaveBeenCalled()
  })

  // The default is the wired one, not none: an export must never be the exporter refusing to try.
  it('carries a decoder without being handed one', async () => {
    const mesh = boxWearing(new CompressedTexture([], 4, 4))

    const refusal = await exportObjects([mesh], 'gltf').then(
      () => '',
      (error: unknown) => String(error),
    )

    expect(refusal).not.toMatch(/setTextureUtils/)
  })
})

// USDZ is read in `sceneExportUsdz.test.ts`, which runs without a browser — see its head.

/**
 * `USDZExporter` reads `object.matrix` and never refreshes it (`USDZExporter.js:639`), where
 * `GLTFExporter` calls `updateMatrix` first (`GLTFExporter.js:2488`). Decomposing the world matrix
 * into position, quaternion and scale therefore reached one format and not the other: a selected
 * child came out of USDZ where it sits inside its parent, and the glTF test never saw it.
 */
describe('placedCopy', () => {
  it('leaves the copy a matrix that agrees with where it stands', () => {
    const parent = named('parent')
    parent.position.set(10, 0, 0)
    const child = named('child')
    parent.add(child)
    parent.updateMatrixWorld(true)

    const copy = placedCopy(child)

    // Column-major, so the translation sits at index 12.
    expect(copy.matrix.elements[12]).toBe(10)
    expect(copy.position.x).toBe(10)
  })
})

/**
 * The picking identity is the node id, which is what the objects in the viewport wear — so a
 * file exported from them wears UUIDs where a reader expects the names of the outliner.
 */
describe('exportObjects and the names a reader sees', () => {
  it('writes what the document calls a node, not the id the engine picks it by', async () => {
    const object = named('3f2a8e14-0c7b-4e9d-9f21-6a5d2b8c1e40')

    const file = await gltfOf([object], {
      nameOf: id => (id === '3f2a8e14-0c7b-4e9d-9f21-6a5d2b8c1e40' ? 'Lamp post' : undefined),
    })

    expect(file.nodes?.map(node => node.name)).toEqual(['Lamp post'])
  })

  /** A child the document does not know — a mesh inside an imported model — keeps its own name. */
  it('leaves alone a name the document has none for', async () => {
    const object = named('node-1')
    const inner = named('Wheel')
    object.add(inner)

    const file = await gltfOf([object], { nameOf: id => (id === 'node-1' ? 'Cart' : undefined) })

    expect(file.nodes?.map(node => node.name).sort()).toEqual(['Cart', 'Wheel'])
  })
})

describe('exportObjects and what cannot be written', () => {
  it('refuses a selection that is entirely hidden', async () => {
    const hidden = named('box-1')
    hidden.visible = false

    await expect(exportObjects([hidden], 'gltf')).rejects.toThrow(/nothing visible/)
  })

  it('writes what is visible when only some of it is hidden', async () => {
    const hidden = named('box-1')
    hidden.visible = false

    const file = await gltfOf([hidden, named('box-2')])

    expect(file.nodes?.map(node => node.name)).toEqual(['box-2'])
  })

  /** Nothing selected is not the same thing as everything hidden: it writes an empty file. */
  it('says nothing about an empty selection', async () => {
    const file = await gltfOf([])

    expect(file.nodes).toBeUndefined()
  })
})

describe('placedCopy of a light', () => {
  /**
   * A light's target is a SIBLING of the nodes, so it never travels with the copy — and glTF has
   * no target at all: `KHR_lights_punctual` reads the node's own −Z. three says as much on the
   * way out. The copy is therefore turned to look where the original looked.
   */
  it('turns the copy towards the target the original aimed at', () => {
    const light = new DirectionalLight()
    light.position.set(0, 10, 0)
    light.target.position.set(5, 0, 0)
    light.target.updateWorldMatrix(true, false)

    const copy = placedCopy(light)

    const aim = new Vector3(0, 0, -1).applyQuaternion(copy.quaternion)
    const wanted = new Vector3(5, 0, 0).sub(new Vector3(0, 10, 0)).normalize()
    expect(aim.x).toBeCloseTo(wanted.x, 5)
    expect(aim.y).toBeCloseTo(wanted.y, 5)
    expect(aim.z).toBeCloseTo(wanted.z, 5)
  })

  /** And carries a target of its own, where three asks for it, or it warns and drops the aim. */
  it('gives the copy a target of its own, one unit down its own axis', () => {
    const light = new DirectionalLight()
    light.target.position.set(5, 0, 0)

    const copy = placedCopy(light)

    expect(copy).toBeInstanceOf(DirectionalLight)
    if (!(copy instanceof DirectionalLight)) return
    expect(copy.target.parent).toBe(copy)
    expect(copy.target.position.toArray()).toEqual([0, 0, -1])
  })

  /** An ordinary object has no target, and must not grow one. */
  it('leaves a mesh with the children it had', () => {
    expect(placedCopy(named('box-1')).children).toEqual([])
  })
})

describe('placedCopy of a rigged model', () => {
  function rigged(): Object3D {
    const bone = new Bone()
    bone.name = 'root-bone'
    const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial())
    mesh.add(bone)
    mesh.bind(new Skeleton([bone]))
    return mesh
  }

  /**
   * `SkinnedMesh.copy` keeps the ORIGINAL's skeleton, whose bones live outside the copied
   * subtree — glTF then writes `"joints":[null,null]`, a file no viewer opens.
   */
  it('binds the copy onto its own bones, not the original ones', () => {
    const source = rigged()
    const copy = placedCopy(source)

    expect(copy).toBeInstanceOf(SkinnedMesh)
    if (!(copy instanceof SkinnedMesh) || !(source instanceof SkinnedMesh)) return

    const bone = copy.skeleton.bones[0]
    expect(bone).toBeDefined()
    expect(bone).not.toBe(source.skeleton.bones[0])
    // The bone the copy is bound to has to be IN the copy: an exporter walks the subtree.
    expect(copy.children).toContain(bone)
  })
})

/**
 * The exporter writes NOTHING of an animation it was not handed, and it was handed none: a scene
 * animated in the studio and a model that arrived animated both left as still poses. Measured
 * before it was fixed — `parseAsync` was called with `{ binary }` alone.
 */
describe('exportObjects and the animation a reader plays', () => {
  /**
   * Bound by NAME, which is what `GLTFLoader` produces and the copies therefore keep. A track
   * naming a uuid binds to nothing on the other side — `placedCopy` mints fresh ones — and the
   * exporter then writes the clip anyway, with no channel at all. Measured 20/08: a uuid-bound
   * `Walk` reaches the file as `Walk:0`, a name-bound one as `Walk:1`, and a test reading names
   * alone cannot tell them apart.
   */
  const walking = (object: Object3D, target: Object3D): void => {
    object.animations = [
      new AnimationClip('Walk', 1, [
        new VectorKeyframeTrack(`${target.name}.position`, [0, 1], [0, 0, 0, 1, 0, 0]),
      ]),
    ]
  }

  /** What a reader actually plays: a clip with no channel is a name and nothing else. */
  const played = (file: GltfFile): string[] =>
    (file.animations ?? [])
      .filter(one => (one.channels?.length ?? 0) > 0)
      .map(one => one.name ?? '')

  it('carries the clips a loaded model brought with it', async () => {
    const model = named('rig')
    walking(model, model)

    expect(played(await gltfOf([model]))).toEqual(['Walk'])
  })

  /** The copy is what the file holds, so the clip has to name that — never the object on screen. */
  const composed = (at: number): Parameters<typeof gltfOf>[1] => ({
    clipsFor: copies => [
      new AnimationClip('AI Desktop Studio', 2, [
        new VectorKeyframeTrack(`${copies[at]?.uuid}.position`, [0, 2], [0, 0, 0, 5, 0, 0]),
      ]),
    ],
  })

  it('carries the document’s own animation, built from the copies', async () => {
    const file = await gltfOf([named('box-1')], composed(0))

    expect(played(file)).toEqual(['AI Desktop Studio'])
    expect(file.animations?.[0]?.channels?.[0]?.target?.path).toBe('translation')
  })

  /** A still scene must not gain an empty animation, which every reader would list as one. */
  it('writes no animation for a scene that holds none', async () => {
    expect((await gltfOf([named('box-1')])).animations).toBeUndefined()
  })

  /**
   * The case every real scene is in — a mesh and a lamp is already two — and the one every case
   * above missed by handing over exactly one root. `GLTFExporter` reads `animations` as a flat
   * list for a single input and as a list PER input beyond that, so a flat one was walked as if
   * each clip were an array of clips and nothing at all reached the file. Both sources at once:
   * they arrive through the same option, and both were silenced by it.
   */
  it('carries the animation of a scene standing on more than one root', async () => {
    const box = named('box-1')
    walking(box, box)

    const file = await gltfOf([box, named('box-2')], composed(1))

    expect(played(file).sort()).toEqual(['AI Desktop Studio', 'Walk'])
  })
})

/**
 * The registry tells a person, before the click, what a `.glb` will carry. Nothing else checks
 * that promise against the file: a trait classed as carried and quietly written by nobody reads
 * as « no loss » on screen and arrives empty in Blender.
 */
describe('what a scene export carries, against what the registry promises', () => {
  const carried = exportTargetOf('scene.glb').capability.interchange

  it('writes the material a node wears, which is why nodeMaterial is not a loss', async () => {
    expect(carried).toContain('nodeMaterial')
    expect((await gltfOf([named('box-1')])).materials?.length).toBeGreaterThan(0)
  })

  it('writes a punctual light through the extension glTF spells it with', async () => {
    const light = new DirectionalLight()
    light.name = 'sun'

    expect(carried).toContain('punctualLight')
    expect(Object.keys((await gltfOf([light])).extensions ?? {})).toContain('KHR_lights_punctual')
  })

  it('writes a camera, so its lens survives the trip', async () => {
    const camera = new PerspectiveCamera(35)
    camera.name = 'shot'

    expect(carried).toContain('cameraLens')
    expect((await gltfOf([camera])).cameras?.length).toBeGreaterThan(0)
  })
})

/**
 * The three formats a printer, a mesh tool and a physics engine read. Each carries shapes and
 * nothing else, which the registry says out loud — these cases check the FILE says the same.
 */
describe('the shape formats', () => {
  it('writes an OBJ naming the objects it was handed', async () => {
    const written = new TextDecoder().decode(await exportObjects([named('box-1')], 'obj'))

    expect(written).toContain('o box-1')
    expect(written).toMatch(/^v /m)
  })

  it('writes a PLY under the header the format opens on, binary rather than text', async () => {
    const written = await exportObjects([named('box-1')], 'ply')

    expect(new TextDecoder().decode(written.subarray(0, 3))).toBe('ply')
    expect(new TextDecoder().decode(written.subarray(0, 64))).toContain('binary')
  })

  /** 80 bytes of header, the triangle count, then 50 bytes each — the length has to add up. */
  it('writes an STL a reader can measure', async () => {
    const written = await exportObjects([named('box-1')], 'stl')

    const triangles = new DataView(written.buffer, written.byteOffset).getUint32(80, true)
    expect(triangles).toBe(12)
    expect(written.byteLength).toBe(84 + triangles * 50)
  })

  /** Several roots reach exporters that take exactly one, and must not lose all but the first. */
  it('carries every object handed to it, however many', async () => {
    const written = new TextDecoder().decode(
      await exportObjects([named('box-1'), named('box-2')], 'obj'),
    )

    expect(written).toContain('o box-1')
    expect(written).toContain('o box-2')
  })

  /**
   * A parent and its child, which is the smallest tree there is. OBJ writes the two as SIBLING
   * `o` groups — the notation has no nesting at all — and the registry must not promise one.
   */
  it('flattens a tree into siblings, which is why OBJ cannot promise the tree', async () => {
    const parent = named('parent')
    parent.add(named('child'))

    const written = new TextDecoder().decode(await exportObjects([parent], 'obj'))

    expect(written).toContain('o parent')
    expect(written).toContain('o child')
    expect(lossesExportingTo(['sceneTree'], 'scene.obj')).toEqual(['sceneTree'])
    expect(lossesExportingTo(['nodeName', 'nodePlacement'], 'scene.obj')).toEqual([])
  })

  /**
   * A PLY is one list of vertices and one of faces, and the header names neither an object nor a
   * parent — `element vertex` and `element face` are the format's own words, not a node's. The
   * registry promised both, on the reading that PLY "names its elements".
   */
  it('names nothing at all in a PLY, tree or node', async () => {
    const parent = named('parent')
    parent.add(named('child'))

    // The head alone: the rest is binary, and decoding it as text says nothing about a name.
    const header = new TextDecoder().decode((await exportObjects([parent], 'ply')).subarray(0, 512))

    expect(header).toContain('end_header')
    expect(header.slice(0, header.indexOf('end_header'))).not.toContain('parent')
    expect(header.slice(0, header.indexOf('end_header'))).not.toContain('child')
    expect(lossesExportingTo(['sceneTree', 'nodeName'], 'scene.ply')).toEqual([
      'sceneTree',
      'nodeName',
    ])
    expect(lossesExportingTo(['nodePlacement'], 'scene.ply')).toEqual([])
  })
})
