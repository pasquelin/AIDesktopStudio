import { Texture } from 'pixi.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clipAt,
  createFrameSink,
  fitInside,
  reusePaintedSource,
  spritesOffFrame,
  swapTexture,
  TimelineEngine,
  uploadNow,
  videoTracksByDepth,
} from './TimelineEngine'
import { clipFixture, sequenceWith, settled, trackFixture } from './timeline-fixtures'
import type { SoundCue, SoundPort } from './soundSchedule'
import type { Clip, SequenceState, Us } from './timelineState'

const clip = (id: string, start: number, duration: number, inPoint = 0): Clip =>
  clipFixture(id, start, duration, { inPoint })

const stateWith = (clips: Clip[]): SequenceState =>
  sequenceWith([trackFixture('V1', 'video', clips)])

const frame = (close: () => void): VideoFrame =>
  // jsdom has no VideoFrame; the engine only ever calls `close` on it.
  ({ close }) as unknown as VideoFrame

describe('timeline engine', () => {
  it('finds the clip playing on a track at a given time', () => {
    const track = stateWith([clip('a', 0, 1_000_000), clip('b', 2_000_000, 1_000_000)]).tracks[0]!
    expect(clipAt(track, 500_000)?.id).toBe('a')
    expect(clipAt(track, 1_500_000)).toBeNull()
    expect(clipAt(track, 2_000_000)?.id).toBe('b')
  })

  it('treats the end of a clip as outside it, so a butt joint plays the next one', () => {
    const track = stateWith([clip('a', 0, 1_000_000)]).tracks[0]!
    expect(clipAt(track, 1_000_000)).toBeNull()
  })

  it('reuses a still already on the sprite, and not a live source', () => {
    const painted = new Map([['V1', 'logo']])
    expect(reusePaintedSource('logo', 'V1', id => id === 'logo', painted)).toBe(true)
    expect(reusePaintedSource('logo', 'V1', () => false, painted)).toBe(false)
    expect(reusePaintedSource('rush', 'V1', () => true, painted)).toBe(false)
    expect(reusePaintedSource(null, 'V1', () => true, painted)).toBe(false)
  })

  /**
   * The paint loop only reaches tracks still in the frame, so a source monitor switching a rush
   * to a take would otherwise keep the rush on screen over the take's sound.
   */
  it('hands back the sprite of a track that left the frame, so it can go dark', () => {
    const sprites = new Map([
      ['S1', 'stale'],
      ['V1', 'painting'],
    ])
    const painting = sequenceWith([trackFixture('V1', 'video')]).tracks

    expect(spritesOffFrame(sprites, painting)).toEqual(['stale'])
  })

  it('leaves every sprite alone while its track is still painting', () => {
    const painting = sequenceWith([trackFixture('V1', 'video')]).tracks

    expect(spritesOffFrame(new Map([['V1', 'painting']]), painting)).toEqual([])
  })

  it('orders video tracks by index, so the highest one is composited last', () => {
    const state = sequenceWith([
      trackFixture('V2', 'video', [], { index: 2 }),
      trackFixture('A1', 'audio'),
      trackFixture('V1', 'video'),
    ])
    expect(videoTracksByDepth(state).map(track => track.id)).toEqual(['V1', 'V2'])
  })

  it('centres a wider picture between horizontal bars', () => {
    // 800×400 into 400×400: scaled by half, and the 200 leftover pixels split above and below.
    expect(fitInside({ width: 800, height: 400 }, { width: 400, height: 400 })).toEqual({
      x: 0,
      y: 100,
      scale: 0.5,
    })
  })

  it('centres a taller picture between vertical bars', () => {
    expect(fitInside({ width: 400, height: 800 }, { width: 400, height: 400 })).toEqual({
      x: 100,
      y: 0,
      scale: 0.5,
    })
  })

  it('enlarges a picture smaller than the frame rather than pinning it to a corner', () => {
    expect(fitInside({ width: 100, height: 100 }, { width: 400, height: 200 })).toEqual({
      x: 100,
      y: 0,
      scale: 2,
    })
  })

  // A monitor is laid out before it is measured, and a texture is sized before it is decoded.
  it('answers something finite when either side has no size yet', () => {
    expect(fitInside({ width: 0, height: 0 }, { width: 400, height: 400 })).toEqual({
      x: 0,
      y: 0,
      scale: 0,
    })
    expect(fitInside({ width: 800, height: 400 }, { width: 0, height: 0 })).toEqual({
      x: 0,
      y: 0,
      scale: 0,
    })
  })

  // Left to Pixi, the upload happens at the next render — long after the sink closed the frame
  // behind it, and the monitor then paints nothing at all, for every media.
  it('puts a texture on the GPU rather than waiting for the next render', () => {
    const initSource = vi.fn()
    const texture = new Texture()

    expect(uploadNow(texture, { initSource })).toBe(texture)
    expect(initSource).toHaveBeenCalledWith(texture.source)
  })

  it('closes every frame it uploads', () => {
    const close = vi.fn()
    createFrameSink({ upload: vi.fn() }).push(frame(close))
    // A frame kept past its upload leaks GPU memory, and it shows in seconds, not minutes.
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('destroys the texture it replaces, which held a frame nobody will show again', () => {
    const previous = new Texture()
    const destroy = vi.spyOn(previous, 'destroy')
    const target = { texture: previous }

    swapTexture(target, Texture.EMPTY)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('leaves the empty texture alone, which every sprite in the application starts on', () => {
    const destroy = vi.spyOn(Texture.EMPTY, 'destroy')
    const target = { texture: Texture.EMPTY }

    swapTexture(target, new Texture())
    expect(destroy).not.toHaveBeenCalled()
    destroy.mockRestore()
  })

  it('still closes the frame when the upload throws', () => {
    const close = vi.fn()
    const sink = createFrameSink({
      upload: () => {
        throw new Error('context lost')
      },
    })

    expect(() => sink.push(frame(close))).toThrow()
    expect(close).toHaveBeenCalledTimes(1)
  })
})

/**
 * The transport drives the sound as it drives the picture. The engine is built without a canvas
 * here: `seek` gives up without one, and what is under test happens before it.
 */
describe('driving the sound', () => {
  const soundPort = () => {
    const cues: SoundCue[] = []
    const loaded: string[] = []
    const stop = vi.fn()
    const port: SoundPort = {
      now: () => 0,
      tap: () => null,
      resume: vi.fn(),
      load: vi.fn(async assetId => {
        loaded.push(assetId)
        return (cue: SoundCue) => {
          cues.push(cue)
          return { stop }
        }
      }),
    }
    return { port, cues, loaded, stop }
  }

  /** The frame loop, one step at a time: a real one would run against the wall clock. */
  const frames: Array<() => void> = []
  vi.stubGlobal('requestAnimationFrame', (step: () => void) => frames.push(step))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())

  const audioSequence = (clips: Clip[], extra = {}): SequenceState =>
    sequenceWith([trackFixture('A1', 'audio', clips, extra)])

  /** Seconds on the output clock, which the engine's own clock follows when it is given one. */
  let elapsed = 0

  const engineWith = (port: SoundPort): TimelineEngine => {
    elapsed = 0
    return new TimelineEngine({
      openSink: () => Promise.reject(new Error('no decoder in a test')),
      sound: port,
      maxDecoders: 1,
      maxPictures: 1,
      owner: 'document',
      audioTime: () => elapsed,
    })
  }

  afterEach(() => {
    frames.length = 0
  })

  it('plays the sound under the playhead as soon as the transport starts', async () => {
    const { port, loaded } = soundPort()
    const engine = engineWith(port)
    engine.apply(audioSequence([clipFixture('a', 0, 4_000_000)]))

    engine.play()
    await settled()

    expect(loaded).toEqual(['asset-a'])
    engine.dispose()
  })

  /**
   * Planned once at the start and never again, only the first second of a sequence would sound:
   * everything past the horizon is planned by the frame loop as the playhead reaches it.
   */
  it('plans what the playhead reaches, frame after frame', async () => {
    const { port, loaded } = soundPort()
    const engine = engineWith(port)
    engine.apply(audioSequence([clipFixture('far', 5_000_000, 2_000_000)]))

    engine.play()
    await settled()
    expect(loaded).toEqual([])

    elapsed = 4.5
    frames.shift()?.()
    await settled()

    expect(loaded).toEqual(['asset-far'])
    engine.dispose()
  })

  /**
   * The head moves without the tracks changing, and the monitor then seeks without applying:
   * read from the applied state, the transport started wherever the head was when a clip was
   * last touched — a play button that ignored the head the user had just dragged.
   */
  it('starts the transport where the head was last seeked, not where it was last applied', async () => {
    const { port } = soundPort()
    const reported: Us[] = []
    const engine = new TimelineEngine({
      openSink: () => Promise.reject(new Error('no decoder in a test')),
      sound: port,
      maxDecoders: 1,
      maxPictures: 1,
      owner: 'document',
      audioTime: () => elapsed,
      onTime: time => reported.push(time),
    })
    elapsed = 0

    engine.apply({ ...audioSequence([clipFixture('a', 0, 4_000_000)]), playhead: 1_000_000 })
    await engine.seek(0)

    reported.length = 0
    engine.play()
    frames.shift()?.()
    await settled()

    expect(reported[0]).toBe(0)
    engine.dispose()
  })

  it('silences the sequence when the transport pauses', async () => {
    const { port, stop } = soundPort()
    const engine = engineWith(port)
    engine.apply(audioSequence([clipFixture('a', 0, 4_000_000)]))

    engine.play()
    await settled()
    engine.pause()

    expect(stop).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  it('hands the sequence over on every change, so muting a track is heard at once', async () => {
    const { port, stop } = soundPort()
    const engine = engineWith(port)
    const clips = [clipFixture('a', 0, 4_000_000)]
    engine.apply(audioSequence(clips))

    engine.play()
    await settled()
    engine.apply(audioSequence(clips, { muted: true }))

    expect(stop).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  /**
   * The clock asks the output whether to follow it, once, when the transport starts. Asked
   * before the output was woken, the answer is always no — and the picture then runs on the
   * wall clock while the sound runs on the output's, which drifts audibly in under a minute.
   */
  it('wakes the output before the clock decides which one to follow', () => {
    const { port } = soundPort()
    const order: string[] = []
    const watching = {
      ...port,
      resume: () => order.push('sound'),
      now: () => {
        order.push('clock')
        return 0
      },
    }
    const engine = engineWith(watching)

    engine.play()

    expect(order[0]).toBe('sound')
    engine.dispose()
  })

  it('stays silent while a paused playhead is dragged over a clip', async () => {
    const { port, loaded } = soundPort()
    const engine = engineWith(port)
    engine.apply(audioSequence([clipFixture('a', 0, 4_000_000)]))

    await engine.seek(1_000_000)
    await settled()

    expect(loaded).toEqual([])
    engine.dispose()
  })
})
