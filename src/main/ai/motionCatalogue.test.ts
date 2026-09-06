import { aiRoleId } from '@shared/domain/aiRole'
import { describe, expect, it } from 'vitest'
import { localFieldsOf } from '@shared/domain/localFields'
import { shippedModelsFor } from './catalogue'

describe('local motion generation', () => {
  it('offers the shared motion form and standard animation output', () => {
    const model = shippedModelsFor(aiRoleId('3d', 'motion')).find(
      one => one.fieldProfile === 'motion',
    )
    expect(model).toBeDefined()
    expect(model?.outputExtension).toBe('glb')
    expect(localFieldsOf('mesh', {}, key => key, 'motion').map(field => field.key)).toEqual([
      'prompt',
      'seconds',
      'steps',
      'seed',
    ])
  })
})
