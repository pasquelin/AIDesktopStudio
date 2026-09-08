import { localModelReady } from '@/helpers/modelForCapability'
import { useAiModels } from '@/stores/aiModels'

/**
 * Whether a model of THIS machine is installed and usable, subscribed — for a tool armed on the
 * bar only when what runs it is actually there.
 *
 * 🛑 The ANSWER, never `state.overview` itself: the manager republishes the whole overview per
 * percent of a load, and a subscription to the object redraws the bar with it. A boolean compares
 * by value, so an identical republish stops here.
 */
export function useLocalModelReady(modelId: string): boolean {
  return useAiModels(state => localModelReady(modelId, state.overview))
}
