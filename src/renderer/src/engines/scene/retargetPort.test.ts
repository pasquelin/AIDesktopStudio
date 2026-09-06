import { describe, expect, it } from 'vitest'
import { profileWithRole, skeletonSignatureOf } from '@shared/domain/skeletonProfile'
import { Euler, Quaternion } from 'three'
import { createRetarget, skinnedFromWire, wireClipOf } from './retarget'
import { UTHANA, TRIPO, scriptedWorker, turnClip } from './retarget-fixtures'

describe('asking the worker', () => {
  it('answers an identical skeleton without starting a worker at all', async () => {
    const script = scriptedWorker()
    const clips = [turnClip('mixamorigSpine')]
    const model = skinnedFromWire(UTHANA)

    const adapted = await createRetarget(script.spawn).adapt(model, skinnedFromWire(UTHANA), clips)

    expect(adapted).toEqual(clips)
    expect(script.spawned).toBe(0)
  })

  it('keeps source and target drafts independent when their topology is identical', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const signature = skeletonSignatureOf(UTHANA.map(bone => bone.name))
    const profile = { signature, roles: {} }
    const pending = port.adapt(
      skinnedFromWire(UTHANA),
      skinnedFromWire(UTHANA),
      [turnClip('mixamorigSpine')],
      {
        sourceProfile: profileWithRole(profile, 'mixamorigSpine', null),
        targetProfile: profile,
      },
    )
    const request = script.sent[0]
    expect(request).toBeDefined()
    if (request && !('cancel' in request)) expect(request.names.mixamorigSpine).toBeUndefined()
    port.dispose()
    await pending
  })

  it('honours cancellation even for an identical skeleton', async () => {
    const stop = new AbortController()
    stop.abort()
    expect(
      await createRetarget(scriptedWorker().spawn).adapt(
        skinnedFromWire(UTHANA),
        skinnedFromWire(UTHANA),
        [],
        { signal: stop.signal },
      ),
    ).toBeNull()
  })

  it('uses a draft alignment and options without remembering the draft', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const signature = skeletonSignatureOf(UTHANA.map(bone => bone.name))
    const draft = {
      signature,
      roles: {},
      restPose: {
        mixamorigHips: {
          position: { x: 0, y: 3, z: 0 },
          rotation: { x: 0, y: 0, z: Math.PI },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    }
    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')], {
      profiles: [draft],
      options: { scale: 2, rootMotion: 'inPlace' },
    })
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('missing request')
    expect(request.source[0]?.quaternion[3]).toBeCloseTo(0, 6)
    expect(request.source[0]?.position).toEqual([0, 1, 0])
    expect(request.options).toEqual({ scale: 2, rootMotion: 'inPlace' })
    script.answer({ id: request.id, done: true, ok: true, clips: [] })
    await pending
    const next = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')])
    const unchanged = script.sent.at(-1)
    if (!unchanged || 'cancel' in unchanged) throw new Error('missing second request')
    expect(unchanged.source[0]?.quaternion).toEqual([0, 0, 0, 1])
    port.dispose()
    await next
  })

  it('sends the two skeletons and the clips, and answers what comes back', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [
      turnClip('mixamorigSpine'),
    ])
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('nothing was asked of the worker')

    expect(request.names.Waist).toBe('mixamorigSpine')
    script.answer({ id: request.id, done: true, ok: true, clips: [wireClipOf(turnClip('Waist'))] })

    expect((await pending)?.[0]?.tracks[0]?.name).toBe('Waist.quaternion')
  })

  it('reports each clip as it lands', async () => {
    const script = scriptedWorker()
    const seen: number[] = []
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')], {
      onProgress: progress => void seen.push(progress),
    })
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('nothing was asked of the worker')

    script.answer({ id: request.id, done: false, progress: 0.5 })
    script.answer({ id: request.id, done: true, ok: true, clips: [] })
    await pending

    expect(seen).toEqual([0.5])
  })

  it('lets a caller take a request back, and tells the worker to stop', async () => {
    const script = scriptedWorker()
    const stop = new AbortController()
    const port = createRetarget(script.spawn)

    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')], {
      signal: stop.signal,
    })
    stop.abort()

    expect(await pending).toBeNull()
    expect(script.terminated).toBe(1)
  })

  it('restarts after interrupting an active clip and runs the queued request', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const stop = new AbortController()
    const first = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('one')], {
      signal: stop.signal,
    })
    const second = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('two')])
    expect(script.sent).toHaveLength(1)
    stop.abort()
    expect(await first).toBeNull()
    expect(script.spawned).toBe(2)
    const request = script.sent.at(-1)
    if (!request || 'cancel' in request) throw new Error('missing resumed request')
    script.answer({ id: request.id, done: true, ok: true, clips: [] })
    expect(await second).toEqual([])
  })

  it('invalidates an in-flight answer when a remembered profile changes', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const pending = port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')])
    port.remember({
      signature: skeletonSignatureOf(TRIPO.map(bone => bone.name)),
      roles: { Hip: 'Hips' },
    })
    script.answer({ id: 1, done: true, ok: true, clips: [wireClipOf(turnClip('old'))] })
    expect(await pending).toBeNull()
  })

  it('settles the active and queued requests when disposed', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const requests = Array.from({ length: 3 }, () =>
      port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [turnClip('x')]),
    )
    port.dispose()
    expect(await Promise.all(requests)).toEqual([null, null, null])
    expect(script.spawned).toBe(1)
  })

  it('answers nothing once the port has let go, rather than waiting forever', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    port.dispose()

    expect(await port.adapt(skinnedFromWire(TRIPO), skinnedFromWire(UTHANA), [])).toBeNull()
  })

  it('answers nothing to a caller whose signal had already fired', async () => {
    const script = scriptedWorker()
    const stop = new AbortController()
    stop.abort()

    // An `abort` already delivered never reaches a listener added after it: without a check of
    // its own, the worker would do the whole job and hand clips to a caller already gone.
    const adapted = await createRetarget(script.spawn).adapt(
      skinnedFromWire(TRIPO),
      skinnedFromWire(UTHANA),
      [turnClip('x')],
      { signal: stop.signal },
    )

    expect(adapted).toBeNull()
    expect(script.spawned).toBe(0)
  })
})

describe('an aligned rest pose', () => {
  it('turns the bone it names and leaves the proportions of the file alone', async () => {
    const script = scriptedWorker()
    const port = createRetarget(script.spawn)
    const profile = {
      signature: skeletonSignatureOf(UTHANA.map(bone => bone.name)),
      roles: {},
      restPose: {
        mixamorigSpine: {
          position: { x: 9, y: 9, z: 9 },
          rotation: { x: 0, y: 0, z: Math.PI / 2 },
          scale: { x: 3, y: 3, z: 3 },
        },
      },
    }
    void port.adapt(skinnedFromWire(UTHANA), skinnedFromWire(TRIPO), [turnClip('mixamorigSpine')], {
      targetProfile: profile,
    })
    const request = script.sent[0]
    if (!request || 'cancel' in request) throw new Error('no request sent')
    const spine = request.target.find(bone => bone.name === 'mixamorigSpine')
    expect(spine?.position).toEqual([0, 0.2, 0])
    expect(spine?.scale).toEqual([1, 1, 1])
    const turned = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2)).toArray()
    spine?.quaternion.forEach((value, index) => expect(value).toBeCloseTo(turned[index] ?? 0, 6))
    port.dispose()
  })
})
