import { createDefaultScene } from '@/engines/scene/defaultScene'
import { GEOMETRY_SPECS, type PropertySpec } from '@/engines/scene/propertyFields'
import { type SceneNode, type SceneState } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installDocuments } from '@/stores/document-fixtures'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { Asset } from '@shared/domain/asset'
import { assistantAction, type ActionName } from '@shared/domain/assistant'
import { numericBoundsOf } from '@shared/domain/propertySpec'
import { TEXTURE_SLOTS, type SceneWorld } from '@shared/domain/scene'
import { beforeEach, describe, expect, it } from 'vitest'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'

function scene(): SceneState {
  return sceneOf(useScenes.getState(), DOCUMENT)
}

const nodeNamed = (name: string): SceneNode | undefined =>
  scene().nodes.find(node => node.name === name)

/** What the catalogue holds for this suite: `node.addModel` and `world.setSceneLighting` read it. */
const inCatalogue = (id: string, type: Asset['type']): Asset => ({
  id,
  name: id,
  type,
  location: 'local',
  tags: [],
  createdAt: '2026-08-20T10:00:00.000Z',
})

const CATALOGUE = [inCatalogue('asset-mesh', 'mesh'), inCatalogue('sky-1', 'skybox')]

beforeEach(() => {
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
  installFakeBridge({
    assets: {
      search: query => Promise.resolve(CATALOGUE.filter(one => query.ids?.includes(one.id))),
    },
  })
})

describe('the world of the scene', () => {
  it('replaces its durable terrain and scatter layers through one MCP action', async () => {
    const outcome = await runAction('world.setLayers', {
      layers: [
        {
          kind: 'scatter',
          id: 'trees',
          name: 'Trees',
          enabled: true,
          locked: false,
          assets: [],
          rules: { density: 1, scale: { min: 1, max: 1 }, rotation: { min: 0, max: 0 } },
          seed: 1,
          category: 'prop',
          collision: false,
          followRelief: true,
        },
      ],
    })

    expect(outcome).toEqual({ ok: true })
    expect(scene().world.layers).toMatchObject([{ kind: 'scatter', id: 'trees', name: 'Trees' }])
  })

  it('refuses a list it cannot read whole, rather than wiping the layers it holds', async () => {
    await runAction('world.setLayers', { layers: [{ kind: 'scatter', id: 'trees' }] })

    expect(await runAction('world.setLayers', { layers: 'all' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(await runAction('world.setLayers', { layers: [{ kind: 'relief' }] })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(scene().world.layers).toMatchObject([{ kind: 'scatter', id: 'trees' }])
  })

  it('uses the scene reader defaults for a sparse scatter entry', async () => {
    expect(await runAction('world.setLayers', { layers: [{ kind: 'scatter' }] })).toEqual({
      ok: true,
    })
    expect(scene().world.layers).toMatchObject([{ kind: 'scatter', assets: [], enabled: true }])
  })

  /**
   * 🛑 What CHANGED, never the whole of it: a member still as a fresh scene has it is left out and
   * absent reads as that default. Written whole, the world spent 355 characters carrying no id at
   * all, and `resultLine` then dropped `nodes` — where every id of the scene is published.
   */
  it('reads back every part of it that has moved, and leaves the rest out', async () => {
    await runAction('world.setFog', { kind: 'exp2', density: 0.05 })
    await runAction('world.setToneMapping', { toneMapping: 'aces', exposure: 1.4 })
    await runAction('world.setGroundPlane', { visible: true })

    const outcome = await runAction('scene.state', {})
    const read = outcome.ok ? (outcome.data as { world: Partial<SceneWorld> }).world : null

    expect(read?.fog).toEqual({ kind: 'exp2', color: expect.any(String), density: 0.05 })
    expect(read?.toneMapping).toBe('aces')
    expect(read?.exposure).toBe(1.4)
    expect(read?.ground).toEqual(scene().world.ground)
    // Untouched, so left out — the environment a fresh scene already lights itself with.
    expect(read?.environment).toBeUndefined()
  })

  it('lights the scene by a named sky, and puts it back out', async () => {
    expect(await runAction('world.setSceneLighting', { assetId: 'sky-1', intensity: 1.5 })).toEqual(
      {
        ok: true,
      },
    )
    expect(scene().world.environment).toEqual({ kind: 'skybox', assetId: 'sky-1' })
    expect(scene().world.envIntensity).toBe(1.5)

    await runAction('world.setSceneLighting', { kind: 'studio' })

    expect(scene().world.environment).toEqual({ kind: 'studio' })
  })

  /**
   * The panel answers this one by taking the first sky of the project. From outside that would be
   * a reference nobody picked, so the call is refused rather than guessed at.
   */
  it('refuses a sky nobody named', async () => {
    expect(await runAction('world.setSceneLighting', { kind: 'skybox' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * A scene FOLLOWS a sky document: it takes its graded picture, its sun and its intensity, and
   * editing that sky edits the scene. Named by TITLE, since a document id is nothing anyone types.
   */
  it('follows a sky document named by its title', async () => {
    installDocuments({ 'sky-doc': 'skyboxes', [DOCUMENT]: '3d' }, DOCUMENT)

    expect(await runAction('world.setSceneLighting', { sky: 'sky-doc' })).toEqual({ ok: true })
    expect(scene().world.environment).toEqual({ kind: 'sky', documentId: 'sky-doc' })
  })

  it('refuses a sky document the project does not hold', async () => {
    expect(await runAction('world.setSceneLighting', { sky: 'Nulle part' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  // A scene is lit by ONE prefiltered map, so naming both is a request with two answers.
  it('refuses a picture and a sky document at once', async () => {
    expect(
      await runAction('world.setSceneLighting', { assetId: 'sky-1', sky: 'sky-doc' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  it('refuses a sky document nobody named', async () => {
    expect(await runAction('world.setSceneLighting', { kind: 'sky' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * `transparent` is the shape a client most wants and no other call offers: a capture with
   * nothing behind the subject. The colour is written by the same call rather than by a second.
   */
  it('paints the backdrop, and takes it away entirely', async () => {
    await runAction('world.setBackground', { kind: 'color', color: '#123456' })

    expect(scene().world.background).toEqual({ kind: 'color', color: '#123456' })

    await runAction('world.setBackground', { kind: 'transparent' })

    expect(scene().world.background).toEqual({ kind: 'transparent' })
  })

  it('takes the distances of a linear haze, and forgets them when it is turned off', async () => {
    await runAction('world.setFog', { kind: 'linear', color: '#334455', near: 5, far: 90 })

    expect(scene().world.fog).toEqual({ kind: 'linear', color: '#334455', near: 5, far: 90 })

    await runAction('world.setFog', { kind: 'none' })

    expect(scene().world.fog).toEqual({ kind: 'none' })
  })

  /**
   * The switch the panel uses answers with the DEFAULTS of the shape it opens, so re-asserting
   * the shape in hand to change one value took the other two back to 10 and 60 in silence.
   */
  it('keeps the distances when only the colour of the same haze is named', async () => {
    await runAction('world.setFog', { kind: 'linear', near: 5, far: 90 })
    await runAction('world.setFog', { kind: 'linear', color: '#ff0000' })

    expect(scene().world.fog).toEqual({ kind: 'linear', color: '#ff0000', near: 5, far: 90 })
  })

  it('keeps the softening of a backdrop re-asserted as itself', async () => {
    await runAction('world.setBackground', { kind: 'environment', blur: 0.5 })
    await runAction('world.setBackground', { kind: 'environment' })

    expect(scene().world.background).toEqual({ kind: 'environment', blur: 0.5 })
  })

  /** A key a client believes took must never get a silent yes — the rule of `validatesInput`. */
  it('refuses a value that belongs to another shape, rather than dropping it', async () => {
    expect(await runAction('world.setFog', { kind: 'exp2', near: 5 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(
      await runAction('world.setBackground', { kind: 'transparent', color: '#000000' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    // Both readings of this call contradict each other: putting the sky out, and naming one.
    expect(
      await runAction('world.setSceneLighting', { kind: 'studio', assetId: 'sky-1' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /** The trap of an optional boolean: read as `false`, a call about the size would hide the floor. */
  it('leaves the ground showing when only its size is named', async () => {
    await runAction('world.setGroundPlane', { visible: true })
    await runAction('world.setGroundPlane', { size: 60 })

    expect(scene().world.ground).toMatchObject({ visible: true, size: 60 })
  })

  it('refuses a call that names nothing at all', async () => {
    expect(await runAction('world.setGroundPlane', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(await runAction('world.setToneMapping', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(await runAction('world.setSceneLighting', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * `no-unreachable-command` holds `setWorld` as PUBLISHED, which it now is — and a patch command
   * says nothing about its fields. This is what names the members no action writes, so a member
   * added to the world does not gain a door by accident.
   */
  it('names the members of the world nothing can write', async () => {
    const world: readonly ActionName[] = [
      'world.setSceneLighting',
      'world.setBackground',
      'world.setFog',
      'world.setGroundPlane',
      'world.setToneMapping',
    ]
    const written = new Set(
      world.flatMap(name => assistantAction(name)?.fields ?? []).map(field => field.key),
    )

    const reached: Record<keyof SceneWorld, boolean> = {
      environment: written.has('kind'),
      envIntensity: written.has('intensity'),
      envRotation: written.has('rotation'),
      background: written.has('blur'),
      fog: written.has('density'),
      toneMapping: written.has('toneMapping'),
      exposure: written.has('exposure'),
      ground: written.has('receiveShadow'),
      // The composition has actions of its own (`post.*`), which name an effect and a parameter
      // rather than a field of the world — so no `world.*` call reaches it, and none should.
      post: false,
      // How a set is WALKED. Nothing reads it yet either — see `ScenePlay`, whose own note says
      // it is written by templates and by nothing else.
      play: false,
      // A heightmap reference, written by nothing yet — no sculpt tool, no world action.
      layers: false,
    }

    expect(
      Object.entries(reached)
        .filter(([, held]) => !held)
        .map(([member]) => member),
      // `post` is written by the composition's own actions — `post.add`, `post.set`, `post.applyPreset`
      // — which name an effect and a parameter rather than a field of the world. `play` and
      // `layers` are written by nothing at all yet.
    ).toEqual(['post', 'play', 'layers'])
  })
})

/**
 * The bounds a client is offered against the ones the inspector enforces. A schema that swings
 * wider than the field is a client told it may write what the panel cannot — and the registry
 * lives in `shared/`, which cannot import the tables, so the copy is held from this side.
 */
describe('what the registry offers a node', () => {
  const fieldOf = (name: ActionName, key: string) =>
    assistantAction(name)?.fields.find(field => field.key === key)

  /** Every spec that names a field, whatever the primitive holding it. */
  const specsByName = (): Map<string, PropertySpec[]> => {
    const held = new Map<string, PropertySpec[]>()

    for (const specs of Object.values(GEOMETRY_SPECS)) {
      for (const [name, spec] of Object.entries(specs)) {
        held.set(name, [...(held.get(name) ?? []), spec])
      }
    }

    return held
  }

  /** A bound only holds where EVERY kind carrying the name has one — otherwise it is open. */
  const across = (specs: readonly PropertySpec[], edge: 'min' | 'max'): number | undefined => {
    const bounds = specs.map(spec => numericBoundsOf(spec)?.[edge] ?? undefined)
    if (bounds.some(bound => bound === undefined)) return undefined

    return edge === 'min' ? Math.min(...bounds.map(Number)) : Math.max(...bounds.map(Number))
  }

  it('bounds every primitive parameter as the union of what the kinds declare', () => {
    for (const [name, specs] of specsByName()) {
      const field = fieldOf('node.setPrimitiveParameters', name)

      expect({ min: field?.min, max: field?.max }, name).toEqual({
        min: across(specs, 'min'),
        max: across(specs, 'max'),
      })
    }
  })

  /** Counted, never measured: a segment and a half is a primitive three.js refuses to build. */
  it('publishes a whole number wherever the engine steps by one', () => {
    const counted = Object.values(GEOMETRY_SPECS).flatMap(specs =>
      Object.entries(specs)
        .filter(([, spec]) => numericBoundsOf(spec)?.step === 1)
        .map(([key]) => key),
    )

    expect(
      [...new Set(counted)].filter(
        key => fieldOf('node.setPrimitiveParameters', key)?.kind !== 'integer',
      ),
    ).toEqual([])
  })

  it('names every map slot the material holds, on the action that takes one', () => {
    expect([...(fieldOf('node.setMeshMaterial', 'textures')?.options ?? [])].sort()).toEqual(
      [...TEXTURE_SLOTS].sort(),
    )
  })
})

describe('what a node is made of', () => {
  const meshNamed = async (kind: string, name: string): Promise<string> => {
    const added = await runAction('node.add', { kind, name })
    return added.ok ? (added.data as { nodeId: string }).nodeId : ''
  }

  it('writes the parameters of the primitive it was built from', async () => {
    const nodeId = await meshNamed('torusKnot', 'Nœud')

    await runAction('node.setPrimitiveParameters', { nodeId, radius: 2, p: 3, q: 5 })

    expect(nodeNamed('Nœud')).toMatchObject({
      geometry: { kind: 'torusKnot', radius: 2, p: 3, q: 5, tube: 0.2 },
    })
  })

  it('refuses a parameter the shape has not got, rather than filing it', async () => {
    const nodeId = await meshNamed('box', 'Caisse')

    expect(await runAction('node.setPrimitiveParameters', { nodeId, radius: 2 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(nodeNamed('Caisse')?.type === 'mesh' && 'radius' in nodeNamed('Caisse')!).toBe(false)
  })

  /**
   * The narrowing the registry cannot do: it publishes one segment as the floor because a torus
   * takes one, and a capsule's ring falls apart below three.
   */
  it('refuses a count the kind in hand puts out of range', async () => {
    const capsule = await meshNamed('capsule', 'Gélule')
    const torus = await meshNamed('torus', 'Anneau')

    expect(
      await runAction('node.setPrimitiveParameters', { nodeId: capsule, radialSegments: 1 }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(
      await runAction('node.setPrimitiveParameters', { nodeId: torus, radialSegments: 1 }),
    ).toMatchObject({
      ok: true,
    })
  })

  it('throws and catches shadows, and refuses the half a light cannot hold', async () => {
    const mesh = await meshNamed('box', 'Caisse')
    const lamp = await meshNamed('point', 'Lampe')

    await runAction('node.setShadowCastAndReceive', {
      nodeId: mesh,
      castShadow: true,
      receiveShadow: true,
    })
    await runAction('node.setShadowCastAndReceive', { nodeId: lamp, castShadow: true })

    expect(nodeNamed('Caisse')).toMatchObject({ castShadow: true, receiveShadow: true })
    expect(nodeNamed('Lampe')).toMatchObject({ castShadow: true })
    expect(
      await runAction('node.setShadowCastAndReceive', { nodeId: lamp, receiveShadow: true }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('dresses a mesh in the project’s own maps, and takes one back off', async () => {
    const nodeId = await meshNamed('plane', 'Mur')

    await runAction('node.setMeshMaterial', {
      nodeId,
      tilesPerMetre: 2,
      textures: { map: 'asset-albedo', normalMap: 'asset-normal' },
    })
    expect(nodeNamed('Mur')).toMatchObject({
      material: { tilesPerMetre: 2, map: { assetId: 'asset-albedo' } },
    })

    await runAction('node.setMeshMaterial', { nodeId, textures: { normalMap: '' } })
    expect(nodeNamed('Mur')).toMatchObject({
      material: { map: { assetId: 'asset-albedo' }, normalMap: null },
    })
  })

  it('paints a text with the very action a mesh takes, minus the tiling', async () => {
    const nodeId = await meshNamed('text', 'Titre')

    await runAction('node.setMeshMaterial', { nodeId, color: '#00ff00' })
    expect(nodeNamed('Titre')).toMatchObject({ material: { color: '#00ff00' } })

    expect(await runAction('node.setMeshMaterial', { nodeId, tilesPerMetre: 2 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('sets the words, the face and the shape of a text', async () => {
    const nodeId = await meshNamed('text', 'Titre')

    await runAction('node.setTextSettings', {
      nodeId,
      value: 'Bonjour',
      fontFamily: 'IBM Plex Mono',
      textSize: 2,
      textDepth: 0,
    })

    expect(nodeNamed('Titre')).toMatchObject({
      text: { value: 'Bonjour', font: { family: 'IBM Plex Mono', source: 'embedded' }, size: 2 },
    })
  })

  it('tints and fades a sprite, and takes its picture away', async () => {
    const nodeId = await meshNamed('sprite', 'Panneau')

    await runAction('node.setSpriteSettings', { nodeId, opacity: 0.5, map: 'asset-picture' })
    expect(nodeNamed('Panneau')).toMatchObject({
      sprite: { opacity: 0.5, map: { assetId: 'asset-picture' } },
    })

    await runAction('node.setSpriteSettings', { nodeId, map: '' })
    expect(nodeNamed('Panneau')).toMatchObject({ sprite: { map: null } })
  })

  /**
   * A model NAMES a material and holds nothing of it, so taking one off is the whole gesture in
   * reverse: the node goes back to the maps its own `.glb` carries.
   */
  it('refuses a material the project does not hold, and takes one off on an empty name', async () => {
    const added = await runAction('node.addModel', { assetId: 'asset-mesh', name: 'Chevalier' })
    const nodeId = added.ok ? (added.data as { nodeId: string }).nodeId : ''

    const missing = await runAction('model.setMaterialDocument', {
      nodeId,
      material: 'Aucune matière',
    })
    expect(missing.ok).toBe(false)

    await runAction('model.setMaterialDocument', { nodeId, material: '' })

    const bare = nodeNamed('Chevalier')
    expect(bare).toMatchObject({ model: { assetId: 'asset-mesh' } })
    expect(bare?.type === 'model' && bare.model.materialDocumentId).toBeUndefined()
  })
})
