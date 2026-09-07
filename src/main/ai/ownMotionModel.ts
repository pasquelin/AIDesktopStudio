import { steppedProgress, type TaskWatch } from '@shared/domain/taskProgress'
import { aiRoleId } from '@shared/domain/aiRole'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { LocalModel, ModelFile } from '@shared/domain/localModel'
import { shippedModelsFor } from './catalogue'
import { fingerprintModelFile } from './modelInstall'
import { ownModelId } from './ownModel'

export type OwnMotionModelDeps = {
  readJson: (path: string) => Promise<unknown>
  sizeOf: (path: string) => Promise<number>
  fingerprint: (
    path: string,
    signal?: AbortSignal,
    onBytes?: (bytes: number) => void,
  ) => Promise<{ bytes: number; sha256: string }>
}

const disk: OwnMotionModelDeps = {
  readJson: async path => {
    if ((await stat(path)).size > 2_000_000) throw new Error('oversized local model configuration')
    return JSON.parse(await readFile(path, 'utf8'))
  },
  sizeOf: async path => (await stat(path)).size,
  fingerprint: (path, signal, onBytes) =>
    fingerprintModelFile(source => createReadStream(source), path, signal, onBytes),
}
const shardName = z.string().regex(/^model-[0-9]+-of-[0-9]+\.safetensors$/)
const indexSchema = z.object({ weight_map: z.record(z.string(), shardName) })
const encoderSchema = z.object({
  model_type: z.literal('llama'),
  hidden_size: z.literal(4096),
  num_hidden_layers: z.literal(32),
})

export async function ownMotionModelFrom(
  path: string,
  licencesAccepted: boolean,
  deps: OwnMotionModelDeps = disk,
  watch?: TaskWatch,
): Promise<LocalModel> {
  watch?.signal?.throwIfAborted()
  if (!licencesAccepted) throw new Error('motion model licence acceptance is required')
  const template = shippedModelsFor(aiRoleId('3d', 'motion')).find(
    model => model.modality === 'motion',
  )
  if (!template) throw new Error('motion model manifest is unavailable')
  const folder = resolve(path)
  const shards = await encoderShards(folder, deps)
  const files = await fingerprintFiles(folder, template.files, shards, deps, watch)
  watch?.signal?.throwIfAborted()
  return {
    ...template,
    id: ownModelId(folder),
    backendId: template.id,
    rank: 3,
    weightsPath: folder,
    files,
    diskBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    runtimeStatus: 'supported',
    distributionStatus: 'public',
    distribution: 'user-import',
  }
}

async function encoderShards(folder: string, deps: OwnMotionModelDeps): Promise<string[]> {
  const index = indexSchema.parse(
    await deps.readJson(join(folder, 'encoder/model.safetensors.index.json')),
  )
  encoderSchema.parse(await deps.readJson(join(folder, 'encoder/config.json')))
  const shards = [...new Set(Object.values(index.weight_map))]
  if (shards.length === 0 || shards.length > 16) throw new Error('invalid local encoder shards')
  return shards
}

async function fingerprintFiles(
  folder: string,
  expectedFiles: readonly ModelFile[],
  shards: readonly string[],
  deps: OwnMotionModelDeps,
  watch?: TaskWatch,
): Promise<ModelFile[]> {
  const names = [...expectedFiles.map(file => file.name), ...encoderNames(shards)]
  const sizes = await Promise.all(names.map(name => deps.sizeOf(join(folder, name))))
  const report = steppedProgress(
    sizes.reduce((sum, size) => sum + size, 0),
    watch?.onStep,
  )
  const files: ModelFile[] = []
  for (const name of names) {
    watch?.signal?.throwIfAborted()
    const actual = await deps.fingerprint(join(folder, name), watch?.signal, report)
    const expected = expectedFiles.find(file => file.name === name)
    files.push(verifiedFile(name, actual, expected))
  }
  return files
}

function verifiedFile(
  name: string,
  actual: { bytes: number; sha256: string },
  expected?: ModelFile,
): ModelFile {
  if (expected && (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256)) {
    throw new Error(`local model integrity check failed: ${name}`)
  }
  if (actual.bytes <= 0 || !/^[a-f0-9]{64}$/.test(actual.sha256)) {
    throw new Error(`invalid local model file: ${name}`)
  }
  return expected ?? { role: 'encoder', name, url: 'local://user-import', ...actual }
}

function encoderNames(shards: readonly string[]): string[] {
  return [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'model.safetensors.index.json',
    ...shards,
  ].map(name => `encoder/${name}`)
}
