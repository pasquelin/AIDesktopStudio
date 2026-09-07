import { Profiler } from 'react'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { SECOND } from '@shared/domain/time'
import { addAnimationTrack } from '@/engines/scene/animationCommands'
import { animationRows } from '@/engines/scene/animationRows'
import { type SubjectRow } from '@/engines/timeline/bandRows'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useSceneViews } from '@/stores/sceneViews'
import { AnimationHeadersSubject } from './AnimationHeadersSubject'

const DOCUMENT = 'doc-1'
/** Five seconds of playback, at the rate `useAnimationPlayback` asks the screen for frames. */
const TICKS = 300
const TICK = SECOND / 60

function subjectRow(): SubjectRow {
  const timeline = { ...sceneOf(useScenes.getState(), DOCUMENT).animation, sheet: ['cube-1'] }
  const rows = animationRows(timeline, {
    sceneName: 'Scene',
    nodes: [{ id: 'cube-1', name: 'Cube' }],
    expanded: new Set<string>(),
  })
  const row = rows.find(held => held.kind === 'subject' && held.id === 'cube-1')
  if (row?.kind !== 'subject') throw new Error('no subject row for the cube')
  return row
}

/** The head run forward the way playback runs it, past the rows beside the band. */
function playFiveSeconds(): { writes: number; wakes: number } {
  const row = subjectRow()

  let writes = 0
  const stop = useSceneViews.subscribe(() => {
    writes += 1
  })

  let wakes = 0
  render(
    // A `Profiler` rather than a counter in a parent: what wakes here is the row itself, and a
    // parent that never re-renders would count nothing at all.
    <Profiler
      id="subject"
      onRender={() => {
        wakes += 1
      }}
    >
      <AnimationHeadersSubject documentId={DOCUMENT} row={row} shown={['cube-1']} />
    </Profiler>,
  )

  // One `act` per tick rather than one for the batch: a batch is a single commit, and it would
  // hide three hundred wake-ups behind one.
  for (let tick = 1; tick <= TICKS; tick += 1)
    act(() => useSceneViews.getState().setPlayhead(DOCUMENT, tick * TICK))
  stop()

  return { writes, wakes: wakes - 1 }
}

describe('what playing a scene costs the rows beside its band', () => {
  beforeEach(() => {
    const one = addAnimationTrack({ nodeId: 'cube-1', property: 'position' }, 'Cube', 't1')
    installScene(DOCUMENT, one.apply({ ...EMPTY_SCENE, nodes: [meshNode('cube-1')] }))
    useSceneViews.setState({ views: {} })
  })

  /**
   * The row asks the clock one QUESTION — whether a key stands under the head — so a head that
   * moves without changing the answer costs it nothing. `writes` is the assurance that the store
   * was really turned: without it a broken fixture would read as a quiet row.
   */
  it('sleeps through a playback that never crosses one of its keys', () => {
    expect(playFiveSeconds()).toEqual({ writes: TICKS, wakes: 0 })
  })
})
