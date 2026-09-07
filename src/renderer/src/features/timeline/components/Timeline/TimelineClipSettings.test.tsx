import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { clipLane, embeddedClip, type ClipLane, type ClipRef } from '@shared/domain/scene'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE, type ModelNode } from '@/engines/scene/sceneState'
import { useAnimationViews } from '@/stores/animationView'
import { clearScenes, installScene } from '@/stores/scene-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { TimelineClipSettings } from './TimelineClipSettings'

const DOCUMENT = 'doc-1'

const withLanes = (...lanes: ClipLane[]): void => {
  installScene(DOCUMENT, {
    ...EMPTY_SCENE,
    nodes: [{ ...modelNodeFixture('a'), model: { assetId: 'asset-1', lanes } }],
  })
}

const played = (): ClipRef | undefined => {
  const node = sceneOf(useScenes.getState(), DOCUMENT).nodes[0]
  return node?.type === 'model' ? (node as ModelNode).model.lanes?.[0]?.clips[0] : undefined
}

const show = (): void => {
  render(<TimelineClipSettings documentId={DOCUMENT} />)
}

beforeEach(() => {
  clearScenes()
  useAnimationViews.getState().setPickedBlock(DOCUMENT, null)
})

describe('how the chosen block plays', () => {
  // 🛑 The whole reason these left the inspector: it had to guess WHICH block, and it guessed the
  // first one it found — arming Play over a block nobody had picked.
  it('says nothing at all while no block is chosen', () => {
    withLanes(clipLane('main', [embeddedClip('c1', 'walk')]))
    show()

    expect(screen.queryByLabelText('Vitesse')).not.toBeInTheDocument()
  })

  it('describes the block chosen on the band, and no other', () => {
    withLanes(
      clipLane('main', [embeddedClip('c1', 'walk'), embeddedClip('c2', 'run', { speed: 2 })]),
    )
    useAnimationViews.getState().setPickedBlock(DOCUMENT, 'c2')
    show()

    expect(screen.getByLabelText('Vitesse')).toHaveValue('2')
  })

  it('writes the loop switch into the document', async () => {
    withLanes(clipLane('main', [embeddedClip('c1', 'walk')]))
    useAnimationViews.getState().setPickedBlock(DOCUMENT, 'c1')
    show()

    await userEvent.click(screen.getByLabelText('En boucle'))

    expect(played()?.loop).toBe(false)
  })

  // One value for both edges: what is set is how this move JOINS its neighbours.
  it('writes a transition on both edges of the block', async () => {
    withLanes(clipLane('main', [embeddedClip('c1', 'walk')]))
    useAnimationViews.getState().setPickedBlock(DOCUMENT, 'c1')
    show()

    await userEvent.selectOptions(screen.getByLabelText('Déplacement du personnage'), 'inPlace')

    expect(played()?.rootMotion).toBe('inPlace')
  })

  it('leaves the blocks it does not show alone', async () => {
    const kept = embeddedClip('c2', 'run', { start: 5 })
    withLanes(clipLane('main', [embeddedClip('c1', 'walk'), kept]))
    useAnimationViews.getState().setPickedBlock(DOCUMENT, 'c1')
    show()

    await userEvent.click(screen.getByLabelText('En boucle'))

    const node = sceneOf(useScenes.getState(), DOCUMENT).nodes[0]
    expect(node?.type === 'model' && node.model.lanes?.[0]?.clips[1]).toEqual(kept)
  })

  it('says nothing of a block that belongs to no model of this scene', () => {
    withLanes(clipLane('main', [embeddedClip('c1', 'walk')]))
    useAnimationViews.getState().setPickedBlock(DOCUMENT, 'gone')
    show()

    expect(screen.queryByLabelText('Vitesse')).not.toBeInTheDocument()
  })
})
