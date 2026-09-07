import type {
  AutoRigInferenceOptions,
  AutoRigInferenceResult,
} from '@shared/domain/autoRigInference'
import { AutoRigService } from './autoRig'
import { makeItAnimatableBackend } from './makeItAnimatableBackend'
import { simpleAutoRigBackend } from './simpleAutoRigBackend'
import type { AutoRigBackend } from './autoRig'

type AutoRigInput = AutoRigInferenceOptions

export function autoRigServiceFor(
  runSimple: AutoRigBackend<AutoRigInput>['run'],
  infer: (
    backendId: string,
    options: AutoRigInferenceOptions,
    signal: AbortSignal,
  ) => Promise<AutoRigInferenceResult>,
): AutoRigService<AutoRigInput> {
  return new AutoRigService([
    simpleAutoRigBackend(runSimple),
    makeItAnimatableBackend((input, signal) => infer('make-it-animatable', input, signal)),
  ])
}
