import { readFileSync } from 'node:fs'
import type { AssistantCall } from '@shared/domain/assistant'
import { describe, expect, it } from 'vitest'
import { play } from './play'
import { createStudio, type Studio, type Think } from './studio'
import { rankOf } from './coverage'
import { assetOf, boatImage, montage, named, opened } from './setups'
import { PROJECT } from './project'
import type { Scenario } from './run'
import { SCENARIOS } from './scenarios'

/**
 * 🛑 What makes « on en est où ? » answerable: every request of `BATTERIE.md` has a scenario and
 * every scenario answers to a request. Without it the two drift apart in silence.
 */
const LIST = readFileSync('scripts/banc/BATTERIE.md', 'utf8').split('\n')

/** A sentence as either side spells it — the quotes and the wrapping are not the point. */
const plainly = (said: string): string =>
  said.replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * What each request ASKS, in order. Joined until the first `»`: Prettier wraps a long request
 * over several lines, and section 30 writes a note after the closing quote.
 */
const asked = (): readonly string[] => {
  const found: string[] = []
  for (let at = 0; at < LIST.length; at += 1) {
    if (!/^- \[[ x]\] «/.test(LIST[at] ?? '')) continue

    let whole = LIST[at] ?? ''
    while (!whole.includes('»') && at + 1 < LIST.length) {
      at += 1
      whole = `${whole} ${LIST[at]}`
    }
    found.push(plainly(whole.slice(whole.indexOf('«') + 1, whole.indexOf('»'))))
  }

  return found
}

/** Every scenario, on a studio of its own, laid out and then judged. */
async function overEachScenario(
  fault: (scenario: Scenario, studio: Studio) => string | null,
): Promise<string[]> {
  const found: string[] = []
  for (const scenario of SCENARIOS) {
    const studio = await createStudio(PROJECT)
    await scenario.setup?.(studio)
    const said = fault(scenario, studio)
    if (said !== null) found.push(said)
    studio.close()
  }

  return found
}

describe('the batterie and the bench', () => {
  it('carries one scenario per request of the list', () => {
    expect(SCENARIOS).toHaveLength(asked().length)
  })

  /**
   * 🛑 Seven sentences had drifted and nothing was red: the count matched, the order matched,
   * only the words differed. The LAST one, since a chain carries its earlier steps as setup.
   */
  it('says of each request the sentence the list carries', () => {
    const list = asked()
    const drifted = SCENARIOS.map((one, at) =>
      plainly(one.said.at(-1) ?? '') === list[at] ? null : one.name,
    ).filter(one => one !== null)

    expect(drifted).toEqual([])
  })

  it('names every scenario after the section and the rank it answers', () => {
    const misnamed = SCENARIOS.filter(one => !/^\d{1,2}\.\d{1,2} /.test(one.name))

    expect(misnamed.map(one => one.name)).toEqual([])
  })

  it('numbers them in the order the list reads', () => {
    const rank = (name: string): number => {
      const [section, at] = rankOf(name).split('.')
      return Number(section) * 100 + Number(at)
    }
    const ranks = SCENARIOS.map(one => rank(one.name))

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  /**
   * 🛑 A decor whose calls are REFUSED lays out nothing, and the scenario then runs against an
   * empty studio — the model is blamed for a scene that was never built.
   */
  it('lays out every decor without a single refusal', async () => {
    const broken = await overEachScenario((scenario, studio) =>
      studio.refusals().length === 0 ? null : `${scenario.name}: ${studio.refusals().join(', ')}`,
    )

    expect(broken).toEqual([])
  })

  /**
   * 🛑 An oracle already true after the decor measures NOTHING: a model that answers with no call
   * at all scores a pass. Thirty-one were, and the report counted them as successes.
   */
  it('leaves no scenario a model could pass by doing nothing', async () => {
    const vacuous = await overEachScenario((scenario, studio) => {
      studio.settle()
      const run = { studio, called: [], refused: 0, said: '', asks: [] }
      return scenario.passed(run) ? scenario.name : null
    })

    expect(vacuous).toEqual([])
  })

  it('gives every scenario something for the person to say', () => {
    const mute = SCENARIOS.filter(
      one => one.said.length === 0 || one.said.some(w => w.trim() === ''),
    )

    expect(mute.map(one => one.name)).toEqual([])
  })

  it('judges scene key times in the microseconds stored by the timeline', async () => {
    const scenario = SCENARIOS.find(one => one.name.startsWith('13.3 '))
    if (!scenario) throw new Error('scenario 13.3 is missing')
    const studio = await createStudio(PROJECT)
    await scenario.setup?.(studio)
    await studio.run('key.writePoseKeys', {
      nodeId: named(studio, 'Cube Test'),
      timeSeconds: 10,
      property: 'position',
    })

    expect(scenario.passed({ studio, called: [], refused: 0, said: '', asks: [] })).toBe(true)
    studio.close()
  })
})

/**
 * 🛑 The bench's own chain, which nothing else can check: `pnpm banc` costs money, so a harness
 * that mis-reads what happened would only be found by paying for it.
 */
describe('a scenario played out', () => {
  const answering =
    (calls: readonly AssistantCall[]): Think =>
    request =>
      Promise.resolve({
        say: `round on « ${request.utterance} »`,
        calls: request.continuing ? [] : calls,
        cost: 0,
      })

  it('reports what the model chose, what the studio answered, and what it said', async () => {
    const played = await play(
      {
        name: '0.1 nothing',
        said: ['Liste mes fichiers.'],
        passed: () => true,
      },
      answering([
        { action: 'files.list', input: { folder: 'Images' } },
        { action: 'file.rename', input: { path: 'nowhere.png', name: 'x.png' } },
      ]),
    )

    expect(played.called.map(one => one.action)).toEqual(['files.list', 'file.rename'])
    expect(played.called[0]?.input).toEqual({ folder: 'Images' })
    // 🛑 The file gesture answers `ok` and NAMES its refusal — a `FileOutcome`, never a bare
    // refusal. The bench answered `ok` on a path nothing held for a whole session.
    expect(played.called[0]?.answer).toBe('found 7')
    expect(played.called[1]?.answer).toMatch(/^ok \{"done":\[\],"refused":\[\{/)
    expect(played.refused).toBe(0)
    expect(played.said).toContain('Liste mes fichiers.')
    // Two: the round that planned, and the one that answered with nothing left to do.
    expect(played.rounds).toBe(2)
    played.studio.close()
  })

  /**
   * 🛑 The MODEL's own calls reach `runConfirmedAction` directly — a wrapper around `Studio.run`
   * sees the decor's and none of theirs, so the dock has to be a SUBSCRIPTION.
   */
  it('brings forward what the model itself opened, not only what a decor did', async () => {
    const played = await play(
      { name: '0.3 nothing', said: ['Ouvre le bateau et ajoute un calque.'], passed: () => true },
      answering([
        { action: 'file.open', input: { path: 'Images/fais moi un bateau.png' } },
        { action: 'layer.add', input: { name: 'Overlay', kind: 'pixel' } },
      ]),
    )

    // A `wrongSurface` here would mean the picture never came forward.
    expect(played.called[1]?.answer).toContain('layerId')
    played.studio.close()
  })

  it('hands the generator the picture the model armed it with', async () => {
    const played = await play(
      { name: '0.4 nothing', said: ['Génère une variante de cette image.'], passed: () => true },
      answering([
        {
          action: 'generator.prepare',
          input: { family: 'image', modelId: 'model-image', parameters: { image: 'asset-1' } },
        },
        { action: 'generator.submit', input: {} },
      ]),
    )

    expect(played.studio.references()).toEqual(['asset-1'])
    played.studio.close()
  })

  it('is told what the studio holds, in the sentences the briefing carries', async () => {
    const seen: string[] = []
    await play({ name: '0.2 nothing', said: ['Où en suis-je ?'], passed: () => true }, request => {
      seen.push(request.state ?? '')
      return Promise.resolve({ say: '', calls: [], cost: 0 })
    })

    expect(seen[0]).toContain('Démo')
  })
})

/**
 * 🛑 The surfaces a headless run stands in for, measured HERE rather than by a paid pass: each of
 * these refused for want of a window until 2026-09-02 — an image had no engine to hand its pixels
 * over, a sky and a material had no GPU to draw with, and four scopes were armed by nobody.
 */
describe('what a run with no window can still carry out', () => {
  const asking =
    (calls: readonly AssistantCall[]): Think =>
    request =>
      Promise.resolve({ say: '', calls: request.continuing ? [] : calls, cost: 0 })

  /** What each call answered, in order — `ok`, or the refusal by name. */
  const answering = async (
    setup: Scenario['setup'],
    calls: readonly AssistantCall[],
  ): Promise<readonly string[]> => {
    const played = await play(
      { name: '0.3 nothing', said: ['Fais-le.'], ...(setup ? { setup } : {}), passed: () => true },
      asking(calls),
    )
    played.studio.close()
    return played.called.map(one => one.answer ?? 'never ran')
  }

  it('saves and exports the image in front, whose pixels a canvas host stands in for', async () => {
    const answers = await answering(boatImage, [
      { action: 'document.save', input: {} },
      { action: 'document.export', input: {} },
    ])

    expect(answers).toEqual([expect.stringMatching(/^ok/), expect.stringMatching(/^ok/)])
  })

  it('exports the sky in front, whose GPU pass a port stands in for', async () => {
    const answers = await answering(
      async studio => {
        await opened('skyboxes', 'Ciel Test')(studio)
        // A sky with no picture refuses before any pass — its own answer, not a missing surface.
        await studio.run('skybox.setSourceImage', {
          assetId: assetOf(studio, 'a clear blue sky at noon.png'),
        })
      },
      [{ action: 'document.export', input: {} }],
    )

    expect(answers).toEqual([expect.stringMatching(/^ok/)])
  })

  it('exports the material in front, whose GPU pass a port stands in for', async () => {
    const answers = await answering(opened('materials', 'Matière Test'), [
      { action: 'document.export', input: {} },
    ])

    expect(answers).toEqual([expect.stringMatching(/^ok/)])
  })

  it('carries a command of the scope the document in front edits through', async () => {
    const answers = await answering(opened('materials', 'Matière Test'), [
      { action: 'command.runStudioCommand', input: { command: 'material.undo' } },
    ])

    // « nothing left to do » and not « nothing in front can carry that »: the scope IS armed, and
    // an empty history is what an undo finds on a document nobody has edited.
    expect(answers).toEqual([expect.stringMatching(/nothing left to do/)])
  })

  it('keeps a selected scene object framed through the headless viewport', async () => {
    const answers = await answering(
      SCENARIOS.find(scenario => scenario.name.startsWith('10.9 '))?.setup,
      [{ action: 'command.runStudioCommand', input: { command: 'scene.frameFollow' } }],
    )

    expect(answers).toEqual([expect.stringMatching(/^ok/)])
  })

  it('carries the commands of an image, of a montage and of the project folder', async () => {
    const canvas = await answering(boatImage, [
      { action: 'command.runStudioCommand', input: { command: 'canvas.selectAll' } },
    ])
    const sequence = await answering(montage(), [
      { action: 'command.runStudioCommand', input: { command: 'sequence.undo' } },
    ])
    // A folder and not an undo: the file stack lives in the main process, so `explorer.undo`
    // answers before it knows whether there was anything to take back — see `runExplorerCommand`.
    const explorer = await answering(undefined, [
      { action: 'command.runStudioCommand', input: { command: 'explorer.newFolder' } },
    ])

    expect(canvas).toEqual([expect.stringMatching(/^ok/)])
    expect(sequence).toEqual([expect.stringMatching(/nothing left to do/)])
    expect(explorer).toEqual([expect.stringMatching(/^ok/)])
  })
})
