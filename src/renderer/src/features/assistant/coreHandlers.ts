import { findActions, refused, type ActionOutcome } from '@shared/domain/assistant'
import type { ApiFailure } from '@shared/domain/failure'
import { commandDescriptor } from '@shared/domain/command'
import { allRoles, primaryRoleOf } from '@shared/domain/aiRole'
import { CHOICE_SCOPES } from '@shared/domain/aiOverview'
import { LANDING_TARGETS } from '@shared/domain/landingTarget'
import { CAPABILITIES_BY_FAMILY, MODEL_FAMILIES } from '@shared/domain/model'
import { SCENE_TEMPLATE_IDS } from '@shared/domain/sceneTemplate'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { englishText } from '@shared/i18n'
import { failureMessageKey } from '@/services/failureMessage'
import { showWorkspace } from '@/features/shell/components/dockviewApi'
import { restoreDocument } from '@/features/shell/documentLoad'
import { createDocumentIn } from '@/features/shell/newDocument'
import { openGeneratorOn } from '@/helpers/openGenerator'
import { revealTool, toolIsOffered } from '@/helpers/revealPanel'
import { routeCommand, type CommandRouting } from '@/services/commandRouter'
import { useJobs } from '@/stores/jobs'
import { useModels } from '@/stores/models'
import { useProject } from '@/stores/project'
import { getBridge } from '@/services/bridge'
import { withBridge, type ActionHandlers } from './actionHandler'
import { boolOf, oneOf, recordOf, textOf } from './actionInputs'
import { generatorMounted, mountedGenerator } from './generatorBridge'

/**
 * The eleven a spoken request needs.
 *
 * Every branch calls the helper the studio already uses for that gesture — the rail's own way of
 * making a document, the inspector's own way of opening the generator. Nothing here is a second
 * path to an existing behaviour.
 */

/** What the router made of it, in the assistant's own words. */
const ROUTED: Record<CommandRouting, ActionOutcome> = {
  ran: { ok: true },
  noSurface: refused(
    'wrongSurface',
    'nothing in front can carry that command out — documents.list and panels.list answer what is up, and workspace.open brings the space it belongs to forward',
  ),
  // What the command names is there, and there is nothing left for it to do — a space already at
  // the end of the bar. `failed` would blame the studio for what is a fact of the input.
  nothingToDo: refused(
    'notFound',
    'that command has nothing left to do — what it names already stands the way it asks for',
  ),
  noBridge: refused('noBridge', 'this window is not connected to the studio process'),
  failed: refused('failed', 'that command was carried out and it failed — the journal holds why'),
}

/**
 * Fires a command wherever it belongs, through the router the native menu uses.
 *
 * Nothing is decided here: a second copy of that routing is what let ten commands be offered by
 * the tool schema and refused by the handler for as long as the two existed side by side.
 */
async function runCommand(input: Record<string, unknown>): Promise<ActionOutcome> {
  const descriptor = commandDescriptor(textOf(input, 'command') ?? '')
  if (!descriptor)
    return refused(
      'unknownCommand',
      `no command "${textOf(input, 'command') ?? ''}" in this studio — the "command" field of this action lists every id it takes`,
    )
  // 🛑 A native modal cannot be filled from here, cannot be read back, and the next round ran the
  // command again — a second Finder over the first. The action that takes a path does this.
  if (descriptor.raisesDialog)
    return refused(
      'nativeDialog',
      `"${descriptor.id}" raises a dialog of the operating system, which nothing here can fill or read back — use the action that takes a path instead: file.open, project.open, document.open or document.export, depending on what was meant`,
    )

  const routed = await routeCommand(descriptor.id)
  return typeof routed === 'string' ? ROUTED[routed] : { ok: true, data: routed }
}

async function submitPrepared(input: Record<string, unknown>): Promise<ActionOutcome> {
  const generator = mountedGenerator()
  if (!generator) {
    // Opened rather than merely refused: the next attempt then has somewhere to land, and the
    // panel is what the person needs to see to judge what is about to be sent.
    revealTool('generator')
    return refused(
      'generatorClosed',
      'the generation panel was not open; it has just been raised — generator.prepare arms a model and its parameters, then send this again',
    )
  }

  const armed = generator.armed()
  if (!armed)
    return refused(
      'nothingPrepared',
      'the generation panel holds nothing armed — generator.prepare arms a model and its parameters first',
    )

  // 🛑 What the call names, else what the panel shows — and a refusal rather than a default
  // where the studio itself would have asked. Its options travel in `detail`, the half a client
  // reads: a refusal naming nothing was sent again word for word 384 times on 2026-08-25.
  const into = oneOf(input, 'landing', LANDING_TARGETS) ?? armed.landing.target
  if (into === null) {
    return refused(
      'ambiguousLanding',
      `by MCP nobody is at the screen to be asked — name landing: one of ${LANDING_TARGETS.join(', ')}`,
    )
  }

  const job = await generator.submit(into)
  return job
    ? { ok: true, data: { jobId: job.id, landing: into } }
    : refused(
        'notSubmitted',
        'the studio did not take this generation — generator.readArmedGeneration says what stands on the form, and the journal holds why it was turned back',
      )
}

/** What is armed, before a call may quote a cost or spend one — model, operation, sources, where. */
function armedGeneration(): ActionOutcome {
  const armed = mountedGenerator()?.armed()
  if (!armed)
    return refused(
      'generatorClosed',
      'the generation panel is not open, or holds nothing armed — generator.prepare opens it on a model',
    )

  return { ok: true, data: armed }
}

async function prepareGenerator(input: Record<string, unknown>): Promise<ActionOutcome> {
  const family = oneOf(input, 'family', MODEL_FAMILIES)
  const parameters = recordOf(input, 'parameters')
  if (!family || !parameters)
    return refused(
      'badInput',
      `"family" wants one of: ${MODEL_FAMILIES.join(', ')}, and "parameters" a record of the model's own inputs — models.readGenerationModelFields answers which those are`,
    )

  openGeneratorOn(
    family,
    textOf(input, 'modelId') ?? '',
    parameters,
    textOf(input, 'operation') ?? undefined,
  )
  // The arming stands whatever the answer — as it did before there was one: it is what the panel
  // reads when a space that carries it does come forward.
  if (!toolIsOffered('generator'))
    return refused(
      'wrongSurface',
      'the space in front carries no generation panel — workspace.open brings one forward that does',
    )

  // Awaited: the panel declares itself a render later, and the call after this one reads it.
  return (await generatorMounted())
    ? { ok: true }
    : refused(
        'generatorClosed',
        'the generation panel was armed and then closed before it could be read — generator.prepare opens it again',
      )
}

// Waits for the document: the creation puts a name field on screen, and answering before it is
// filled told a client "done" about one the person then called off.
async function openWorkspace(input: Record<string, unknown>): Promise<ActionOutcome> {
  const workspace = oneOf(input, 'workspace', WORKSPACE_IDS)
  if (!workspace)
    return refused('badInput', `"workspace" wants one of: ${WORKSPACE_IDS.join(', ')}`)

  if (!boolOf(input, 'createDocument')) {
    // The tab brought forward may never have been mounted, so nothing has read its file. Waited
    // for, so the call after this one reads restored content — but never refused on: the space IS
    // in front, and a front tab whose file will not read would otherwise make it unreachable.
    const front = showWorkspace(workspace)
    if (!front) return { ok: true }

    await restoreDocument(front)
    return { ok: true, data: { documentId: front } }
  }

  // Asked here although the creation asks it too: from there it answers `null`, which is the
  // person's own refusal — and "you turned that down" for a studio with no project open is a lie.
  if (!useProject.getState().project)
    return refused(
      'noProject',
      'no project is open, and a document is made inside one — projects.list answers what there is, project.open opens one and project.create makes one',
    )

  const title = textOf(input, 'title')
  const folder = textOf(input, 'folder')
  // Only alongside a title, and for the same reason the folder is: with no title the naming
  // window opens, and what it puts on screen is the person's own choice to make.
  const template = oneOf(input, 'template', SCENE_TEMPLATE_IDS)
  const created = await createDocumentIn(
    workspace,
    title === null
      ? undefined
      : {
          title,
          ...(folder === null ? {} : { folder }),
          ...(template === null ? {} : { template }),
        },
  )
  return created
    ? { ok: true, data: { documentId: created.id } }
    : refused('declined', 'the person at the screen turned the new document down')
}

/**
 * Suggestions are written FOR a model — its own vocabulary, its own parameters — so there is no
 * useful answer without one armed.
 */
function suggestPrompts(input: Record<string, unknown>): Promise<ActionOutcome> {
  const prepared = mountedGenerator()?.body()
  if (!prepared)
    return Promise.resolve(
      refused(
        'generatorClosed',
        'a suggestion is written for the model armed in the generation panel, and none is — generator.prepare arms one first',
      ),
    )

  return withBridge(bridge =>
    bridge.provider.suggestPrompts({
      modelId: prepared.modelId,
      prompt: textOf(input, 'draft') ?? '',
    }),
  )
}

function describeStyle(): Promise<ActionOutcome> {
  const generator = mountedGenerator()
  if (!generator)
    return Promise.resolve(
      refused(
        'generatorClosed',
        'a style is read off the pictures on the generation form, and the panel is not open — generator.prepare opens it',
      ),
    )

  const references = generator.references()
  // Not a failure and not a guess: with nothing on the form there is no style to read, and the
  // channel refuses an empty list anyway.
  if (references.length === 0)
    return Promise.resolve(
      refused(
        'noReference',
        'the generation form carries no reference picture to read a style from — put one on it first',
      ),
    )

  return withBridge(bridge => bridge.provider.describeStyle(references))
}

/**
 * The catalogue, searched — how a model shown the short list learns what else there is.
 *
 * English, like the catalogue a model is shown and the tools an MCP client reads: the answer is
 * read by a program, not by the person at the machine.
 */
function findInCatalogue(input: Record<string, unknown>): ActionOutcome {
  const query = textOf(input, 'query')
  if (query === null)
    return refused(
      'badInput',
      '"query" is wanted — the words to look for among the studio\'s actions',
    )

  return {
    ok: true,
    // The field DESCRIPTORS as they stand, plus their English label: listing the three properties
    // that seemed useful dropped `repeated`, `min` and `max`, so a client discovering an action
    // here got a weaker contract than the same tool in `tools/list`.
    data: findActions(query).map(found => ({
      name: found.name,
      description: englishText(found.descriptionKey),
      fields: found.fields.map(field => ({ ...field, label: englishText(field.labelKey) })),
    })),
  }
}

// A cloud catalogue that answered nothing, said as what to do next — `missing` is the one code a
// client can repair, and it met a bare `failed: missing` (2026-09-06).
function catalogueRefusal(code: ApiFailure): ActionOutcome {
  return refused(
    'notFound',
    code === 'missing'
      ? 'the cloud catalogue needs a Scenario account and none is active — accounts.list says which accounts exist, and Settings ▸ Accounts adds one; models that need no account are listed when there are any'
      : `the cloud catalogue refused the search: ${englishText(failureMessageKey(code))} — what needs no account is listed when there is any`,
  )
}

function localModelManagement(
  input: Record<string, unknown>,
): Promise<ActionOutcome> | ActionOutcome {
  const operation = textOf(input, 'operation')
  const localId = textOf(input, 'localId')
  const profile = oneOf(input, 'profile', ['motion'])
  const needsModel = ['choose', 'install', 'remove', 'load', 'unload'].includes(operation ?? '')
  if (needsModel && !localId) return refused('badInput', '"localId" is required for this operation')

  if (operation === 'choose') {
    const role = allRoles().find(candidate => candidate === textOf(input, 'role'))
    const scope = oneOf(input, 'scope', CHOICE_SCOPES)
    return role && scope && localId
      ? withBridge(bridge => bridge.ai.choose(role, { kind: 'local', modelId: localId }, scope))
      : refused('badInput', '"role", "localId" and "scope" are required to choose a local model')
  }

  if (operation === 'install' && localId) return withBridge(bridge => bridge.ai.install(localId))
  if (operation === 'cancelInstall') return withBridge(bridge => bridge.ai.cancelInstall())
  if (operation === 'remove' && localId) return withBridge(bridge => bridge.ai.remove(localId))
  if (operation === 'load' && localId) return withBridge(bridge => bridge.ai.load(localId))
  if (operation === 'cancelLoad') return withBridge(bridge => bridge.ai.cancelLoad())
  if (operation === 'unload' && localId) return withBridge(bridge => bridge.ai.unload(localId))
  if (operation === 'readEngine')
    return withBridge(bridge => bridge.ai.readEngine(profile ?? undefined))
  if (operation === 'installEngine')
    return withBridge(bridge => bridge.ai.installEngine(profile ?? undefined))
  if (operation === 'cancelEngineInstall')
    return withBridge(bridge => bridge.ai.cancelInstallEngine())
  if (operation === 'installRuntime') return withBridge(bridge => bridge.ai.installOllama())
  if (operation === 'cancelRuntimeInstall')
    return withBridge(bridge => bridge.ai.cancelInstallOllama())
  return refused('badInput', '"operation" is not a local model lifecycle operation')
}

export const CORE_HANDLERS: ActionHandlers = {
  'ai.localState': () => withBridge(bridge => bridge.ai.overview()),
  'ai.manageLocalRuntime': localModelManagement,
  'command.runStudioCommand': runCommand,
  'actions.find': findInCatalogue,
  'workspace.open': openWorkspace,
  'generator.prepare': prepareGenerator,
  'generator.readArmedGeneration': armedGeneration,
  'generator.submit': submitPrepared,
  'prompt.suggest': suggestPrompts,
  'prompt.describeStyle': describeStyle,

  'models.search': async input => {
    const bridge = getBridge()
    if (!bridge) return ROUTED.noBridge
    const family = oneOf(input, 'family', MODEL_FAMILIES)
    const operation = textOf(input, 'operation')
    const query = {
      ...(family ? { family } : {}),
      ...(operation && family && CAPABILITIES_BY_FAMILY[family].includes(operation)
        ? { capabilities: [operation] }
        : {}),
    }
    const search = textOf(input, 'query')
    let page = await bridge.provider.searchModels({ ...query, ...(search ? { search } : {}) })
    if (page.items.length === 0 && search && family) {
      page = await bridge.provider.searchModels(query)
    }
    if (page.items.length === 0 && page.refused) return catalogueRefusal(page.refused)
    return {
      ok: true,
      data: page.items.map(model => ({
        id: model.id,
        name: model.name,
        family: model.family,
        ...(model.unavailable ? { unavailable: model.unavailable } : {}),
      })),
    }
  },

  'models.select': input => {
    const family = oneOf(input, 'family', MODEL_FAMILIES)
    if (!family) return refused('badInput', `"family" wants one of: ${MODEL_FAMILIES.join(', ')}`)

    // The door names a family, which is what an MCP client can be expected to know. The pick
    // arms its FIRST employment — the one that family generates with when nothing narrower is
    // asked for, and the one this call armed before choices were filed per employment.
    const role = primaryRoleOf(family)
    if (!role)
      return refused(
        'badInput',
        `the "${family}" family generates through no model this studio arms`,
      )

    useModels.getState().select(role, textOf(input, 'modelId') ?? '')
    return { ok: true }
  },

  /**
   * Whole jobs, `assetIds` above all. Four fields were picked out here — id, label, status,
   * progress — which made a client able to start a generation and unable to learn what it
   * produced, or what it cost, or why it failed.
   */
  'jobs.list': () => ({ ok: true, data: useJobs.getState().jobs }),

  'prompt.translate': input =>
    withBridge(bridge => bridge.provider.translatePrompt(textOf(input, 'text') ?? '')),

  /**
   * Recognised here, carried out by the conversation itself — see `say` in `stores/assistant`.
   * Not `hide()` on this line: that store imports the executor to run a plan, and reaching back
   * into it would close the loop between the two.
   */
  'chat.close': () => ({ ok: true }),
}
