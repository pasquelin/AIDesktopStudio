import { aiRoleId } from '@shared/domain/aiRole'
import { describe, expect, it } from 'vitest'
import { localFieldsOf, outputExtensionOf } from '@shared/domain/localFields'
import { shippedModelsFor } from './catalogue'

describe('local motion generation', () => {
  it('offers the shared motion form and standard animation output', () => {
    const model = shippedModelsFor(aiRoleId('3d', 'motion')).find(one => one.modality === 'motion')
    expect(model).toBeDefined()
    expect(outputExtensionOf('motion')).toBe('glb')
    expect(localFieldsOf('motion', {}, key => key).map(field => field.key)).toEqual([
      'prompt',
      'seconds',
      'steps',
      'seed',
    ])
  })
})
