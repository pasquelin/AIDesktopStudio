import type { Scenario } from './run'
import { PROJECT_SCENARIOS } from './scenariosProject'
import { SCENE_SCENARIOS } from './scenariosScene'
import { MONTAGE_SCENARIOS } from './scenariosMontage'
import { IMAGE_SCENARIOS } from './scenariosImage'
import { GENERATION_SCENARIOS } from './scenariosGeneration'
import { LANGUAGE_SCENARIOS } from './scenariosLanguage'
import { PLANNING_SCENARIOS } from './scenariosPlanning'
import { SKY_SCENARIOS } from './scenariosSky'
import { CANVAS_SCENARIOS } from './scenariosCanvas'
import { REST_SCENARIOS } from './scenariosRest'
import { SHELL_SCENARIOS } from './scenariosShell'
import { GIT_SCENARIOS } from './scenariosGit'
import { POST_SCENARIOS } from './scenariosPost'
import { GAME_SCENARIOS } from './scenariosGame'
import { PLAY_SCENARIOS } from './scenariosPlay'
import { TIMELINE_SCENARIOS } from './scenariosTimeline'
import { ASSEMBLY_SCENARIOS } from './scenariosAssembly'
import { SCENES_SCENARIOS } from './scenariosScenes'
import { EXPORT_SCENARIOS } from './scenariosExport'
import { CODE_SCENARIOS } from './scenariosCode'
import { MEMORY_SCENARIOS } from './scenariosMemory'
import { PIXEL_ART_SCENARIOS } from './scenariosPixelArt'
import { OPTIMIZATION_SCENARIOS } from './scenariosOptimization'
import { COMMENT_SCENARIOS } from './scenariosComments'
import { PROJECT_FORMAT_SCENARIOS } from './scenariosProjectFormats'

/**
 * The batterie, as something the bench can run — one scenario per request of `BATTERIE.md`, in
 * its order. `batterie.test.ts` holds the two lists at the same length and in the same order,
 * which is the only thing that makes « on en est où ? » answerable.
 */
export const SCENARIOS: readonly Scenario[] = [
  ...PROJECT_SCENARIOS,
  ...SCENE_SCENARIOS,
  ...MONTAGE_SCENARIOS,
  ...IMAGE_SCENARIOS,
  ...GENERATION_SCENARIOS,
  ...LANGUAGE_SCENARIOS,
  ...PLANNING_SCENARIOS,
  ...SKY_SCENARIOS,
  ...CANVAS_SCENARIOS,
  ...REST_SCENARIOS,
  ...SHELL_SCENARIOS,
  ...GIT_SCENARIOS,
  ...POST_SCENARIOS,
  ...GAME_SCENARIOS,
  ...PLAY_SCENARIOS,
  ...TIMELINE_SCENARIOS,
  ...ASSEMBLY_SCENARIOS,
  ...SCENES_SCENARIOS,
  ...EXPORT_SCENARIOS,
  ...CODE_SCENARIOS,
  ...MEMORY_SCENARIOS,
  ...PIXEL_ART_SCENARIOS,
  ...OPTIMIZATION_SCENARIOS,
  ...COMMENT_SCENARIOS,
  ...PROJECT_FORMAT_SCENARIOS,
]
