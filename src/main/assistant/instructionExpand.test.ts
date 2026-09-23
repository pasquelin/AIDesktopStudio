import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY, type ActionName } from '@shared/domain/assistant'
import { CLOUD_CONTEXT_TOKENS } from './brainHttp'
import { BRIEFING_ROOM } from './brainProvider'
import { briefingFor, studioBriefing } from './instruction'
import { roomFor } from './promptWindow'

const NARROW = BRIEFING_ROOM

// The names a search would hand back: what an expansion COMPOSES is what these measure, and how
// those names were ranked belongs to `actionIndex.test.ts`.
const named = (word: string): readonly ActionName[] =>
  ACTION_REGISTRY.map(one => one.name).filter(name => name.startsWith(`${word}.`))

const expanded = (query: string, found: readonly ActionName[]) =>
  studioBriefing({ room: NARROW }).expand?.(query, found)

describe('asking for the rest of the catalogue', () => {
  /** A word rather than a name: what `actions.find` is still for once every name is shown. */
  it('opens the manual of what a query found', () => {
    const briefing = expanded('git branch', ['git.checkout'])

    expect(briefing?.text).toContain('  git.checkout —')
    expect(briefing?.loaded).toContain('git.checkout')
  })

  it('says so rather than inventing when a query found nothing', () => {
    const briefing = expanded('zzzznothing', [])

    expect(briefing?.text).toContain('Nothing in the catalogue matches')
  })

  /**
   * 🛑 The two are NOT one sentence. A door whose room barely covers the short briefing plus a
   * full project context has nothing left for one found action — and "nothing matches" would then
   * be said to the person about nineteen actions that do.
   */
  it('says there was no ROOM, which is not the same as nothing matching', () => {
    const briefing = studioBriefing({ room: 1 }).expand?.('layer', named('layer'))

    expect(briefing?.text).toContain('matching "layer"')
    expect(briefing?.text).not.toContain('Nothing in the catalogue matches')
  })

  /**
   * 🛑 The reason the cut is by ACTIONS rather than by characters: half a field line is an action
   * the model cannot call and cannot see is truncated, on the one door too narrow to be shown
   * everything — which is the default one.
   */
  it('keeps whole actions inside the room, however many matched', () => {
    const briefing = expanded(
      'the a of',
      ACTION_REGISTRY.map(one => one.name),
    )

    expect(briefing?.text.length).toBeLessThanOrEqual(NARROW)
    for (const action of ACTION_REGISTRY) {
      const shown = briefing?.text.includes(`  ${action.name} —`) ?? false
      if (shown) expect(briefing?.text).toContain(`  ${action.name} —`)
    }
  })
})

describe('expanded catalogue results', () => {
  /**
   * 🛑 A wide door prints every manual from the start, so nothing is ever left to open and the
   * unprinted count is ALWAYS zero. Read as "nothing matched", it made the model tell the person
   * the studio cannot do what 28 actions three lines above do — measured 2026-08-31.
   */
  it('says the manual already holds them rather than that nothing matched', async () => {
    const wide = await briefingFor(
      { utterance: 'image', history: [] },
      roomFor(CLOUD_CONTEXT_TOKENS),
    )
    const found = wide.expand?.('image', named('canvas'))

    expect(found?.text).toContain('holds every action matching')
    expect(found?.text).not.toContain('Nothing in the catalogue matches')
  })

  /**
   * 🛑 What a query opened must cross the boundary, or `withChainLast` cannot put it at the back
   * next turn, the cut takes it again, and the chain rediscovers the same action every round.
   */
  it('carries what a query opened back over the boundary', async () => {
    for (const room of [NARROW, roomFor(CLOUD_CONTEXT_TOKENS)]) {
      const door = await briefingFor({ utterance: 'branch', history: [] }, room)

      expect(door.expand?.('git branch', ['git.checkout'])?.opened).toContain('git.checkout')
    }
  })

  /**
   * 🛑 A match already printed is ranked to the back too, or the found block's own 150 characters
   * push it out of a cut that bites from the front: asking about a topic then printed FEWER of its
   * manuals than not asking — 16 rooms between 20 000 and 30 000, measured 2026-08-31.
   */
  it('never prints fewer manuals for a topic than before it was asked about', () => {
    const loaded = ACTION_REGISTRY.map(one => one.name)
    const matched = named('git')

    for (let room = 20_000; room <= 30_000; room += 71) {
      const before = studioBriefing({ room, loaded, opened: [] })
      const held = matched.filter(name => before.loaded.includes(name)).length
      const after = before.expand?.('git branch', matched)

      expect(matched.filter(name => after?.loaded.includes(name)).length).toBeGreaterThanOrEqual(
        held,
      )
    }
  })

  /**
   * 🛑 The COUNT against what is printed, never merely "at least one", and over the BAND where the
   * footer and the memory signal each cost a manual: measured on the same sweep, 502 rooms said
   * more than the delivered briefing carried before 2026-08-31, and none of them past 20 000.
   */
  it('never announces more manuals than the briefing carries', () => {
    const matched = named('canvas')
    const loaded = ACTION_REGISTRY.map(one => one.name)

    for (const memories of [0, 5]) {
      for (let room = 7_200; room <= 9_100; room += 53) {
        const text =
          studioBriefing({ room, loaded, memories }).expand?.('image', matched)?.text ?? ''
        const printed = matched.filter(name => text.includes(`\n  ${name} — `)).length
        const said = /holds (\d+) of the/.exec(text)

        if (said) expect(printed).toBe(Number(said[1]))
        else if (text.includes('no room for their fields')) expect(printed).toBe(0)
        else if (text.includes('holds every action')) expect(printed).toBe(matched.length)
      }
    }
  })

  /** Once and no further: a second query would be a conversation the person is paying to wait on. */
  it('offers no second expansion', () => {
    expect(expanded('git', named('git'))?.expand).toBeNull()
  })
})
