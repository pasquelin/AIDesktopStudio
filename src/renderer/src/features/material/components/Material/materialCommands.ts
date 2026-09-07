import type { CommandId } from '@shared/domain/command'
import { runHistoryCommand } from '@/services/historyCommand'
import { materialStore } from '@/stores/materials'

/** The commands of a material, reached the same way from the tab and from a headless run. */
export const runMaterialCommand = (documentId: string, command: CommandId): boolean =>
  runHistoryCommand(materialStore, 'material', documentId, command) ?? false
