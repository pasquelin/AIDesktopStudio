import { beforeEach, describe, expect, it } from 'vitest'
import { POST_EFFECTS } from '@shared/domain/postProcessing'
import { createDefaultScene } from '@/engines/scene/defaultScene'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { usePostPresets } from '@/stores/postPresets'
import { sceneOf, useScenes } from '@/stores/scenes'
import { runAction } from './executor'

const DOCUMENT = 'doc-post'

const scene = () => sceneOf(useScenes.getState(), DOCUMENT)

async function cameraNamed(name: string): Promise<string> {
  const added = await runAction('node.add', { kind: 'camera', name })
  return added.ok ? (added.data as { nodeId: string }).nodeId : ''
}

beforeEach(() => {
  installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
  installFakeBridge({})
})

/**
 * A camera says one of three things about the scene's composition: it inherits it, it overrides
 * it with one of its own, or it films through NONE. The first two own a stack the call can be
 * pointed at; the third owns nothing, and answering the scene's would rewrite what every other
 * camera shows while leaving the named one untouched — silently, and reported as done.
 */
describe('a camera that composes through nothing', () => {
  const disabled = async (name: string): Promise<string> => {
    const nodeId = await cameraNamed(name)
    await runAction('post.setCameraStackMode', { nodeId, mode: 'disabled' })
    return nodeId
  }

  it('refuses an edit rather than sending it to the scene', async () => {
    const nodeId = await disabled('Caméra muette')
    await runAction('post.add', { effect: 'bloom' })
    const before = scene().world.post.effects.length

    const outcome = await runAction('post.add', { cameraId: nodeId, effect: 'vignette' })

    expect(outcome.ok).toBe(false)
    expect(scene().world.post.effects).toHaveLength(before)
  })

  // A READ is answered rather than refused, and with the truth: no effects, because none run.
  it('reads back an empty composition of its own', async () => {
    const nodeId = await disabled('Caméra muette')
    await runAction('post.add', { effect: 'bloom' })

    const outcome = await runAction('post.state', { cameraId: nodeId })
    const read = outcome.ok ? (outcome.data as { owner: string; effects: unknown[] }) : null

    expect(read).toMatchObject({ owner: 'camera', enabled: false, effects: [] })
  })

  // The case that must NOT change: inheriting is asking the scene, and that is the whole point.
  it('still sends an inheriting camera to the scene', async () => {
    const nodeId = await cameraNamed('Caméra héritière')

    const outcome = await runAction('post.add', { cameraId: nodeId, effect: 'vignette' })

    expect(outcome.ok).toBe(true)
    expect(scene().world.post.effects.map(one => one.effect)).toEqual(['vignette'])
  })
})

/** A bloom in the scene's composition, and its instance id — minted per run, so never spelt. */
async function withBloom(): Promise<string> {
  await runAction('post.add', { effect: 'bloom' })
  return scene().world.post.effects[0]?.id ?? ''
}

describe('composing without a panel', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
    installFakeBridge({})
    usePostPresets.setState({ saved: [] })
  })

  it('duplicates an effect into a second instance of its own', async () => {
    const effectId = await withBloom()

    expect((await runAction('post.duplicate', { effectId })).ok).toBe(true)

    const effects = scene().world.post.effects
    expect(effects.map(one => one.effect)).toEqual(['bloom', 'bloom'])
    expect(effects[1]?.id).not.toBe(effectId)
  })

  // One anti-aliaser is one anti-aliaser: the catalogue says so, and the command already refuses.
  it('leaves an effect a second instance of means nothing alone', async () => {
    await runAction('post.add', { effect: 'smaa' })
    const effectId = scene().world.post.effects[0]?.id ?? ''

    await runAction('post.duplicate', { effectId })

    expect(scene().world.post.effects).toHaveLength(1)
  })

  it('puts an effect back on the defaults its catalogue declares', async () => {
    const effectId = await withBloom()
    await runAction('post.set', { effectId, param: 'strength', value: 3 })

    expect((await runAction('post.reset', { effectId })).ok).toBe(true)

    expect(scene().world.post.effects[0]?.params.strength).toBe(
      POST_EFFECTS.bloom.params.strength?.default,
    )
  })

  /**
   * The value handed over is the one to SEE. A channel holds the DELTA against the stack, so a
   * client asked to do that arithmetic would have to read the stack first and would get it wrong
   * the moment another key already moved the parameter.
   */
  it('keys a parameter on the absolute value it was handed', async () => {
    const effectId = await withBloom()
    await runAction('post.set', { effectId, param: 'strength', value: 0.5 })

    expect(
      (await runAction('post.addKeyframe', { effectId, param: 'strength', value: 2 })).ok,
    ).toBe(true)

    const track = scene().animation.tracks[0]
    expect(track?.target.post).toEqual({ effectId, param: 'strength' })
    expect(track?.keys[0]?.value.x).toBeCloseTo(1.5, 5)
  })

  it('refuses to key a parameter the catalogue does not call animatable', async () => {
    await runAction('post.add', { effect: 'filmGrain' })
    const effectId = scene().world.post.effects[0]?.id ?? ''

    expect(
      (await runAction('post.addKeyframe', { effectId, param: 'animated', value: 1 })).ok,
    ).toBe(false)
    expect(scene().animation.tracks).toEqual([])
  })

  it('takes the key back off and leaves the channel standing', async () => {
    const effectId = await withBloom()
    await runAction('post.addKeyframe', { effectId, param: 'strength', value: 2 })

    expect((await runAction('post.removeKeyframe', { effectId, param: 'strength' })).ok).toBe(true)

    expect(scene().animation.tracks).toHaveLength(1)
    expect(scene().animation.tracks[0]?.keys).toEqual([])
  })
})

/**
 * A preset saved on this machine is reachable by the NAME somebody gave it — the rule every
 * node-facing action of the registry keeps. Reachable only by a generated id, a saved look would
 * be one no client could ever ask for.
 */
describe('the looks kept on this machine', () => {
  beforeEach(() => {
    installScene(DOCUMENT, { ...createDefaultScene(), nodes: [], selectedIds: [] })
    installFakeBridge({})
    usePostPresets.setState({ saved: [] })
  })

  const saved = () => usePostPresets.getState().saved

  it('keeps the composition in front under a name', async () => {
    await withBloom()

    expect((await runAction('post.savePreset', { name: 'Aube grise' })).ok).toBe(true)

    expect(saved().map(one => one.name)).toEqual(['Aube grise'])
    expect(saved()[0]?.stack.effects.map(one => one.effect)).toEqual(['bloom'])
  })

  it('applies one back by the name it was given', async () => {
    await withBloom()
    await runAction('post.savePreset', { name: 'Aube grise' })
    await runAction('post.remove', { effectId: scene().world.post.effects[0]?.id ?? '' })

    expect((await runAction('post.applyPreset', { preset: 'Aube grise' })).ok).toBe(true)

    expect(scene().world.post.effects.map(one => one.effect)).toEqual(['bloom'])
  })

  /**
   * The picker hands an ID for either list, and the two rows stand one above the other under
   * their own headings. Matched by name first, a look saved as « noir » would swallow the
   * shipped `noir` — and the row somebody clicked would apply somebody else's stack.
   */
  it('lets a shipped preset through when a saved one bears its name', async () => {
    await withBloom()
    await runAction('post.savePreset', { name: 'noir' })
    await runAction('post.remove', { effectId: scene().world.post.effects[0]?.id ?? '' })

    await runAction('post.applyPreset', { preset: 'noir' })

    expect(scene().world.post.effects.map(one => one.effect)).toContain('letterbox')
  })

  it('still applies one the studio ships, by its id', async () => {
    expect((await runAction('post.applyPreset', { preset: 'noir' })).ok).toBe(true)

    expect(scene().world.post.effects.map(one => one.effect)).toContain('letterbox')
  })

  it('names both families, so a client can know a saved look exists', async () => {
    await withBloom()
    await runAction('post.savePreset', { name: 'Aube grise' })

    const outcome = await runAction('post.listPresets', {})
    const read = outcome.ok
      ? (outcome.data as { shipped: string[]; saved: { name: string }[] })
      : null

    expect(read?.shipped).toContain('psx')
    expect(read?.saved.map(one => one.name)).toEqual(['Aube grise'])
  })

  it('renames one, without touching what it holds', async () => {
    await withBloom()
    await runAction('post.savePreset', { name: 'Aube grise' })

    expect(
      (await runAction('post.renamePreset', { preset: 'Aube grise', name: 'Aube claire' })).ok,
    ).toBe(true)

    expect(saved().map(one => one.name)).toEqual(['Aube claire'])
    expect(saved()[0]?.stack.effects.map(one => one.effect)).toEqual(['bloom'])
  })

  it('forgets one', async () => {
    await withBloom()
    await runAction('post.savePreset', { name: 'Aube grise' })

    expect((await runAction('post.deleteSavedPreset', { preset: 'Aube grise' })).ok).toBe(true)

    expect(saved()).toEqual([])
  })

  it('refuses to rename or forget a look nobody saved', async () => {
    expect((await runAction('post.renamePreset', { preset: 'Jamais', name: 'X' })).ok).toBe(false)
    expect((await runAction('post.deleteSavedPreset', { preset: 'Jamais' })).ok).toBe(false)
  })
})

/**
 * 🛑 Measured on the bench pass of 2026-08-31 against deepseek-chat: `post.set` and `post.preset`
 * were refused eleven times each on a bare `badInput`, which names nothing a caller can change.
 */
describe('what a refused composition says', () => {
  const detailOf = (outcome: { ok: boolean; detail?: string }): string => outcome.detail ?? ''

  it('names the instance and the parameter, and where the value goes', async () => {
    await runAction('post.add', { effect: 'bloom' })

    const outcome = await runAction('post.set', {
      effectId: 'effect-nowhere',
      param: 'intensity',
      value: 2,
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('effectId')
    expect(detailOf(outcome)).toContain('post.state')
  })

  it('names the parameter when the instance is real and the knob is not', async () => {
    const added = await runAction('post.add', { effect: 'bloom' })
    const stack = await runAction('post.state', {})
    const effectId = stack.ok ? (stack.data as { effects: { id: string }[] }).effects[0]?.id : ''

    const outcome = await runAction('post.set', { effectId, param: 'nothing', value: 1 })

    expect(added.ok).toBe(true)
    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('param')
  })

  it('sends a preset nobody holds back to the call that lists them', async () => {
    const outcome = await runAction('post.applyPreset', { preset: 'aucun' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(detailOf(outcome)).toContain('post.listPresets')
  })
})
