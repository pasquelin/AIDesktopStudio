import type { AutoRigInferenceRequest, AutoRigInferenceResult } from './domain/autoRigInference'

export type StudioBridgeAutoRig = {
  autoRig: {
    run: (request: AutoRigInferenceRequest) => Promise<AutoRigInferenceResult>
  }
}
