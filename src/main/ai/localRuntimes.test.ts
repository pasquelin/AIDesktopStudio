import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runtimeEndpointId } from '@shared/domain/aiRuntime'
import { MODEL_LOADERS } from '@shared/domain/localModel'
import { LOCAL_MODALITIES, producesFile } from '@shared/domain/localFields'
import catalogue from '@shared/domain/localModels.json'
import { endpointOf, endpointsOf, engineDoorOf } from './localRuntimes'
import { endpointOfDoor } from './engineMemory'
import type { LocalModel } from '@shared/domain/localModel'
import { localModel } from '@shared/domain/localModel-fixtures'
import { fileRuntime, runtimeReadingsOf, type LocalRuntime } from './localRuntimes'

const ROOT = join(import.meta.dirname, '..', '..', '..')

const parakeet = localModel({ id: 'parakeet', loader: 'sherpa-onnx' })
const llama = localModel({ id: 'llama3.2:3b', loader: 'ollama', files: [] })

const holding = (installed: string[]): LocalRuntime => ({
  read: () => Promise.resolve({ ready: true, installed: new Set(installed), loaded: new Set() }),
  install: () => Promise.resolve(),
  remove: () => Promise.resolve(),
})

describe('runtimeReadingsOf', () => {
  it('asks each loader once, for the models that name it', async () => {
    const seen: LocalModel[][] = []
    const runtimes = {
      'sherpa-onnx': {
        ...holding([]),
        read: (models: readonly LocalModel[]) => {
          seen.push([...models])
          return Promise.resolve({
            ready: true,
            installed: new Set<string>(),
            loaded: new Set<string>(),
          })
        },
      },
    }

    await runtimeReadingsOf(runtimes, [parakeet, localModel({ id: 'second' })], () => {})

    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveLength(2)
  })

  /**
   * 🛑 A runtime that is down THROWS, and the reason is REPORTED. Swallowed, it was invisible
   * everywhere: the screen can only ever say "not answering".
   */
  it('reads a runtime that raises as one that is not answering, and says why', async () => {
    const said: string[] = []
    const runtimes = {
      ollama: { ...holding([]), read: () => Promise.reject(new Error('ECONNREFUSED')) },
    }

    const readings = await runtimeReadingsOf(runtimes, [llama], (_loader, why) => said.push(why))

    expect(readings.get('ollama')).toEqual({
      ready: false,
      installed: new Set(),
      loaded: new Set(),
    })
    expect(said).toEqual([expect.stringContaining('ECONNREFUSED')])
  })

  // A loader with no line is shown, greyed, and explained — rather than vanishing from the list.
  it('reads a loader nothing wires as one that is not answering', async () => {
    const readings = await runtimeReadingsOf({}, [llama], () => {})

    expect(readings.get('ollama')).toEqual({
      ready: false,
      installed: new Set(),
      loaded: new Set(),
    })
  })

  it('keeps the answer of each loader to its own models', async () => {
    const readings = await runtimeReadingsOf(
      { 'sherpa-onnx': holding(['parakeet']), ollama: holding([]) },
      [parakeet, llama],
      () => {},
    )

    expect(readings.get('sherpa-onnx')?.installed.has('parakeet')).toBe(true)
    expect(readings.get('ollama')?.installed.has('llama3.2:3b')).toBe(false)
  })
})

describe('fileRuntime', () => {
  // Ready by construction: what would have to be answering is this process.
  it('holds a model whose files are all complete on disk', async () => {
    const runtime = fileRuntime({
      folderFor: () => '/models',
      isComplete: model => Promise.resolve(model.id === 'parakeet'),
      fetch: () => Promise.resolve(),
      removeFiles: () => Promise.resolve(),
    })

    await expect(runtime.read([parakeet, localModel({ id: 'other' })])).resolves.toEqual({
      ready: true,
      installed: new Set(['parakeet']),
      // It fetches weights and holds nothing between calls: what is resident is another
      // runtime's question entirely.
      loaded: new Set(),
    })
  })

  // It fetches weights; it holds no conversation, and the router must be able to see that.
  it('offers no conversation', () => {
    const runtime = fileRuntime({
      folderFor: () => '/models',
      isComplete: () => Promise.resolve(false),
      fetch: () => Promise.resolve(),
      removeFiles: () => Promise.resolve(),
    })

    expect(runtime.chat).toBeUndefined()
  })

  it('removes from the folder the model was filed under', async () => {
    const removeFiles = vi.fn(() => Promise.resolve())
    const runtime = fileRuntime({
      folderFor: () => '/elsewhere',
      isComplete: () => Promise.resolve(true),
      fetch: () => Promise.resolve(),
      removeFiles,
    })

    await runtime.remove(parakeet)

    expect(removeFiles).toHaveBeenCalledWith(parakeet, '/elsewhere')
  })
})

describe('the door a loader answers on', () => {
  it('is its embedded one when it holds the weights in its own process', () => {
    expect(endpointOf('llamacpp')).toBe(runtimeEndpointId('llamacpp', 'embedded'))
  })

  /**
   * The reason this stopped being a `Record`: one can only ever hold ONE door per loader, and the
   * same Python runtime answers for images and for meshes from two processes.
   */
  it('differs by modality for a loader that serves several', () => {
    expect(endpointOf('diffusers', 'image')).not.toBe(endpointOf('diffusers', 'mesh'))
    expect(endpointOf('ollama', 'image')).not.toBe(endpointOf('ollama'))
  })

  it('falls back rather than minting a door for a modality nobody declared', () => {
    expect(endpointOf('diffusers', 'unheard-of')).toBe(endpointOf('diffusers'))
  })
})

describe('every door a loader answers on', () => {
  /** An inverse map is built from this: a door missing here has no loader, and a plan throws. */
  it('holds each of them once', () => {
    expect([...endpointsOf('diffusers')].sort()).toEqual([
      runtimeEndpointId('diffusers', '3d'),
      runtimeEndpointId('diffusers', 'audio'),
      runtimeEndpointId('diffusers', 'diffusion'),
      runtimeEndpointId('diffusers', 'skybox'),
      runtimeEndpointId('diffusers', 'video'),
    ])
  })

  it('covers what `endpointOf` can answer, for every loader', () => {
    for (const loader of MODEL_LOADERS) {
      expect(endpointsOf(loader)).toContain(endpointOf(loader))
    }
  })
})

describe('engineDoorOf', () => {
  it('names the door the engine itself answers under', () => {
    expect(engineDoorOf('image')).toBe('engine/diffusion')
  })

  // A door is what a release plan KILLS, and a video model weighs tens of gigabytes: co-located,
  // freeing one would take the other down with it.
  it('gives a video a process of its own rather than the image one', () => {
    expect(engineDoorOf('video')).not.toBe(engineDoorOf('image'))
  })

  it('gives a skybox a process of its own rather than the image one', () => {
    expect(engineDoorOf('skybox')).toBe('engine/skybox')
    expect(engineDoorOf('skybox')).not.toBe(engineDoorOf('image'))
  })

  // `endpointOfDoor` reads the same format the other way, and a key not minted here fails to
  // index the record it addresses.
  it('mints what the memory ledger reads back', () => {
    expect(endpointOfDoor(engineDoorOf('mesh'))).toBe(engineDoorOf('mesh'))
  })
})

describe('the doors the engine opens', () => {
  /**
   * 🛑 Two tables, one on each side of the frontier: this file pairs a MODALITY with a door, and
   * `engine/src/ia_studio_engine/protocol/doors.py` pairs a DOOR with the modality it serves. A
   * name that drifts on one side is refused at generation time, hours after the edit, as
   * `no such door` — nothing else here would see it.
   */
  it('names the same door as the engine, for every modality that writes a file', () => {
    const doorsPy = readFileSync(
      join(ROOT, 'engine/src/ia_studio_engine/protocol/doors.py'),
      'utf8',
    )
    const declared = Object.fromEntries(
      [...doorsPy.matchAll(/^ {4}"(engine\/[a-z0-9]+)": "([a-z]+)",$/gm)].map(
        ([, door, modality]) => [modality, door],
      ),
    )
    const ours = Object.fromEntries(
      LOCAL_MODALITIES.filter(producesFile).map(modality => [modality, engineDoorOf(modality)]),
    )

    expect(ours).toEqual(declared)
  })
})

describe('the families the engine opens itself', () => {
  /**
   * 🛑 The catalogue and `PLUGINS` are the two halves of one decision, and they sit on opposite
   * sides of the frontier. Read from HERE rather than from `engine/tests/`: the engine imports
   * nothing of this repository, and a guard that reached back into `src/` would be deleted the
   * day the engine is extracted — taking with it what says a CUDA family must not load on Metal.
   */
  const table = readFileSync(
    join(ROOT, 'engine/src/ia_studio_engine/adapters/plugin_adapter.py'),
    'utf8',
  )
  const body = table.split('PLUGINS: dict[str, Plugin] = {')[1]?.split('\n}')[0] ?? ''
  const declared = body.split(/\n(?= {4}")/).flatMap(entry => {
    const id = /^ {4}"([a-z0-9.-]+)":/.exec(entry)?.[1]
    return id ? [{ id, needsCuda: entry.includes('needs_cuda=True') }] : []
  })

  const wired = (status: string): LocalModel[] =>
    Object.values(catalogue as Record<string, LocalModel[]>)
      .flat()
      .filter(model => model.loader === 'plugin' && (model.runtimeStatus ?? 'supported') === status)

  it('opens every plugin the catalogue wires, and nothing it does not', () => {
    expect(declared.map(one => one.id).sort()).toEqual(
      wired('supported')
        .map(one => one.id)
        .sort(),
    )
  })

  it('wires no plugin to weights the engine refuses to attach', () => {
    // `PluginAdapter.load` raises on `attachment`, and only the catalogue can say a plugin has
    // one — the refusal would otherwise surface at `models.load`, not here.
    const grafted = wired('supported').filter(model => model.attaches !== undefined)

    expect(grafted.map(model => model.id)).toEqual([])
  })

  it('leaves a plugin marked unsupported without an adapter', () => {
    const unwired = new Set(wired('unsupported').map(one => one.id))

    expect(declared.filter(one => unwired.has(one.id))).toEqual([])
  })

  it('demands CUDA for exactly the families the catalogue says need it', () => {
    const demanded = wired('supported')
      .filter(model => model.needsCuda)
      .map(model => model.id)

    expect(
      declared
        .filter(one => one.needsCuda)
        .map(one => one.id)
        .sort(),
    ).toEqual(demanded.sort())
  })
})
