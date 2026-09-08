import { localizedError } from '@shared/localizedError'
import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  SphereGeometry,
} from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { createBvhBuilder, WORTH_A_TREE } from './bvhBuilder'
import type { BvhRequest, BvhResponse } from './bvhMessage'

/** The answer a real build gives, tree included — shared by the two fake workers below. */
function treeFor(request: BvhRequest): BvhResponse {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(request.position, 3))
  if (request.index) geometry.setIndex(new BufferAttribute(request.index, 1))

  const serialized = MeshBVH.serialize(new MeshBVH(geometry))
  return {
    id: request.id,
    ok: true,
    bvh: {
      version: 1,
      roots: serialized.roots,
      index:
        serialized.index instanceof Uint32Array || serialized.index instanceof Uint16Array
          ? serialized.index
          : null,
      indirectBuffer: null,
    },
  }
}

/**
 * One fresh worker per spawn, so an event can be aimed at a worker already replaced — which the
 * single-instance fake below cannot express, its `spawn` handing back the same object every time.
 */
function respawningWorkers() {
  const made: {
    listeners: Map<string, (event: Event) => void>
    sent: BvhRequest[]
    terminate: Mock<() => void>
  }[] = []

  const spawn = vi.fn((): Worker => {
    const fake = {
      listeners: new Map<string, (event: Event) => void>(),
      sent: [] as BvhRequest[],
      terminate: vi.fn(),
    }
    made.push(fake)
    const worker = {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        fake.listeners.set(type, listener)
      },
      postMessage: (request: BvhRequest) => fake.sent.push(request),
      terminate: fake.terminate,
    }
    // `as`: the builder calls exactly these three members of a `Worker`, and jsdom has no other.
    return worker as unknown as Worker
  })

  return {
    spawn,
    made,
    /** That worker died — whether or not it is still the one the builder holds. */
    raise: (at: number, message: string) => {
      made[at]?.listeners.get('error')?.(new ErrorEvent('error', { message }))
    },
    settle: async (at: number) => {
      const fake = made[at]
      const request = fake?.sent.at(-1)
      if (!fake || !request) return
      fake.listeners.get('message')?.(new MessageEvent('message', { data: treeFor(request) }))
      await Promise.resolve()
    },
  }
}

/**
 * A worker standing in for the real one, building the tree in place. jsdom spawns no worker, and
 * what these tests are about is the exchange around it: what is sent, what is kept, what is
 * dropped — the build itself is three-mesh-bvh's business.
 */
function scriptedWorker() {
  const sent: BvhRequest[] = []
  const listeners = new Map<string, (event: Event) => void>()

  const worker = {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, listener)
    },
    postMessage: (request: BvhRequest) => sent.push(request),
    terminate: vi.fn(),
  }

  // `as`: the builder calls exactly these three members of a `Worker`, and jsdom has no other.
  const spawn = vi.fn(() => worker as unknown as Worker)

  const reply = async (response: BvhResponse): Promise<void> => {
    listeners.get('message')?.(new MessageEvent('message', { data: response }))
    await Promise.resolve()
  }

  const lastRequest = (): BvhRequest | undefined => sent.at(-1)

  return {
    spawn,
    sent,
    terminated: worker.terminate,
    /** Answers the last request the way the real worker would, tree included. */
    settle: async () => {
      const request = lastRequest()
      if (request) await reply(treeFor(request))
    },
    /** Answers the last request the way a build that threw does. */
    refuse: async (error: string) => {
      const request = lastRequest()
      if (!request) return
      await reply({ id: request.id, ok: false, error })
    },
    /** The worker itself died, which no `try` inside it can report. */
    die: (message: string) => {
      listeners.get('error')?.(new ErrorEvent('error', { message }))
    },
    /** It answered with something the structured clone could not carry. */
    garble: () => {
      listeners.get('messageerror')?.(new MessageEvent('messageerror'))
    },
  }
}

/** Dense enough to be worth a tree — a studio primitive never is. */
const dense = () => new Mesh(new SphereGeometry(1, 256, 128))
const light = () => new Mesh(new SphereGeometry(1, 8, 8))

describe('createBvhBuilder', () => {
  it('gives a dense mesh a tree', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()

    const done = builder.accelerate(mesh)
    await scripted.settle()
    await done

    expect(mesh.geometry.boundsTree).toBeDefined()
  })

  /**
   * The reason the whole thing exists: a tree turns a walk over every triangle into a descent.
   * Measured in `scenePicking.bench.ts`, checked here on the count three.js actually reads.
   */
  it('leaves the geometry able to answer a ray', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()

    const done = builder.accelerate(mesh)
    await scripted.settle()
    await done

    expect(mesh.geometry.boundsTree?.geometry).toBe(mesh.geometry)
  })

  // Thirty triangles are walked faster than a tree is built, let alone sent twice over a boundary.
  it('leaves a light mesh alone, tree unbuilt', async () => {
    const scripted = scriptedWorker()

    await createBvhBuilder(scripted.spawn).accelerate(light())

    expect(scripted.sent).toEqual([])
  })

  it('never builds a second tree for a geometry that has one', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()

    const done = builder.accelerate(mesh)
    await scripted.settle()
    await done
    await builder.accelerate(mesh)

    expect(scripted.sent).toHaveLength(1)
  })

  // The same race a texture runs: what nobody wants any more must not come back to life.
  it('drops a tree whose mesh changed shape while it was being built', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()
    // The one the build was asked for: production writes the tree onto the geometry it captured,
    // so asserting on the replacement passed under every possible implementation.
    const asked = mesh.geometry

    const done = builder.accelerate(mesh)
    mesh.geometry = new SphereGeometry(2, 8, 8)
    await scripted.settle()
    await done

    expect(asked.boundsTree).toBeUndefined()
  })

  it('sends the buffers, never the geometry', async () => {
    const scripted = scriptedWorker()

    void createBvhBuilder(scripted.spawn).accelerate(dense())

    expect(scripted.sent[0]?.position).toBeInstanceOf(Float32Array)
    expect(scripted.sent[0]).not.toHaveProperty('geometry')
  })

  it('shuts the worker down with the engine', () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    void builder.accelerate(dense())
    builder.dispose()

    expect(scripted.terminated).toHaveBeenCalled()
  })

  // A promise nobody will ever answer keeps its whole closure alive — the mesh included.
  it('lets go of a build in flight when the engine goes', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()

    const done = builder.accelerate(mesh)
    builder.dispose()

    await expect(done).resolves.toBeUndefined()
    expect(mesh.geometry.boundsTree).toBeUndefined()
  })

  // Duplicating a model gives two nodes one geometry: the tree is asked for once, not twice.
  it('asks for one tree when two meshes share a geometry', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const first = dense()
    const second = new Mesh(first.geometry)

    const done = Promise.all([builder.accelerate(first), builder.accelerate(second)])
    await scripted.settle()
    await done

    expect(scripted.sent).toHaveLength(1)
    expect(second.geometry.boundsTree).toBeDefined()
  })

  // Nothing dense has been seen yet: a worker started at mount would cost a thread for nothing.
  it('starts no worker until something is worth accelerating', async () => {
    const spawn = vi.fn(() => scriptedWorker().spawn())

    await createBvhBuilder(spawn).accelerate(light())

    expect(spawn).not.toHaveBeenCalled()
  })
})

/**
 * Before this, a build that raised left its promise open forever: the caller waited for a window's
 * life, and the geometry stayed in `building` so no later click ever got its tree either.
 */
describe('when a build does not come back', () => {
  it('rejects the build the worker refused', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    const done = builder.accelerate(dense())
    await scripted.refuse('index out of range')

    await expect(done).rejects.toThrow('index out of range')
  })

  // The geometry has to leave `building`, or the mesh is refused a tree for the rest of the session.
  it('lets the same geometry be tried again after a refusal', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)
    const mesh = dense()

    const failed = builder.accelerate(mesh)
    await scripted.refuse('index out of range')
    await expect(failed).rejects.toThrow()

    const done = builder.accelerate(mesh)
    await scripted.settle()
    await done

    expect(mesh.geometry.boundsTree).toBeDefined()
    expect(scripted.sent).toHaveLength(2)
  })

  it('rejects what was in flight when the worker itself died', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    const done = builder.accelerate(dense())
    scripted.die('killed')

    await expect(done).rejects.toThrow('killed')
    // A worker left running holds its thread for the window's life — `messageerror` fires on one
    // that is still perfectly alive.
    expect(scripted.terminated).toHaveBeenCalled()
  })

  it('rejects what was in flight when the answer could not be read', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    const done = builder.accelerate(dense())
    scripted.garble()

    await expect(done).rejects.toThrow(localizedError('workerUnreadable', { name: 'BVH' }).message)
    expect(scripted.terminated).toHaveBeenCalled()
  })

  // One model running the thread out of memory must not cost every later click its tree.
  it('starts a fresh worker for the mesh after the one that died', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    const died = builder.accelerate(dense())
    scripted.die('killed')
    await expect(died).rejects.toThrow()

    const done = builder.accelerate(dense())
    await scripted.settle()
    await done

    expect(scripted.spawn).toHaveBeenCalledTimes(2)
  })

  /**
   * `abandon` used to close over the current worker rather than the one that raised, so an event
   * queued by a worker already replaced killed its successor and rejected builds that never met it.
   */
  it('leaves the worker that replaced a dead one alone', async () => {
    const workers = respawningWorkers()
    const builder = createBvhBuilder(workers.spawn)

    const died = builder.accelerate(dense())
    workers.raise(0, 'killed')
    await expect(died).rejects.toThrow('killed')

    const done = builder.accelerate(dense())
    // The dead worker's second event, arriving after its replacement is already at work.
    workers.raise(0, 'killed again')
    await workers.settle(1)

    expect(workers.made[1]?.terminate).not.toHaveBeenCalled()
    await expect(done).resolves.toBeUndefined()
  })

  /**
   * A worker the environment refuses — a chunk that did not ship, a CSP — must reject rather than
   * hang, and must not hold the geometry hostage afterwards.
   *
   * Nothing is in flight to sweep up either: the worker is asked for before the request is
   * registered, so a refused spawn never reaches `InflightBuilds` at all — which is what
   * `bvh-inflight.test.ts` measures on its own `size`.
   */
  it('lets a geometry be tried again after a worker that would not start', async () => {
    const refused = vi.fn<() => Worker>(() => {
      throw new Error('worker refused')
    })
    const builder = createBvhBuilder(refused)
    const mesh = dense()

    await expect(builder.accelerate(mesh)).rejects.toThrow('worker refused')
    await expect(builder.accelerate(mesh)).rejects.toThrow('worker refused')

    expect(refused).toHaveBeenCalledTimes(2)
  })
})

describe('once the engine is gone', () => {
  it('starts no worker for a mesh asked for after the fact', () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    builder.dispose()
    void builder.accelerate(dense())

    expect(scripted.spawn).not.toHaveBeenCalled()
  })

  /**
   * The way it actually happens: `SceneRenderer.accelerate` walks a model's meshes one await at a
   * time, and the engine can go between two of them. The turn after the dispose used to spawn a
   * second worker — one nothing would ever terminate, since `dispose` had already run.
   */
  it('starts no worker for the next mesh of a loop the dispose interrupted', async () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    const done = builder.accelerate(dense())
    builder.dispose()
    await done
    await builder.accelerate(dense())

    expect(scripted.spawn).toHaveBeenCalledTimes(1)
  })
})

/**
 * A mesh worth a tree, built the way a GLB arrives: raw positions, and an index only when the
 * file carried one. Sized from the threshold itself, so raising it cannot leave these tests
 * quietly asserting the too-light path.
 */
function worthATree(positions: Float32ArrayConstructor | Float64ArrayConstructor, indexed = false) {
  const triangles = WORTH_A_TREE + 1
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new positions(triangles * 9), 3))
  if (indexed) geometry.setIndex(new BufferAttribute(new Uint8Array(triangles * 3), 1))
  return new Mesh(geometry)
}

describe('what the builder sends across', () => {
  // The build itself is irrelevant here, and a real one costs 150 ms a piece.
  it('spawns one worker however many trees it builds', () => {
    const scripted = scriptedWorker()
    const builder = createBvhBuilder(scripted.spawn)

    void builder.accelerate(dense())
    void builder.accelerate(dense())

    expect(scripted.spawn).toHaveBeenCalledTimes(1)
  })

  // The worker reads a `Float32Array` and nothing else, so another width is converted on the way
  // out rather than refused — refusing left a dense mesh costing a frame a click, for nothing.
  it('narrows a position buffer of another width on the way out', async () => {
    const scripted = scriptedWorker()

    void createBvhBuilder(scripted.spawn).accelerate(worthATree(Float64Array))

    expect(scripted.sent[0]?.position).toBeInstanceOf(Float32Array)
  })

  /**
   * `GLTFLoader` interleaves as soon as a file's byte stride says to, and an interleaved
   * attribute's `array` is the *whole* buffer. Handed over whole it is read as coordinates, so the
   * tree describes a mesh made of normals and uvs — and every click then misses what it hit.
   */
  it('sends only the coordinates of an interleaved position', async () => {
    const scripted = scriptedWorker()
    const vertices = (WORTH_A_TREE + 1) * 3
    // Six floats a vertex: the three coordinates, then three of something else.
    const buffer = new InterleavedBuffer(new Float32Array(vertices * 6), 6)
    for (let at = 0; at < vertices; at += 1) buffer.array[at * 6] = at
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0))

    void createBvhBuilder(scripted.spawn).accelerate(new Mesh(geometry))

    const sent = scripted.sent[0]?.position
    expect(sent).toHaveLength(vertices * 3)
    // The second vertex's x, which is the fourth float once the padding is gone.
    expect(sent?.[3]).toBe(1)
  })

  it('sends no index for a geometry that has none', async () => {
    const scripted = scriptedWorker()

    void createBvhBuilder(scripted.spawn).accelerate(worthATree(Float32Array))

    expect(scripted.sent[0]?.index).toBeNull()
  })

  /**
   * Widened, never dropped. Dropped, the worker took the geometry for a non-indexed one and handed
   * back an index of another length — which `deserialize` writes over the live one for as far as
   * it reaches, leaving the rest of the triangles where they were and raising nothing.
   */
  it('widens an index of a width the tree cannot carry', async () => {
    const scripted = scriptedWorker()

    void createBvhBuilder(scripted.spawn).accelerate(worthATree(Float32Array, true))

    expect(scripted.sent[0]?.index).toBeInstanceOf(Uint32Array)
  })
})
