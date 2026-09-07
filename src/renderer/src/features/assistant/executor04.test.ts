import { installFakeBridge } from '@/services/fakeBridge'
import { job as jobOf } from '@/stores/job-fixtures'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { useSettings } from '@/stores/settings'
import { ACTION_REGISTRY, commitmentOfCall } from '@shared/domain/assistant'
import { DEFAULT_SETTINGS, type Settings } from '@shared/domain/settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerConfirmer, type ConfirmAnswer, type ConfirmRequest } from './confirm'
import {
  handledActions,
  resetDelegatedSpendForTests,
  runAction,
  runConfirmedAction,
} from './executor'
import { registerGenerator, type ArmedGeneration, type GeneratorBridge } from './generatorBridge'

const WHEN = '2026-08-17T10:00:00.000Z'

/** A person at the screen: the yes or the no, and the input handed back as it came. */
const saying =
  (granted: boolean) =>
  (request: ConfirmRequest): Promise<ConfirmAnswer> =>
    Promise.resolve({ granted, input: request.input })

const showWorkspace = vi.hoisted(() => vi.fn())
const createDocumentIn = vi.hoisted(() => vi.fn())
const revealTool = vi.hoisted(() => vi.fn())

vi.mock('@/features/shell/components/dockviewApi', () => ({ showWorkspace }))
vi.mock('@/features/shell/newDocument', () => ({ createDocumentIn }))
vi.mock('@/helpers/revealPanel', () => ({ revealTool }))

function onImageDocument(): void {
  useLayouts.setState({ activeWorkspace: 'image', home: false })
}

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

describe('what an armed studio lets through without asking', () => {
  const arm = (partial: Partial<Settings['mcp']>): void => {
    useSettings.setState({
      settings: { ...DEFAULT_SETTINGS, mcp: { ...DEFAULT_SETTINGS.mcp, ...partial } },
    })
  }

  beforeEach(() => {
    resetDelegatedSpendForTests()
    useSettings.setState({ settings: DEFAULT_SETTINGS })
  })

  it('asks about everything while nothing is armed', async () => {
    const ask = vi.fn(saying(false))
    const stop = registerConfirmer(ask)

    await runConfirmedAction('command.runStudioCommand', { command: 'canvas.cutout' })

    expect(ask).toHaveBeenCalled()
    stop()
  })

  it('runs an armed level with nobody to ask at all', async () => {
    arm({ delegateAsset: true })

    // No confirmer registered: without the delegation this is `noConfirmer`, which is the whole
    // of what "a client working while nobody is at the machine" used to run into.
    expect(
      await runConfirmedAction('command.runStudioCommand', { command: 'canvas.cutout' }),
    ).not.toMatchObject({
      ok: false,
      refusal: 'noConfirmer',
    })
  })

  it('spends up to the budget, then asks again', async () => {
    arm({ delegateBudget: 5 })
    installFakeBridge({ provider: { estimateCost: () => Promise.resolve({ creativeUnits: 3 }) } })
    const stopGenerator = registerGenerator(
      aGenerator({ submit: () => Promise.resolve(jobOf({ id: 'job_1' })) }),
    )

    // Three of five: through. Three more is six, which is past five — so the second one asks, and
    // with nobody registered to ask it refuses.
    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({ ok: true })
    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'noConfirmer',
    })
    stopGenerator()
  })

  /** A ceiling cannot bound a cost nobody knows, so an unpriced spend is asked about regardless. */
  it('asks about a spend the API declined to price, whatever the budget', async () => {
    arm({ delegateBudget: 10_000 })
    installFakeBridge({ provider: { estimateCost: () => Promise.reject(new Error('no price')) } })
    const stopGenerator = registerGenerator(aGenerator())

    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'noConfirmer',
    })
    stopGenerator()
  })
})

describe('the table of handlers', () => {
  /**
   * Both directions, because both misses are silent. An action published with nothing behind it
   * answers `badInput` to every client that read `tools/list` and believed the tool existed; a
   * handler nothing publishes is code no door can reach. Neither the compiler nor the schema
   * sees either — the table is `Partial` by construction, one family per module.
   */
  it('answers every action the registry publishes, and no name it does not', () => {
    expect([...handledActions()].sort()).toEqual(ACTION_REGISTRY.map(entry => entry.name).sort())
  })
})

describe('an input the registry would not accept', () => {
  /**
   * The gate is `runConfirmedAction` and nowhere else, which is what lets each handler read its
   * input plainly. Checked through the confirmed door rather than on `validatesInput` directly:
   * what this holds is the wiring, and the wiring is what was missing.
   */
  it('is refused before the action runs at all', async () => {
    onImageDocument()

    expect(await runConfirmedAction('workspace.open', { workspace: 'nowhere' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(await runConfirmedAction('workspace.open', { worksapce: '3d' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(showWorkspace).not.toHaveBeenCalled()
  })

  // A costly action with a bad input must not raise the question first: the person would be
  // asked to approve a spend that was never going to happen.
  it('is refused without anybody being asked', async () => {
    const ask = vi.fn(saying(true))
    const stop = registerConfirmer(ask)

    expect(await runConfirmedAction('generator.submit', { unexpected: 1 })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
    expect(ask).not.toHaveBeenCalled()
    stop()
  })
})

describe('what a call engages', () => {
  it('spends credits only by submitting', () => {
    expect(commitmentOfCall('generator.submit', {})).toBe('credits')
    expect(commitmentOfCall('generator.prepare', {})).toBe('none')
    expect(commitmentOfCall('workspace.open', { workspace: '3d' })).toBe('none')
  })

  it('reads the commitment of the command a run names, not of the action', () => {
    expect(commitmentOfCall('command.runStudioCommand', { command: 'canvas.cutout' })).toBe('asset')
    expect(commitmentOfCall('command.runStudioCommand', { command: 'canvas.zoomIn' })).toBe('none')
  })

  // Recording a version adds one; amending REPLACES the one already there, message and parent
  // with it — the same loss `git.restore` is asked about, and it went through unasked.
  it('asks before an amend rewrites the version already recorded', () => {
    expect(commitmentOfCall('git.commit', { message: 'Un lot' })).toBe('none')
    expect(commitmentOfCall('git.commit', { message: 'Un lot', amend: true })).toBe('files')
  })
})

describe('a handler that throws rather than refuses', () => {
  /**
   * 🛑 The one silence a model cannot repair from. Left to climb, the rejection reached the bare
   * catch of the turn and marked it LOST: « L'assistant n'a pas su répondre à cette demande »,
   * over a studio that had just written the reason in its journal.
   */
  it('answers with the reason instead of losing the whole turn', async () => {
    installFakeBridge({
      project: {
        listFolder: vi.fn(() => Promise.reject(new Error('EACCES: permission denied'))),
      },
    })
    useProject.setState({
      project: {
        path: '/tmp/Film',
        manifest: { version: 1, createdAt: WHEN, updatedAt: WHEN },
      },
    })

    expect(await runAction('files.list', { folder: 'Plans' })).toEqual({
      ok: false,
      refusal: 'failed',
      detail: 'EACCES: permission denied',
    })
  })
})
