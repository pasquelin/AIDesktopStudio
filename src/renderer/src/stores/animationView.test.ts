import { beforeEach, describe, expect, it } from 'vitest'
import { SECOND } from '@shared/domain/time'
import { DEFAULT_VIEWPORT } from '@/engines/timeline/viewport'
import { animationViewOf, keySetOf, useAnimationViews } from './animationView'

const DOCUMENT = 'doc-1'

const viewOf = () => animationViewOf(useAnimationViews.getState(), DOCUMENT)

describe('how a scene band is being looked at', () => {
  beforeEach(() => useAnimationViews.setState({ views: {} }))

  it('looks at a document nobody has opened the default way', () => {
    expect(viewOf()).toEqual({
      viewport: DEFAULT_VIEWPORT,
      expanded: [],
      selected: [],
      pickedBlock: null,
      autoKey: false,
      looping: false,
      openMotion: null,
      order: [],
    })
  })

  // With both held, Delete would have two answers and the eye no way of knowing which.
  it('empties the picked keys when a block is chosen, and the other way round', () => {
    const store = useAnimationViews.getState()
    store.setSelected(DOCUMENT, ['row@0'])
    store.setPickedBlock(DOCUMENT, 'c1')

    expect(viewOf().selected).toEqual([])
    expect(viewOf().pickedBlock).toBe('c1')

    useAnimationViews.getState().setSelected(DOCUMENT, ['row@0'])
    expect(viewOf().pickedBlock).toBeNull()
  })

  it('holds a viewport per document, so two scenes are two points of view', () => {
    const moved = { scale: 1 / SECOND, offset: 2 * SECOND, scrollTop: 40 }
    useAnimationViews.getState().setViewport(DOCUMENT, moved)

    expect(viewOf().viewport).toEqual(moved)
    expect(animationViewOf(useAnimationViews.getState(), 'doc-2').viewport).toEqual(
      DEFAULT_VIEWPORT,
    )
  })

  it('unfolds a subject, and folds it back', () => {
    const { toggleExpanded } = useAnimationViews.getState()

    toggleExpanded(DOCUMENT, 'cube')
    expect(viewOf().expanded).toEqual(['cube'])

    toggleExpanded(DOCUMENT, 'cube')
    expect(viewOf().expanded).toEqual([])
  })

  it('keeps two unfolded subjects apart', () => {
    const { toggleExpanded } = useAnimationViews.getState()
    toggleExpanded(DOCUMENT, 'cube')
    toggleExpanded(DOCUMENT, 'rig/Hips')

    expect(viewOf().expanded).toEqual(['cube', 'rig/Hips'])

    toggleExpanded(DOCUMENT, 'cube')
    expect(viewOf().expanded).toEqual(['rig/Hips'])
  })

  it('records with auto-key, and stops', () => {
    useAnimationViews.getState().setAutoKey(DOCUMENT, true)
    expect(viewOf().autoKey).toBe(true)

    useAnimationViews.getState().setAutoKey(DOCUMENT, false)
    expect(viewOf().autoKey).toBe(false)
  })

  it('replaces the picked keys rather than adding to them', () => {
    const { setSelected } = useAnimationViews.getState()
    setSelected(DOCUMENT, ['cube@0'])
    setSelected(DOCUMENT, ['cube@1000000'])

    expect(viewOf().selected).toEqual(['cube@1000000'])
  })

  it('forgets a document, and leaves the others standing', () => {
    useAnimationViews.getState().setAutoKey(DOCUMENT, true)
    useAnimationViews.getState().setAutoKey('doc-2', true)

    useAnimationViews.getState().forget(DOCUMENT)

    expect(viewOf().autoKey).toBe(false)
    expect(animationViewOf(useAnimationViews.getState(), 'doc-2').autoKey).toBe(true)
  })

  it('forgets a document nobody ever looked at without complaining', () => {
    expect(() => useAnimationViews.getState().forget('never-opened')).not.toThrow()
  })
})

describe('the picked keys, as a set', () => {
  it('answers what it was given, and an empty one for nothing', () => {
    expect([...keySetOf(['a@0', 'b@1'])]).toEqual(['a@0', 'b@1'])
    expect(keySetOf([]).size).toBe(0)
  })

  it('builds a NEW set each call, which is why it must never be a selector', () => {
    const keys = ['a@0']
    expect(keySetOf(keys)).not.toBe(keySetOf(keys))
  })
})
