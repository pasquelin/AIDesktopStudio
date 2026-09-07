import type { AutoRigBackend } from './autoRig'
import { adaptMakeItAnimatable, type MakeItAnimatableOutput } from './makeItAnimatableAdapter'

export function makeItAnimatableBackend<Input>(
  infer: (input: Input, signal: AbortSignal) => Promise<MakeItAnimatableOutput>,
): AutoRigBackend<Input> {
  return {
    id: 'make-it-animatable',
    requiresModel: true,
    modelIds: ['make-it-animatable'],
    devices: ['mps', 'cpu'],
    experimental: true,
    platformSupport: [{ platform: 'darwin', architecture: 'arm64', status: 'available' }],
    capabilities: {
      target: 'humanoid',
      skeleton: true,
      skinWeights: true,
      fingers: true,
      local: true,
    },
    run: async (input, { signal, onProgress }) => {
      onProgress(0)
      const adaptation = adaptMakeItAnimatable(await infer(input, signal))
      if (adaptation.fault) throw new Error(`Make-It-Animatable output: ${adaptation.fault}`)
      onProgress(1)
      return adaptation.result
    },
  }
}
