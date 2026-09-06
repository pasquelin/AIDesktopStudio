import { aiRoleId, ASSISTANT_ROLE } from '@shared/domain/aiRole'
import { describe, expect, it, vi } from 'vitest'
import { ownMotionModelFrom, type OwnMotionModelDeps } from './ownMotionModel'
import { shippedModelsFor, modelsForWith } from './catalogue'

const fixture = () => {
  const publicModel = shippedModelsFor(aiRoleId('3d', 'motion'))[0]!
  const fingerprint = vi.fn(async (path: string) => {
    const file = publicModel.files.find(one => path.endsWith(`/${one.name}`))
    return { bytes: file?.bytes ?? 1000, sha256: file?.sha256 ?? 'a'.repeat(64) }
  })
  const deps: OwnMotionModelDeps = {
    readJson: async path =>
      path.endsWith('index.json')
        ? { weight_map: { weight: 'model-00001-of-00001.safetensors' } }
        : { model_type: 'llama', hidden_size: 4096, num_hidden_layers: 32 },
    fingerprint,
    sizeOf: async path => (await fingerprint(path)).bytes,
  }
  return { deps, fingerprint }
}

describe('locally supplied motion model', () => {
  it('requires explicit licence acceptance before reading the folder', async () => {
    const { deps, fingerprint } = fixture()
    await expect(ownMotionModelFrom('/models/motion', false, deps)).rejects.toThrow('licence')
    expect(fingerprint).not.toHaveBeenCalled()
  })
  it('records local fingerprints and exposes the installed model to its motion role', async () => {
    const { deps } = fixture()
    const model = await ownMotionModelFrom('/models/motion', true, deps)
    expect(model.backendId).toBe('kimodo-soma-rp-v1.1')
    expect(model.distributionStatus).toBe('public')
    expect(model.weightsPath).toBe('/models/motion')
    expect(model.files.some(file => file.name.startsWith('encoder/model-'))).toBe(true)
    expect(modelsForWith(aiRoleId('3d', 'motion'), [model])).toContain(model)
    expect(modelsForWith(ASSISTANT_ROLE, [model])).not.toContain(model)
  })
  it('stops hashing immediately on cancellation and reports byte progress', async () => {
    const { deps } = fixture()
    const controller = new AbortController()
    const onStep = vi.fn()
    let observed: AbortSignal | undefined
    deps.fingerprint = async (_path, signal, onBytes) => {
      observed = signal
      expect(onBytes).toBeTypeOf('function')
      onBytes?.(100)
      controller.abort()
      signal?.throwIfAborted()
      throw new Error('unreachable')
    }
    await expect(
      ownMotionModelFrom('/models/motion', true, deps, {
        signal: controller.signal,
        onStep,
      }),
    ).rejects.toThrow()
    expect(observed).toBe(controller.signal)
  })
  it('refuses escaped shard paths without fingerprinting external files', async () => {
    const { deps, fingerprint } = fixture()
    deps.readJson = async () => ({ weight_map: { weight: '../other.safetensors' } })
    await expect(ownMotionModelFrom('/models/motion', true, deps)).rejects.toThrow()
    expect(fingerprint).not.toHaveBeenCalled()
  })
  it('refuses modified public weights rather than claiming publisher provenance', async () => {
    const { deps } = fixture()
    deps.fingerprint = async () => ({ bytes: 1, sha256: 'b'.repeat(64) })
    await expect(ownMotionModelFrom('/models/motion', true, deps)).rejects.toThrow('integrity')
  })
})
