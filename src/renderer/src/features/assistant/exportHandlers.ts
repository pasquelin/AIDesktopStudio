import { refused, type ActionOutcome } from '@shared/domain/assistant'
import {
  GEOMETRY_SIMPLIFICATIONS,
  NO_LOSSY_OPTIMIZATION,
  TEXTURE_COMPRESSIONS,
  TEXTURE_REDUCTIONS,
  hasVisualChanges,
  type LossyOptimization,
} from '@shared/domain/gameExport'
import { messageOf } from '@shared/guards'
import { exportGameProject, type GameExportFailure } from '@/game/gameExportCompiler'
import type { ActionHandlers } from './actionHandler'
import { boolOf, oneOf, textOf } from './actionInputs'

export const EXPORT_HANDLERS: ActionHandlers = {
  'game.export': exportGame,
}

async function exportGame(
  input: Record<string, unknown>,
  wire?: unknown,
  signal?: AbortSignal,
): Promise<ActionOutcome> {
  const folder = textOf(input, 'folder')
  if (wire && !folder)
    return refused(
      'nativeDialog',
      'with no "folder" named the studio raises a picker of the operating system, which a caller on the wire can neither fill nor read — name "folder" and send this again',
    )

  const lossyOptimization = lossyOptimizationOf(input)
  const entryScene = textOf(input, 'entryScene')
  const title = textOf(input, 'title')
  try {
    const result = await exportGameProject({
      lossyOptimization,
      signal,
      ...(folder ? { folder } : {}),
      ...(entryScene ? { entryScene } : {}),
      ...(title ? { title } : {}),
    })
    if (!result.ok) return refusalOf(result.reason, entryScene)
    return {
      ok: true,
      data: {
        ...result.outcome,
        visualChanges: hasVisualChanges(lossyOptimization) ? 'POSSIBLE' : 'NONE',
        troubles: result.troubles,
      },
    }
  } catch (error) {
    return refused('failed', messageOf(error))
  }
}

function lossyOptimizationOf(input: Record<string, unknown>): LossyOptimization {
  return {
    generateLods: boolOf(input, 'generateLods'),
    geometrySimplification:
      oneOf(input, 'geometrySimplification', GEOMETRY_SIMPLIFICATIONS) ??
      NO_LOSSY_OPTIMIZATION.geometrySimplification,
    textureCompression:
      oneOf(input, 'textureCompression', TEXTURE_COMPRESSIONS) ??
      NO_LOSSY_OPTIMIZATION.textureCompression,
    textureReduction:
      oneOf(input, 'textureReduction', TEXTURE_REDUCTIONS) ??
      NO_LOSSY_OPTIMIZATION.textureReduction,
  }
}

/** Exhaustive on purpose: a sixth failure used to come out as « no folder was picked », untrue. */
function refusalOf(reason: GameExportFailure, entryScene: string | null) {
  switch (reason) {
    case 'noBridge':
      return refused('noBridge', 'this window is not connected to the studio process')
    case 'noProject':
      return refused(
        'noProject',
        'no project is open, and a game is exported out of one — projects.list answers what there is, and project.open opens one',
      )
    case 'noScene':
      return refused('badInput', 'this project holds no scene to export')
    case 'unknownScene':
      return refused('badInput', `no scene named "${entryScene ?? ''}"`)
    case 'declined':
      return refused(
        'declined',
        'no folder was picked, or the name is not one folder of the project',
      )
  }
}
