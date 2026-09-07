import { animationGraphOf } from '@shared/domain/animationGraph'
import { CHANNELS } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import type { AnimationGraphStore } from './animationGraphs'

export function registerAnimationGraphHandlers(graphs: AnimationGraphStore): void {
  handle(CHANNELS.animationGraphList, () => graphs.list())
  handle(CHANNELS.animationGraphRead, (_event, path) => graphs.read(path))
  handle(CHANNELS.animationGraphWrite, (_event, path, graph) =>
    graphs.write(path, animationGraphOf(graph)),
  )
}
