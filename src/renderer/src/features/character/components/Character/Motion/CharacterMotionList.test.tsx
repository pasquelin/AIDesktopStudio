import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnimationTimeline } from '@shared/domain/animation'
import { STUDIO_METADATA_KEY } from '@shared/domain/studioMetadata'
import { motionFile } from '@/character/characterMotion-fixtures'
import { animationTrack, timelineWith } from '@/engines/scene/animation-fixtures'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { installFakeBridge } from '@/services/fakeBridge'
import { installScene } from '@/stores/scene-fixtures'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { seedCharacter } from '@/stores/character'
import { clearCharacters } from '@/stores/character-fixtures'
import { sceneOf, useScenes } from '@/stores/scenes'
import { CharacterMotionList } from './CharacterMotionList'

const ASSET = 'asset-hero'
const DOCUMENT = 'character:asset-hero'
const NODE = 'node-9'

const keyed = timelineWith([
  animationTrack('track-1', 'position', [{ time: 0, value: { x: 0, y: 1, z: 0 } }], {
    target: { nodeId: 'posed-elsewhere', bone: 'Spine', property: 'position' },
  }),
])

function serve(bytes: Uint8Array): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(bytes.buffer) } as Response),
    ),
  )
}

const timelineOf = (): AnimationTimeline => sceneOf(useScenes.getState(), DOCUMENT).animation

const openMotionOf = (): string | null =>
  animationViewOf(useAnimationViews.getState(), DOCUMENT).openMotion

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

const list = (onSave?: (asNew: boolean) => Promise<void>) =>
  render(
    <CharacterMotionList
      assetId={ASSET}
      documentId={DOCUMENT}
      nodeId={NODE}
      playable
      onSave={onSave}
    />,
  )

describe('the motions a character knows', () => {
  /** 🛑 The keys a hand posed, never the clip baked frame by frame. */
  it('takes a motion back onto the band, aimed at the model this workshop holds', async () => {
    serve(motionFile({ [STUDIO_METADATA_KEY]: { animation: keyed } }))
    list()

    await userEvent.click(screen.getByRole('button', { name: /Reprendre/ }))

    expect(timelineOf().tracks[0]?.target).toEqual({
      nodeId: NODE,
      bone: 'Spine',
      property: 'position',
    })
    expect(timelineOf().tracks[0]?.keys).toEqual(keyed.tracks[0]?.keys)
    // What a second save must land on, rather than filing a copy beside the file it came from.
    expect(openMotionOf()).toBe('asset-walk')
  })

  // Every motion of the project is offered and most were posed elsewhere: a file from a library
  // carries a clip and no band. Emptying the bench over one would lose the work standing on it.
  it('leaves the band alone for a motion this studio wrote no band into', async () => {
    serve(motionFile({}))
    list()

    await userEvent.click(screen.getByRole('button', { name: /Reprendre/ }))

    expect(timelineOf().tracks).toEqual([])
    expect(openMotionOf()).toBeNull()
  })

  /**
   * 🛑 The bench has to be able to LET GO: aimed at a motion for ever, the next movement posed
   * here is written over it instead of being filed, and nothing on screen says so.
   */
  it('lets go of a motion that is taken out of the list', async () => {
    serve(motionFile({ [STUDIO_METADATA_KEY]: { animation: keyed } }))
    list()
    await userEvent.click(screen.getByRole('button', { name: /Reprendre/ }))

    await userEvent.click(screen.getByRole('button', { name: 'Retirer ce mouvement' }))

    expect(openMotionOf()).toBeNull()
  })
})
