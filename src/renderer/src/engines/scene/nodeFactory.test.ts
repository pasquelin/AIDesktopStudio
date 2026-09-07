import { describe, expect, it, onTestFinished } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { figureByKind } from './figures'
import { createNodeOf, createNodesOf, figureNodes, groupNode, iconOf } from './nodeFactory'
import { PLAYER_KIND } from './playerModule'
import { forgetShippedCharacter, rememberShippedCharacter } from './shippedCharacter'
import { lightNodeFixture, meshNode, modelNodeFixture, spriteNodeFixture } from './scene-fixtures'

describe('createNodeOf', () => {
  it('builds a mesh from a primitive kind', () => {
    const node = createNodeOf('box')

    expect(node?.type).toBe('mesh')
    expect(node?.type === 'mesh' && node.geometry.kind).toBe('box')
  })

  it('builds a light from a light kind', () => {
    const node = createNodeOf('point')

    expect(node?.type).toBe('light')
    expect(node?.type === 'light' && node.light.kind).toBe('point')
  })

  /**
   * A name is document data. Named after the translated menu row, a scene would read `Cube` in
   * French and `Box` in English — and could not be shared between the two.
   */
  it('names a node after its class, not after the language of the interface', () => {
    expect(createNodeOf('box')?.name).toBe('Box')
    expect(createNodeOf('torusKnot')?.name).toBe('TorusKnot')
    expect(createNodeOf('spot')?.name).toBe('SpotLight')
  })

  it('drops the node at the origin, visible and unparented', () => {
    const node = createNodeOf('sphere')

    expect(node?.parentId).toBeNull()
    expect(node?.visible).toBe(true)
    expect(node?.transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('gives every node its own id', () => {
    expect(createNodeOf('box')?.id).not.toBe(createNodeOf('box')?.id)
  })

  it('refuses a kind no registry claims', () => {
    expect(createNodeOf('hologram')).toBeNull()
  })

  // Born with something written in it: a text node that draws nothing until someone finds the
  // field is a node the Add menu appears to have failed at.
  it('builds a text with words in it, in a face the studio ships', () => {
    const node = createNodeOf('text')

    expect(node?.type).toBe('text')
    expect(node?.type === 'text' && node.text.value).toBeTruthy()
    expect(node?.type === 'text' && node.text.font.source).toBe('embedded')
  })

  it('builds a sprite, mapless, since the picture is picked afterwards', () => {
    const node = createNodeOf('sprite')

    expect(node?.type).toBe('sprite')
    expect(node?.type === 'sprite' && node.sprite.map).toBeNull()
  })

  // three.js draws meshes into a shadow map and nothing else, so both boxes would lie.
  it('makes a sprite neither throw a shadow nor catch one', () => {
    const node = createNodeOf('sprite')

    expect(node).toMatchObject({ castShadow: false, receiveShadow: false })
  })

  it('refuses a kind no registry knows', () => {
    expect(createNodeOf('teapot')).toBeNull()
  })
})

// The glyph belongs to the registry entry: a panel that picked its own would drift from the menu.
describe('iconOf', () => {
  it('gives each kind of node its own glyph', () => {
    const icons = [
      iconOf(meshNode('a')),
      iconOf(lightNodeFixture('l')),
      iconOf(spriteNodeFixture('s')),
      iconOf(modelNodeFixture('m')),
      iconOf(groupNode()),
    ]

    expect(new Set(icons).size).toBe(icons.length)
  })
})

/**
 * The module is the one node that IMPOSES a shape on what hangs under it: a body and an eye,
 * always. Who the player is stops being decided by whichever controller a sweep met first.
 */
describe('the player module', () => {
  const bornWith = (name: string) => createNodesOf(PLAYER_KIND).find(node => node.name === name)

  it('is born as a body and an eye, parented the way the module reads', () => {
    const nodes = createNodesOf(PLAYER_KIND)
    const at = (name: string) => nodes.find(node => node.name === name)

    // The figure's own parts hang under it and are its business — see `figures.test.ts`.
    expect(nodes.map(node => node.name).filter(name => name !== undefined)).toEqual(
      expect.arrayContaining(['Player_Module', 'Capsule', 'Figure', 'SpringArm', 'Camera']),
    )
    expect(at('Player_Module')?.parentId).toBeNull()
    expect(at('Capsule')?.parentId).toBe(at('Player_Module')?.id)
    expect(at('Figure')?.parentId).toBe(at('Capsule')?.id)
    expect(at('SpringArm')?.parentId).toBe(at('Player_Module')?.id)
    expect(at('Camera')?.parentId).toBe(at('SpringArm')?.id)
  })

  it('marks the module itself, which is what makes it findable at all', () => {
    expect(bornWith('Player_Module')?.components).toEqual([newComponent('Player')])
  })

  /** The capsule is the controller's own height and radius — it draws nothing of its own. */
  it('puts the walking on the capsule and the drawing on the figure under it', () => {
    expect(bornWith('Capsule')?.type).toBe('group')
    expect(bornWith('Capsule')?.components?.map(one => one.type)).toEqual(['CharacterController'])
    expect(bornWith('Figure')?.type).toBe('group')
    expect(bornWith('Figure')?.components).toBeUndefined()
  })

  /**
   * What the shipped character is FOR. The figure of boxes above is the fallback — a project that
   * cannot be written to installs nothing, and a module without a body cannot be seen walking.
   */
  it('wears the shipped character grounded and facing the controller forward direction', () => {
    rememberShippedCharacter('asset_hero')
    onTestFinished(forgetShippedCharacter)

    const worn = bornWith('Character')

    expect(worn?.type).toBe('model')
    expect(worn?.type === 'model' && worn.model.assetId).toBe('asset_hero')
    // Down by half the controller's height: the body's node is its centre, a character's origin
    // is at its feet, and left at the centre it would stand 90 cm in the air.
    expect(worn?.transform.position).toEqual({ x: 0, y: -0.9, z: 0 })
    expect(Math.cos(worn?.transform.rotation.y ?? 0)).toBeCloseTo(-1)
    expect(bornWith('Figure')).toBeUndefined()
  })

  it('hangs the camera on an arm rather than on the body, so a wall can push it in', () => {
    expect(bornWith('SpringArm')?.components?.map(one => one.type)).toEqual(['SpringArm'])
    expect(bornWith('Camera')?.type).toBe('camera')
  })

  /** 🛑 Readable names, never ids: a uuid is a field an author cannot read, let alone correct. */
  it('names its own children in its arm, as a reader sees them', () => {
    const arm = bornWith('SpringArm')?.components?.[0]

    expect(arm?.subject).toBe('Capsule')
    expect(arm?.camera).toBe('Camera')
  })

  /**
   * 🛑 What is FELT and what is SEEN are one body — but a figure knows nothing of a controller,
   * so it is the module that SIZES one to the body it fills. A capsule drawn inside a capsule
   * showed nothing the cage does not already draw, which is why it went.
   */
  it('stands the body on the ground, its centre half its own height up', () => {
    const walker = bornWith('Capsule')?.components?.[0]

    expect(bornWith('Capsule')?.transform.position.y).toBe(Number(walker?.height) / 2)
  })

  /**
   * 🛑 INSIDE the capsule and not merely as tall as it: a capsule is domed and a part is a box,
   * so a figure at full height had its shoes 9,6 cm out through the bottom — read on screen as a
   * body bursting its own cage.
   */
  it('sizes the figure so every part of it stands within the body', () => {
    const walker = bornWith('Capsule')?.components?.[0]
    const height = Number(walker?.height)
    const radius = Number(walker?.radius)
    const worn = bornWith('Figure')?.transform.scale.y ?? 0
    const straight = height / 2 - radius

    const outside = createNodesOf(PLAYER_KIND)
      .filter(node => node.type === 'mesh' && node.geometry.kind === 'box')
      .flatMap(node =>
        node.type === 'mesh' && node.geometry.kind === 'box'
          ? [{ at: node.transform.position, size: node.geometry }]
          : [],
      )
      .filter(({ at, size }) =>
        [-1, 1].some(sx =>
          [-1, 1].some(sy =>
            [-1, 1].some(sz => {
              const x = (at.x + (sx * size.width) / 2) * worn
              const y = (at.y + (sy * size.height) / 2) * worn
              const z = (at.z + (sz * size.depth) / 2) * worn
              const beyond = Math.max(0, Math.abs(y) - straight)
              return Math.hypot(Math.hypot(x, z), beyond) > radius + 1e-6
            }),
          ),
        ),
      )

    expect(outside).toEqual([])
    // And not shrunk to nothing to get there: it still fills the body it stands in.
    expect(worn).toBeGreaterThan(0.8)
  })

  it('gives every module its own ids', () => {
    const first = createNodesOf(PLAYER_KIND).map(node => node.id)
    const second = createNodesOf(PLAYER_KIND).map(node => node.id)

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length)
  })
})

/** The door every add goes through. A module is several nodes; everything else is exactly one. */
describe('createNodesOf', () => {
  it('answers one node for a kind that is one node', () => {
    expect(createNodesOf('box')).toHaveLength(1)
  })

  it('answers nothing for a kind no registry claims', () => {
    expect(createNodesOf('hologram')).toEqual([])
  })
})

/**
 * The one place a figure becomes a scene, as `meshNode` is the one place a mesh does. What it
 * builds is ORDINARY nodes: that is the whole bargain of the family — glTF, the inspector, undo
 * and instancing all serve a figure without knowing one exists.
 */
describe('a figure laid down as nodes', () => {
  const humanoid = () =>
    figureNodes(figureByKind('humanoid')?.create() ?? { kind: 'humanoid', height: 0, parts: [] })

  it('hangs every part off one group, so a scene gains one row and not thirteen', () => {
    const nodes = humanoid()
    const group = nodes[0]

    expect(group?.type).toBe('group')
    expect(group?.name).toBe('Figure')
    expect(nodes.slice(1).every(node => node.parentId === group?.id)).toBe(true)
  })

  it('paints each part the colour the registry gave it', () => {
    const figure = figureByKind('humanoid')?.create()
    const painted = figureNodes(figure ?? { kind: 'humanoid', height: 0, parts: [] })
      .slice(1)
      .map(node => (node.type === 'mesh' ? node.material.color : null))

    expect(painted).toEqual(figure?.parts.map(part => part.colour))
  })

  /** A part recoloured afterwards must not drag its twin: two nodes holding one object would. */
  it('gives every part a material of its own', () => {
    const materials = humanoid().flatMap(node => (node.type === 'mesh' ? [node.material] : []))

    expect(new Set(materials).size).toBe(materials.length)
  })

  /**
   * 🛑 The same trap `levelParts.surface` names for materials: `transformAt` KEEPS the vector it
   * is handed, and the parts are a module-level table — so two figures shared one position each,
   * and moving a leg on one moved it on the other.
   */
  it('gives every part a position of its own, across two figures', () => {
    const one = humanoid()
    const other = humanoid()
    const held = [...one, ...other].map(node => node.transform.position)

    expect(new Set(held).size).toBe(held.length)
  })

  it('sizes the whole thing without touching a part, so one figure fits any body', () => {
    const worn = figureNodes(
      figureByKind('humanoid')?.create() ?? { kind: 'humanoid', height: 0, parts: [] },
      0.5,
    )

    expect(worn[0]?.transform.scale).toEqual({ x: 0.5, y: 0.5, z: 0.5 })
    expect(worn[1]?.transform.scale).toEqual({ x: 1, y: 1, z: 1 })
  })
})
