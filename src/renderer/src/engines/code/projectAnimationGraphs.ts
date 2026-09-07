// SPDX-License-Identifier: MIT
import type { AnimationGraphModule } from '@shared/domain/animationGraph'
import { getBridge } from '@/services/bridge'
import { projectModulesOf } from './projectModules'

export async function projectAnimationGraphs(): Promise<AnimationGraphModule[]> {
  const read = await projectModulesOf(getBridge()?.animationGraphs)

  return read.map(held => ({ path: held.path, graph: held.value }))
}
