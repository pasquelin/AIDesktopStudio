import { describe, expect, it, vi } from 'vitest'
import type { ReliefOverlay } from '@shared/domain/relief'
import { emptyHistory, run, undo } from '../core/history'
import {
  RELIEF_CHUNK_TEXELS,
  applyReliefSculpt,
  changedChunks,
  combinedAt,
  withChunkDelta,
  withPackedChunks,
  type ReliefSculpt,
  type ReliefSculptOperation,
} from '@shared/domain/relief'
import {
  DEFAULT_RELIEF_ELEVATION,
  DEFAULT_RELIEF_ORIGIN,
  DEFAULT_RELIEF_SIZE,
  DEFAULT_WORLD,
  reliefLayer,
  terrainEditLayer,
} from '@shared/domain/scene'
import { sculptRelief } from './reliefCommands'
import { EMPTY_SCENE, type SceneState } from './sceneState'
import { createReliefSculptor } from './reliefSculptor'
import type { ReliefSculptRequest, ReliefSculptResponse } from './reliefSculptMessage'

const samples = { width: 66, height: 8, values: new Float32Array(66 * 8) }
const extent = {
  origin: DEFAULT_RELIEF_ORIGIN,
  size: DEFAULT_RELIEF_SIZE,
  elevation: DEFAULT_RELIEF_ELEVATION,
}
const stepX = extent.size.x / (samples.width - 1)

function diskAt(sampleX: number, amount: number) {
  return {
    samples,
    extent,
    grain: RELIEF_CHUNK_TEXELS,
    sculpt: undefined as ReliefSculpt | undefined,
    disk: {
      x: extent.origin.x + sampleX * stepX,
      z: extent.origin.z,
      radius: stepX,
    },
    amount,
  }
}

function fakeWorker() {
  const listeners: ((event: MessageEvent<ReliefSculptResponse>) => void)[] = []
  const errorListeners: ((event: ErrorEvent) => void)[] = []
  const posted: ReliefSculptRequest[] = []
  let baseValues: Float32Array | undefined
  const worker = {
    postMessage: (message: unknown) => {
      posted.push(message as ReliefSculptRequest)
    },
    addEventListener: (
      type: string,
      listener: (event: MessageEvent<ReliefSculptResponse> | ErrorEvent) => void,
    ) => {
      if (type === 'message') {
        listeners.push(listener as (event: MessageEvent<ReliefSculptResponse>) => void)
      }
      if (type === 'error') errorListeners.push(listener as (event: ErrorEvent) => void)
    },
    terminate: vi.fn(),
  } as unknown as Worker

  return {
    worker,
    posted,
    baseValues: () => baseValues,
    holdBase: (values: Float32Array) => {
      baseValues = values
    },
    reply: (data: ReliefSculptResponse) => {
      for (const listener of listeners) listener({ data } as MessageEvent<ReliefSculptResponse>)
    },
    crash: () => {
      for (const listener of errorListeners) listener({ message: 'worker died' } as ErrorEvent)
    },
  }
}

function answer(fake: ReturnType<typeof fakeWorker>, request: ReliefSculptRequest): void {
  if (request.values) fake.holdBase(request.values)
  const after = applyReliefSculpt(
    {
      width: request.width,
      height: request.height,
      values: request.values ?? fake.baseValues() ?? new Float32Array(0),
    },
    request.extent,
    request.sculpt,
    request.operation,
    request.grain,
    request.rows,
    request.overlays,
    request.overlayAlpha === undefined
      ? undefined
      : { alpha: request.overlayAlpha, mask: request.overlayMask },
  )
  fake.reply({
    id: request.id,
    ok: true,
    grain: request.grain,
    chunks: changedChunks(request.sculpt, after),
  })
}

describe('createReliefSculptor', () => {
  it('splits a wide stroke by chunk rows and joins the edits in order', async () => {
    const fakes = [fakeWorker(), fakeWorker()]
    let next = 0
    const sculptor = createReliefSculptor(() => {
      const fake = fakes[next]
      next += 1
      if (!fake) throw new Error('No fake worker left')
      return fake.worker
    }, fakes.length)
    const side = 1024
    const wideSamples = { width: side, height: side, values: new Float32Array(side * side) }
    const stroke = {
      samples: wideSamples,
      extent,
      grain: RELIEF_CHUNK_TEXELS,
      sculpt: undefined,
      disk: {
        x: extent.origin.x + extent.size.x / 2,
        z: extent.origin.z + extent.size.z / 2,
        radius: Math.hypot(extent.size.x, extent.size.z) / 2,
      },
      amount: 2,
    }

    const pending = sculptor.raiseDisk(stroke)
    for (const fake of fakes) {
      const request = fake.posted[0]
      if (!request) throw new Error('parallel stroke was not sent')
      answer(fake, request)
    }

    const expected = applyReliefSculpt(wideSamples, extent, undefined, operationOf(stroke))
    expect(await pending).toEqual(changedChunks(undefined, expected))
    expect(fakes.map(fake => fake.posted[0]?.rows)).toEqual([
      { from: 0, to: 8 },
      { from: 8, to: 16 },
    ])
  })

  it('queues a second stroke so a drag does not drop the first disk', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const first = diskAt(1, 2)
    const second = diskAt(2, 5)

    const pendingFirst = sculptor.raiseDisk(first)
    const pendingSecond = sculptor.raiseDisk(second)

    expect(fake.posted).toHaveLength(1)
    const request1 = fake.posted[0]
    if (!request1) throw new Error('first stroke was not sent')
    answer(fake, request1)
    const edits1 = await pendingFirst

    expect(fake.posted).toHaveLength(2)
    const request2 = fake.posted[1]
    if (!request2) throw new Error('second stroke was not sent')
    const afterFirst = applyReliefSculpt(samples, extent, undefined, operationOf(first))
    expect(request2.sculpt).toEqual(afterFirst)
    answer(fake, request2)
    const edits2 = await pendingSecond

    const afterSecond = applyReliefSculpt(samples, extent, afterFirst, operationOf(second))
    expect(edits1).toEqual(changedChunks(undefined, afterFirst))
    expect(edits2).toEqual(changedChunks(afterFirst, afterSecond))
    expect(edits2).not.toEqual(edits1)
  })

  it('drops an in-flight stroke when undo restores another sculpt', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const first = diskAt(1, 2)
    const second = diskAt(2, 5)

    const pendingFirst = sculptor.raiseDisk(first)
    const request1 = fake.posted[0]
    if (!request1) throw new Error('first stroke was not sent')
    answer(fake, request1)
    const edits1 = await pendingFirst
    if (!edits1) throw new Error('first stroke was dropped')

    let state = sceneOf()
    let history = emptyHistory<SceneState>()
    ;[state, history] = run(state, history, sculptRelief('terrain', 'sculpt', edits1))
    sculptor.note(sculptOf(state))

    const pendingSecond = sculptor.raiseDisk(second)
    ;[state, history] = undo(state, history)
    sculptor.note(sculptOf(state))

    const request2 = fake.posted[1]
    if (!request2) throw new Error('second stroke was not sent')
    answer(fake, request2)
    const edits2 = await pendingSecond
    if (edits2) state = run(state, history, sculptRelief('terrain', 'sculpt', edits2))[0]

    expect(edits2).toBeNull()
    expect(sculptOf(state)).toBeUndefined()
  })

  it('sends a smooth stroke as one worker job, with the heightfield the domain reads', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const pending = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })
    const request = fake.posted[0]
    if (!request) throw new Error('smooth stroke was not sent')
    answer(fake, request)

    expect(request.operation.kind).toBe('smooth')
    expect(request.values).toBe(samples.values)
    expect(request.rows).toBeUndefined()
    expect(await pending).not.toBeNull()
  })

  it('binds a smooth heightfield once and reuses it for the next stroke', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const first = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })
    const request1 = fake.posted[0]
    if (!request1) throw new Error('first smooth stroke was not sent')
    answer(fake, request1)
    await first

    const second = sculptor.raiseDisk({ ...diskAt(2, 0.1), kind: 'smooth' })
    const request2 = fake.posted[1]
    if (!request2) throw new Error('second smooth stroke was not sent')
    answer(fake, request2)

    expect(request1.values).toBe(samples.values)
    expect(request1.baseId).toBeTypeOf('number')
    expect(request2.values).toBeUndefined()
    expect(request2.baseId).toBe(request1.baseId)
    await expect(second).resolves.not.toBeNull()
  })

  it('rebinds when the heightmap changes or the worker refuses its base', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const first = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })
    const request1 = fake.posted[0]
    if (!request1) throw new Error('first smooth stroke was not sent')
    fake.reply({ id: request1.id, ok: false, error: 'base unavailable' })
    await expect(first).rejects.toThrow('base unavailable')

    const retry = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })
    const request2 = fake.posted[1]
    if (!request2) throw new Error('retried smooth stroke was not sent')
    expect(request2.values).toBe(samples.values)
    expect(request2.baseId).not.toBe(request1.baseId)
    answer(fake, request2)
    await retry

    const changed = { ...samples, values: new Float32Array(samples.values.length).fill(2) }
    const rebound = sculptor.raiseDisk({ ...diskAt(2, 0.1), samples: changed, kind: 'flatten' })
    const request3 = fake.posted[2]
    if (!request3) throw new Error('changed heightmap stroke was not sent')
    expect(request3.values).toBe(changed.values)
    expect(request3.baseId).not.toBe(request2.baseId)
    answer(fake, request3)
    await rebound
  })

  it('resends the heightfield after the worker restarts', async () => {
    const workers = [fakeWorker(), fakeWorker()]
    let opened = 0
    const sculptor = createReliefSculptor(() => {
      const fake = workers[opened]
      opened += 1
      if (!fake) throw new Error('no restarted worker')
      return fake.worker
    })
    const first = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })
    const request1 = workers[0]?.posted[0]
    if (!request1 || !workers[0]) throw new Error('first stroke was not sent')
    answer(workers[0], request1)
    await first

    const interrupted = sculptor.raiseDisk({ ...diskAt(2, 0.1), kind: 'smooth' })
    expect(workers[0].posted[1]?.values).toBeUndefined()
    workers[0].crash()
    await expect(interrupted).rejects.toThrow('worker died')

    const retried = sculptor.raiseDisk({ ...diskAt(2, 0.1), kind: 'smooth' })
    const request2 = workers[1]?.posted[0]
    if (!request2 || !workers[1]) throw new Error('retry was not sent to the new worker')
    expect(request2.values).toBe(samples.values)
    answer(workers[1], request2)
    await expect(retried).resolves.not.toBeNull()
  })

  it('terminates its worker and drops the in-flight stroke on dispose', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const pending = sculptor.raiseDisk({ ...diskAt(1, 0.1), kind: 'smooth' })

    sculptor.dispose()

    await expect(pending).resolves.toBeNull()
    expect(fake.worker.terminate).toHaveBeenCalledOnce()
  })

  it('writes the whole raise delta and lets the mask hold it back at read time', async () => {
    const fake = fakeWorker()
    const sculptor = createReliefSculptor(() => fake.worker)
    const paint = withChunkDelta(samples, undefined, {
      column: 0,
      row: 0,
      localX: 2,
      localZ: 2,
      delta: 1,
    })
    const pending = sculptor.raiseDisk({
      ...diskAt(2, 1),
      disk: {
        x: extent.origin.x + 2 * stepX,
        z: extent.origin.z + 2 * (extent.size.z / (samples.height - 1)),
        radius: extent.size.x,
      },
      overlayAlpha: 1,
      overlayMask: { kind: 'painted', weights: paint },
    })
    const request = fake.posted[0]
    if (!request) throw new Error('raise was not sent')
    answer(fake, request)
    const edits = await pending
    if (!edits) throw new Error('raise was dropped')
    const sculpt = withPackedChunks(undefined, edits)
    const bare: ReliefOverlay[] = [{ enabled: true, alpha: 1, sculpt }]
    const masked: ReliefOverlay[] = [
      { enabled: true, alpha: 1, sculpt, mask: { kind: 'painted', weights: paint } },
    ]
    const at = (overlays: ReliefOverlay[], sx: number): number =>
      combinedAt(samples, RELIEF_CHUNK_TEXELS, overlays, sx, 2)

    // The mask holds the stroke back at READ time and the delta stays whole underneath: applied
    // at both ends it squared the weight, and lowering the mask gave nothing back.
    expect(at(masked, 2)).toBeGreaterThan(0)
    expect(at(masked, 4)).toBeCloseTo(0)
    expect(at(bare, 4)).toBeGreaterThan(0)
  })
})

function sceneOf(sculpt?: ReliefSculpt): SceneState {
  return {
    ...EMPTY_SCENE,
    world: {
      ...DEFAULT_WORLD,
      layers: [
        reliefLayer(
          { assetId: 'asset_height' },
          { id: 'terrain', edits: [terrainEditLayer({ id: 'sculpt', sculpt })] },
        ),
      ],
    },
  }
}

function sculptOf(state: SceneState): ReliefSculpt | undefined {
  const layer = state.world.layers[0]
  return layer?.kind === 'relief' ? layer.edits[0]?.sculpt : undefined
}

function operationOf(stroke: ReturnType<typeof diskAt>): ReliefSculptOperation {
  return { kind: 'raiseDisk', disk: stroke.disk, amount: stroke.amount }
}
