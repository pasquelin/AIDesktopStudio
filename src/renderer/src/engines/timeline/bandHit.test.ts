import { describe, expect, it } from 'vitest'
import { SECOND } from '@shared/domain/time'
import { RULER_HEIGHT, type Viewport } from '../timeline/timelineGeometry'
import { animationTrack, cameraShot, timelineWith } from '../scene/animation-fixtures'
import { animationCursorAt, hitAnimation, type HitContext } from '../timeline/bandHit'
import { animationRows } from '../scene/animationRows'
import { type ClipBlock } from './bandRows'
import { CHANNEL_HEIGHT, SUBJECT_HEIGHT } from '../timeline/bandRows'

/** One pixel per 10 ms, so a second is a hundred pixels across. */
const viewport: Viewport = { scale: 100 / SECOND, offset: 0, scrollTop: 0 }

const key = (seconds: number) => ({ time: seconds * SECOND, value: { x: 0, y: 0, z: 0 } })

function contextWith(expanded: string[] = []): HitContext {
  const rows = animationRows(
    timelineWith([
      animationTrack('a', 'position', [key(0), key(2)]),
      animationTrack('b', 'rotation', [key(1)]),
    ]),
    { sceneName: 'Scene', nodes: [{ id: 'cube', name: 'Circle' }], expanded: new Set(expanded) },
  )
  return { rows, viewport, fps: 25 }
}

/** The vertical middle of the first row, which is the subject line. */
const SUBJECT_MIDDLE = RULER_HEIGHT + SUBJECT_HEIGHT / 2

describe('pointing at the animation band', () => {
  it('reads the graduated strip as a scrub, at the time under the pointer', () => {
    expect(hitAnimation(contextWith(), { x: 300, y: 4 })).toEqual({
      kind: 'ruler',
      time: 3 * SECOND,
    })
  })

  it('snaps the time it answers to the frame grid', () => {
    // 313 px is 3.13 s; at 25 fps the nearest frame is 3.12 s.
    const hit = hitAnimation(contextWith(), { x: 313, y: 4 })
    expect(hit?.kind === 'ruler' && hit.time).toBe(3_120_000)
  })

  it('finds a key when the pointer is on it', () => {
    expect(hitAnimation(contextWith(), { x: 200, y: SUBJECT_MIDDLE })).toEqual({
      kind: 'key',
      rowId: 'cube',
      time: 2 * SECOND,
    })
  })

  it('forgives a couple of pixels, since a diamond is only a few across', () => {
    const hit = hitAnimation(contextWith(), { x: 204, y: SUBJECT_MIDDLE })
    expect(hit?.kind).toBe('key')
  })

  it('reads the row itself once the pointer is clear of every key', () => {
    expect(hitAnimation(contextWith(), { x: 400, y: SUBJECT_MIDDLE })).toEqual({
      kind: 'row',
      rowId: 'cube',
      time: 4 * SECOND,
    })
  })

  it('shows a folded subject the keys of all its channels', () => {
    // The rotation key at one second belongs to channel `b`, and the folded line carries it.
    const hit = hitAnimation(contextWith(), { x: 100, y: SUBJECT_MIDDLE })
    expect(hit).toEqual({ kind: 'key', rowId: 'cube', time: 1 * SECOND })
  })

  it('reaches a channel row once the subject is unfolded', () => {
    const context = contextWith(['cube'])
    const y = RULER_HEIGHT + SUBJECT_HEIGHT + CHANNEL_HEIGHT / 2

    expect(hitAnimation(context, { x: 200, y })).toEqual({
      kind: 'key',
      rowId: 'a',
      time: 2 * SECOND,
    })
  })

  it('does not offer a rotation key on the position channel', () => {
    const context = contextWith(['cube'])
    const y = RULER_HEIGHT + SUBJECT_HEIGHT + CHANNEL_HEIGHT / 2

    // One second is `b`'s key, not `a`'s: on `a`'s row it is empty space.
    expect(hitAnimation(context, { x: 100, y })?.kind).toBe('row')
  })

  it('answers nothing below the last row rather than clamping to it', () => {
    expect(hitAnimation(contextWith(), { x: 200, y: 4_000 })).toBeNull()
  })

  it('follows the scroll, so a scrolled row is still hit where it is drawn', () => {
    const context = contextWith()
    const scrolled = { ...context, viewport: { ...viewport, scrollTop: SUBJECT_HEIGHT } }

    // The subject has scrolled up out of view, so its middle no longer answers.
    expect(hitAnimation(scrolled, { x: 200, y: SUBJECT_MIDDLE })).toBeNull()
  })

  it('follows the horizontal offset, so a panned key is hit where it is drawn', () => {
    const context = contextWith()
    const panned = { ...context, viewport: { ...viewport, offset: 1 * SECOND } }

    // Panned one second right, the key at two seconds now sits a hundred pixels in.
    expect(hitAnimation(panned, { x: 100, y: SUBJECT_MIDDLE })).toEqual({
      kind: 'key',
      rowId: 'cube',
      time: 2 * SECOND,
    })
  })
})

describe('pointing at a clip block', () => {
  const laneWith = (...blocks: readonly ClipBlock[]): HitContext => ({
    rows: animationRows(timelineWith([], { sheet: ['perso'] }), {
      sceneName: 'Scene',
      nodes: [{ id: 'perso', name: 'Perso' }],
      expanded: new Set(['perso']),
      lanes: [{ nodeId: 'perso', laneId: 'main', name: 'Animation 1', blocks }],
    }),
    viewport,
    fps: 25,
  })

  const walk: ClipBlock = { clipId: 'c1', name: 'Walk', start: 1 * SECOND, duration: 2 * SECOND }

  const withBlock = (): HitContext => laneWith(walk)

  /** The vertical middle of the lane row, which sits under the object's own line. */
  const middle = RULER_HEIGHT + SUBJECT_HEIGHT + CHANNEL_HEIGHT / 2

  const where = { rowId: 'lane:perso:main', nodeId: 'perso', laneId: 'main', clipId: 'c1' }

  it('finds the block, and says how far into it the pointer landed', () => {
    expect(hitAnimation(withBlock(), { x: 150, y: middle })).toEqual({
      kind: 'block',
      ...where,
      grabbedAt: 0.5 * SECOND,
    })
  })

  it('finds the end a trim is grabbed by, at both edges', () => {
    expect(hitAnimation(withBlock(), { x: 102, y: middle })).toEqual({
      kind: 'blockEdge',
      ...where,
      edge: 'in',
    })
    expect(hitAnimation(withBlock(), { x: 298, y: middle })).toEqual({
      kind: 'blockEdge',
      ...where,
      edge: 'out',
    })
  })

  it('says the pointer is over a trim zone, which is what shows the resize cursor', () => {
    expect(animationCursorAt(withBlock(), { x: 102, y: middle })).toBe('ew-resize')
    expect(animationCursorAt(withBlock(), { x: 150, y: middle })).toBe('')
  })

  // They are drawn last, so the eye grabs what it sees.
  it('gives the later of two overlapping blocks to the hand', () => {
    const context = laneWith(walk, {
      clipId: 'c2',
      name: 'Run',
      start: 2 * SECOND,
      duration: 2 * SECOND,
    })
    const hit = hitAnimation(context, { x: 250, y: middle })

    expect(hit?.kind === 'block' && hit.clipId).toBe('c2')
  })

  it('reads the row rather than the block once the pointer is past its end', () => {
    // The block runs from one to three seconds; four is beyond it.
    expect(hitAnimation(withBlock(), { x: 400, y: middle })?.kind).toBe('row')
  })

  it('reads the row rather than the block before its start', () => {
    expect(hitAnimation(withBlock(), { x: 20, y: middle })?.kind).toBe('row')
  })
})

describe('pointing at a shot', () => {
  const withShot = (): HitContext => ({
    rows: animationRows(
      timelineWith([], {
        shots: [cameraShot('s1', { start: 1 * SECOND, duration: 2 * SECOND })],
      }),
      { sceneName: 'Scene', nodes: [{ id: 'cam-a', name: 'Camera A' }], expanded: new Set() },
    ),
    viewport,
    fps: 25,
  })

  /** The vertical middle of the shot line, which is the first row of the sheet. */
  const middle = RULER_HEIGHT + SUBJECT_HEIGHT / 2

  it('finds the shot, and says how far into it the pointer landed', () => {
    expect(hitAnimation(withShot(), { x: 200, y: middle })).toEqual({
      kind: 'shot',
      rowId: 'cam-a',
      shotId: 's1',
      edge: null,
      grabbedAt: 1 * SECOND,
    })
  })

  // The handles are read in pixels: a two-second shot and a four-minute one offer the same grab.
  it('reads the two edges as handles that trim', () => {
    const head = hitAnimation(withShot(), { x: 101, y: middle })
    const tail = hitAnimation(withShot(), { x: 299, y: middle })

    expect(head?.kind === 'shot' && head.edge).toBe('start')
    expect(tail?.kind === 'shot' && tail.edge).toBe('end')
  })

  it('reads the row rather than the shot away from any bar', () => {
    expect(hitAnimation(withShot(), { x: 400, y: middle })?.kind).toBe('row')
  })
})
