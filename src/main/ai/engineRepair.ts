import { isNvidia, type HardwareFacts } from './hardwareProbe'
import { installEngineLibraries } from './installEngineLibraries'
import type { ManagerDeps } from './managerTypes'
import { notAnswering } from './pythonRuntime'
import type { PythonSupervisor } from './pythonSupervisor'
import { spawnLines } from './spawnLines'

/**
 * What the manager asks of the DOOR's environment: what it lacks, and the run that repairs it.
 *
 * Wiring, and held together on purpose: the two closures read the same engine client, one after
 * the other on every repair, and this is where the machine's card is turned into an answer —
 * `installEngineLibraries` is handed that answer and never allowed to probe for it.
 */
export function engineRepairDeps(deps: {
  readonly supervisor: PythonSupervisor
  /** The embedded interpreter — `bundledEngine().python`. Never the computer's own. */
  readonly python: () => string
  readonly platform: NodeJS.Platform
  readonly facts: () => Promise<HardwareFacts>
  /**
   * Free bytes where the interpreter lives, `null` when unreadable. Handed in rather than read:
   * this module names no volume, and `HardwareFacts.diskFreeBytes` answers for the weights.
   */
  readonly freeBytes: () => Promise<number | null>
}): Pick<ManagerDeps, 'engineMissing' | 'installEngine'> {
  return {
    engineMissing: async profile => {
      const client = await deps.supervisor.engine()
      if (!client) return null
      const { absent, stale, torchCuda } = await client.requirements(profile)
      return { missing: [...absent, ...stale].map(one => one.name), torchCuda }
    },
    installEngine: async (onProgress, signal, profile) => {
      const client = await deps.supervisor.engine()
      if (!client) throw notAnswering(deps.supervisor.whyNot())
      // Together: the machine reading is `getGPUInfo` plus a disk stat, the declaration is a round
      // trip to the Python process, and neither waits on the other.
      const [machine, environment] = await Promise.all([deps.facts(), client.requirements(profile)])

      return installEngineLibraries({
        python: deps.python(),
        platform: deps.platform,
        // What separates a 682 MB install from a 2.6 GB one, read once and handed over.
        hasNvidia: isNvidia(machine.gpu),
        freeBytes: deps.freeBytes,
        declaration: environment.declaration,
        spawn: spawnLines,
        onProgress,
        signal,
      })
    },
  }
}
