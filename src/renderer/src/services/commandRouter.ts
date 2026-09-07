import { commandDescriptor, type CommandId } from '@shared/domain/command'
import type { StudioBridge } from '@shared/ipc'
import { saveDocument, saveDocumentAs } from '@/features/shell/documentIo'
import { closableTabId } from '@/features/shell/components/dockviewApi'
import { closeTab } from '@/features/shell/components/Document/Tab/closeTab'
import { openNewDocument } from '@/features/shell/newDocument'
import { importOtioz } from '@/features/shell/otioImport'
import { revealChat } from '@/features/assistant/components/Assistant/Toast/revealChat'
import { applyWorkspaceMove } from '@/helpers/applyWorkspaceMove'
import { getBridge } from '@/services/bridge'
import { commandScopeIsArmed, publishCommand } from '@/services/commandBus'
import { reportFailure } from '@/services/diagnostics'
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
export type CommandRouting = 'ran' | 'noSurface' | 'nothingToDo' | 'noBridge'

/** `ran`, with what the surface CREATED when the command made something — see `CommandAnswer`. */
export type RoutedCommand = CommandRouting | Record<string, unknown>

/** Runs it through the bridge, or says the window has none — a mirror, a test with no preload. */
function through(run: (bridge: StudioBridge) => void): CommandRouting {
  const bridge = getBridge()
  if (!bridge) return 'noBridge'

  run(bridge)
  return 'ran'
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
function toggleDictation(): CommandRouting {
  const dictation = useDictation.getState()
  void (dictation.state === 'listening' ? dictation.stop() : dictation.start())
  return 'ran'
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

function runDocumentCommand(command: CommandId): CommandRouting | null {
  if (command === 'document.close') {
    const tabId = closableTabId()
    if (tabId === null) return 'noSurface'
    closeTab(tabId)
    return 'ran'
  }
  if (command !== 'document.save' && command !== 'document.saveAs') return null
  const documentId = useDocuments.getState().activeId
  if (!documentId) return 'noSurface'
  if (command === 'document.save') {
    void saveDocument(documentId).catch(error => reportFailure('document.save', documentId, error))
  } else {
    void saveDocumentAs(documentId)
  }
  return 'ran'
}

/**
 * The commands the application performs itself, having no surface that listens for them.
 *
 * `null` means "not one of mine", which is the answer for everything a document owns.
 */
function runHere(command: CommandId): CommandRouting | null {
  const project = runProjectCommand(command)
  if (project) return project
  const document = runDocumentCommand(command)
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
      return through(bridge => void bridge.settings.open('general'))
    case 'window.fullScreen':
      return through(bridge => void bridge.window.toggleFullScreen())
    case 'app.assistant':
      return revealChat() ? 'ran' : 'noSurface'
    case 'app.dictate':
      return toggleDictation()
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
export function routeCommand(command: CommandId): RoutedCommand {
  const here = runHere(command)
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
