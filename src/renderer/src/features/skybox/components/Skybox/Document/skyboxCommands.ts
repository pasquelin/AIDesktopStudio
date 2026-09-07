import type { CommandId } from '@shared/domain/command'
import { runHistoryCommand } from '@/services/historyCommand'
import { skyboxStore } from '@/stores/skyboxes'
import { skyboxViewOf, useSkyboxViews } from '@/stores/skyboxViews'

/** The commands of the sky, reached the same way from the viewport and from a headless run. */
export function runSkyboxCommand(documentId: string, command: CommandId): boolean {
  switch (command) {
    case 'skybox.view':
      // Cycles rather than one key per view: four modes, and a key each would spend four
      // letters on a space that has two other things to offer.
      useSkyboxViews.getState().cycleView(documentId)
      return true
    case 'skybox.probes': {
      const views = useSkyboxViews.getState()
      views.set(documentId, { probes: !skyboxViewOf(views, documentId).probes })
      return true
    }
    default:
      return runHistoryCommand(skyboxStore, 'skybox', documentId, command) ?? false
  }
}
