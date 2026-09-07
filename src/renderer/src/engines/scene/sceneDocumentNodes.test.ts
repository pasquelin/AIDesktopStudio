import { describe, expect, it } from 'vitest'
import { TEXTURE_SLOTS, TILES_PER_METRE } from '@shared/domain/scene'
import {
  lightNodeFixture as light,
  meshNode as mesh,
  modelNodeFixture,
  pathNodeFixture,
  spriteNodeFixture,
  textNodeFixture,
} from './scene-fixtures'
import { groupNode } from './nodeFactory'
import { SPRITE_SPECS } from './propertyFields'
import { scenePayload, sceneFromPayload } from './sceneDocument'
import {
  DEFAULT_MATERIAL,
  DEFAULT_SPRITE,
  DEFAULT_TEXT,
  EMPTY_SCENE,
  IDENTITY_TRANSFORM,
  type SceneNode,
  type SceneState,
} from './sceneState'

/** A payload as it comes back from disk: through JSON, so nothing keeps a live reference. */
function reread(state: SceneState): SceneState {
  return sceneFromPayload(JSON.parse(JSON.stringify(scenePayload(state))))
}

const nodeWith = (fields: object): unknown => ({ ...mesh('a'), ...fields })

describe('sceneFromPayload structured nodes', () => {
  // Saving a grouped scene and reopening it dropped every group, leaving their children hanging
  // from a parent nothing answered to — invisible in the outliner, and kept in the file.
  it('carries a group and what hangs from it through a round trip', () => {
    const group = groupNode()
    const child = { ...mesh('a'), parentId: group.id }

    const back = reread({ ...EMPTY_SCENE, nodes: [group, child] }).nodes
    expect(back.map(node => node.id)).toEqual([group.id, 'a'])
    expect(back[1]?.parentId).toBe(group.id)
  })

  it('carries a runtime optimization override without making it the scene truth', () => {
    const node: SceneNode = { ...mesh('a'), optimization: { mode: 'exclude' } }

    expect(reread({ ...EMPTY_SCENE, nodes: [node] }).nodes[0]?.optimization).toEqual({
      mode: 'exclude',
    })
    expect(
      sceneFromPayload({ nodes: [{ ...node, optimization: { mode: 'unknown' } }] }).nodes,
    ).toEqual([])
  })

  it('round-trips the source identities and transforms of a baked instance node', () => {
    const node: SceneNode = {
      ...mesh('baked'),
      instances: [{ sourceId: 'source', name: 'Source', transform: IDENTITY_TRANSFORM }],
    }

    expect(reread({ ...EMPTY_SCENE, nodes: [node] }).nodes).toEqual([node])
    expect(
      sceneFromPayload({
        nodes: [{ ...node, instances: [{ sourceId: 'source', transform: IDENTITY_TRANSFORM }] }],
      }).nodes,
    ).toEqual([])
  })

  it('drops baked groups whose source identities are empty, repeated, or already nodes', () => {
    const source = mesh('source')
    const baked = (id: string, sourceIds: readonly string[]): SceneNode => ({
      ...mesh(id),
      instances: sourceIds.map(sourceId => ({
        sourceId,
        name: sourceId,
        transform: IDENTITY_TRANSFORM,
      })),
    })

    expect(
      sceneFromPayload({
        nodes: [
          source,
          baked('empty', ['']),
          baked('local-duplicate', ['twice', 'twice']),
          baked('node-collision', ['source']),
          baked('first-valid', ['shared']),
          baked('cross-group-duplicate', ['shared']),
        ],
      }).nodes.map(node => node.id),
    ).toEqual(['source', 'first-valid'])
  })

  // Same trap as the group's: a node type the loader has never heard of is dropped, and a scene
  // saved with sprites would reopen without them.
  it('carries a sprite and the picture it wears through a round trip', () => {
    const back = reread({ ...EMPTY_SCENE, nodes: [spriteNodeFixture('s1', 'pic-1')] }).nodes

    expect(back[0]).toMatchObject({
      type: 'sprite',
      sprite: { map: { assetId: 'pic-1' }, opacity: 1, color: null },
    })
  })

  /**
   * The trap this scene has fallen into twice: `isSceneNode` did not know `group`, and a grouped
   * scene reopened without its groups; the same was waiting for `sprite`. Every new kind of node
   * is tested by a round trip through what a file holds, never by reading the guard.
   */
  it('carries a text, its face and its shape through a round trip', () => {
    const written = textNodeFixture('t1', { value: 'Bonjour', size: 2, depth: 0.5 })

    const back = reread({ ...EMPTY_SCENE, nodes: [written] }).nodes

    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({
      type: 'text',
      text: { value: 'Bonjour', size: 2, depth: 0.5, font: { source: 'embedded', family: 'Lato' } },
    })
  })

  // Every new kind of node is tested by a round trip through what a file holds — the trap this
  // loader has fallen into twice, for groups and then for sprites.
  it('carries a rail, its points and its shape through a round trip', () => {
    const rail = pathNodeFixture('rail')

    expect(reread({ ...EMPTY_SCENE, nodes: [rail] }).nodes).toEqual([rail])
  })

  it('drops a rail of fewer than two points, and keeps the scene around it', () => {
    const rail = pathNodeFixture('rail')
    const nodes: unknown[] = [
      mesh('a'),
      { ...rail, path: { ...rail.path, points: [{ x: 0, y: 0, z: 0 }] } },
      { ...rail, id: 'nowhere', path: { ...rail.path, points: 'somewhere' } },
    ]

    expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a'])
  })

  // A family this machine has not got is kept as written: the document said what it meant, and
  // rewriting it here would lose the author's choice on every open.
  it('keeps a system face nobody here has, rather than rewriting the document', () => {
    const written = textNodeFixture('t1', { font: { source: 'system', family: 'Futura' } })

    const back = reread({ ...EMPTY_SCENE, nodes: [written] }).nodes

    expect(back[0]?.type === 'text' && back[0].text.font).toEqual({
      source: 'system',
      family: 'Futura',
    })
  })

  // A face the studio no longer ships is one nothing can produce: fallen back rather than kept,
  // so the words still draw.
  it('falls back to a shipped face when the document names one it no longer has', () => {
    const written = textNodeFixture('t1', { font: { source: 'embedded', family: 'Helvetiker' } })

    const back = reread({ ...EMPTY_SCENE, nodes: [written] }).nodes

    expect(back[0]?.type === 'text' && back[0].text.font.family).toBe('Lato')
  })

  it.each([
    ['a size that is not a number', { ...DEFAULT_TEXT, size: 'big' }],
    ['no words at all', { ...DEFAULT_TEXT, value: 42 }],
    ['a text that is not an object', 'Bonjour'],
  ])('drops a text with %s', (_case, text) => {
    const nodes: unknown[] = [{ ...textNodeFixture('t1'), text }]

    expect(sceneFromPayload({ nodes }).nodes).toHaveLength(0)
  })

  /**
   * Driven off the table rather than named one by one: `isSprite` was the last guard checking its
   * fields by hand, so a field added to `SPRITE_SPECS` went unverified at load — and a document
   * carrying a wrong value for it reopened with that value in place.
   */
  // The colour apart: `null` is legal for it and for nothing else, and a case below covers it.
  const measured = Object.keys(SPRITE_SPECS).filter(name => name !== 'color')

  it.each(measured)('drops a sprite whose %s is not a number', field => {
    const broken = {
      ...spriteNodeFixture('s1'),
      sprite: { color: null, opacity: 1, map: null, [field]: 'half' },
    }

    expect(sceneFromPayload({ nodes: [broken] }).nodes).toEqual([])
  })
})

describe('sceneFromPayload legacy shadows', () => {
  /**
   * The silent risk of the whole shadow change: every document written so far has no flags, and
   * requiring them would have emptied each of them at load — a dropped node looks exactly like
   * one that was never there.
   */
  describe('a document written before shadows existed', () => {
    const before = (node: object): Record<string, unknown> => {
      const stripped: Record<string, unknown> = { ...node }
      delete stripped.castShadow
      delete stripped.receiveShadow
      return stripped
    }

    it('keeps its nodes rather than dropping them', () => {
      const nodes = [before(mesh('a')), before(light('b')), before(modelNodeFixture('m'))]
      expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a', 'b', 'm'])
    })

    it('gives a mesh both flags, so a scene reads as lit rather than as cut-outs', () => {
      const [node] = sceneFromPayload({ nodes: [before(mesh('a'))] }).nodes
      expect(node).toMatchObject({ castShadow: true, receiveShadow: true })
    })

    // A point light with shadows is six renders of the scene a frame, and a spot is one.
    it('only lets a directional light throw shadows by default', () => {
      const directional = light('d', {
        kind: 'directional',
        color: '#fff',
        intensity: 1,
        target: { x: 0, y: 0, z: 0 },
      })
      const point = light('p', {
        kind: 'point',
        color: '#fff',
        intensity: 1,
        distance: 0,
        decay: 2,
      })

      const nodes = sceneFromPayload({ nodes: [before(directional), before(point)] }).nodes
      expect(nodes.map(node => node.castShadow)).toEqual([true, false])
    })

    it('leaves a flag the file does hold alone', () => {
      const kept = { ...mesh('a'), castShadow: false, receiveShadow: false }
      expect(sceneFromPayload({ nodes: [kept] }).nodes[0]).toMatchObject({ castShadow: false })
    })
  })
})

describe('sceneFromPayload malformed nodes', () => {
  it.each([
    ['no id', nodeWith({ id: '' })],
    ['a shadow flag that is not a flag', nodeWith({ castShadow: 'yes' })],
    ['a parent that is not a reference', nodeWith({ parentId: 7 })],
    ['no name', nodeWith({ name: null })],
    ['a visibility that is not a flag', nodeWith({ visible: 'yes' })],
    ['a transform missing an axis', nodeWith({ transform: { ...IDENTITY_TRANSFORM, scale: {} } })],
    // 'camera' used to stand for an unknown type here; it is a node of its own since renders
    // need one, so the example moved to something the studio still draws nothing for.
    ['a type nothing renders', nodeWith({ type: 'projector' })],
    ['a geometry of an unknown kind', nodeWith({ geometry: { kind: 'blob', radius: 1 } })],
    ['a geometry missing a parameter', nodeWith({ geometry: { kind: 'box', width: 1 } })],
    ['a geometry whose parameter is text', nodeWith({ geometry: { kind: 'sphere', radius: '1' } })],
    [
      'a material of an unknown kind',
      nodeWith({ material: { ...DEFAULT_MATERIAL, kind: 'toon' } }),
    ],
    ['a texture without an asset', nodeWith({ material: { ...DEFAULT_MATERIAL, map: {} } })],
    ['an id that is not text', nodeWith({ id: 7 })],
    ['a transform that is not an object', nodeWith({ transform: 'origin' })],
    ['a geometry whose kind is not text', nodeWith({ geometry: { kind: 7 } })],
    ['a material that is not an object', nodeWith({ material: 'standard' })],
    [
      'a material colour that is not text',
      nodeWith({ material: { ...DEFAULT_MATERIAL, color: 7 } }),
    ],
    ['a model whose reference is not an object', { ...modelNodeFixture('m'), model: 'asset-1' }],
    ['a sprite that is not an object', { ...spriteNodeFixture('s'), sprite: 'red' }],
    [
      'a sprite colour that is not text',
      { ...spriteNodeFixture('s'), sprite: { color: 7, opacity: 1, map: null } },
    ],
  ])('drops a node with %s', (_case, node) => {
    expect(sceneFromPayload({ nodes: [node] }).nodes).toEqual([])
  })
})

describe('sceneFromPayload malformed node recovery', () => {
  it('drops a light whose descriptor is incomplete', () => {
    const broken = { ...light('a'), light: { kind: 'spot', color: '#fff', intensity: 1 } }
    expect(sceneFromPayload({ nodes: [broken] }).nodes).toEqual([])
  })

  it('refuses a number JSON cannot hold, rather than building a mesh from Infinity', () => {
    const overflowing: unknown = JSON.parse('{"nodes":[{"geometry":{"radius":1e999}}]}')
    expect(sceneFromPayload(overflowing).nodes).toEqual([])
  })

  it('keeps the good nodes around a bad one', () => {
    const nodes = [mesh('a'), nodeWith({ id: 'bad', geometry: { kind: 'blob' } }), mesh('c')]
    expect(sceneFromPayload({ nodes }).nodes.map(node => node.id)).toEqual(['a', 'c'])
  })

  /**
   * The guarantee this used to get from a dropped node, now that an absent slot is legal: a slot
   * added to `MaterialDescriptor` and forgotten in `TEXTURE_SLOTS` would go unchecked, and the
   * texture it names would be neither validated nor drawn.
   */
  it('names every texture slot a dressed material has to carry', () => {
    const declared = Object.keys(DEFAULT_MATERIAL).filter(name => name.endsWith('Map'))

    expect([...TEXTURE_SLOTS].sort()).toEqual(['map', ...declared].sort())
  })

  /**
   * The defect this guards: the tables are exhaustive by typecheck, so a field added to one is
   * required of every document written before it existed — and a node that fails its guard is
   * dropped in silence, indistinguishable from a node that never was.
   */
  it('revives a material missing a slot rather than dropping the node', () => {
    const stripped: Record<string, unknown> = { ...DEFAULT_MATERIAL }
    delete stripped.normalMap

    const [node] = sceneFromPayload({ nodes: [nodeWith({ material: stripped })] }).nodes

    expect(node?.type === 'mesh' && node.material.normalMap).toBe(null)
  })

  /**
   * The bounds were declared and read by nobody: a file holding zero collapsed every UV onto one
   * texel, which shows as a mesh painted flat with no way to tell why. Clamped rather than
   * refused — dropping the node would lose the shape as well as its tiling.
   */
  it('holds a tiling density inside its bounds instead of dropping the node', () => {
    const nodes = [
      nodeWith({ material: { ...DEFAULT_MATERIAL, tilesPerMetre: 0 } }),
      nodeWith({ material: { ...DEFAULT_MATERIAL, tilesPerMetre: 5000 } }),
    ]

    const revived = sceneFromPayload({ nodes }).nodes

    expect(revived).toHaveLength(2)
    expect(revived[0]?.type === 'mesh' && revived[0].material.tilesPerMetre).toBe(
      TILES_PER_METRE.min,
    )
    expect(revived[1]?.type === 'mesh' && revived[1].material.tilesPerMetre).toBe(
      TILES_PER_METRE.max,
    )
  })

  it('revives a sprite missing a measured field with the default for it', () => {
    const stripped: Record<string, unknown> = { ...DEFAULT_SPRITE }
    delete stripped.opacity
    const nodes: unknown[] = [{ ...spriteNodeFixture('s1'), sprite: stripped }]

    const [node] = sceneFromPayload({ nodes }).nodes

    expect(node?.type === 'sprite' && node.sprite.opacity).toBe(DEFAULT_SPRITE.opacity)
  })

  it('revives a text missing a measured field with the default for it', () => {
    const stripped: Record<string, unknown> = { ...DEFAULT_TEXT }
    delete stripped.curveSegments
    const nodes: unknown[] = [{ ...textNodeFixture('t1'), text: stripped }]

    const [node] = sceneFromPayload({ nodes }).nodes

    expect(node?.type === 'text' && node.text.curveSegments).toBe(DEFAULT_TEXT.curveSegments)
  })

  // Absent is a file that says nothing; `null` is a file that says something wrong.
  it('still drops a node whose measured field is null rather than absent', () => {
    const nodes: unknown[] = [
      { ...spriteNodeFixture('s1'), sprite: { ...DEFAULT_SPRITE, opacity: null } },
    ]

    expect(sceneFromPayload({ nodes }).nodes).toEqual([])
  })
})
