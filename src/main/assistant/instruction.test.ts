import { describe, expect, it } from 'vitest'
import {
  ACTION_FAMILIES,
  ACTION_REGISTRY,
  findActions,
  MOST_LOADED,
} from '@shared/domain/assistant'
import { GENERATIVE_WORKSPACE_IDS } from '@shared/domain/workspace'
import { CONTEXT_COMPOSED_MAX } from '@shared/domain/projectContext'
import { TARGET_ID_MAX, TARGET_NAME_MAX, TARGETS_MAX, type Target } from '@shared/domain/target'
import { CLOUD_CONTEXT_TOKENS } from './brainHttp'
import { BRIEFING_ROOM } from './brainProvider'
import { machineFolders } from './machineFolders'
import { briefingFor, studioBriefing } from './instruction'
import { ASSISTANT_WINDOW_MAX, roomFor } from './promptWindow'
import { STATE_MAX } from './studioState'

/**
 * EVERY bound at its widest, and each one matters: the list as long as it may be, each id and
 * each name as long as they may be, every line carrying the ` (selected)` suffix. Built from
 * plausible values instead, it measured 2 354 and stayed green while the reachable worst was
 * 1 552 — under the floor the case next to it claims to hold.
 */
const SATURATED: readonly Target[] = [...Array(TARGETS_MAX).keys()].map((at): Target => ({
  id: `${at}`.padEnd(TARGET_ID_MAX, 'i'),
  kind: 'layer',
  name: 'N'.repeat(TARGET_NAME_MAX),
  selected: true,
}))

/** Past anything any door holds — what a briefing composes against when nothing squeezes it. */
const WIDE = 200_000

/** The manuals of one whole family, which is what a chain that settles on git ends up carrying. */
const GIT = (ACTION_FAMILIES.find(one => one.name === 'git')?.actions ?? []).map(one => one.name)

/**
 * What Scenario's door leaves the briefing — the tightest room any door composes against, and
 * narrow enough that the wide rules do not fit. Read off the door rather than copied: the number
 * moved once and three cases went on measuring the one before it.
 */
const NARROW = BRIEFING_ROOM

describe('what the model is told about the studio', () => {
  /**
   * The half of "say it before you promise" that lives in the prompt: a refusal after the fact
   * still follows a sentence announcing a picture.
   */
  it('names the spaces nothing can generate in, and says nothing when all are served', () => {
    expect(studioBriefing({ notReady: ['image', 'video'], room: NARROW }).text).toContain(
      'No model ready for: image, video.',
    )
    expect(studioBriefing({ room: NARROW }).text).not.toContain('No model ready')
  })

  /** Defect 2 in one line: before this the briefing never said what the studio WAS. */
  it('carries what the studio is right now', () => {
    const briefing = studioBriefing({ state: 'Studio now:\n  Space: image.', room: NARROW })

    expect(briefing.text).toContain('Space: image.')
  })
})

describe('how much of the catalogue the model is shown', () => {
  /**
   * 🛑 `[M]` The one a whole lot walked past: at 4 096 tokens — what `ollamaModel` gives a tag
   * declaring none — the room is 7 116 against a short briefing of 7 405, and nothing was left to
   * give. The catalogue gives ground now, and `actions.find` reaches what was cut.
   *
   * Every room rather than one: a case pinned to a figure goes green the day the briefing shrinks.
   */
  it.each([roomFor(4096), roomFor(8192), NARROW, WIDE])('fits the room it was given: %i', room => {
    expect(
      studioBriefing({
        room,
        folders: machineFolders(name => `/Users/someone/${name}`, undefined),
        context: 'x'.repeat(CONTEXT_COMPOSED_MAX),
        state: 'z'.repeat(STATE_MAX),
        targets: SATURATED,
        // 🛑 The manuals at their bound as well: they are what a chain ADDS to a briefing that
        // already fitted, and the only part of it a window names.
        loaded: ACTION_REGISTRY.slice(0, MOST_LOADED).map(one => one.name),
      }).text.length,
    ).toBeLessThanOrEqual(room)
  })

  /**
   * 🛑 `[M]` The guard nothing held: at `roomFor(32 000)` = 90 828 the whole share costs 90 994,
   * so the state, the project context and the folders were cut AND `panel.close` fell off the
   * tail — 521 rounds and 227 refusals a run, every gate green.
   *
   * 🛑 `allowed` against the TEXT, never one action's name: the catalogue is cut from the END, so
   * naming any action but the last leaves a tail of them free to vanish. And a name in `allowed`
   * that the text does not carry is worse than a missing one — the wide share offers no
   * `actions.find`, so the model can neither see it nor ask for it, and `parseReply` accepts a
   * call it was never shown how to write.
   */
  it('shows every action it allows, and what is on screen beside them', () => {
    const briefing = studioBriefing({
      room: roomFor(CLOUD_CONTEXT_TOKENS),
      folders: machineFolders(name => `/Users/someone/${name}`, undefined),
      context: 'a project about sailing boats',
      state: 'The Image space is in front, on document "Voilier vert".',
      targets: [{ id: 'sky-2', kind: 'layer', name: 'Sky', selected: true }],
    })

    // 🛑 `allowed` contre le TEXTE, jamais un nom choisi : une action autorisée que le briefing
    // n'écrit pas est pire qu'une absente — le modèle peut la nommer sans jamais l'avoir lue.
    // 🛑 Du BLOC des noms seul : lu depuis l'index 0, la tranche portait aussi les règles, où
    // treize actions sont citées — la garde ne pouvait plus rougir pour aucune d'elles.
    const at = briefing.text.indexOf('[core]')
    const names = briefing.text.slice(at, briefing.text.indexOf('\n\n', at))
    const unwritten = ACTION_REGISTRY.map(one => one.name).filter(name => !names.includes(name))
    expect(unwritten).toEqual([])
    expect(briefing.text).toContain('The Image space is in front')
    expect(briefing.text).toContain('a project about sailing boats')
    expect(briefing.text).toContain('/Users/someone/')
    expect(briefing.text).toContain('sky-2 — layer "Sky"')
  })

  /**
   * 🛑 They go before the catalogue does, and a runtime cuts from the HEAD (ADR-18) — so what a
   * silent overrun costs is the preamble rather than the block that caused it.
   *
   * The room is MEASURED here, never a door's: written as a figure this case would go green the
   * day the catalogue shrinks, testing a ladder nothing climbs.
   */
  it('drops the machine folders rather than overrun the room they do not fit in', () => {
    const folders = machineFolders(name => `/Users/someone/${name}`, undefined)
    const exact = studioBriefing({ room: NARROW }).text.length
    const briefing = studioBriefing({ room: exact, folders })

    expect(briefing.text).not.toContain('Folders on this machine:')
    expect(briefing.text.length).toBeLessThanOrEqual(exact)
  })

  it('carries the machine folders wherever they fit', () => {
    const folders = machineFolders(name => `/Users/someone/${name}`, undefined)
    const briefing = studioBriefing({ room: roomFor(ASSISTANT_WINDOW_MAX), folders })

    expect(briefing.text).toContain('downloads: /Users/someone/downloads')
  })

  /**
   * 🛑 The way to ask is in the FORMAT and never in the catalogue, and this is what that buys:
   * the block is composed on EVERY briefing, so the narrowest room the studio ships for still
   * carries it. Named as an action it was described by a rule that gave ground with the memory
   * line — a way of asking that disappeared exactly where a small model needed it most.
   */
  it('tells every door how to ask the person, whatever room it has', () => {
    for (const room of [NARROW, roomFor(ASSISTANT_WINDOW_MAX), WIDE]) {
      const briefing = studioBriefing({ room })

      expect(briefing.text, `room ${room}`).toContain('"ask": {"question"')
      expect(briefing.text, `room ${room}`).toContain('RUNS NOTHING')
    }
  })

  /**
   * 🛑 The point of the whole mechanism, on the tightest door the studio ships: every name, on
   * every door. Before this, the narrow ones were shown eleven actions of 283 and answered « je
   * ne peux pas » about the other 272.
   */
  it.each([roomFor(4096), NARROW, roomFor(ASSISTANT_WINDOW_MAX), WIDE])(
    'names every action of the registry, whatever room it has: %i',
    room => {
      const briefing = studioBriefing({ room })

      for (const action of ACTION_REGISTRY) {
        expect(briefing.text.includes(action.name), action.name).toBe(true)
      }
    },
  )
})

describe('how the catalogue is presented to the model', () => {
  /** And the names ALONE: a manual nobody asked for is what put 90 994 characters on every turn. */
  it('describes no action until one is opened', () => {
    const bare = studioBriefing({ room: WIDE })
    const opened = studioBriefing({ room: WIDE, loaded: ['git.checkout'] })

    expect(bare.text).not.toContain('  git.checkout —')
    expect(opened.text).toContain('  git.checkout —')
    expect(opened.loaded).toEqual(['git.checkout'])
  })

  /**
   * 🛑 Headed by the FAMILY the registry publishes, not by the first token of a name: read off
   * the name, 231 actions cut into 83 headings for 65 prefixes — a heading every 2.8 actions,
   * grouping nothing. `models.readGenerationModelFields` and `model.textures` are two families under one prefix.
   */
  it('heads the names with the families the registry publishes', () => {
    const { text } = studioBriefing({ room: WIDE })
    const headings = text.split('\n').flatMap(one => /^ {2}(\[[a-z]+\]) /.exec(one)?.[1] ?? [])

    expect(headings).toHaveLength(ACTION_FAMILIES.length)
    expect(new Set(headings).size).toBe(headings.length)
    expect(headings).toContain('[scene]')
    expect(headings).not.toContain('[model]')
  })

  /**
   * 🛑 What the wide door pays 2 400 characters for, and the tight one does not: naming an action
   * is safe on every door now, so what separates the two rule sets is room and nothing else.
   */
  it('drops the wide rules on a door too tight for them, and keeps every name', () => {
    const tight = studioBriefing({ room: NARROW })

    expect(tight.text).not.toContain('List the folders YOURSELF')
    expect(tight.text).toContain('git.checkout')
    expect(studioBriefing({ room: WIDE }).text).toContain('List the folders YOURSELF')
  })

  // The other half: a rule dropped from the wide door would be as silent as one wrongly kept.
  it('gives the door that holds them the rules that name them', () => {
    const wide = studioBriefing({ room: WIDE })

    expect(wide.text).toContain('  - A file the person names is in the project')
    expect(wide.text).toContain('List the folders YOURSELF')
    expect(wide.text).toContain('The remote library is not this project')
    expect(wide.text).toContain('work on the document IN FRONT')
    expect(wide.text).toContain('repair your OWN order')
    // The four the bench measured, and the reason they live on this door alone — see WIDE_RULES.
    expect(wide.text).toContain('Rule 3 is for what the person ALONE knows')
    expect(wide.text).toContain('are RELATIVE')
    expect(wide.text).toContain('Never say a thing is done')
    expect(wide.text).toContain('Reading is not doing')
    expect(wide.text).toContain('has HAPPENED')
    expect(wide.text).toContain('the WHOLE path inside the project')
    expect(wide.text).toContain('Never write <something> where an id goes')
    expect(wide.text).toContain('what a generation MADE is in the project catalogue')
    expect(wide.text).toContain('read models.readGenerationModelFields first')
  })

  it('stays inside the room it was given', () => {
    expect(studioBriefing({ room: NARROW }).text.length).toBeLessThanOrEqual(NARROW)
  })

  /**
   * 🛑 Every bound at once, not today's machine: nothing generateable, a full project context, a
   * target list saturated on all three of its bounds, AND a full state block. The room is what
   * the narrowest door leaves the briefing, and the state is what gives ground inside it — never
   * the sentence, which `brain.test.ts` holds at two thousand characters.
   */
  it.each([false, true])(
    'holds its room with every part of the briefing at its widest, continuing %s',
    // 🛑 CONTINUING as well, which the case left out: it is added to BOTH doors and grew by two
    // lines the day the bench measured a model repeating a call it had already run.
    continuing => {
      const briefing = studioBriefing({
        continuing,
        // The widest this list can ever be: `spacesWithNoModel` names spaces whose PRIMARY
        // employment nothing serves, and every space has one since Code gained `code/txt2code`.
        notReady: GENERATIVE_WORKSPACE_IDS,
        context: 'x'.repeat(CONTEXT_COMPOSED_MAX),
        state: [...Array(20).keys()]
          .map(at => `  line ${at} `.padEnd(STATE_MAX / 20, 'z'))
          .join('\n'),
        targets: SATURATED,
        room: NARROW,
      })

      expect(briefing.text.length).toBeLessThanOrEqual(NARROW)
      // The names never give ground, whatever else had to.
      expect(briefing.text).toContain('workspace.open')
    },
  )

  /** The ids are what `target.select` takes back, so they have to be IN what the model reads. */
  it('lists what the open document can be aimed at, and says nothing when there is nothing', () => {
    const aimed = studioBriefing({
      targets: [{ id: 'sky-2', kind: 'layer', name: 'Sky', selected: true }],
      room: NARROW,
    })

    expect(aimed.text).toContain('sky-2 — layer "Sky" (selected)')
    expect(studioBriefing({ room: NARROW }).text).not.toContain('Targets in the open document')
  })
})

const expanded = (query: string) => studioBriefing({ room: NARROW }).expand?.(query)

describe('asking for the rest of the catalogue', () => {
  /** A word rather than a name: what `actions.find` is still for once every name is shown. */
  it('opens the manual of what a query found', () => {
    const briefing = expanded('git branch')

    expect(briefing?.text).toContain('  git.checkout —')
    expect(briefing?.loaded).toContain('git.checkout')
  })

  it('says so rather than inventing when a query found nothing', () => {
    const briefing = expanded('zzzznothing')

    expect(briefing?.text).toContain('Nothing in the catalogue matches')
  })

  /**
   * 🛑 The two are NOT one sentence. A door whose room barely covers the short briefing plus a
   * full project context has nothing left for one found action — and "nothing matches" would then
   * be said to the person about nineteen actions that do.
   */
  it('says there was no ROOM, which is not the same as nothing matching', () => {
    const briefing = studioBriefing({ room: 1 }).expand?.('layer')

    expect(briefing?.text).toContain('matching "layer"')
    expect(briefing?.text).not.toContain('Nothing in the catalogue matches')
  })

  /**
   * 🛑 The reason the cut is by ACTIONS rather than by characters: half a field line is an action
   * the model cannot call and cannot see is truncated, on the one door too narrow to be shown
   * everything — which is the default one.
   */
  it('keeps whole actions inside the room, however many matched', () => {
    const briefing = expanded('the a of')

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
    const found = wide.expand?.('image')

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

      expect(door.expand?.('git branch')?.opened).toContain('git.checkout')
    }
  })

  /**
   * 🛑 A match already printed is ranked to the back too, or the found block's own 150 characters
   * push it out of a cut that bites from the front: asking about a topic then printed FEWER of its
   * manuals than not asking — 16 rooms between 20 000 and 30 000, measured 2026-08-31.
   */
  it('never prints fewer manuals for a topic than before it was asked about', () => {
    const loaded = ACTION_REGISTRY.map(one => one.name)
    const matched = findActions('git branch').map(one => one.name)

    for (let room = 20_000; room <= 30_000; room += 71) {
      const before = studioBriefing({ room, loaded, opened: [] })
      const held = matched.filter(name => before.loaded.includes(name)).length
      const after = before.expand?.('git branch')

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
    const matched = findActions('image').map(one => one.name)
    const loaded = ACTION_REGISTRY.map(one => one.name)

    for (const memories of [0, 5]) {
      for (let room = 7_200; room <= 9_100; room += 53) {
        const text = studioBriefing({ room, loaded, memories }).expand?.('image')?.text ?? ''
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
    expect(expanded('git')?.expand).toBeNull()
  })
})

describe('what the briefing says about naming an action', () => {
  /**
   * 🛑 The half-sentence is the whole rule: without it a model asked to name an action the
   * briefing had not spelt answered « je ne peux pas » rather than call it — 20 of the 121
   * failures of the 2026-09-01 pass.
   */
  it('tells the model to call an unopened action rather than refuse', () => {
    expect(studioBriefing({ room: WIDE }).text).toContain(
      'Never invent a name, never say you cannot.',
    )
  })
})

describe('a door that refused the briefing it was given', () => {
  /**
   * The room a chat cloud holds is an assumption — its model is typed by hand — so the wide
   * briefing carries the way back to a shorter one. What gives ground is the RULES: the names
   * are 4 225 characters no door has ever refused, and dropping them would blind the model.
   */
  it('has the rules to give up, and never the names', () => {
    const narrow = studioBriefing({ room: WIDE }).narrow?.()

    expect(narrow?.text).not.toContain('List the folders YOURSELF')
    expect(narrow?.text).toContain('git.checkout')
    expect(narrow?.expand).not.toBeNull()
  })

  it('does not offer to narrow what is already narrow', () => {
    expect(studioBriefing({ room: NARROW }).narrow).toBeNull()
  })
})

/**
 * The narrow briefing with nothing else in it — measured rather than written down, because it
 * moves whenever a rule or an action name does.
 */
const bareShort = (): number => studioBriefing({ room: NARROW, memories: 0 }).text.length

describe('what a briefing says about the memory', () => {
  /**
   * 🛑 A SIGNAL and not the memories. Injecting summaries paid an embedding and a scan of every
   * vector on every turn, for a block four doors of five had no room to carry — measured on the
   * running app: `room=7116 briefing=7094 recalledLen=49 inBriefing=false`.
   */
  it('names the action that reads it, and never what it holds', () => {
    const text = studioBriefing({ memories: 12, room: WIDE }).text

    expect(text).toContain('memory.recall answers it')
    expect(text).not.toContain('learned about this project:')
  })

  it('says nothing at all about a project that has learned nothing', () => {
    expect(studioBriefing({ memories: 0, room: WIDE }).text).not.toContain('has a memory')
    expect(studioBriefing({ room: WIDE }).text).not.toContain('has a memory')
  })
})

describe('memory briefing budgets', () => {
  /**
   * 🛑 Overrunning is the ONE thing it yields to — a runtime truncates from the HEAD, where the
   * preamble sits (ADR-18).
   */
  it('gives the signal up rather than overrun a door that has no room for it', () => {
    const room = bareShort() + 10
    const text = studioBriefing({ memories: 12, room }).text

    expect(text.length).toBeLessThanOrEqual(room)
    expect(text).not.toContain('has a memory')
  })

  /**
   * 🛑 The exact opposite of what this case asserted until 2026-08-31: the manuals give ground
   * FIRST and every real door cuts some, so yielding to a cut manual dropped the line from every
   * door under ~97 400 — measured absent at 19 404, 8 500 and 7 116.
   */
  it('keeps the signal by giving a manual ground instead', () => {
    // A whole family, so the room stays above what the wide rules ask for: below it the briefing
    // drops those instead, and the signal then fits for a reason this case is not about.
    const room = studioBriefing({ memories: 0, room: WIDE, loaded: GIT }).text.length + 10
    const signalled = studioBriefing({ memories: 12, room, loaded: GIT })

    expect(signalled.text.length).toBeLessThanOrEqual(room)
    expect(signalled.text).toContain('has a memory')
    expect(signalled.loaded.length).toBeLessThan(GIT.length)
  })

  /** Every manual loaded from the start, which is what every door composes against since 08-31. */
  it('holds the signal on the doors that carry the whole catalogue', () => {
    const loaded = ACTION_REGISTRY.map(one => one.name)

    for (const room of [NARROW, roomFor(8192), roomFor(CLOUD_CONTEXT_TOKENS)]) {
      expect(studioBriefing({ memories: 5, room, loaded }).text).toContain('has a memory')
    }
  })
})
