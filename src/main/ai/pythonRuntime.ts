import type { DownloadProgress, LocalModel } from '@shared/domain/localModel'
import type { RuntimeEndpointId } from '@shared/domain/aiRuntime'
import type { EngineFailure } from '@shared/domain/failure'
import type { PythonClient } from './pythonClient'
import type { EngineRequirements } from './pythonProtocol'
import type {
  FileRuntimeDeps,
  GenerateRequest,
  GenerateResult,
  LoadOptions,
  LocalRuntime,
  RuntimeReading,
} from './localRuntimes'
import { engineDoorOf, engineDoorOfEndpoint, fileRuntime } from './localRuntimes'

/**
 * The engine as a `LocalRuntime`. Installing stays in `modelInstall.ts`; this adds load, unload
 * and generate, and is handed PATHS the main process has already admitted.
 */

export type PythonRuntimeDeps = FileRuntimeDeps & {
  /** The model an attachment completes, so its folder can travel with the load. */
  baseOf: (model: LocalModel) => LocalModel | null
  /**
   * The engine, started on first ask. `null` once it has died too often to keep trying — which is
   * a runtime that is not answering, and says so, rather than a studio that freezes.
   */
  engine: () => Promise<PythonClient | null>
  /** The engine only if it is ALREADY running. Reading the catalogue must never start one. */
  running: () => PythonClient | null
  /** Why the engine will not come, once that is settled — the code a failed job then carries. */
  whyNot: () => EngineFailure | null
  log: (level: 'info' | 'warn', message: string) => void
  /** Called when a load or generation starts; the returned function runs when it ends. */
  onUsed?: (modelId: string) => (() => void) | void
}

/**
 * What a door needs to graft one set of weights onto another, or nothing at all.
 *
 * Answers nothing when the base is unknown rather than sending a half plan: a door handed an
 * attachment with no base to graft it onto would load neither, and say so from further away.
 */
function attachmentOf(model: LocalModel, base: LocalModel | null): Record<string, unknown> {
  if (!model.attaches || !base) return {}

  return {
    attachAs: model.attaches.as,
    attachSubfolder: model.attaches.subfolder,
    attachWeightName: model.attaches.weightName,
  }
}

/**
 * What is missing, named. A person can only act on names: "the door died" sends them to a log,
 * `torch, torchvision` sends them to the button that installs exactly those.
 */
function whatIsMissing(needs: EngineRequirements): string {
  const absent = needs.absent.map(one => one.name)
  const stale = needs.stale.map(one => `${one.name} ${one.installed} (needs ${one.wanted})`)
  return [...absent, ...stale].join(', ')
}

function profileOf(model: LocalModel): 'selection' | 'motion' | 'autorig' | 'diffusion' {
  if (model.loader === 'onnx-runtime') return 'selection'
  if (model.modality === 'motion') return 'motion'
  return model.backendId === 'make-it-animatable' ? 'autorig' : 'diffusion'
}

function doorOf(model: LocalModel): string {
  return model.loader === 'onnx-runtime' ? 'engine/selection' : engineDoorOf(model.modality)
}

/** The code when the supervisor knows why, so a failed job says "not installed", not "rejected". */
export function notAnswering(whyNot: EngineFailure | null): Error {
  return new Error(whyNot ?? 'the local AI engine is not answering')
}

export function pythonRuntime(deps: PythonRuntimeDeps): LocalRuntime {
  // Installing, removing and reading the disk are exactly what a file runtime does, and doing them
  // through the engine would put a second copy of `modelInstall` in Python.
  const files = fileRuntime(deps)

  /**
   * 🛑 A backend that counts no bytes never reaches the ledger, so a died door stays here until
   * the engine itself goes. Clearing the map on an empty ledger made the model unfreeable.
   */
  const held = new Map<string, string>()

  return {
    read: async (models): Promise<RuntimeReading> => {
      const onDisk = await files.read(models)
      // Never STARTED here: a reading runs on every window that connects, and forking costs
      // 28,8 ms to answer that nothing is loaded. `ready` follows the disk — installing needs
      // no Python process.
      const engine = deps.running()
      // Its processes went with it, so it holds nothing — a measurement, not an assumption.
      if (!engine) {
        held.clear()
        return { ...onDisk, loaded: new Set() }
      }

      // The LEDGER and never `worker.status`: the core answers this itself, where asking a door
      // would fork a Python process and pay 682 MB of imports to be told it holds nothing.
      try {
        // A door answering ZERO is a release confirmed. One that is ABSENT is not a denial —
        // a backend with no counter never appears here at all.
        for (const door of await engine.memory()) {
          if (door.heldBytes === 0) held.delete(door.door)
        }
      } catch (error) {
        deps.log('warn', `the engine answered nothing for its memory: ${String(error)}`)
      }

      return {
        ...onDisk,
        loaded: new Set(
          models.filter(model => [...held.values()].includes(model.id)).map(model => model.id),
        ),
      }
    },

    install: (model, onProgress: (progress: DownloadProgress) => void, signal) =>
      files.install(model, onProgress, signal),

    remove: model => files.remove(model),

    load: async (model: LocalModel, options: LoadOptions): Promise<number> => {
      const engine = await deps.engine()
      if (!engine) throw notAnswering(deps.whyNot())

      // Asked BEFORE the door is woken: a library that is absent fails as an `ImportError` three
      // frames inside a worker, which reaches the person as a door that died. The core answers
      // this off `.dist-info` folders, so it imports nothing and starts no process.
      const needs = await engine.requirements(profileOf(model))
      if (!needs.complete) {
        throw new Error(`the local AI engine is missing: ${whatIsMissing(needs)}`)
      }

      const done = deps.onUsed?.(model.id)
      try {
        const door = doorOf(model)
        const base = deps.baseOf(model)
        const settled = await engine.job(
          'models.load',
          {
            modelId: model.backendId ?? model.id,
            // The BASE's folder where this only completes it: the door loads that one, and the
            // attachment is grafted onto the pipeline it holds.
            folder: deps.folderFor(base ?? model),
            attachFolder: base ? deps.folderFor(model) : undefined,
            door,
            // Declared per entry, never per loader — see `readsTorchWeights`.
            torchWeights: model.readsTorchWeights === true,
            ...attachmentOf(model, base),
          },
          { onStep: options.onProgress, signal: options.signal },
        )

        held.set(door, model.id)
        // A MEASUREMENT, where `reservationBytes` is only what a publisher announced — R3. A backend
        // that answered nothing leaves the reservation, which is the only other figure there is.
        return settled.heldBytes ?? model.reservationBytes
      } finally {
        done?.()
      }
    },

    unload: async (endpoint?: RuntimeEndpointId) => {
      const asked = (endpoint ? [engineDoorOfEndpoint(endpoint)] : [...held.keys()]).filter(door =>
        held.has(door),
      )
      if (asked.length === 0) return

      const engine = deps.running()
      if (!engine) {
        for (const door of asked) held.delete(door)
        return
      }

      for (const door of asked) {
        await engine.job('models.unload', { door })
        held.delete(door)
        // Unloaded THEN closed. The first hands the tensors back; only the second returns the
        // interpreter itself — measured 2026-09-08, a door that has so much as called `device()`
        // never drops below 208 MB again. `_live` reopens it at the next load, cold.
        await engine.closeDoor(door)
      }
    },

    generate: async (request: GenerateRequest): Promise<GenerateResult> => {
      const engine = await deps.engine()
      if (!engine) throw notAnswering(deps.whyNot())

      const done = deps.onUsed?.(request.model)
      try {
        const settled = await engine.job(
          'generate',
          {
            ...request.fields,
            prompt: request.prompt,
            destination: request.destination,
            door: engineDoorOf(request.modality),
          },
          { onStep: request.onProgress, signal: request.signal },
        )

        const path = settled.path
        if (path === undefined) throw new Error('the engine answered no path for the generation')

        return {
          path,
          // Reported rather than assumed: a model that fell back to the CPU runs at forty times the
          // time it should, and that is indistinguishable from a slow machine unless it is said.
          device: settled.device ?? 'unknown',
          backend: settled.backend ?? 'unknown',
        }
      } finally {
        done?.()
      }
    },
  }
}
