import { describe, expect, it, onTestFinished } from 'vitest'
import { DEFAULT_CHECKER_TEXTURE } from '@shared/domain/checkerTexture'
import { SCENE_SUBJECT_ID } from '@shared/domain/animation'
import { SCENE_TEMPLATE_IDS, type SceneTemplateId } from '@shared/domain/sceneTemplate'
import { TEMPLATE_SCRIPT_IDS } from '@shared/domain/templateScript'
import { documentPathFor } from '@shared/domain/documentName'
import { refFromString } from '@shared/domain/ref'
import { rememberCheckerTextures, forgetCheckerTextures } from './checkerTextures'
import { textOf } from '@game/runtime/componentFields'
import { createHierarchy } from '@/game/hierarchy'
import { aimedFrom, armRest } from './nodeFactory'
import { isPlayerModule, playerPartsOf } from './playerModule'
import { forgetShippedCharacter, rememberShippedCharacter } from './shippedCharacter'
import { pitchTowards, sceneFromTemplate } from './sceneTemplates'
import { subtreesOf, type SceneNode } from './sceneState'

const typesIn = (nodes: readonly SceneNode[]): string[] => nodes.map(node => node.type)

describe('sceneFromTemplate', () => {
  /**
   * 🛑 What a machine points at, held against what the template actually carries. A name nobody
   * wears is a beacon that never turns and a drone that never follows — in silence, since the
   * systems answer nothing for a name they cannot resolve. Renaming the stand-in is what this
   * catches, and only a template can: the level names `Character`, which the level does not hold.
   */
  it('points every component at a name its own template carries', () => {
    for (const id of SCENE_TEMPLATE_IDS) {
      const nodes = sceneFromTemplate(id).nodes
      const names = new Set(nodes.map(node => node.name))
      const wanted = nodes.flatMap(node =>
        (node.components ?? []).flatMap(component =>
          typeof component.target === 'string' && component.target !== '' ? [component.target] : [],
        ),
      )

      expect({ id, missing: wanted.filter(name => !names.has(name)) }).toEqual({ id, missing: [] })
    }
  })

  /**
   * 🛑 A template poses its camera by hand while its arm names the numbers again, and the two
   * drifted: the circuit opened 11,56 m off and backwards, the module 21,8° off in PITCH — which
   * is why the rotation is held here too, and not the seat alone.
   */
  it('seats and aims the camera of every armed template where the arm will put it', () => {
    const seated: Record<string, unknown> = {}

    for (const id of SCENE_TEMPLATE_IDS) {
      const nodes = sceneFromTemplate(id).nodes
      const byId = new Map(nodes.map(node => [node.id, node]))
      const byName = new Map(nodes.map(node => [node.name, node]))
      const hierarchy = createHierarchy(byId, () => null)
      const worldOf = (node: SceneNode) => hierarchy.worldOf(node.id, node.transform)

      for (const node of nodes) {
        const arm = node.components?.find(one => one.type === 'SpringArm')
        if (!arm) continue

        const subject = byName.get(textOf(arm, 'subject', ''))
        const camera = byName.get(textOf(arm, 'camera', ''))
        if (!subject || !camera) {
          seated[id] = 'unresolved'
          continue
        }

        const stands = worldOf(subject)
        const { pivot, seat } = armRest(stands.position, stands.rotation.y, arm)
        const at = worldOf(camera)
        const turned = aimedFrom(seat, pivot)
        seated[id] =
          Math.hypot(at.position.x - seat.x, at.position.y - seat.y, at.position.z - seat.z) <
            0.001 && Math.abs(at.rotation.x - turned.x) < 0.001
      }
    }

    // The keys ARE the coverage: a template that stops being checked shows up as a missing one.
    expect(seated).toEqual({ firstPerson: true, thirdPerson: true, car: true })
  })

  it('opens every template on a lit scene, so none of them looks like a broken viewport', () => {
    for (const id of SCENE_TEMPLATE_IDS) {
      expect(typesIn(sceneFromTemplate(id).nodes)).toContain('light')
    }
  })

  it('holds no mesh in the empty one: nothing has been modelled yet', () => {
    expect(sceneFromTemplate('empty').nodes.filter(node => node.type === 'mesh')).toEqual([])
  })

  it('gives the basic one a floor, a cube to scale it by, a camera and no selection', () => {
    const scene = sceneFromTemplate('basic')

    expect(typesIn(scene.nodes)).toEqual(['mesh', 'mesh', 'light', 'light', 'camera'])
    expect(scene.selectedIds).toEqual([])
  })

  // What sent the first batch back: one stretch of the checker over twenty metres reads as a blur.
  it('tiles a floor by the metre rather than stretching one picture over it', () => {
    const floor = sceneFromTemplate('basic').nodes.find(node => node.type === 'mesh')

    expect(floor?.type === 'mesh' && floor.material.tilesPerMetre).toBe(1)
  })

  it('lays the floor flat and keeps it out of the shadow pass', () => {
    const floor = sceneFromTemplate('basic').nodes.find(node => node.type === 'mesh')

    expect(floor?.transform.rotation).toEqual({ x: -Math.PI / 2, y: 0, z: 0 })
    expect(floor?.castShadow).toBe(false)
    expect(floor?.receiveShadow).toBe(true)
  })

  it('puts the cinematic camera on a rail, which is what the template is for', () => {
    expect(typesIn(sceneFromTemplate('cinematic').nodes)).toContain('path')
  })

  it('stands a person-sized stand-in in the template that frames one', () => {
    const capsule = sceneFromTemplate('topDown').nodes.find(
      node => node.type === 'mesh' && node.geometry.kind === 'capsule',
    )

    expect(capsule?.transform.position.y).toBeCloseTo(0.9)
  })

  /** The module carries its own body: what stands is its `Capsule`, and the mesh hangs under it. */
  it('opens the third person on a player module rather than a loose stand-in', () => {
    const { nodes } = sceneFromTemplate('thirdPerson')
    const parts = playerPartsOf(nodes)

    expect(parts?.module.name).toBe('Player_Module')
    expect(parts?.body?.transform.position.y).toBeCloseTo(0.9)
    expect(nodes.filter(node => node.type === 'camera')).toHaveLength(1)
  })

  it('points the character animator at the graph the template seeded', () => {
    rememberShippedCharacter('asset-hero')
    onTestFinished(forgetShippedCharacter)
    const graph = 'Motions/character.anim.json'
    const { nodes } = sceneFromTemplate('thirdPerson', 'Scripts', graph)
    const animator = nodes
      .flatMap(node => node.components ?? [])
      .find(one => one.type === 'Animator')

    expect(animator).toMatchObject({ graph })
  })

  it('gives the character templates feet on the ground, which nothing reads yet', () => {
    expect(sceneFromTemplate('firstPerson').world.play).toEqual({
      camera: 'firstPerson',
      eyeHeight: 1.7,
      moveSpeed: 4,
      gravity: 9.81,
    })
  })

  it('leaves the studio default in place for a template that says nothing about playing', () => {
    expect(sceneFromTemplate('basic').world.play.camera).toBe('orbit')
    expect(sceneFromTemplate('basic').world.play.gravity).toBe(0)
  })

  it('aims the first-person camera at the horizon, at eye height', () => {
    const camera = sceneFromTemplate('firstPerson').nodes.find(node => node.type === 'camera')

    expect(camera?.transform.position.y).toBe(1.7)
    expect(camera?.transform.rotation).toEqual({ x: 0, y: 0, z: 0 })
  })

  // Three cadrages over an empty floor proved nothing: what makes them worth picking is a set
  // one can climb, fall off and bump into — the same one for the three.
  it('opens the three character views on the same level, moving only the camera', () => {
    // The LEVEL alone, and it has to be said in two ways: `thirdPerson` stands a player MODULE
    // on it — a figure of a dozen meshes — while the other two still carry the old `Character`
    // capsule. Whoever walks the set is not the set, in either shape; the second line goes the
    // day the last template is migrated.
    const shapesOf = (id: SceneTemplateId): string => {
      const { nodes } = sceneFromTemplate(id)
      const walker = new Set(
        subtreesOf(
          nodes,
          nodes.filter(isPlayerModule).map(node => node.id),
        ).map(node => node.id),
      )
      return nodes
        .filter(node => node.type === 'mesh' && !walker.has(node.id) && node.name !== 'Character')
        .map(node => (node.type === 'mesh' ? node.geometry.kind : ''))
        .join()
    }

    expect(shapesOf('topDown')).toBe(shapesOf('thirdPerson'))
    expect(shapesOf('firstPerson').split(',').length).toBeGreaterThan(15)
  })

  it('builds a fresh scene each time, sharing no id with the last', () => {
    const first = sceneFromTemplate('basic').nodes.map(node => node.id)
    const second = sceneFromTemplate('basic').nodes.map(node => node.id)

    expect(new Set([...first, ...second]).size).toBe(first.length + second.length)
  })

  it('wears the project checker once it is installed, and plain paint until then', () => {
    forgetCheckerTextures()
    const bare = sceneFromTemplate('basic').nodes.find(node => node.type === 'mesh')
    expect(bare?.type === 'mesh' && bare.material.map).toBeNull()

    rememberCheckerTextures([{ id: DEFAULT_CHECKER_TEXTURE, assetId: 'asset_checker' }])
    const dressed = sceneFromTemplate('basic').nodes.find(node => node.type === 'mesh')
    expect(dressed?.type === 'mesh' && dressed.material.map).toEqual({ assetId: 'asset_checker' })

    forgetCheckerTextures()
  })

  it('leaves the photo studio backdrop unpainted by the checker', () => {
    rememberCheckerTextures([{ id: DEFAULT_CHECKER_TEXTURE, assetId: 'asset_checker' }])
    const backdrop = sceneFromTemplate('photoStudio').nodes.find(
      node => node.type === 'mesh' && node.transform.position.z === -5,
    )

    expect(backdrop?.type === 'mesh' && backdrop.material.map).toBeNull()
    forgetCheckerTextures()
  })
})

describe('pitchTowards', () => {
  it('tips a raised camera downward, and leaves one at target height level', () => {
    expect(pitchTowards(12, 8)).toBeLessThan(0)
    expect(pitchTowards(1.7, 6, 1.7)).toBe(0)
  })
})

describe('the template the composition is judged on', () => {
  const demo = sceneFromTemplate('postProcessing')

  /** § 28, as one gesture: open it, press Play, and the whole chain is in front of you. */
  it('opens with a composition already on the scene', () => {
    expect(demo.world.post.effects.map(one => one.effect)).toEqual([
      'gtao',
      'dof',
      'bloom',
      'colorGrading',
      'vignette',
      'smaa',
    ])
  })

  it('puts the camera on a rail for the length of the shot', () => {
    const shot = demo.animation.shots[0]
    const rail = demo.nodes.find(one => one.type === 'path')

    expect(shot?.motion?.pathId).toBe(rail?.id)
    expect(shot?.duration).toBe(demo.animation.duration)
  })

  /** The rack focus of § 14: sharp at fifteen metres, sharp at two three seconds later. */
  it('racks the focus from fifteen metres to two', () => {
    const focus = demo.animation.tracks.find(one => one.target.post?.param === 'focusDistance')
    const stack = demo.world.post.effects.find(one => one.effect === 'dof')

    expect(stack?.params.focusDistance).toBe(15)
    expect(focus?.keys.map(key => key.value.x)).toEqual([0, -13])
  })

  it('keys the flash and the exposure of § 15 on the scene, not on a camera', () => {
    const driven = demo.animation.tracks.filter(one => one.target.nodeId === SCENE_SUBJECT_ID)

    expect(driven).toHaveLength(3)
  })

  /** A band that shows no line for what it drives is a state no saved file can be in. */
  it('puts everything it animates on the sheet', () => {
    expect(demo.animation.sheet).toContain(SCENE_SUBJECT_ID)
    expect(demo.animation.sheet).toContain(demo.animation.shots[0]?.cameraId)
  })
})

/**
 * 🛑 An arm is a COMPONENT, so no menu of node types can offer one — a template shipping without
 * it is a feature nobody reaches. What is left here is the MACHINE, which has no module yet:
 * `thirdPerson` left this list the day its arm stopped naming anything.
 */
describe('the arm the playable templates hang their camera on', () => {
  /**
   * 🛑 `aimedCamera` stands on the +Z axis at x = 0, which framed a subject only while it sat near
   * the origin. The car moved onto the loop's straight and the camera stayed 71 m to the side.
   */
  it('stands the car template camera behind the car rather than on the Z axis', () => {
    const { nodes } = sceneFromTemplate('car')
    const camera = nodes.find(node => node.type === 'camera')!
    const car = nodes.find(node => node.name === 'Car')!
    const away = {
      x: car.transform.position.x - camera.transform.position.x,
      z: car.transform.position.z - camera.transform.position.z,
    }

    const yaw = camera.transform.rotation.y
    // A camera looks down its own -Z, which is why this is not the subject's own forward vector.
    const sight = { x: -Math.sin(yaw), z: -Math.cos(yaw) }

    // The car stands AHEAD of the camera, in its axis — not off to the side of a fixed Z view.
    expect(away.x * sight.x + away.z * sight.z).toBeGreaterThan(5)
    expect(Math.abs(away.x * sight.z - away.z * sight.x)).toBeLessThan(0.5)
  })

  const wired: readonly { template: SceneTemplateId; subject: string }[] = [
    { template: 'car', subject: 'Car' },
  ]

  for (const { template, subject } of wired) {
    it(`wires ${template} to a subject and a camera the scene really holds`, () => {
      const { nodes } = sceneFromTemplate(template)
      const arm = nodes.flatMap(node => node.components ?? []).find(one => one.type === 'SpringArm')
      const named = nodes.map(node => node.name)

      expect(arm?.subject).toBe(subject)
      expect(named).toContain(arm?.camera)
      expect(named).toContain(subject)
    })
  }
})

describe('what a template lays down beside itself', () => {
  const scripted = (template: SceneTemplateId, folder?: string): readonly string[] =>
    sceneFromTemplate(template, folder)
      .nodes.flatMap(node => node.components ?? [])
      .filter(component => component.type === 'Script')
      .map(component => textOf(component, 'script', ''))

  it('gives every played template a script to open, and every other none', () => {
    expect(scripted('firstPerson')).toEqual(['script:Scripts/player.ts'])
    expect(scripted('thirdPerson')).toEqual(['script:Scripts/player.ts'])
    expect(scripted('topDown')).toEqual(['script:Scripts/player.ts'])
    expect(scripted('car')).toEqual(['script:Scripts/car.ts'])
    expect(scripted('plane')).toEqual(['script:Scripts/plane.ts'])
    expect(scripted('empty')).toEqual([])
    expect(scripted('basic')).toEqual([])
  })

  /**
   * 🛑 The field is a `script:<path>` REFERENCE, and a bare id resolves to nothing: the kernel
   * answers « script never loaded » and the inspector opens no file. The path follows the project's
   * own code folder, which is where the seeding writes.
   */
  it('points the component at the file the seeding writes, in the folder that role resolved to', () => {
    expect(scripted('car', 'Sources')).toEqual(['script:Sources/car.ts'])
  })

  it('hangs it on what is PLAYED, never on a prop standing beside it', () => {
    const third = sceneFromTemplate('thirdPerson').nodes
    const module = third.find(isPlayerModule)

    expect(module?.components?.some(one => one.type === 'Script')).toBe(true)

    const walker = sceneFromTemplate('firstPerson').nodes.find(isPlayerModule)
    expect(walker?.components?.some(one => one.type === 'Script')).toBe(true)
  })

  it('names a script the seeding can write, so the component never points at nothing', () => {
    for (const template of SCENE_TEMPLATE_IDS) {
      for (const named of scripted(template)) {
        const ref = refFromString(named)
        // Both halves: a reference the kernel can key on, whose file the seeding knows how to write.
        expect(ref?.kind).toBe('script')
        expect(
          TEMPLATE_SCRIPT_IDS.some(
            id => ref?.kind === 'script' && ref.path === documentPathFor(id, 'script', 'Scripts'),
          ),
        ).toBe(true)
      }
    }
  })
})
