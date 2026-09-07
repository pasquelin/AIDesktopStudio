import { inputMapOf } from '@shared/domain/inputMap'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { InputMapStore } from './inputMaps'

export function registerInputMapHandlers(maps: InputMapStore): void {
  handle(CHANNELS.inputMapList, () => maps.list())
  handle(CHANNELS.inputMapRead, (_event, path) => maps.read(path))
  handle(CHANNELS.inputMapWrite, (_event, path, map) => maps.write(path, inputMapOf(map)))
}
