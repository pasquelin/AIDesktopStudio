import { describe, expect, it } from 'vitest'
import { engineRepairDeps } from './engineRepair'
import type { HardwareFacts } from './hardwareProbe'
import type { PythonClient } from './pythonClient'
import type { PythonSupervisor } from './pythonSupervisor'

const FACTS: HardwareFacts = {
  platform: 'linux',
  arch: 'x64',
  cpuCount: 8,
  physicalBytes: 0,
  freeBytes: null,
  diskFreeBytes: null,
  gpu: null,
  vram: null,
}

const ANSWERED = {
  extra: 'diffusion',
  declaration: ['torch>=2.6'],
  absent: [{ name: 'diffusers', wanted: '>=0.40' }],
  stale: [{ name: 'peft', wanted: '>=0.18', installed: '0.17.0' }],
  complete: false,
  torchCuda: false,
}

/** One method of the client is reached here; a whole one would be a fixture nobody reads. */
const clientAnswering = (): PythonClient =>
  ({ requirements: () => Promise.resolve(ANSWERED) }) as PythonClient

const repairFor = (client: PythonClient | null, whyNot: PythonSupervisor['whyNot'] = () => null) =>
  engineRepairDeps({
    supervisor: {
      engine: () => Promise.resolve(client),
      current: () => client,
      whyNot,
      dispose: () => {},
    },
    python: () => '/app/engine/python/bin/python3',
    platform: 'linux',
    facts: () => Promise.resolve(FACTS),
    freeBytes: () => Promise.resolve(null),
  })

describe('what the manager asks of the door’s environment', () => {
  /** Absent and older-than-declared ask for the same gesture, and the screen names one list. */
  it('folds what is absent and what is stale into one list, with the CUDA answer beside it', async () => {
    expect(await repairFor(clientAnswering()).engineMissing()).toEqual({
      missing: ['diffusers', 'peft'],
      torchCuda: false,
    })
  })

  /** `null` is "nothing has answered", which the screen shows as unknown and never as ready. */
  it('answers nothing at all when no engine answered', async () => {
    expect(await repairFor(null).engineMissing()).toBeNull()
  })

  /** Refused before pip: an install with no engine has no declaration to install against. */
  it('refuses to repair when the engine is not answering, and says why', async () => {
    const repair = repairFor(null, () => 'engine-missing')

    await expect(repair.installEngine(() => {}, new AbortController().signal)).rejects.toThrow(
      'engine-missing',
    )
  })
})
