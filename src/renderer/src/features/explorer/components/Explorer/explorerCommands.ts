import type { CommandId } from '@shared/domain/command'
import { touchesDocuments, type FileOutcome } from '@shared/domain/fileOp'
import { getBridge } from '@/services/bridge'
import type { CommandAnswer } from '@/services/commandBus'
import { useDocuments } from '@/stores/documents'
import { useFileClipboard } from '@/stores/fileClipboard'
import { selectedFilePaths, useSelection } from '@/stores/selection'
export type ExplorerCommandContext = {
  into: string
  folderName: string
  settle?: (outcome: FileOutcome) => void
}
export function settleFileOutcome(outcome: FileOutcome): void {
  if (touchesDocuments(outcome.done)) void useDocuments.getState().relist()
}
async function settled(outcome: Promise<FileOutcome>, settle?: (outcome: FileOutcome) => void) {
  const done = await outcome
  settleFileOutcome(done)
  settle?.(done)
}
type ExplorerExecution = {
  bridge: NonNullable<ReturnType<typeof getBridge>>['project']
  paths: string[]
  held: ReturnType<typeof useFileClipboard.getState>
  into: string
  folderName: string
  settle?: (outcome: FileOutcome) => void
}
function runClipboardCommand(command: CommandId, execution: ExplorerExecution): boolean | null {
  const { bridge, paths, held, into, settle } = execution
  if (command === 'explorer.cut' || command === 'explorer.copy') {
    if (paths.length === 0) return false
    held.hold(paths, command === 'explorer.cut')
    return true
  }
  if (command !== 'explorer.paste') return null
  if (held.paths.length === 0) return false
  void settled(bridge.pasteFiles(held.paths, into, held.cut), settle)
  if (held.cut) held.clear()
  return true
}
function runFileCommand(command: CommandId, execution: ExplorerExecution): boolean | null {
  const { bridge, paths, into, folderName, settle } = execution
  const operations: Partial<Record<CommandId, () => Promise<FileOutcome>>> = {
    'explorer.newFolder': () => bridge.newFolder(into, folderName),
    'explorer.undo': () => bridge.undoFile(),
    'explorer.redo': () => bridge.redoFile(),
    'explorer.duplicate': () => bridge.duplicateFiles(paths),
    'explorer.trash': () => bridge.trashFiles(paths),
  }
  const operation = operations[command]
  if (!operation) return null
  if ((command === 'explorer.duplicate' || command === 'explorer.trash') && paths.length === 0)
    return false
  void settled(operation(), settle)
  return true
}
export function runExplorerCommand(
  command: CommandId,
  { into, folderName, settle }: ExplorerCommandContext,
): CommandAnswer {
  const bridge = getBridge()?.project
  if (!bridge) return false
  const paths = selectedFilePaths(useSelection.getState())
  const held = useFileClipboard.getState()
  const execution = { bridge, paths: [...paths], held, into, folderName, settle }
  return runClipboardCommand(command, execution) ?? runFileCommand(command, execution) ?? false
}
