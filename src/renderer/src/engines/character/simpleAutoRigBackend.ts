import type { AutoRigBackend } from './autoRig'

export function simpleAutoRigBackend<Input>(
  run: AutoRigBackend<Input>['run'],
): AutoRigBackend<Input> {
  return {
    id: 'simple',
    requiresModel: false,
    modelIds: [],
    devices: ['cpu'],
    experimental: false,
    capabilities: {
      target: 'humanoid',
      skeleton: true,
      skinWeights: true,
      fingers: false,
      local: true,
    },
    run,
  }
}
