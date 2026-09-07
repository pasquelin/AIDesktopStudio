import { armCommandScope, subscribeToCommands } from '@/services/commandBus'
import { installFakeBridge } from '@/services/fakeBridge'
import { job as jobOf } from '@/stores/job-fixtures'
import { useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { useProject } from '@/stores/project'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import { aiRoleId } from '@shared/domain/aiRole'
import type { Job } from '@shared/domain/job'
import type { ModelSummary } from '@shared/domain/model'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'
import { registerGenerator, type ArmedGeneration, type GeneratorBridge } from './generatorBridge'

const showWorkspace = vi.hoisted(() => vi.fn())
const createDocumentIn = vi.hoisted(() => vi.fn())
const revealTool = vi.hoisted(() => vi.fn())

vi.mock('@/features/shell/components/dockviewApi', () => ({ showWorkspace }))
vi.mock('@/features/shell/newDocument', () => ({ createDocumentIn }))
vi.mock('@/helpers/revealPanel', () => ({ revealTool }))

function onImageDocument(): void {
  useLayouts.setState({ activeWorkspace: 'image', home: false })
}

const aModel = (id: string, name: string): ModelSummary => ({
  id,
  name,
  family: '3d',
  runsOn: SCENARIO_CLOUD,
  source: 'scenario',
  origin: 'official',
  featured: false,
  capabilities: [],
  tags: [],
})

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

describe('opening a workspace', () => {
  const stamp = '2026-08-17T10:00:00.000Z'
  const madeDocument = {
    id: 'doc-9',
    kind: 'scene',
    workspace: '3d',
    title: 'Niveau',
    path: 'documents/Niveau.gltf',
  }

  beforeEach(() => {
    useProject.setState({
      project: {
        path: '/projects/one',
        manifest: { version: 1, createdAt: stamp, updatedAt: stamp },
      },
    })
    createDocumentIn.mockResolvedValue(madeDocument)
  })

  it('switches to it', async () => {
    expect(await runAction('workspace.open', { workspace: '3d' })).toEqual({ ok: true })

    expect(showWorkspace).toHaveBeenCalledWith('3d')
    expect(createDocumentIn).not.toHaveBeenCalled()
  })

  it('makes a document there when asked to', async () => {
    await runAction('workspace.open', { workspace: '3d', createDocument: true })

    // Nothing named: the field opens, which is what a person at the window expects.
    expect(createDocumentIn).toHaveBeenCalledWith('3d', undefined)
    expect(showWorkspace).not.toHaveBeenCalled()
  })

  /**
   * The creation puts a name field on screen. Answering before it is filled told a client the
   * document was there while the person was still deciding — and it stayed "done" when they
   * pressed Cancel.
   */
  it('answers the document it made, and waits for it', async () => {
    expect(await runAction('workspace.open', { workspace: '3d', createDocument: true })).toEqual({
      ok: true,
      data: { documentId: 'doc-9' },
    })
  })

  // Named by the caller, the creation raises no field — see `createDocumentIn`.
  it('passes on the name and the folder the caller gave', async () => {
    await runAction('workspace.open', {
      workspace: '3d',
      createDocument: true,
      title: 'Niveau',
      folder: 'Repérages',
    })

    expect(createDocumentIn).toHaveBeenCalledWith('3d', { title: 'Niveau', folder: 'Repérages' })
  })

  it('leaves the folder out when only a name was given', async () => {
    await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' })

    expect(createDocumentIn).toHaveBeenCalledWith('3d', { title: 'Niveau' })
  })

  it('refuses when the name field is called off', async () => {
    createDocumentIn.mockResolvedValue(null)

    expect(
      await runAction('workspace.open', { workspace: '3d', createDocument: true }),
    ).toMatchObject({
      ok: false,
      refusal: 'declined',
    })
  })

  it('refuses to make one with no project to write it in', async () => {
    useProject.setState({ project: null })

    expect(
      await runAction('workspace.open', { workspace: '3d', createDocument: true }),
    ).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
    expect(createDocumentIn).not.toHaveBeenCalled()
  })

  it('refuses a workspace the studio has no panel for', async () => {
    const outcome = await runAction('workspace.open', { workspace: 'holodeck' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(showWorkspace).not.toHaveBeenCalled()
  })
})

describe('running a command', () => {
  it('hands it to the surface listening for it', async () => {
    const heard: string[] = []
    const stop = subscribeToCommands(command => heard.push(command) > 0)
    const disarm = armCommandScope('canvas')

    expect(await runAction('command.runStudioCommand', { command: 'canvas.zoomIn' })).toEqual({
      ok: true,
    })

    expect(heard).toEqual(['canvas.zoomIn'])
    disarm()
    stop()
  })

  it('answers what the surface made, so a client need not run the command twice for an id', async () => {
    const stop = subscribeToCommands(() => ({ nodeIds: ['copy-1'] }))
    const disarm = armCommandScope('scene')

    expect(await runAction('command.runStudioCommand', { command: 'scene.duplicate' })).toEqual({
      ok: true,
      data: { nodeIds: ['copy-1'] },
    })
    disarm()
    stop()
  })

  /**
   * The defect this whole check exists for: the bus is memoryless and the subscriber filters by
   * scope, so a command for a surface nothing has mounted vanishes without a word. Reported as
   * having run, the assistant would be lying about the one thing it is asked to be reliable on.
   */
  it('says so rather than dropping a command no surface is there to take', async () => {
    const heard: string[] = []
    const stop = subscribeToCommands(command => heard.push(command) > 0)

    const outcome = await runAction('command.runStudioCommand', { command: 'scene.frame' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'wrongSurface' })
    expect(heard).toEqual([])
    stop()
  })

  /**
   * `badInput` and not `unknownCommand`, because the field closes over every declared id: the
   * schema promised the client an enum, so a value outside it never reaches the handler. The
   * handler keeps its own `unknownCommand` all the same — it is what would answer the day the
   * registry and the field parted company.
   */
  it('refuses a command nothing declares, at the schema rather than at the surface', async () => {
    const outcome = await runAction('command.runStudioCommand', { command: 'canvas.summonADragon' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  // The catalogue offers these to the model, so refusing them all was the assistant announcing
  // "creating a new project" and then doing nothing at all.
  it('runs the application’s own commands, through the path the native menu takes', async () => {
    const outcome = await runAction('command.runStudioCommand', { command: 'app.settings' })

    expect(outcome).toEqual({ ok: true })
  })

  /**
   * 🛑 Measured on screen: the Finder opened, the person answered it, and the NEXT round ran the
   * same command again — a second Finder over the first, because nothing came back saying what
   * had been chosen. `project.create` takes a name and answers what it made.
   */
  it('refuses a command that raises a system dialogue', async () => {
    const outcome = await runAction('command.runStudioCommand', { command: 'project.new' })

    expect(outcome).toMatchObject({ ok: false, refusal: 'nativeDialog' })
    expect(createPicked).not.toHaveBeenCalled()
  })
})

describe('choosing and preparing a model', () => {
  it('arms a model for its family', async () => {
    expect(await runAction('models.select', { family: 'image', modelId: 'model_x' })).toEqual({
      ok: true,
    })

    expect(useModels.getState().selected[aiRoleId('image', 'txt2img')]).toBe('model_x')
  })

  it('fills the generator without sending anything', async () => {
    await runAction('generator.prepare', {
      family: '3d',
      modelId: 'model_y',
      parameters: { prompt: 'a knight helmet' },
    })

    expect(useModels.getState().preset[aiRoleId('3d', 'txt23d')]).toEqual({
      prompt: 'a knight helmet',
    })
    expect(useModels.getState().selected[aiRoleId('3d', 'txt23d')]).toBe('model_y')
  })

  /**
   * What a model shown only the short list asks with, and what it gets back: the action, what it
   * is for, and the fields it takes — enough to call it on the next turn without seeing the rest.
   */
  it('finds actions the short catalogue never named', async () => {
    const outcome = await runAction('actions.find', { query: 'git branch' })
    const found = outcome.ok ? (outcome.data as { name: string; fields: unknown[] }[]) : []

    expect(found.some(one => one.name === 'git.checkout')).toBe(true)
    expect(found.find(one => one.name === 'git.checkout')?.fields.length).toBeGreaterThan(0)
  })

  it('refuses parameters that are not a set of values', async () => {
    const outcome = await runAction('generator.prepare', {
      family: '3d',
      modelId: 'model_y',
      parameters: 'a knight helmet',
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
  })

  it('searches the catalogue and answers what it found', async () => {
    installFakeBridge({
      provider: {
        searchModels: () => Promise.resolve({ items: [aModel('model_z', 'Knight')], cursor: null }),
      },
    })

    const outcome = await runAction('models.search', { query: 'knight', family: '3d' })

    expect(outcome).toEqual({
      ok: true,
      data: [{ id: 'model_z', name: 'Knight', family: '3d' }],
    })
  })

  it('falls back to compatible models when content words match no engine name', async () => {
    const searchModels = vi.fn(query =>
      Promise.resolve({
        items: query.search ? [] : [aModel('model_z', 'Knight')],
        cursor: null,
      }),
    )
    installFakeBridge({ provider: { searchModels } })

    const outcome = await runAction('models.search', {
      query: 'wooden chest',
      family: '3d',
      operation: 'txt23d',
    })

    expect(outcome).toEqual({
      ok: true,
      data: [{ id: 'model_z', name: 'Knight', family: '3d' }],
    })
    expect(searchModels).toHaveBeenNthCalledWith(1, {
      family: '3d',
      capabilities: ['txt23d'],
      search: 'wooden chest',
    })
    expect(searchModels).toHaveBeenNthCalledWith(2, {
      family: '3d',
      capabilities: ['txt23d'],
    })
  })
})

describe('submitting what was prepared', () => {
  it('sends the form the panel is showing, and answers the job', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stop = registerGenerator(aGenerator({ submit }))

    expect(await runAction('generator.submit', {})).toEqual({
      ok: true,
      data: { jobId: 'job_1', landing: 'newTab' },
    })
    // What the panel shows, when the call names nothing: the destination is not re-decided here.
    expect(submit).toHaveBeenCalledWith('newTab')
    stop()
  })

  it('sends it where the call says, over what the panel shows', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stop = registerGenerator(aGenerator({ submit }))

    await runAction('generator.submit', { landing: 'document' })

    expect(submit).toHaveBeenCalledWith('document')
    stop()
  })

  /**
   * 🛑 Refused rather than guessed: the studio itself would have put the question on screen, and
   * a call from outside cannot answer it — the wrong half writes over a file being edited.
   */
  it('refuses, naming the options, where the studio would have asked', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stop = registerGenerator(
      aGenerator({
        submit,
        armed: () => ({ ...ARMED, landing: { ...ARMED.landing, target: null } }),
      }),
    )

    const outcome = await runAction('generator.submit', {})

    expect(outcome).toMatchObject({ ok: false, refusal: 'ambiguousLanding' })
    expect(outcome).toMatchObject({ detail: expect.stringContaining('newTab') })
    // Why the question is not simply asked: a client with no screen read the refusal as a broken
    // promise of `generation.landing: ask` (Codex by MCP, 2026-09-06).
    expect(outcome).toMatchObject({ detail: expect.stringContaining('by MCP') })
    expect(submit).not.toHaveBeenCalled()
    stop()
  })

  /** The same call, with the destination named, goes through: the refusal is repairable. */
  it('goes through once the ambiguity is named', async () => {
    const submit = vi.fn(() => Promise.resolve(aJob('job_1')))
    const stop = registerGenerator(
      aGenerator({
        submit,
        armed: () => ({ ...ARMED, landing: { ...ARMED.landing, target: null } }),
      }),
    )

    await runAction('generator.submit', { landing: 'newTab' })

    expect(submit).toHaveBeenCalledWith('newTab')
    stop()
  })

  it('opens the generator, and refuses, when no panel is mounted', async () => {
    const outcome = await runAction('generator.submit', {})

    expect(outcome).toMatchObject({ ok: false, refusal: 'generatorClosed' })
    expect(revealTool).toHaveBeenCalledWith('generator')
  })

  /** Read before the spend: what a client sees instead of paying to find out. */
  it('answers the model, the operation and the destination that are armed', async () => {
    const stop = registerGenerator(aGenerator())

    expect(await runAction('generator.readArmedGeneration', {})).toEqual({ ok: true, data: ARMED })
    stop()
  })

  it('refuses to say what is armed with no panel mounted', async () => {
    expect(await runAction('generator.readArmedGeneration', {})).toMatchObject({
      ok: false,
      refusal: 'generatorClosed',
    })
  })

  it('refuses when the panel is up but nothing is armed', async () => {
    const stop = registerGenerator(aGenerator({ armed: () => null }))

    expect(await runAction('generator.submit', {})).toMatchObject({
      ok: false,
      refusal: 'nothingPrepared',
    })
    stop()
  })
})

/**
 * The three the prompt field used to carry as buttons. The channels are untouched — what
 * changed is who presses — so what is worth saying here is where each one reads its input from.
 */
