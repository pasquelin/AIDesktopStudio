import { describe, expect, it } from 'vitest'
import { reliefLayer } from '@shared/domain/scene'
import { DOCUMENT_ID_KEY, DOCUMENT_KIND_KEY, STUDIO_METADATA_KEY } from '@shared/domain/document'
import { GLTF_SCENE_STATE, gltfStudioMetadata, isGltfDocument } from '@shared/domain/gltf'
import { isRecord } from '@shared/guards'
import {
  gltfDocumentOf,
  sceneFromGltf,
  sceneHoldsMore,
  type GltfDocumentOptions,
} from './gltfDocument'
import { loadHeightmap } from './heightmap'
import { openExrFloatY } from './openExr-fixtures'
import { cameraNodeFixture, lightNodeFixture, meshNode, modelNodeFixture } from './scene-fixtures'
import { EMPTY_SCENE, type SceneState } from './sceneState'

const WRITTEN: GltfDocumentOptions = { documentId: 'doc-1', documentKind: 'scene' }

function write(state: SceneState): Record<string, unknown> {
  const document = gltfDocumentOf(state, WRITTEN)
  if (!isRecord(document)) throw new Error('not a document')
  return document
}

/** What a reader walks: the nodes array, checked for shape rather than trusted. */
function nodesOf(document: Record<string, unknown>): Record<string, unknown>[] {
  const nodes = document.nodes
  return Array.isArray(nodes) ? nodes.filter(isRecord) : []
}

/** `EXRLoader` writes scanline 0 at the bottom. Domain samples follow that orientation. */
function flippedExr(values: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(values.length)
  for (let y = 0; y < height; y++) {
    out.set(values.subarray(y * width, (y + 1) * width), (height - 1 - y) * width)
  }
  return out
}

describe('gltfDocumentOf', () => {
  it('writes a file another application reads as glTF', () => {
    const document = write(EMPTY_SCENE)

    expect(isGltfDocument(document)).toBe(true)
    expect(document.scene).toBe(0)
  })

  it('names the model another application follows, by uri', () => {
    const uri = '.resources/Models/HeroMedium.glb'
    const document = gltfDocumentOf(
      { ...EMPTY_SCENE, nodes: [modelNodeFixture('Character', 'asset-hero')] },
      { ...WRITTEN, uriOf: id => (id === 'asset-hero' ? uri : null) },
    )
    if (!isRecord(document)) throw new Error('not a document')

    expect(nodesOf(document)[0]?.extras).toEqual({ uri })
  })

  it('points at the pictures a mesh wears', () => {
    const floor = meshNode('floor')
    floor.material = { ...floor.material, map: { assetId: 'tex-1' } }
    const document = gltfDocumentOf(
      { ...EMPTY_SCENE, nodes: [floor] },
      { ...WRITTEN, uriOf: id => (id === 'tex-1' ? '.resources/Materials/GridLarge.png' : null) },
    )
    if (!isRecord(document)) throw new Error('not a document')

    expect(document.images).toEqual([{ uri: '.resources/Materials/GridLarge.png' }])
  })

  it('keeps pictures it composed, and names extras a save would drop', () => {
    const floor = meshNode('floor')
    floor.material = { ...floor.material, map: { assetId: 'tex-1' } }
    const composed = gltfDocumentOf(
      { ...EMPTY_SCENE, nodes: [floor] },
      { ...WRITTEN, uriOf: () => 'grid.png' },
    )
    if (!isRecord(composed)) throw new Error('not a document')

    expect(sceneHoldsMore(composed)).not.toContain('images')
    expect(sceneHoldsMore({ ...write(EMPTY_SCENE), images: [{ uri: 'foreign.png' }] })).toContain(
      'images',
    )
  })

  it('says which document it is, and which kind, where the file name cannot', () => {
    const studio = gltfStudioMetadata(write(EMPTY_SCENE))

    expect(studio[DOCUMENT_ID_KEY]).toBe('doc-1')
    expect(studio[DOCUMENT_KIND_KEY]).toBe('scene')
  })

  it('hangs a child under its parent, and roots the rest', () => {
    const child = { ...meshNode('child'), parentId: 'parent' }
    const document = write({ ...EMPTY_SCENE, nodes: [meshNode('parent'), child] })

    expect(nodesOf(document)[0]?.children).toEqual([1])
    expect(nodesOf(document)[1]?.children).toBeUndefined()
    const scenes = document.scenes
    expect(Array.isArray(scenes) && isRecord(scenes[0]) ? scenes[0].nodes : null).toEqual([0])
  })

  it('leaves out a placement that is the default, and writes one that is not', () => {
    const moved = meshNode('moved')
    moved.transform = {
      ...moved.transform,
      position: { x: 1, y: 2, z: 3 },
      scale: { x: 2, y: 2, z: 2 },
    }
    const document = write({ ...EMPTY_SCENE, nodes: [meshNode('still'), moved] })

    expect(nodesOf(document)[0]).toEqual({ name: 'still' })
    expect(nodesOf(document)[1]?.translation).toEqual([1, 2, 3])
    expect(nodesOf(document)[1]?.scale).toEqual([2, 2, 2])
  })

  it('writes a rotation as a quaternion, four numbers where the descriptor holds three', () => {
    const turned = meshNode('turned')
    turned.transform = { ...turned.transform, rotation: { x: 0, y: Math.PI / 2, z: 0 } }

    const quarterTurn = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]
    expect(nodesOf(write({ ...EMPTY_SCENE, nodes: [turned] }))[0]?.rotation).toEqual(quarterTurn)
  })

  it('writes a camera the standard way, its angle in radians', () => {
    const document = write({ ...EMPTY_SCENE, nodes: [cameraNodeFixture('cam', { fov: 90 })] })
    const cameras = document.cameras

    expect(nodesOf(document)[0]?.camera).toBe(0)
    const first = Array.isArray(cameras) && isRecord(cameras[0]) ? cameras[0] : {}
    expect(first.type).toBe('perspective')
    expect(isRecord(first.perspective) ? first.perspective.yfov : null).toBeCloseTo(Math.PI / 2, 6)
  })

  it('writes a punctual light under the extension, and declares it', () => {
    const document = write({
      ...EMPTY_SCENE,
      nodes: [
        lightNodeFixture('spot', {
          kind: 'spot',
          color: '#ffffff',
          intensity: 2,
          distance: 8,
          angle: 1,
          penumbra: 0.5,
          decay: 2,
          target: { x: 0, y: 0, z: 0 },
        }),
      ],
    })

    expect(document.extensionsUsed).toEqual(['KHR_lights_punctual'])
    const extensions = isRecord(document.extensions)
      ? document.extensions.KHR_lights_punctual
      : null
    const lights = isRecord(extensions) ? extensions.lights : null
    const light = Array.isArray(lights) && isRecord(lights[0]) ? lights[0] : {}
    expect(light.type).toBe('spot')
    expect(light.color).toEqual([1, 1, 1])
    expect(light.intensity).toBe(2)
    expect(light.range).toBe(8)
    expect(light.spot).toEqual({ innerConeAngle: 0.5, outerConeAngle: 1 })
  })

  it('leaves an ambient light out of the extension, having no type for it', () => {
    const document = write({ ...EMPTY_SCENE, nodes: [lightNodeFixture('ambient')] })

    expect(document.extensionsUsed).toBeUndefined()
    expect(nodesOf(document)[0]?.extensions).toBeUndefined()
  })
})

describe('sceneFromGltf', () => {
  it('round-trips a relief, and the samples that asset holds', async () => {
    const layer = reliefLayer(
      { assetId: 'asset_height' },
      {
        id: 'terrain',
        origin: { x: -16, z: 4 },
        size: { x: 256, z: 128 },
        elevation: { min: -8, max: 32 },
      },
    )
    const state: SceneState = {
      ...EMPTY_SCENE,
      world: {
        ...EMPTY_SCENE.world,
        layers: [layer],
      },
    }
    const document = JSON.parse(JSON.stringify(write(state)))

    expect(sceneHoldsMore(document)).toEqual([])
    const back = sceneFromGltf(document)
    expect(back.world.layers).toEqual([layer])

    const values = Float32Array.from({ length: 16 }, (_, at) => at + 0.25)
    const bytes = openExrFloatY(4, 4, values)
    const body = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(body).set(bytes)
    const first = back.world.layers[0]
    const assetId = first?.kind === 'relief' ? first.heightmap.assetId : ''
    const samples = await loadHeightmap(assetId, async () => body)
    expect(samples.width).toBe(4)
    expect(samples.height).toBe(4)
    expect(samples.values).toEqual(flippedExr(values, 4, 4))
  })

  it('gives back the scene that was written, node for node', () => {
    const state: SceneState = {
      ...EMPTY_SCENE,
      nodes: [meshNode('box'), cameraNodeFixture('cam'), lightNodeFixture('ambient')],
    }

    expect(sceneFromGltf(write(state))).toEqual({ ...state, selectedIds: [] })
  })

  it('answers an empty scene for a glTF no studio wrote', () => {
    expect(sceneFromGltf({ asset: { version: '2.0' }, scenes: [{ nodes: [] }] })).toEqual(
      EMPTY_SCENE,
    )
  })

  it('reads the scene the document points at, not the first one written', () => {
    const document = write({ ...EMPTY_SCENE, nodes: [meshNode('box')] })
    const scenes = document.scenes
    const held = Array.isArray(scenes) ? scenes[0] : {}

    // The studio's own scene second, and pointed at: a reader that took the first would answer
    // for a scene holding nothing.
    expect(
      sceneFromGltf({
        ...document,
        scene: 1,
        scenes: [{ name: 'other', extras: { [STUDIO_METADATA_KEY]: {} } }, held],
      }).nodes,
    ).toHaveLength(1)
  })
})

/** This build's own file with its animation replaced — a later build's rows, in this file. */
function withTimeline(over: Record<string, unknown>): Record<string, unknown> {
  const held = JSON.parse(JSON.stringify(write({ ...EMPTY_SCENE, nodes: [meshNode('a')] })))
  const state = gltfStudioMetadata(held)[GLTF_SCENE_STATE]
  if (!isRecord(state) || !isRecord(state.animation)) throw new Error('no animation written')
  Object.assign(state.animation, over)
  return held
}

/**
 * Each case asserts WHICH member was found, never that something was.
 *
 * The suite next door asserted only that the refusal existed, and its fixture REPLACED `scenes` —
 * which drops the extras carrying the state, so the node count fired instead. Disarming the scene
 * check therefore left every case green, measured 18/08 on the whole 10 326.
 */
describe('sceneHoldsMore', () => {
  const written = (): Record<string, unknown> => write({ ...EMPTY_SCENE, nodes: [meshNode('a')] })

  const enriched = (over: Record<string, unknown>): Record<string, unknown> => ({
    ...written(),
    ...over,
  })

  it('finds nothing in a file it wrote itself', () => {
    expect(sceneHoldsMore(written())).toEqual([])
  })

  /** The case the suite next door could not see: the studio's own scenes KEPT, plus one. */
  it('names the second scene of a file holding two', () => {
    const scenes = written().scenes
    const two = enriched({
      scenes: [...(Array.isArray(scenes) ? scenes : []), { name: 'Plan large', nodes: [] }],
    })

    expect(sceneHoldsMore(two)).toEqual(['scenes'])
  })

  it('names the node a file gained beside the ones the state holds', () => {
    const nodes = written().nodes
    const more = enriched({ nodes: [...(Array.isArray(nodes) ? nodes : []), { name: 'Empty' }] })

    expect(sceneHoldsMore(more)).toEqual(['nodes'])
  })

  /**
   * 🛑 The same loss as an unknown component, one member deeper: a save recomposes the timeline
   * whole, so a row a later build wrote and this one cannot read is one the first ⌘S takes away.
   */
  it('names a timeline row a later build wrote and this one cannot read', () => {
    const held = withTimeline({
      transitions: [{ id: 't1', at: 0, kind: 'iris', duration: 100 }],
      template: 'documentary',
    })

    expect(sceneHoldsMore(held).sort()).toEqual(['animation.template', 'animation.transitions'])
  })

  /** 🛑 The quietest loss of all: `readList` answers empty and nothing counts a difference. */
  it('names a list a later build wrote as something other than an array', () => {
    const held = withTimeline({ events: { e1: { id: 'e1', at: 0, name: 'Opened' } } })

    expect(sceneHoldsMore(held)).toEqual(['animation.events'])
  })

  /** A member COMPOSED from something narrower has to be looked INTO — the repository's own rule. */
  it('names a timeline member this build has no name for', () => {
    const held = withTimeline({ markers: [{ id: 'm1', at: 0 }] })

    expect(sceneHoldsMore(held)).toEqual(['animation.markers'])
  })

  /**
   * 🛑 `readList` FILTERS, it does not key by id: both rows come back and both are written back.
   * Counted as a loss, a repeat opened the document read-only and refused every ⌘S over a round
   * trip that was faithful. What it really costs is a row swallowed at PLAY.
   */
  it('says nothing about two rows under one id, and gives both back', () => {
    const held = withTimeline({
      events: [
        { id: 'e1', at: 0, name: 'First' },
        { id: 'e1', at: 1, name: 'Second' },
      ],
    })

    expect(sceneHoldsMore(held)).toEqual([])
    expect(sceneFromGltf(held).animation.events).toHaveLength(2)
  })

  it('says nothing about a timeline whose rows it reads whole', () => {
    const held = withTimeline({ events: [{ id: 'e1', at: 0, name: 'Opened' }] })

    expect(sceneHoldsMore(held)).toEqual([])
  })

  it('names an asset field beyond the ones a save writes back', () => {
    expect(sceneHoldsMore(enriched({ asset: { version: '2.0', copyright: 'Atelier' } }))).toEqual([
      'asset.copyright',
    ])
  })

  it('names an extension the file declares beside the lights one', () => {
    const variants = enriched({
      extensionsUsed: ['KHR_lights_punctual', 'KHR_materials_variants'],
    })

    expect(sceneHoldsMore(variants)).toEqual(['KHR_materials_variants'])
  })

  it('names a root member this studio never writes', () => {
    expect(
      sceneHoldsMore(enriched({ extensionsRequired: ['KHR_draco_mesh_compression'] })),
    ).toEqual(['extensionsRequired'])
    expect(sceneHoldsMore(enriched({ meshes: [{ primitives: [] }] }))).toEqual(['meshes'])
  })

  /** The default scene's extras are recomposed whole, exactly as the sky's are. */
  it('names a key another application left in the default scene extras', () => {
    const scenes = written().scenes
    const first = Array.isArray(scenes) && isRecord(scenes[0]) ? scenes[0] : {}
    const marked = enriched({
      scenes: [{ ...first, extras: { ...(first.extras as object), blender: { collection: 'A' } } }],
    })

    expect(sceneHoldsMore(marked)).toEqual(['scene.extras.blender'])
  })

  /** A scene written before the studio wrote glTF is not one, so there is nothing to measure. */
  it('answers nothing at all for a payload that is not a glTF document', () => {
    expect(sceneHoldsMore({ nodes: [], selection: [] })).toEqual([])
  })
})
