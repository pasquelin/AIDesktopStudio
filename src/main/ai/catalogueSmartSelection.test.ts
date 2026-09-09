import { describe, expect, it } from 'vitest'
import { aiRoleId } from '@shared/domain/aiRole'
import { shippedModel, shippedModelsFor } from './catalogue'

describe('Smart Select catalogue', () => {
  it('pins the two ONNX artifacts', () => {
    expect(shippedModel('efficient-sam-ti')).toMatchObject({
      loader: 'onnx-runtime',
      format: 'onnx',
      licence: 'Apache-2.0',
      files: [
        {
          role: 'encoder',
          name: 'efficientsam_ti_encoder.onnx',
          sha256: '84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951',
        },
        {
          role: 'decoder',
          name: 'efficientsam_ti_decoder.onnx',
          sha256: 'a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11',
        },
      ],
    })
  })

  it('offers EfficientSAM to the background removal settings role', () => {
    expect(
      shippedModelsFor(aiRoleId('background-removal', 'cutout')).map(model => model.id),
    ).toEqual(['efficient-sam-ti'])
  })
})
