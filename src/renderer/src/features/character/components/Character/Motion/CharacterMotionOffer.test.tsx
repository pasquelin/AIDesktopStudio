import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClipLane } from '@shared/domain/scene'
import { animationTrack, timelineWith } from '@/engines/scene/animation-fixtures'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { useAnimationViews } from '@/stores/animationView'
import { seedCharacter } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { CharacterMotionOffer } from './CharacterMotionOffer'

const ASSET = 'asset-hero'
const DOCUMENT = 'character:asset-hero'
const NODE = 'node-9'

const keyed = timelineWith([
  animationTrack('track-1', 'position', [{ time: 0, value: { x: 0, y: 1, z: 0 } }], {
    target: { nodeId: 'posed-elsewhere', bone: 'Spine', property: 'position' },
  }),
])

/** The lanes the workshop's model carries, which is where a block being tried out is laid. */
const lanesOf = (): readonly ClipLane[] => {
  const node = sceneOf(useScenes.getState(), DOCUMENT).nodes[0]
  return node?.type === 'model' ? (node.model.lanes ?? []) : []
}

/** A band holding a key, which is the only state a save is offered on. */
const posed = (): void => {
  useScenes.getState().replace(DOCUMENT, {
    ...EMPTY_SCENE,
    nodes: [modelNodeFixture(NODE)],
    animation: keyed,
  })
}

beforeEach(() => {
  clearCharacters()
  installFakeBridge({
    animations: { list: () => Promise.resolve([{ name: 'Capoeira', thumbnail: true }]) },
  })
  useAnimationViews.setState({ views: {} })
  installScene(DOCUMENT, { ...EMPTY_SCENE, nodes: [modelNodeFixture(NODE)] })
  seedCharacter(ASSET, null, {
    motions: [{ id: 'motion-1', name: 'Marche', assetId: 'asset-walk' }],
  })
})

const offer = (onSave?: (asNew: boolean) => Promise<void>) =>
  render(
    <CharacterMotionOffer assetId={ASSET} documentId={DOCUMENT} nodeId={NODE} onSave={onSave} />,
  )

describe('what a character with joints is offered', () => {
  // Which of the two a save means has to be readable before it is pressed.
  it('offers to update the motion being edited, and to file a new one otherwise', () => {
    posed()
    const { rerender } = offer(() => Promise.resolve())

    expect(screen.getByRole('button', { name: 'Enregistrer le mouvement' })).toBeInTheDocument()

    useAnimationViews.getState().openMotion(DOCUMENT, 'asset-walk')
    rerender(
      <CharacterMotionOffer
        assetId={ASSET}
        documentId={DOCUMENT}
        nodeId={NODE}
        onSave={() => Promise.resolve()}
      />,
    )

    // Both, and that is the point: one writes over the motion on the bench, the other files the
    // work beside it — the way off a reopened motion, which nothing else offers.
    expect(screen.getByRole('button', { name: 'Mettre à jour le mouvement' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enregistrer un nouveau mouvement' }),
    ).toBeInTheDocument()
  })

  // The two links are one gesture each, and the flag is what tells them apart.
  it('says which of the two was pressed', async () => {
    const onSave = vi.fn(() => Promise.resolve())
    posed()
    useAnimationViews.getState().openMotion(DOCUMENT, 'asset-walk')
    offer(onSave)

    await userEvent.click(screen.getByRole('button', { name: 'Mettre à jour le mouvement' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer un nouveau mouvement' }))

    expect(onSave.mock.calls).toEqual([[false], [true]])
  })

  /**
   * 🛑 Choosing lays the REAL block: the character plays it through the real retargeting, which
   * is the only way to judge a motion before keeping it. Nothing but an asset used to answer at
   * all, so a clip of the library was a row that did nothing when pressed.
   */
  it('lays the motion on the band as soon as one is chosen', async () => {
    offer()

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un mouvement' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Capoeira' }))

    expect(lanesOf()[0]?.clips.map(clip => clip.source)).toEqual([
      { kind: 'bundled', name: 'Capoeira' },
    ])
    // And the picker now has something to preview and to map bones against.
    expect(screen.getByRole('button', { name: 'Garder' })).toBeInTheDocument()
  })

  // Cancelling has to take the block back: kept, a motion nobody chose plays on the character.
  it('takes the block off the band when the choice is cancelled', async () => {
    offer()

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un mouvement' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Capoeira' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(lanesOf()[0]?.clips ?? []).toEqual([])
  })
})
