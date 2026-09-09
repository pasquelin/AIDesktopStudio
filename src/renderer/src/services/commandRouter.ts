import { commandDescriptor, type CommandId } from '@shared/domain/command'
import type { StudioBridge } from '@shared/ipc'
import { saveDocument, saveDocumentAs } from '@/features/shell/documentIo'
import {
  closableTabId,
  fileViewSave,
  panelIsFileView,
} from '@/features/shell/components/dockviewApi'
import { closeTab } from '@/features/shell/components/Document/Tab/closeTab'
import { openNewDocument } from '@/features/shell/newDocument'
import { importOtioz } from '@/features/shell/otioImport'
import { revealChat } from '@/features/assistant/components/Assistant/Toast/revealChat'
import { applyWorkspaceMove } from '@/helpers/applyWorkspaceMove'
import { getBridge } from '@/services/bridge'
import { commandScopeIsArmed, publishCommand } from '@/services/commandBus'
import { reportFailure, traceFailure } from '@/services/diagnostics'
import { useDictation } from '@/stores/dictation'
import { useDocuments } from '@/stores/documents'
import { toolSurface, useLayouts } from '@/stores/layouts'
import { useProject } from '@/stores/project'
import { panelsStore } from '@/stores/panels'

/**
 * Where a command goes, and whether anything took it — one router for the three doors that fire
 * one: the native menu, the assistant, and an MCP client on the other side of the machine.
 *
 * `nothingToDo` is told apart from `noSurface` because a caller reads them differently: a space
 * already at the end of the bar is not a studio showing the wrong thing.
 */
export type CommandRouting = 'ran' | 'noSurface' | 'nothingToDo' | 'noBridge' | 'failed'

/** `ran`, with what the surface CREATED when the command made something — see `CommandAnswer`. */
export type RoutedCommand = CommandRouting | Record<string, unknown>

/** Runs it through the bridge, or says the window has none — a mirror, a test with no preload. */
async function through(
  command: CommandId,
  run: (bridge: StudioBridge) => Promise<unknown>,
): Promise<CommandRouting> {
  const bridge = getBridge()
  if (!bridge) return 'noBridge'

  // Traced rather than journalled: these cross to the main process and throw their answer away,
  // which is the one case `shell.dropped` names — and no scope of the journal fits a command.
  return await ranOrFailed(run(bridge), error => traceFailure('shell.dropped', command, error))
}

/**
 * Awaited, and answered on.
 *
 * 🛑 Every one of these used to be a `void`, so `ran` meant "it was started": a ⌘S that threw was
 * announced as done with one line in the journal nobody reads, and a client reading the tabs back
 * still saw the document modified. What is awaited here is what the caller is told about.
 */
async function ranOrFailed(
  work: Promise<unknown>,
  report: (error: unknown) => void,
): Promise<CommandRouting> {
  try {
    await work
    return 'ran'
  } catch (error) {
    report(error)
    return 'failed'
  }
}

/** The space the bar would move: the one in front, since a command names no other. */
function moveActiveSpace(move: 'left' | 'right'): CommandRouting {
  return applyWorkspaceMove(useLayouts.getState().activeWorkspace, move) ? 'ran' : 'nothingToDo'
}

/**
 * Push-to-talk with neither half, so it starts and stops rather than holding.
 *
 * NOT `setHeld`: outside push-to-talk that one acts on the press alone, so a release asked for
 * from here did nothing at all while the caller was told it ran.
 */
async function toggleDictation(command: CommandId): Promise<CommandRouting> {
  const dictation = useDictation.getState()

  return await ranOrFailed(
    dictation.state === 'listening' ? dictation.stop() : dictation.start(),
    error => traceFailure('shell.dropped', command, error),
  )
}

function runProjectCommand(command: CommandId): CommandRouting | null {
  if (command === 'project.new') {
    void useProject.getState().createPicked()
    return 'ran'
  }
  if (command === 'project.open') {
    void useProject.getState().openPicked()
    return 'ran'
  }
  if (command === 'montage.import') {
    void importOtioz()
    return 'ran'
  }
  return null
}

async function runDocumentCommand(command: CommandId): Promise<CommandRouting | null> {
  if (command === 'document.close') {
    const tabId = closableTabId()
    if (tabId === null) return 'noSurface'
    closeTab(tabId)
    return 'ran'
  }
  if (command !== 'document.save' && command !== 'document.saveAs') return null
  const documentId = useDocuments.getState().activeId
  if (!documentId) return 'noSurface'
  // 🛑 A file view is not in `documents`, so `saveDocument` found nothing and answered `false`
  // without a word: ⌘S over a control map did nothing while the menu row promised it would, and
  // the editor grew a save button of its own to work around it. `saveAs` is not offered at all —
  // a file view IS its path, and the menu greys the row rather than failing here.
  if (panelIsFileView(documentId)) {
    const save = fileViewSave(documentId)
    if (!save || command === 'document.saveAs') return 'noSurface'
    return await ranOrFailed(save(), error => reportFailure('document.save', documentId, error))
  }
  // The `false` these answer stays `ran`: it says BOTH "nothing to write" and "the person said no
  // to the overwrite question", and calling either one a failure would send a client back to
  // retry a save it was never owed. Only a throw is a failure.
  return await ranOrFailed(
    command === 'document.save' ? saveDocument(documentId) : saveDocumentAs(documentId),
    error => reportFailure('document.save', documentId, error),
  )
}

/**
 * The commands the application performs itself, having no surface that listens for them.
 *
 * `null` means "not one of mine", which is the answer for everything a document owns.
 */
async function runHere(command: CommandId): Promise<CommandRouting | null> {
  const project = runProjectCommand(command)
  if (project) return project
  const document = await runDocumentCommand(command)
  if (document) return document
  switch (command) {
    case 'layout.reset':
      panelsStore.getState().reset()
      return 'ran'
    // The one door for both, and the surface only orders what it offers: a project is makeable
    // from anywhere, and so is every kind of document.
    case 'app.new':
      void openNewDocument(toolSurface())
      return 'ran'
    // The section the window opens on when nothing named one — the same one its own row opens.
    case 'app.settings':
      return await through(command, bridge => bridge.settings.open('general'))
    case 'window.fullScreen':
      return await through(command, bridge => bridge.window.toggleFullScreen())
    case 'app.assistant':
      return revealChat() ? 'ran' : 'noSurface'
    case 'app.dictate':
      return await toggleDictation(command)
    case 'spaces.moveLeft':
      return moveActiveSpace('left')
    case 'spaces.moveRight':
      return moveActiveSpace('right')
    default:
      return null
  }
}

/**
 * Fires one command wherever it belongs, and says whether it landed — which an MCP client needs
 * and a menu row does not: `publishCommand` is memoryless, so a command sent while nothing of
 * that scope is mounted vanishes in silence.
 */
export async function routeCommand(command: CommandId): Promise<RoutedCommand> {
  const here = await runHere(command)
  if (here) return here

  // The lookup takes a string, so the type cannot know a `CommandId` is always declared. Anything
  // left here belongs to a surface: `runHere` answers for every `global` and `spaces` command.
  const descriptor = commandDescriptor(command)
  if (!descriptor || !commandScopeIsArmed(descriptor.scope)) return 'noSurface'

  // A surface that took it and had nothing to do is not a studio showing the wrong thing — the
  // very distinction `nothingToDo` was written for, and which nothing used to reach.
  const answer = publishCommand(command)
  return answer === false ? 'nothingToDo' : answer === true ? 'ran' : answer
}
