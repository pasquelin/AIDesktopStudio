import type { CommandId } from '@shared/domain/command'
import { runHistoryCommand } from '@/services/historyCommand'
import { audioEditStore } from '@/stores/audioEdits'
import { sequenceStore } from '@/stores/sequences'

/**
 * The commands of a take, reached the same way from the tab and from a headless run. The chain
 * over the take answers while it has anything to give back, the sound montage under it otherwise.
 */
export function runAudioCommand(documentId: string, command: CommandId): boolean {
  const chain = runHistoryCommand(audioEditStore, 'audio', documentId, command)
  if (chain === null) return false
  return chain || (runHistoryCommand(sequenceStore, 'audio', documentId, command) ?? false)
}
