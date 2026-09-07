import { beforeEach, describe, expect, it } from 'vitest'
import type { Asset } from '@shared/domain/asset'
import type { Rig } from '@shared/domain/rig'
import { secondsToUs } from '@shared/domain/time'
import { IDENTITY_TRANSFORM } from '@shared/domain/transform'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { modelNode } from '@/engines/scene/nodeFactory'
import { installFakeBridge } from '@/services/fakeBridge'
import type { ModelNode, SceneState } from '@/engines/scene/sceneState'
import { installScene } from '@/stores/scene-fixtures'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { useAssets } from '@/stores/assets'
import { useModelFiles } from '@/stores/modelFiles'
import { sceneOf, useScenes } from '@/stores/scenes'
import { characterOf, seedCharacter, useCharacters } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { runAction } from './executor'

const DOCUMENT = 'doc-scene'

/** Two bones, so removing one has a child to hang somewhere. */
const RIG: Rig = {
  origin: 'local',
  bones: [
    { name: 'Root', parent: null, rest: IDENTITY_TRANSFORM },
    { name: 'Spine', parent: 'Root', rest: IDENTITY_TRANSFORM },
  ],
}

const ANIMATION: Asset = {
  id: 'asset-run',
  name: 'Course',
  type: 'animation',
  location: 'local',
  tags: [],
  createdAt: '2026-08-20T10:00:00.000Z',
}

function scene(): SceneState {
  return sceneOf(useScenes.getState(), DOCUMENT)
}

const character = (): ModelNode | undefined =>
  scene().nodes.find((node): node is ModelNode => node.type === 'model')

/** What the skeleton window holds — a FILE, which is where a rig lives now. */
const held = () => characterOf(useCharacters.getState(), ASSET)

/** The scene still holds the model: the band and the blocks are the scene's half. */
function installCharacter(rig: Rig | null = RIG): string {
  const node = modelNode(ASSET, 'Héros')
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [node], selectedIds: [] })
  seedCharacter(ASSET, rig, {})
  return node.id
}

const ASSET = 'asset-hero'

beforeEach(() => {
  useAssets.setState({ items: [ANIMATION] })
  useModelFiles.setState({ rigs: {} })
  clearCharacters()
})

describe('reading a character', () => {
  it('answers its bones, its handles and what it knows how to play', async () => {
    installCharacter()

    const outcome = await runAction('rig.state', {})

    expect(outcome).toMatchObject({ ok: true, data: { rigged: true, motions: [], sockets: [] } })
    expect((outcome as { data: { bones: unknown[] } }).data.bones).toHaveLength(2)
  })

  // 🛑 `wrongSurface` and not `notFound`: a skeleton is edited in a window of its own, and with
  // none open there is no character to name — a different thing from naming one wrongly.
  it('refuses when no character is open, and says where one is opened', async () => {
    expect(await runAction('rig.state', {})).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

describe('the skeleton', () => {
  it('takes a bone out, its children hung where it hung', async () => {
    installCharacter()

    expect(await runAction('bone.remove', { bone: 'Root' })).toEqual({ ok: true })
    expect(held().rig?.bones.map(bone => bone.name)).toEqual(['Spine'])
  })

  it('adds one under the bone named, called after it', async () => {
    installCharacter()

    expect(await runAction('bone.add', { parent: 'Spine' })).toEqual({ ok: true })
    expect(held().rig?.bones.map(bone => bone.name)).toContain('Spine.1')
  })

  /**
   * The command writes nothing for a duplicate, so answering `ok` would tell a client a rename
   * took when the skeleton never moved.
   */
  it('refuses a rename onto a name already taken rather than answering ok', async () => {
    installCharacter()

    expect(await runAction('bone.rename', { bone: 'Spine', name: 'Root' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(held().rig?.bones.map(bone => bone.name)).toEqual(['Root', 'Spine'])
  })

  it('ties a bone to a joint of the standard, and to none when no role is given', async () => {
    installCharacter()

    await runAction('bone.setRole', { bone: 'Spine', role: 'Hips' })
    expect(held().rig?.bones.find(bone => bone.name === 'Spine')?.role).toBe('Hips')

    await runAction('bone.setRole', { bone: 'Spine' })
    expect(held().rig?.bones.find(bone => bone.name === 'Spine')?.role).toBeUndefined()
  })

  it('refuses a bone the skeleton does not hold', async () => {
    installCharacter()

    expect(await runAction('bone.remove', { bone: 'Tail' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  it('takes the whole skeleton off', async () => {
    installCharacter()

    expect(await runAction('rig.clear', {})).toEqual({ ok: true })
    expect(held().rig).toBeNull()
  })

  // The engine has not read the model, so there is nothing measured to fit a skeleton to.
  it('refuses to fit one while nothing has been measured', async () => {
    installCharacter(null)

    expect(await runAction('rig.fit', {})).toMatchObject({ ok: false, refusal: 'notFound' })
  })
})

describe('the handles a joint reaches for', () => {
  it('adds a chain and the handle it reaches for, then takes both back', async () => {
    installCharacter()

    expect(await runAction('ik.add', { bone: 'Spine' })).toEqual({ ok: true })
    const chain = held().rig?.ik?.[0]
    expect(chain?.effector).toBe('Spine')

    expect(await runAction('ik.remove', { chainId: chain?.id ?? '' })).toEqual({ ok: true })
    expect(held().rig?.ik).toEqual([])
    expect(held().rig?.bones.map(bone => bone.name)).toEqual(['Root', 'Spine'])
  })

  it('refuses a chain the rig does not hold', async () => {
    installCharacter()

    expect(await runAction('ik.remove', { chainId: 'chain-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })
})

describe('the band of a character', () => {
  it('lays a block from the library, and takes it off again', async () => {
    const nodeId = installCharacter()

    expect(await runAction('animation.addBlock', { nodeId, assetId: 'asset-run' })).toEqual({
      ok: true,
    })
    const clip = character()?.model.lanes?.[0]?.clips[0]
    expect(clip?.label).toBe('Course')

    expect(await runAction('animation.removeBlock', { nodeId, clipId: clip?.id ?? '' })).toEqual({
      ok: true,
    })
    expect(character()?.model.lanes?.[0]?.clips).toEqual([])
  })

  it('refuses an animation the library does not hold', async () => {
    const nodeId = installCharacter()

    expect(await runAction('animation.addBlock', { nodeId, assetId: 'asset-z' })).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  it('sets the length and the rate, leaving what is not named alone', async () => {
    installCharacter()
    const before = scene().animation.fps

    expect(await runAction('animation.setBandLengthAndRate', { durationSeconds: 4 })).toEqual({
      ok: true,
    })
    expect(scene().animation.fps).toBe(before)
    expect(scene().animation.duration).toBeGreaterThan(0)

    expect(await runAction('animation.setBandLengthAndRate', {})).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('turns automatic keying on, which nothing saves with the document', async () => {
    installCharacter()

    expect(await runAction('animation.autoKey', { on: true })).toEqual({ ok: true })
    expect(animationViewOf(useAnimationViews.getState(), DOCUMENT).autoKey).toBe(true)
  })
})

describe('the three places a motion comes from', () => {
  beforeEach(() => {
    installFakeBridge({
      animations: { list: () => Promise.resolve([{ name: 'Salut', thumbnail: false }]) },
    })
  })

  it('lists the model’s own clips, the shipped ones and the library’s', async () => {
    const nodeId = installCharacter()
    useModelFiles.setState({ rigs: {}, clips: { [DOCUMENT]: { [nodeId]: ['Marche'] } } })

    const outcome = await runAction('animations.list', { nodeId })

    expect(outcome).toMatchObject({
      ok: true,
      data: { embedded: ['Marche'], bundled: ['Salut'], assets: [{ id: 'asset-run' }] },
    })
  })

  it('lays a clip the model’s own file spells', async () => {
    const nodeId = installCharacter()
    useModelFiles.setState({ rigs: {}, clips: { [DOCUMENT]: { [nodeId]: ['Marche'] } } })

    expect(
      await runAction('animation.addBlock', { nodeId, source: 'embedded', clipName: 'Marche' }),
    ).toEqual({ ok: true })
    expect(character()?.model.lanes?.[0]?.clips[0]?.source).toEqual({
      kind: 'embedded',
      name: 'Marche',
    })
  })

  it('lays one of the shipped animations, and refuses a name nothing ships', async () => {
    const nodeId = installCharacter()

    expect(
      await runAction('animation.addBlock', { nodeId, source: 'bundled', clipName: 'Salut' }),
    ).toEqual({ ok: true })
    expect(character()?.model.lanes?.[0]?.clips[0]?.source).toEqual({
      kind: 'bundled',
      name: 'Salut',
    })

    expect(
      await runAction('animation.addBlock', { nodeId, source: 'bundled', clipName: 'Néant' }),
    ).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  /** An id names one source and a name the two others: a call giving both named two things. */
  it('refuses a call that names an asset and a clip at once', async () => {
    const nodeId = installCharacter()

    expect(
      await runAction('animation.addBlock', { nodeId, assetId: 'asset-run', clipName: 'Marche' }),
    ).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(await runAction('animation.addBlock', { nodeId, source: 'embedded' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('what one block of the band plays', () => {
  async function laid(): Promise<{ nodeId: string; clipId: string }> {
    const nodeId = installCharacter()
    await runAction('animation.addBlock', { nodeId, assetId: 'asset-run' })
    return { nodeId, clipId: character()?.model.lanes?.[0]?.clips[0]?.id ?? '' }
  }

  it('writes the block’s own settings and leaves the rest of it alone', async () => {
    const { nodeId, clipId } = await laid()

    expect(
      await runAction('animation.setBlockSettings', {
        nodeId,
        clipId,
        speed: 2,
        loop: false,
        fadeSeconds: 0.5,
        startSeconds: 1,
        rootMotion: 'inPlace',
        part: 'upper',
      }),
    ).toEqual({ ok: true })

    expect(character()?.model.lanes?.[0]?.clips[0]).toMatchObject({
      speed: 2,
      loop: false,
      fadeIn: secondsToUs(0.5),
      fadeOut: secondsToUs(0.5),
      start: secondsToUs(1),
      rootMotion: 'inPlace',
      part: 'upper',
      label: 'Course',
    })
  })

  it('refuses a block no lane carries', async () => {
    const { nodeId } = await laid()

    expect(
      await runAction('animation.setBlockSettings', { nodeId, clipId: 'clip-z', speed: 2 }),
    ).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
  })

  /**
   * Where a drag can actually land it: a block posed off a frame plays a pose the head never stops
   * on, and one past the end sits where nothing can grab it back.
   */
  it('lands a block on a frame, and never past the end of the band', async () => {
    const { nodeId, clipId } = await laid()
    const band = scene().animation

    await runAction('animation.setBlockSettings', { nodeId, clipId, startSeconds: 0.001 })
    expect(character()?.model.lanes?.[0]?.clips[0]?.start).toBe(0)

    await runAction('animation.setBlockSettings', { nodeId, clipId, startSeconds: 9999 })
    expect(character()?.model.lanes?.[0]?.clips[0]?.start).toBe(band.duration)
  })

  // A refusal must not reach the history: `runCommand` banks whatever it is handed, and ⌘Z would
  // give back a state nobody ever left.
  it('refuses a call that names the block and nothing else', async () => {
    const { nodeId, clipId } = await laid()

    expect(await runAction('animation.setBlockSettings', { nodeId, clipId })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

describe('the keys of the band', () => {
  const tracks = () => scene().animation.tracks

  it('opens the channels a subject lacks and keys them where it stands', async () => {
    const nodeId = installCharacter()

    expect(await runAction('key.writePoseKeys', { nodeId })).toEqual({ ok: true })

    expect(
      tracks()
        .map(track => track.target.property)
        .sort(),
    ).toEqual(['position', 'rotation', 'scale'])
    expect(tracks().every(track => track.keys.length === 1)).toBe(true)
    // The band's own naming, so a channel opened from outside reads like one opened by the diamond.
    expect(tracks()[0]?.name.startsWith('Héros · ')).toBe(true)
  })

  it('narrows to one channel when a property is named', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })

    expect(
      await runAction('key.writePoseKeys', { nodeId, property: 'position', timeSeconds: 1 }),
    ).toEqual({
      ok: true,
    })

    const keyed = tracks().filter(track => track.keys.length > 1)
    expect(keyed.map(track => track.target.property)).toEqual(['position'])
  })

  /**
   * And it OPENS that one. Nothing else in the studio opens a channel, so a client driving a
   * single axis would otherwise have to key the whole pose and drop the two it never wanted.
   */
  it('opens the one channel it was asked for on a subject that has none', async () => {
    const nodeId = installCharacter()

    expect(await runAction('key.writePoseKeys', { nodeId, property: 'rotation' })).toEqual({
      ok: true,
    })

    expect(tracks().map(track => track.target.property)).toEqual(['rotation'])
  })

  it('takes a subject’s keys back off at that instant', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })

    expect(await runAction('key.removeSubjectKeys', { nodeId })).toEqual({ ok: true })
    expect(tracks().every(track => track.keys.length === 0)).toBe(true)
  })

  it('slides a key along its channel, and refuses one that is not there', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })
    const trackId = tracks()[0]?.id ?? ''

    expect(await runAction('key.move', { trackId, fromSeconds: 0, toSeconds: 2 })).toEqual({
      ok: true,
    })
    expect(tracks()[0]?.keys[0]?.time).toBe(secondsToUs(2))

    expect(await runAction('key.move', { trackId, fromSeconds: 0, toSeconds: 3 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('keys everything already open without opening one', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })
    await runAction('key.removeSubjectKeys', { nodeId })

    expect(await runAction('key.writeKeysOnOpenChannels', { timeSeconds: 1 })).toEqual({ ok: true })
    expect(tracks()).toHaveLength(3)
    expect(tracks().every(track => track.keys.length === 1)).toBe(true)
  })

  it('takes a channel away, and refuses a locked one', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })
    const trackId = tracks()[0]?.id ?? ''

    expect(await runAction('channel.setMuteSoloLock', { trackId, locked: true })).toEqual({
      ok: true,
    })
    expect(await runAction('channel.remove', { trackId })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })

    await runAction('channel.setMuteSoloLock', { trackId, locked: false, muted: true })
    expect(tracks().find(track => track.id === trackId)).toMatchObject({
      locked: false,
      muted: true,
    })
    expect(await runAction('channel.remove', { trackId })).toEqual({ ok: true })
    expect(tracks()).toHaveLength(2)
  })

  it('refuses a channel the scene has not got, and a call naming no flag', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId })

    expect(
      await runAction('channel.setMuteSoloLock', { trackId: 'track-z', muted: true }),
    ).toMatchObject({
      ok: false,
      refusal: 'notFound',
    })
    expect(
      await runAction('channel.setMuteSoloLock', { trackId: tracks()[0]?.id ?? '' }),
    ).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })
})

/**
 * 🛑 A client cannot see the playhead, so « efface toutes les clés » had no call to make: the
 * same `key.clear` was sent over and over on the bench pass of 2026-08-26, each one clearing at
 * most the key under the head.
 */
describe('clearing the keys of a subject', () => {
  it('takes them all when no instant is named, and one when there is', async () => {
    const nodeId = installCharacter()
    await runAction('key.writePoseKeys', { nodeId, timeSeconds: 0 })
    await runAction('key.writePoseKeys', { nodeId, timeSeconds: 2 })

    expect(await runAction('key.removeSubjectKeys', { nodeId, timeSeconds: 0 })).toEqual({
      ok: true,
    })
    expect(await runAction('key.removeSubjectKeys', { nodeId })).toEqual({ ok: true })
    expect(await runAction('key.removeSubjectKeys', { nodeId })).toMatchObject({ ok: false })
  })
})
