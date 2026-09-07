import { orElse } from '@shared/promises'
import { pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS, type FolderRole } from '@shared/domain/folderRole'
import { ANIMATION_GRAPH_EXTENSION } from '@shared/domain/animationGraph'
import { animationGraphPreset, type AnimationPresetId } from '@shared/domain/animationPresets'
import { INPUT_MAP_EXTENSION } from '@shared/domain/inputMap'
import { inputMapPreset, type InputPresetId } from '@shared/domain/inputPresets'
import { documentPathFor } from '@shared/domain/documentName'
import type { SceneTemplateId } from '@shared/domain/sceneTemplate'
import { TEMPLATE_SCRIPT_SOURCES, type TemplateScriptId } from '@shared/domain/templateScript'
import { getBridge } from '@/services/bridge'
import { scriptRefAt, useCode } from '@/stores/code'
import { useDocuments } from '@/stores/documents'

/**
 * What each template plays with — the script its pilot carries, and the context that drives it.
 *
 * `Record` rather than `Partial`, as `TEMPLATES_BY_GROUP` is: a template that plays nothing says
 * so by `null`, so a new id is a compile error instead of a scene that silently seeds no files.
 */
const PLAYED: Record<
  SceneTemplateId,
  { script: TemplateScriptId; map: InputPresetId; graph?: AnimationPresetId } | null
> = {
  empty: null,
  basic: null,
  photoStudio: null,
  cinematic: null,
  archvis: null,
  postProcessing: null,
  firstPerson: { script: 'player', map: 'character', graph: 'character' },
  thirdPerson: { script: 'player', map: 'character', graph: 'character' },
  topDown: { script: 'player', map: 'character', graph: 'character' },
  car: { script: 'car', map: 'vehicle' },
  plane: { script: 'plane', map: 'flight' },
}

/** Folders a template just wrote, so the scene's components can name the same paths. */
export type SeededTemplateFiles = { scripts: string; graph?: string }

/**
 * The files a scene template lays down beside itself: the control map its actions are bound by,
 * and the script its pilot carries.
 *
 * 🛑 A template SHOWS. The runtime walks and drives off its own contexts with no file at all, so
 * none of this is needed to PLAY — it is needed to be read, opened and changed.
 *
 * Never overwritten: a second scene from the same template joins the files the first laid down,
 * which is what makes a control map a project's rather than a scene's.
 */
export async function seedTemplateFiles(template: SceneTemplateId): Promise<SeededTemplateFiles> {
  const played = PLAYED[template]
  const bridge = getBridge()
  const scripts = await orElse(bridge?.project.folderFor('code'), DEFAULT_ROLE_PATHS.code)
  if (!played || !bridge) return { scripts }

  const [, , graph] = await Promise.all([
    seedPreset('input', INPUT_MAP_EXTENSION, played.map, bridge.inputMaps, {
      ...structuredClone(inputMapPreset(played.map)),
      id: played.map,
    }),
    writeScript(played.script, scripts),
    played.graph
      ? seedPreset(
          'animations',
          ANIMATION_GRAPH_EXTENSION,
          played.graph,
          bridge.animationGraphs,
          structuredClone(animationGraphPreset(played.graph)),
        )
      : Promise.resolve(undefined),
  ])
  await useDocuments.getState().relist()
  return graph ? { scripts, graph } : { scripts }
}

/**
 * One preset written where its role says, and never overwritten.
 *
 * 🛑 Asked BEFORE writing: both stores overwrite, so a second scene from one template would throw
 * away whatever the first one's author had changed. What makes a control map or a graph belong to
 * the PROJECT rather than to the scene that laid it down.
 */
async function seedPreset<T>(
  role: FolderRole,
  extension: string,
  name: string,
  files: { list: () => Promise<string[]>; write: (path: string, value: T) => Promise<boolean> },
  value: T,
): Promise<string | undefined> {
  const folder = await orElse(getBridge()?.project.folderFor(role), DEFAULT_ROLE_PATHS[role])
  const path = pathIn(folder, `${name}${extension}`)
  const taken = await orElse(files.list(), [])
  if (taken.some(one => one.toLowerCase() === path.toLowerCase())) return path

  return (await files.write(path, value)) ? path : undefined
}

async function writeScript(script: TemplateScriptId, folder: string): Promise<void> {
  const bridge = getBridge()
  if (!bridge) return
  const path = documentPathFor(script, 'script', folder)
  // 🛑 Asked BEFORE writing, as `writeMap` asks for its own: `game.writeScript` OVERWRITES, so a
  // second scene from one template threw away whatever the first one's author had written in it.
  const held = await orElse(bridge.game.scripts(), [])
  if (held.some(one => one.path.toLowerCase() === path.toLowerCase())) return

  const source = TEMPLATE_SCRIPT_SOURCES[script]
  await bridge.game.writeScript(path, source)
  // 🛑 Told to the editor's own store, which is what the inspector reads: without it the script
  // this very function just wrote reads as missing in the field that points at it.
  useCode.getState().installed(scriptRefAt(path), source)
}
