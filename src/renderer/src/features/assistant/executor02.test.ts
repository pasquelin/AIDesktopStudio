import { armCommandScope, subscribeToCommands } from '@/services/commandBus'
import { installFakeBridge } from '@/services/fakeBridge'
import { job as jobOf } from '@/stores/job-fixtures'
import { useJobs } from '@/stores/jobs'
import { useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import type { Job } from '@shared/domain/job'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerConfirmer, type ConfirmAnswer, type ConfirmRequest } from './confirm'
import { runAction, runConfirmedAction } from './executor'
import { registerGenerator, type ArmedGeneration, type GeneratorBridge } from './generatorBridge'

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

describe('the prompt assistance, now asked for', () => {
  it('writes variants for the model the generator has armed', async () => {
    const suggestPrompts = vi.fn(() => Promise.resolve([{ text: 'a knight', parameters: {} }]))
    installFakeBridge({ provider: { suggestPrompts } })
    const stop = registerGenerator(aGenerator({ body: () => ({ modelId: 'model_x', values: {} }) }))

    const outcome = await runAction('prompt.suggest', { draft: 'un chevalier' })

    expect(suggestPrompts).toHaveBeenCalledWith({ modelId: 'model_x', prompt: 'un chevalier' })
    expect(outcome).toEqual({ ok: true, data: [{ text: 'a knight', parameters: {} }] })
    stop()
  })

  // Suggestions are written FOR a model, so there is no useful answer without one armed.
  it('refuses to suggest with no model armed', async () => {
    installFakeBridge()

    expect(await runAction('prompt.suggest', { draft: 'un chevalier' })).toMatchObject({
      ok: false,
      refusal: 'generatorClosed',
    })
  })

  it('translates what it was handed, and says which language it recognised', async () => {
    installFakeBridge({
      provider: {
        translatePrompt: () => Promise.resolve({ text: 'a knight', detectedLanguage: 'french' }),
      },
    })

    expect(await runAction('prompt.translate', { text: 'un chevalier' })).toEqual({
      ok: true,
      data: { text: 'a knight', detectedLanguage: 'french' },
    })
  })

  it('reads the style off the pictures the form carries, never off a named list', async () => {
    const describeStyle = vi.fn(() => Promise.resolve({ description: 'flat', synthesis: '' }))
    installFakeBridge({ provider: { describeStyle } })
    const stop = registerGenerator(aGenerator({ references: () => ['asset_1'] }))

    const outcome = await runAction('prompt.describeStyle', {})

    expect(describeStyle).toHaveBeenCalledWith(['asset_1'])
    expect(outcome).toEqual({ ok: true, data: { description: 'flat', synthesis: '' } })
    stop()
  })

  it('says there is nothing to read rather than asking about an empty list', async () => {
    installFakeBridge()
    const stop = registerGenerator(aGenerator())

    expect(await runAction('prompt.describeStyle', {})).toMatchObject({
      ok: false,
      refusal: 'noReference',
    })
    stop()
  })
})

describe('listing the jobs', () => {
  /**
   * Whole jobs. Four fields were picked out here — id, label, status, progress — which left a
   * client able to start a generation and unable to learn what it produced.
   */
  it('answers what the studio is tracking, whole', async () => {
    const job = aJob('job_1')
    useJobs.setState({ jobs: [job] })

    expect(await runAction('jobs.list', {})).toEqual({ ok: true, data: [job] })
  })
})

/**
 * The gate. Everything that outlives the window passes through it, whether the call came from
 * the modal or from an MCP client on the other side of the machine — there is one gate, not two.
 */
describe('asking before acting', () => {
  it('does not ask for what is free and undoable', async () => {
    const ask = vi.fn(saying(true))
    const stop = registerConfirmer(ask)

    await runConfirmedAction('workspace.open', { workspace: '3d' })

    expect(ask).not.toHaveBeenCalled()
    expect(showWorkspace).toHaveBeenCalledWith('3d')
    stop()
  })

  /** 🛑 What RUNS is what the CARD left: the folder it names is a place only the person knows. */
  it('runs the input the card amended', async () => {
    const heard: string[] = []
    const stopHearing = subscribeToCommands(command => heard.push(command) > 0)
    const disarm = armCommandScope('canvas')
    const stop = registerConfirmer(() =>
      Promise.resolve({ granted: true, input: { command: 'canvas.enlarge' } }),
    )

    await runConfirmedAction('command.runStudioCommand', { command: 'canvas.cutout' })
    stop()
    disarm()
    stopHearing()

    expect(heard).toEqual(['canvas.enlarge'])
  })

  /**
   * 🛑 What the card SHOWED is what runs: `raises` reads the input, so a value amended on the
   * card could lift the level above the sentence the person read before saying yes.
   */
  it('refuses an amendment the question was not asked about', async () => {
    const stop = registerConfirmer(() => Promise.resolve({ granted: true, input: { nothing: 1 } }))

    const outcome = await runConfirmedAction('command.runStudioCommand', {
      command: 'canvas.cutout',
    })
    stop()

    expect(outcome).toMatchObject({ ok: false, refusal: 'formChanged' })
  })

  it('asks before spending, and quotes what the form would cost', async () => {
    const ask = vi.fn(saying(true))
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    installFakeBridge({
      provider: { estimateCost: () => Promise.resolve({ creativeUnits: 4 }) },
    })
    const stopGenerator = registerGenerator(
      aGenerator({ body: () => ({ modelId: 'model_x', values: { prompt: 'a knight' } }), submit }),
    )
    const stopConfirmer = registerConfirmer(ask)

    await runConfirmedAction('generator.submit', {})

    expect(ask).toHaveBeenCalledWith({
      action: 'generator.submit',
      input: {},
      commitment: 'credits',
      estimate: 4,
    })
    expect(submit).toHaveBeenCalled()
    stopGenerator()
    stopConfirmer()
  })

  it('does not act when the answer is no', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stopGenerator = registerGenerator(aGenerator({ submit }))
    const stopConfirmer = registerConfirmer(saying(false))

    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'declined',
    })
    expect(submit).not.toHaveBeenCalled()
    stopGenerator()
    stopConfirmer()
  })

  /**
   * The answer that matters for the MCP server: an action arriving from outside while no window
   * is showing the assistant is refused, never granted by default. Spending on a question nobody
   * was shown is the one outcome this whole mechanism exists to prevent.
   */
  it('refuses rather than assuming a yes when nobody can be asked', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stop = registerGenerator(aGenerator({ submit }))

    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'noConfirmer',
    })
    expect(submit).not.toHaveBeenCalled()
    stop()
  })

  /**
   * What was priced is what goes out, or nothing does.
   *
   * The question may stand for two minutes — that is what a client from outside is given — and
   * the generator panel stays live behind it. Raising the count while "~4 CU" is on screen used
   * to send the new form: the figure was read before the question and the body re-read after the
   * yes, with nothing tying the two together.
   */
  it('sends nothing when the form moved between the figure and the yes', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    let count = 1
    installFakeBridge({
      provider: { estimateCost: () => Promise.resolve({ creativeUnits: 4 }) },
    })
    const stopGenerator = registerGenerator(
      aGenerator({ body: () => ({ modelId: 'model_x', values: { count } }), submit }),
    )
    // The hand that changes the form while the question is on screen.
    const stopConfirmer = registerConfirmer(request => {
      count = 10
      return saying(true)(request)
    })

    expect(await runConfirmedAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'formChanged',
    })
    expect(submit).not.toHaveBeenCalled()
    stopGenerator()
    stopConfirmer()
  })

  // An upload is a permanent asset and earns the question, but there is no figure to quote for
  // it — and one invented to fill the sentence would be worse than none.
  it('asks about an upload without quoting a price', async () => {
    const ask = vi.fn(saying(false))
    const stop = registerConfirmer(ask)

    await runConfirmedAction('command.runStudioCommand', { command: 'canvas.cutout' })

    expect(ask).toHaveBeenCalledWith({
      action: 'command.runStudioCommand',
      input: { command: 'canvas.cutout' },
      commitment: 'asset',
    })
    stop()
  })

  it('says the estimate is unknown rather than inventing one', async () => {
    const ask = vi.fn(saying(false))
    installFakeBridge({ provider: { estimateCost: () => Promise.reject(new Error('no price')) } })
    const stopGenerator = registerGenerator(aGenerator())
    const stopConfirmer = registerConfirmer(ask)

    await runConfirmedAction('generator.submit', {})

    expect(ask).toHaveBeenCalledWith({
      action: 'generator.submit',
      input: {},
      commitment: 'credits',
      estimate: null,
    })
    stopGenerator()
    stopConfirmer()
  })
})

/**
 * A caller with no screen on this machine. What is measured here is that the gate did not move:
 * it engages nothing before it has said what it engages, and a token answers for one call only.
 */
