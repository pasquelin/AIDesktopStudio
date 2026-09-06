import { describe, expect, it, vi } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import type { RuntimeReport } from '@shared/domain/gameRuntime'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type SceneState } from '@/engines/scene/sceneState'
import { drawnBy, handDriven } from './game-fixtures'
import { createInertPhysics as inertPhysics } from '@game/host/inertPhysics'
import { createInertScripts } from '@game/host/inertScripts'
import { startPlay } from './playSession'

const scene = (): SceneState => ({
  ...EMPTY_SCENE,
  nodes: [{ ...meshNode('a'), components: [newComponent('Movement')] }, meshNode('b')],
})

function playing(state: SceneState = scene()) {
  const frames = handDriven()
  const apply = vi.fn()
  const placeView = vi.fn()
  const reports: RuntimeReport[] = []

  const session = startPlay({
    documentId: 'doc-1',
    renderer: drawnBy({ apply, placeView }),
    editState: () => state,
    input: new EventTarget(),
    frames: frames.driver,
    onReport: report => reports.push(report),
  })

  return { session, frames, apply, placeView, reports, state }
}

const lastDrawn = (apply: ReturnType<typeof vi.fn>): SceneState | null =>
  apply.mock.calls.at(-1)?.[0] ?? null

describe('a game running inside the studio', () => {
  it('says it is playing, and how much of the scene it holds, before a frame has run', () => {
    const { reports } = playing()

    expect(reports.at(-1)).toMatchObject({ state: 'playing', tick: 0, entities: 2 })
  })

  it('publishes measured renderer counters and the latest compilation cost', () => {
    const frames = handDriven()
    const reports: RuntimeReport[] = []
    startPlay({
      documentId: 'doc-1',
      renderer: drawnBy({
        runtimePerformance: () => ({
          renderMs: 1.25,
          gpuFrameMs: 0.75,
          drawCalls: 7,
          triangles: 420,
          vertices: 240,
          visibleObjects: 6,
          culledObjects: 4,
          instanceCount: 100,
          batchCount: 2,
          geometryBufferBytes: 1_024,
          estimatedTextureBytes: 2_048,
        }),
      }),
      editState: () => scene(),
      input: new EventTarget(),
      frames: frames.driver,
      compilationMs: () => 3.5,
      onReport: report => reports.push(report),
    })

    frames.advance(0.2)

    expect(reports.at(-1)?.performance).toMatchObject({
      drawCalls: 7,
      triangles: 420,
      instanceCount: 100,
      batchCount: 2,
      compilationMs: 3.5,
      gpuFrameMs: 0.75,
      renderMs: 1.25,
    })
  })

  it('moves an object its component says moves, and leaves the others alone', () => {
    const { frames, apply, state } = playing()

    frames.advance(0)
    frames.advance(1)

    const drawn = lastDrawn(apply)
    expect(drawn?.nodes[0]?.transform.position.y).toBeGreaterThan(0)
    expect(drawn?.nodes[1]).toBe(state.nodes[1])
  })

  /** 🛑 The judder at 120 Hz against a 60 Hz step — see `placementsOf`. */
  it('draws a moving object further on every frame, steps run or not', () => {
    const { frames, apply } = playing()
    // Past the warm-up, which forgets its clock once — see `warmed`.
    frames.advance(0)
    frames.advance(1 / 60)
    frames.advance(2 / 60)

    const drawn: number[] = []
    for (let frame = 6; frame <= 12; frame += 1) {
      frames.advance(frame / 120)
      drawn.push(lastDrawn(apply)?.nodes[0]?.transform.position.y ?? 0)
    }

    // Strictly rising, frame by frame: a flat pair is a frame that drew the step it was between.
    expect(drawn.every((at, index) => index === 0 || at > (drawn[index - 1] ?? 0))).toBe(true)
  })

  /**
   * 🛑 A paused game keeps drawing, but the accumulator stops — so `alpha` stays wherever the
   * pause caught it. Redrawing there walks a hand-stepped world BACK to a fraction of the step
   * before, on every frame, for as long as the pause lasts.
   */
  it('holds a hand-stepped world where the step left it, frame after frame', () => {
    const { session, frames, apply } = playing()
    frames.advance(0)
    // A frame that leaves the accumulator part-way between two steps, which is what freezes.
    frames.advance(3.5 / 60)
    session.pause()
    session.step(1)
    const stepped = lastDrawn(apply)?.nodes[0]?.transform.position.y ?? 0

    frames.advance(4 / 60)

    expect(lastDrawn(apply)?.nodes[0]?.transform.position.y ?? 0).toBeCloseTo(stepped, 6)
  })

  /**
   * 🛑 The criterion of the whole lot. The world holds no reference to the store, so this is not
   * a restore — there is nothing to restore, and that is what the comparison BY VALUE says.
   */
  it('leaves the edit state identical, by value, once it has been stopped', () => {
    const before = JSON.stringify(scene())
    const { session, frames, apply, state } = playing()

    frames.advance(0)
    frames.advance(2)
    session.stop()

    expect(JSON.stringify(state)).toBe(before)
    expect(lastDrawn(apply)).toBe(state)
    expect(session.state()).toBe('edit')
  })

  /** Frozen while the game writes the camera, or a damped orbit eases it back — see `placeView`. */
  it('gives the camera back to the hand when it stops', () => {
    const releaseView = vi.fn()
    const frames = handDriven()
    const session = startPlay({
      documentId: 'doc-1',
      renderer: drawnBy({ releaseView }),
      editState: () => scene(),
      input: new EventTarget(),
      frames: frames.driver,
      onReport: () => {},
    })

    session.stop()

    expect(releaseView).toHaveBeenCalled()
  })

  it('lets go of the frames when it stops', () => {
    const { session, frames } = playing()
    session.stop()

    expect(frames.stopped()).toBe(true)
  })

  it('runs no step while it is paused, and picks up where it left off', () => {
    const { session, frames, reports } = playing()

    frames.advance(0)
    frames.advance(1)
    const played = reports.at(-1)?.tick ?? 0

    session.pause()
    frames.advance(2)
    expect(reports.at(-1)?.state).toBe('paused')
    expect(reports.at(-1)?.tick).toBe(played)

    session.resume()
    // The first frame back is an origin — see the case below — so the second is what plays. The
    // report is thrown six times a second rather than sixty, hence the gap between the two.
    frames.advance(3)
    frames.advance(3.3)
    expect(reports.at(-1)?.tick).toBeGreaterThan(played)
  })

  /**
   * A game paused for a minute must not catch that minute up. Without the loop's own reset the
   * clamp still owes it a quarter of a second — fifteen steps nobody played — so the figure here
   * is exact rather than a bound.
   */
  it('does not simulate the time it spent paused', () => {
    const { session, frames, reports } = playing()

    frames.advance(0)
    frames.advance(0.2)
    const played = reports.at(-1)?.tick ?? 0

    session.pause()
    frames.advance(60)
    session.resume()
    frames.advance(60)
    frames.advance(60.2)

    expect(reports.at(-1)?.tick).toBe(played + 12)
  })

  it('seeks the band on the game clock, so a clip without an Animator still plays', () => {
    const seekClips = vi.fn()
    const frames = handDriven()
    startPlay({
      documentId: 'doc-1',
      renderer: drawnBy({}),
      animate: {
        poseNode: vi.fn(),
        releaseNode: vi.fn(),
        clipLengthsOf: () => ({}),
        useGraphClips: vi.fn(),
        seekClips,
      },
      editState: () => scene(),
      input: new EventTarget(),
      frames: frames.driver,
      onReport: () => {},
    })

    frames.advance(0)
    frames.advance(1 / 60)
    frames.advance(1)
    const last = seekClips.mock.calls.at(-1)?.[0] ?? 0

    expect(seekClips.mock.calls.length).toBeGreaterThan(1)
    expect(last).toBeGreaterThan(0)
  })
})

describe('the camera a game borrows', () => {
  /** In `orbit` the runtime never writes the camera, so STOP must not undo what a hand orbited. */
  it('gives the view back only when the game took it', () => {
    const flown = playing()
    flown.session.stop()

    expect(flown.placeView).not.toHaveBeenCalled()
  })

  /**
   * 🛑 Both engines are built per PLAY and hold WebAssembly memory no collector reaches: fifty
   * plays and stops in a session would otherwise leave fifty runtimes alive.
   */
  it('closes both engines when the game stops', () => {
    const physics = { ...inertPhysics(), dispose: vi.fn() }
    const script = { ...createInertScripts(), dispose: vi.fn() }
    const frames = handDriven()
    const session = startPlay({
      documentId: 'doc-1',
      renderer: drawnBy({}),
      editState: () => scene(),
      input: new EventTarget(),
      frames: frames.driver,
      physics,
      script,
      onReport: () => {},
    })

    session.stop()

    expect(physics.dispose).toHaveBeenCalledTimes(1)
    expect(script.dispose).toHaveBeenCalledTimes(1)
  })

  /**
   * 🛑 A STOP in the middle of a fade left the picture dark: `apply` puts the document back, not
   * the veil. And a sound a timeline row started played on until the window closed.
   */
  it('lifts the veil and silences the sounds when the game stops', () => {
    const stopAll = vi.fn()
    const frames = handDriven()
    const reports: RuntimeReport[] = []
    const session = startPlay({
      documentId: 'doc-1',
      renderer: drawnBy({}),
      editState: () => scene(),
      input: new EventTarget(),
      frames: frames.driver,
      audio: { play: () => null, stopAll },
      onReport: report => reports.push(report),
    })

    session.stop()

    expect(stopAll).toHaveBeenCalled()
    expect(reports.at(-1)?.veil).toBe(0)
  })
})
