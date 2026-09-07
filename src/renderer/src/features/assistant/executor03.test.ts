import { installFakeBridge } from '@/services/fakeBridge'
import { job as jobOf } from '@/stores/job-fixtures'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { type ActionOutcome } from '@shared/domain/assistant'
import type { Job } from '@shared/domain/job'
import { DEFAULT_SETTINGS } from '@shared/domain/settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerConfirmer, type ConfirmAnswer, type ConfirmRequest } from './confirm'
import { resetDelegatedSpendForTests, runConfirmedAction } from './executor'
import { registerGenerator, type ArmedGeneration, type GeneratorBridge } from './generatorBridge'
import { forgetConsentsForTests } from './wireConsent'

/** A person at the screen: the yes or the no, and the input handed back as it came. */
const saying =
  (granted: boolean) =>
  (request: ConfirmRequest): Promise<ConfirmAnswer> =>
    Promise.resolve({ granted, input: request.input })

/** The English half of a refusal, which is where the token and what it covers are spelled out. */
const refusalDetail = (outcome: ActionOutcome): string => (outcome.ok ? '' : (outcome.detail ?? ''))

/** Read as the shape it is rather than by the words around it, which are a bundle line. */
const tokensOf = (detail: string): readonly string[] =>
  detail.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []

const tokenOf = (detail: string): string => tokensOf(detail)[0] ?? ''

const showWorkspace = vi.hoisted(() => vi.fn())
const createDocumentIn = vi.hoisted(() => vi.fn())
const revealTool = vi.hoisted(() => vi.fn())

vi.mock('@/features/shell/components/dockviewApi', () => ({ showWorkspace }))
vi.mock('@/features/shell/newDocument', () => ({ createDocumentIn }))
vi.mock('@/helpers/revealPanel', () => ({ revealTool }))

function onImageDocument(): void {
  useLayouts.setState({ activeWorkspace: 'image', home: false })
}

/** The shared factory, told the label and the progress this suite reads a job by. */
const aJob = (id: string): Job => jobOf({ id, label: 'Knight', progress: 0.5 })

/** A mounted generator, armed on a model and carrying no references unless a case says so. */
const ARMED: ArmedGeneration = {
  modelId: 'm',
  operation: 'image/txt2img',
  family: 'image',
  sources: [],
  landing: { target: 'newTab', derived: 'newTab', into: null, creates: null, sends: null },
  parameters: {},
}

const aGenerator = (overrides: Partial<GeneratorBridge> = {}): GeneratorBridge => ({
  body: () => ({ modelId: 'm', values: {} }),
  armed: () => ARMED,
  submit: () => Promise.resolve(null),
  references: () => [],
  ...overrides,
})

/** The real gesture opens a native folder dialog, which a test has none of. */
const createPicked = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  installFakeBridge()
  onImageDocument()
  useProject.setState({ createPicked })
})

describe('asking across the wire', () => {
  beforeEach(() => {
    forgetConsentsForTests()
    resetDelegatedSpendForTests()
    useSettings.setState({ settings: DEFAULT_SETTINGS })
  })

  it('runs what engages nothing, without a token', async () => {
    expect(await runConfirmedAction('workspace.open', { workspace: '3d' }, {})).toMatchObject({
      ok: true,
    })
  })

  it('names what a call engages rather than asking a screen that is not there', async () => {
    const ask = vi.fn(saying(true))
    const stop = registerConfirmer(ask)

    const outcome = await runConfirmedAction('project.create', { name: 'p' }, {})

    expect(outcome).toMatchObject({ ok: false, refusal: 'needsConsent' })
    expect(refusalDetail(outcome)).toContain('the studio’s own state')
    expect(ask).not.toHaveBeenCalled()
    stop()
  })

  it('runs the same call when it comes back with the token', async () => {
    const cutout = { command: 'canvas.cutout' }
    const first = await runConfirmedAction('command.runStudioCommand', cutout, {})
    const consent = tokenOf(refusalDetail(first))

    // Past the gate, which is the whole of what a token buys. What the surface then makes of the
    // command is `coreHandlers`' own case, not this one's.
    expect(
      await runConfirmedAction('command.runStudioCommand', cutout, { consent }),
    ).not.toMatchObject({
      refusal: 'needsConsent',
    })
  })

  it('does not let a token answer for a call it was not minted for', async () => {
    const first = await runConfirmedAction(
      'command.runStudioCommand',
      { command: 'canvas.cutout' },
      {},
    )
    const consent = tokenOf(refusalDetail(first))

    expect(
      await runConfirmedAction(
        'command.runStudioCommand',
        { command: 'canvas.enlarge' },
        { consent },
      ),
    ).toMatchObject({ ok: false, refusal: 'needsConsent' })
  })

  /**
   * 🛑 The one a lot hides: `studio.batch` engages nothing, so it runs before the gate — and its
   * calls fell back on a modal no client can see, each holding the round trip for two minutes.
   */
  it('carries the door down into a lot, so its calls are asked across the wire too', async () => {
    const stop = registerConfirmer(saying(true))
    const calls = JSON.stringify([
      { action: 'command.runStudioCommand', input: { command: 'canvas.cutout' } },
    ])

    const outcome = await runConfirmedAction('studio.batch', { calls }, {})

    expect(outcome).toMatchObject({ ok: false, refusal: 'needsConsent' })
    expect(refusalDetail(outcome)).toContain('call 1')
    stop()
  })

  /**
   * 🛑 What a lot did before it refused. Stopping at the first call wanting a token left the ones
   * before it acted on, and the client sending the lot back with that token ran them twice.
   */
  it('runs nothing at all when a later call of a lot wants a token', async () => {
    const calls = JSON.stringify([
      { action: 'workspace.open', input: { workspace: '3d' } },
      { action: 'command.runStudioCommand', input: { command: 'canvas.cutout' } },
    ])

    expect(await runConfirmedAction('studio.batch', { calls }, {})).toMatchObject({
      ok: false,
      refusal: 'needsConsent',
    })
    expect(showWorkspace).not.toHaveBeenCalled()
  })

  /** One round trip rather than one per engaging call, which is the whole point of a lot. */
  it('hands back a token for every call of the lot that was missing one', async () => {
    const calls = [
      { action: 'command.runStudioCommand', input: { command: 'canvas.cutout' } },
      { action: 'project.create', input: { name: 'p' } },
    ]

    const first = await runConfirmedAction('studio.batch', { calls: JSON.stringify(calls) }, {})
    const tokens = tokensOf(refusalDetail(first))

    expect(tokens).toHaveLength(2)
    expect(refusalDetail(first)).toContain('call 2')

    // Sent back with each call carrying its own, the lot is past the gate. What the surfaces then
    // make of the calls is their own case, not this one's.
    const armed = calls.map((one, at) => ({ ...one, input: { ...one.input, consent: tokens[at] } }))
    expect(
      await runConfirmedAction('studio.batch', { calls: JSON.stringify(armed) }, {}),
    ).not.toMatchObject({ refusal: 'needsConsent' })
  })

  /**
   * 🛑 The loop a token burnt too early makes: refused because of call two, call one's yes must
   * still stand, or the lot comes back one token short of a different call every round.
   */
  it('leaves a token standing when the lot it answered for is refused', async () => {
    const one = { action: 'command.runStudioCommand', input: { command: 'canvas.cutout' } }
    const two = { action: 'project.create', input: { name: 'p' } }

    const first = await runConfirmedAction('studio.batch', { calls: JSON.stringify([one]) }, {})
    const armedOne = { ...one, input: { ...one.input, consent: tokenOf(refusalDetail(first)) } }

    // Call one arrives armed and call two does not: ONE fresh token comes back, not two.
    const second = await runConfirmedAction(
      'studio.batch',
      { calls: JSON.stringify([armedOne, two]) },
      {},
    )
    expect(tokensOf(refusalDetail(second))).toHaveLength(1)
    expect(refusalDetail(second)).toContain('call 2')

    const armedTwo = { ...two, input: { ...two.input, consent: tokenOf(refusalDetail(second)) } }
    expect(
      await runConfirmedAction('studio.batch', { calls: JSON.stringify([armedOne, armedTwo]) }, {}),
    ).not.toMatchObject({ refusal: 'needsConsent' })
  })

  /** 🛑 One yes, one call: `holdsConsent` does not spend, so the same token offered twice in a
   * lot cleared both calls. */
  it('refuses a lot that offers one token for two calls', async () => {
    const call = { action: 'command.runStudioCommand', input: { command: 'canvas.cutout' } }
    const first = await runConfirmedAction('studio.batch', { calls: JSON.stringify([call]) }, {})
    const armed = { ...call, input: { ...call.input, consent: tokenOf(refusalDetail(first)) } }

    const outcome = await runConfirmedAction(
      'studio.batch',
      { calls: JSON.stringify([armed, armed]) },
      {},
    )

    expect(outcome).toMatchObject({ ok: false, refusal: 'needsConsent' })
    expect(refusalDetail(outcome)).toContain('call 2')
    expect(refusalDetail(outcome)).not.toContain('call 1')
  })

  /** 🛑 A lot that stops at call one must leave standing the token of the call it never ran, or
   * the retry asks again for a yes already given. */
  it('spends a token only when its own call runs', async () => {
    const stops = { action: 'game.export', input: {} }
    const engages = { action: 'project.create', input: { name: 'p' } }
    const asked = await runConfirmedAction(
      'studio.batch',
      { calls: JSON.stringify([stops, engages]) },
      {},
    )
    const armed = [
      stops,
      { ...engages, input: { ...engages.input, consent: tokenOf(refusalDetail(asked)) } },
    ]

    const first = await runConfirmedAction('studio.batch', { calls: JSON.stringify(armed) }, {})
    const again = await runConfirmedAction('studio.batch', { calls: JSON.stringify(armed) }, {})

    expect(refusalDetail(first)).toContain('call 1')
    expect(again).not.toMatchObject({ refusal: 'needsConsent' })
    expect(refusalDetail(again)).toContain('call 1')
  })

  /** 🛑 A token offered to a call the delegation covers is spent all the same: left standing it
   * answers a second time, for a spend the ceiling no longer covers. */
  it('spends a token the delegation made unnecessary', async () => {
    installFakeBridge({ provider: { estimateCost: () => Promise.resolve({ creativeUnits: 6 }) } })
    const stopGenerator = registerGenerator(
      aGenerator({ submit: () => Promise.resolve(aJob('job_1')) }),
    )
    const asked = await runConfirmedAction('generator.submit', {}, {})
    const consent = tokenOf(refusalDetail(asked))

    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, mcp: { ...DEFAULT_SETTINGS.mcp, delegateBudget: 10 } },
    })
    // Armed for ten: the call runs on the delegation, and the token it carried goes with it.
    expect(await runConfirmedAction('generator.submit', {}, { consent })).toMatchObject({
      ok: true,
    })
    expect(await runConfirmedAction('generator.submit', {}, { consent })).toMatchObject({
      ok: false,
      refusal: 'needsConsent',
    })
    stopGenerator()
  })

  /**
   * 🛑 The ledger the two doors share. A token spends with nobody at the screen, exactly as a
   * delegated call does — counted on the checkbox door alone, the ceiling bounded nothing.
   */
  it('debits the delegated budget for a spend a token let through', async () => {
    installFakeBridge({ provider: { estimateCost: () => Promise.resolve({ creativeUnits: 6 }) } })
    const stopGenerator = registerGenerator(
      aGenerator({ submit: () => Promise.resolve(aJob('job_1')) }),
    )

    // Nothing armed, so a token is the only way through — and it spends six.
    const asked = await runConfirmedAction('generator.submit', {}, {})
    // The figure the modal quotes, not a bare number: one sentence for both doors.
    expect(refusalDetail(asked)).toContain('~6')
    const consent = tokenOf(refusalDetail(asked))
    expect(await runConfirmedAction('generator.submit', {}, { consent })).toMatchObject({
      ok: true,
    })

    // Armed for ten AFTER the fact: six are already gone, so six more are past the ceiling.
    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, mcp: { ...DEFAULT_SETTINGS.mcp, delegateBudget: 10 } },
    })
    expect(await runConfirmedAction('generator.submit', {}, {})).toMatchObject({
      ok: false,
      refusal: 'needsConsent',
    })
    stopGenerator()
  })

  // The window's own door is untouched: no token reaches it, and it still asks its screen.
  it('leaves the window asking on the glass', async () => {
    const ask = vi.fn(saying(false))
    const stop = registerConfirmer(ask)

    await runConfirmedAction('command.runStudioCommand', { command: 'canvas.cutout' })

    expect(ask).toHaveBeenCalled()
    stop()
  })
})

/**
 * Delegation is what lets a client run while nobody is at the machine, and it is the one feature
 * of this file that can spend somebody's money unwatched. Every case here is about a refusal.
 */
