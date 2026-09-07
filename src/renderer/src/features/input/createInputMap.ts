import { orElse } from '@shared/promises'
import { fileViewOf } from '@shared/domain/fileView'
import { nameOf, pathIn } from '@shared/domain/folder'
import { DEFAULT_ROLE_PATHS } from '@shared/domain/folderRole'
import { INPUT_MAP_EXTENSION } from '@shared/domain/inputMap'
import { inputMapPreset, type InputPresetId } from '@shared/domain/inputPresets'
import { openFileView } from '@/features/shell/components/dockviewApi'
import { getBridge } from '@/services/bridge'

function availablePath(preset: InputPresetId, folder: string, paths: readonly string[]): string {
  const occupied = new Set(paths.map(path => path.toLowerCase()))
  let copy = 1
  let path = pathIn(folder, `${preset}${INPUT_MAP_EXTENSION}`)
  while (occupied.has(path.toLowerCase())) {
    copy += 1
    path = pathIn(folder, `${preset}-${copy}${INPUT_MAP_EXTENSION}`)
  }
  return path
}

export async function createInputMapFromPreset(preset: InputPresetId): Promise<string | null> {
  const bridge = getBridge()
  if (!bridge) return null
  // ASKED, never composed: only the main process reads the markers, so only it knows where the
  // folder went after a rename — and asking is what lays it back down, marked.
  const folder = await orElse(bridge.project.folderFor('input'), DEFAULT_ROLE_PATHS.input)
  const path = availablePath(preset, folder, await bridge.inputMaps.list())
  const map = {
    ...structuredClone(inputMapPreset(preset)),
    // The FILE names the context, folder left out: a map moved to another folder would otherwise
    // rename the context every scene of the project resolves its actions against.
    id: nameOf(path).slice(0, -INPUT_MAP_EXTENSION.length),
  }
  if (!(await bridge.inputMaps.write(path, map))) return null
  const view = fileViewOf(path)
  if (!view) return null
  openFileView(view)
  return path
}
