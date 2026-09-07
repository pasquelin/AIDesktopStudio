import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { SECOND } from '@shared/domain/time'
import { animationTrack } from '@/engines/scene/animation-fixtures'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installScene } from '@/stores/scene-fixtures'
import { runAction } from './executor'

const DOCUMENT = 'doc-1'

describe('what keeps a model from guessing', () => {
  beforeEach(() => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [{ ...meshNode('n1'), name: 'Hero', components: [newComponent('Health')] }],
    })
  })

  // Asked about a channel id, the answer was « no node » — a client that had just opened the
  // channel could not read it back (Codex by MCP, 2026-09-06).
  it('describes a channel by its id, with its keys and what takes it', async () => {
    installScene(DOCUMENT, {
      ...EMPTY_SCENE,
      nodes: [{ ...meshNode('n1'), name: 'Hero' }],
      animation: {
        ...EMPTY_SCENE.animation,
        tracks: [
          animationTrack('track_1', 'position', [{ time: SECOND, value: { x: 0, y: 2, z: 0 } }], {
            target: { nodeId: 'n1', property: 'position' },
          }),
        ],
      },
    })

    const outcome = await runAction('studio.describe', { ref: 'track_1' })

    expect(outcome.ok && outcome.data).toMatchObject({
      channel: { id: 'track_1', keys: [{ timeSeconds: 1, value: { x: 0, y: 2, z: 0 } }] },
      accepts: expect.arrayContaining(['key.writeKeysOnOpenChannels']),
    })
  })

  /** 🛑 The schema comes WITH the component: a second call to learn what may be written is one
   * a model would have to guess it needed. */
  it('describes an object with its components and their schema', async () => {
    const outcome = await runAction('studio.describe', { ref: 'Hero' })

    expect(outcome.ok && outcome.data).toMatchObject({ name: 'Hero' })
    const data = outcome.ok
      ? (outcome.data as { components: { type: string; fields: { label: string }[] }[] })
      : null
    expect(data?.components[0]?.type).toBe('Health')
    // 🛑 Resolved sentences, never i18n keys: an action whose trade is documenting must not
    // answer identifiers to a model that cannot look them up.
    expect(data?.components[0]?.fields[0]?.label).not.toContain('game.fields')
  })

  it('says what may still be added, which is what a repair reads', async () => {
    const outcome = await runAction('studio.describe', { ref: 'Hero' })

    const data = outcome.ok ? (outcome.data as { available: { components: string[] } }) : null
    expect(data?.available.components).toContain('Movement')
    expect(data?.available.components).not.toContain('Health')
  })

  /** 🛑 A confident answer about the WRONG object is worse than no answer at all. */
  it('refuses a reference that belongs to another document', async () => {
    const outcome = await runAction('studio.describe', { ref: 'entity:other-doc/n1' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  it('answers the whole scene when nothing is named', async () => {
    const outcome = await runAction('studio.describe', {})

    expect(outcome.ok && outcome.data).toMatchObject({ scene: DOCUMENT })
  })

  it('names its topics and resolves their canonical and displayed names', async () => {
    const listed = await runAction('studio.docs', {})

    expect(listed.ok && (listed.data as { topics: string[] }).topics).toContain('Health')
    for (const topic of ['Health', 'health', 'Santé', 'sante', 'composant Santé']) {
      const held = await runAction('studio.docs', { topic })
      expect(held.ok && held.data).toMatchObject({ topic: 'Health' })
    }
  })

  /** The SAME text the editor types against — a second telling is the one that would drift. */
  it('serves the sandbox surface a script sees', async () => {
    const outcome = await runAction('studio.docs', { topic: 'script' })

    expect(outcome.ok && String((outcome.data as { docs: string }).docs)).toContain('defineScript')
  })

  it('refuses a folded topic shared by a component and the script surface', async () => {
    expect(await runAction('studio.docs', { topic: 'SCRIPT' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('refuses a topic nothing documents, and says how to find the list', async () => {
    const outcome = await runAction('studio.docs', { topic: 'Whatever' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'notFound' })
  })

  describe('a lot of calls run as one', () => {
    it('runs them in order and answers how many ran', async () => {
      const outcome = await runAction('studio.batch', {
        calls: JSON.stringify([
          { action: 'component.attach', input: { nodeId: 'Hero', type: 'Movement' } },
          {
            action: 'component.setProperties',
            input: { nodeId: 'Hero', type: 'Movement', field: 'speed', value: '9' },
          },
        ]),
      })

      expect(outcome.ok && outcome.data).toMatchObject({ ran: 2 })
    })

    /** 🛑 Which call failed, by rank: a bare refusal has a client re-sending the whole lot. */
    it('stops at the first refusal and says which call it was', async () => {
      const outcome = await runAction('studio.batch', {
        calls: JSON.stringify([
          { action: 'component.attach', input: { nodeId: 'Hero', type: 'Movement' } },
          { action: 'component.attach', input: { nodeId: 'Nobody', type: 'Health' } },
        ]),
      })

      expect(outcome.ok).toBe(false)
      expect(!outcome.ok && outcome.detail).toContain('call 2')
    })

    it('refuses a batch holding a batch, and one naming an action nothing publishes', async () => {
      const nested = await runAction('studio.batch', {
        calls: JSON.stringify([{ action: 'studio.batch', input: {} }]),
      })
      const unknown = await runAction('studio.batch', {
        calls: JSON.stringify([{ action: 'nothing.here', input: {} }]),
      })

      expect(nested).toMatchObject({ ok: false, refusal: 'badInput' })
      expect(unknown).toMatchObject({ ok: false, refusal: 'badInput' })
    })

    it('refuses calls that are not a JSON array of calls', async () => {
      expect(await runAction('studio.batch', { calls: 'not json' })).toMatchObject({
        ok: false,
      })
      expect(await runAction('studio.batch', { calls: '[]' })).toMatchObject({ ok: false })
    })

    /**
     * 🛑 A malformed entry REFUSES rather than being dropped. Filtered out, a lot of five where
     * four had vanished answered `ok` — a model told everything went well having got one thing.
     */
    it('refuses a malformed entry rather than running the rest', async () => {
      const outcome = await runAction('studio.batch', {
        calls: JSON.stringify([
          { action: 'component.attach', input: { nodeId: 'Hero', type: 'Movement' } },
          'garbage',
        ]),
      })

      expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
      expect(!outcome.ok && outcome.detail).toContain('call 2')
    })

    /** The thread runs them one after another with nothing to cancel it — invariant 6. */
    it('refuses a lot too long to run without a word', async () => {
      const many = Array.from({ length: 51 }, () => ({
        action: 'component.attach',
        input: { nodeId: 'Hero', type: 'Movement' },
      }))

      expect(await runAction('studio.batch', { calls: JSON.stringify(many) })).toMatchObject({
        ok: false,
        refusal: 'badInput',
      })
    })
  })
})

// The scene in front is what a dock announces, and nothing announces one headless.
vi.mock('@/stores/documents', async importActual => {
  const held = await importActual<Record<string, unknown>>()
  return { ...held, activeSceneId: () => DOCUMENT }
})
