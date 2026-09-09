import { armCommandScope, subscribeToCommands } from '@/services/commandBus'
import { installFakeBridge } from '@/services/fakeBridge'
import { job as jobOf } from '@/stores/job-fixtures'
import { useLayouts } from '@/stores/layouts'
import { useModels } from '@/stores/models'
import { useProject } from '@/stores/project'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import type { ActionOutcome } from '@shared/domain/assistant'
import { aiRoleId } from '@shared/domain/aiRole'
import type { Job } from '@shared/domain/job'
import type { ModelSummary } from '@shared/domain/model'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runAction } from './executor'
import { registerGenerator, type ArmedGeneration, type GeneratorBridge } from './generatorBridge'

const showWorkspace = vi.hoisted(() => vi.fn())
const createNamedDocumentIn = vi.hoisted(() => vi.fn())
const revealTool = vi.hoisted(() => vi.fn())
const toolIsOffered = vi.hoisted(() => vi.fn(() => false))

vi.mock('@/features/shell/components/dockviewApi', () => ({ showWorkspace }))
vi.mock('@/features/shell/newDocument', () => ({ createNamedDocumentIn }))
vi.mock('@/helpers/revealPanel', () => ({ revealTool, toolIsOffered }))

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
    createNamedDocumentIn.mockResolvedValue(madeDocument)
  })

  it('switches to it', async () => {
    expect(await runAction('workspace.open', { workspace: '3d' })).toEqual({ ok: true })

    expect(showWorkspace).toHaveBeenCalledWith('3d')
    expect(createNamedDocumentIn).not.toHaveBeenCalled()
  })

  it('makes a document there when asked to', async () => {
    await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' })

    expect(createNamedDocumentIn).toHaveBeenCalledWith('3d', { title: 'Niveau' })
    expect(showWorkspace).not.toHaveBeenCalled()
  })

  /**
   * The name is the person's, as a project's is. Told to « always give a title », the model made
   * one up — « 3rd Person » for a sentence naming nothing (2026-09-09). Refused, it asks instead.
   */
  it('refuses a creation that brings no name, and says the field it wants', async () => {
    const outcome = await runAction('workspace.open', { workspace: '3d', createDocument: true })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(createNamedDocumentIn).not.toHaveBeenCalled()
  })

  // The creation reads a template's files off the disk before it answers, and a client told the
  // document was there while it was still being seeded went looking for a tab that had no scene.
  it('answers the document it made, and waits for it', async () => {
    expect(
      await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' }),
    ).toEqual({
      ok: true,
      data: { documentId: 'doc-9' },
    })
  })

  /**
   * Two rounds of one turn sent the same creation and two tabs stood on one file, each saving
   * over the other (2026-09-09). The CAUSE travels, so the model changes the title rather than
   * sending it back — the bench measured that on `document.rename` on 2026-08-26.
   */
  it('refuses a title the project already holds, and says why', async () => {
    createNamedDocumentIn.mockResolvedValue('duplicate')

    const outcome = await runAction('workspace.open', {
      workspace: '3d',
      createDocument: true,
      title: 'Niveau',
    })

    expect(outcome).toMatchObject({ ok: false, refusal: 'badInput' })
    expect(outcome.ok === false && outcome.detail).toContain('duplicate')
  })

  it('passes on the name and the folder the caller gave', async () => {
    await runAction('workspace.open', {
      workspace: '3d',
      createDocument: true,
      title: 'Niveau',
      folder: 'Repérages',
    })

    expect(createNamedDocumentIn).toHaveBeenCalledWith('3d', {
      title: 'Niveau',
      folder: 'Repérages',
    })
  })

  it('leaves the folder out when only a name was given', async () => {
    await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' })

    expect(createNamedDocumentIn).toHaveBeenCalledWith('3d', { title: 'Niveau' })
  })

  // Nobody is asked any more, so nothing written is the studio's own failure to write it.
  it('refuses when the creation itself came to nothing', async () => {
    createNamedDocumentIn.mockResolvedValue(null)

    expect(
      await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' }),
    ).toMatchObject({
      ok: false,
      refusal: 'failed',
    })
  })

  it('refuses to make one with no project to write it in', async () => {
    useProject.setState({ project: null })

    expect(
      await runAction('workspace.open', { workspace: '3d', createDocument: true, title: 'Niveau' }),
    ).toMatchObject({
      ok: false,
      refusal: 'noProject',
    })
    expect(createNamedDocumentIn).not.toHaveBeenCalled()
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
   * 🛑 The panel is what `generator.readArmedGeneration` and `generator.submit` read, and it is
   * mounted a render after the store write that reveals it — so `prepare` answered `ok` and the
   * very next call was refused `generatorClosed` about a panel that was in fact opening. A
   * surface that carries no generation panel is told so instead of being left waiting for one.
   */
  it('refuses when the space in front carries no generation panel', async () => {
    expect(
      await runAction('generator.prepare', {
        family: '3d',
        modelId: 'model_y',
        parameters: { prompt: 'a knight helmet' },
      }),
    ).toMatchObject({ ok: false, refusal: 'wrongSurface' })
  })

  /**
   * 🛑 Asked of the MAIN process, where the SQLite index lives — the window used to rank the query
   * itself, so the same `actions.find` answered one thing here and another to an MCP client.
   */
  it('finds actions the short catalogue never named, through the studio index', async () => {
    const findActions = vi.fn(() =>
      Promise.resolve<ActionOutcome>({
        ok: true,
        data: [{ name: 'git.checkout', fields: [{}] }],
      }),
    )
    installFakeBridge({ assistant: { findActions } })

    const outcome = await runAction('actions.find', { query: 'git branch' })
    const found = outcome.ok ? (outcome.data as { name: string; fields: unknown[] }[]) : []

    expect(findActions).toHaveBeenCalledWith('git branch')
    expect(found.some(one => one.name === 'git.checkout')).toBe(true)
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
