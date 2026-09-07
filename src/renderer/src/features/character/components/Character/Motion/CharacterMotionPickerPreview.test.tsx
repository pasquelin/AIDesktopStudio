import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { bundledClip, clipLane, MAIN_LANE_ID, type ClipRef } from '@shared/domain/scene'
import { EMPTY_SCENE } from '@/engines/scene/sceneState'
import { modelNodeFixture } from '@/engines/scene/scene-fixtures'
import { useModelFiles } from '@/stores/modelFiles'
import { installScene } from '@/stores/scene-fixtures'
import { useSceneViews } from '@/stores/sceneViews'
import { CharacterMotionPickerPreview } from './CharacterMotionPickerPreview'

const DOCUMENT = 'doc-1'
const CLIP = 'block-1'

/** The clip is four seconds long, so a position along it is a number the assertions can name. */
const LENGTH = 4

const watchedNow = () => useSceneViews.getState().views[DOCUMENT]?.preview ?? null

function show(length: number | null = LENGTH, clip: Partial<ClipRef> = {}): void {
  const node = modelNodeFixture('a')
  installScene(DOCUMENT, {
    ...EMPTY_SCENE,
    nodes: [
      {
        ...node,
        model: {
          ...node.model,
          lanes: [clipLane(MAIN_LANE_ID, [bundledClip(CLIP, 'Capoeira', clip)])],
        },
      },
    ],
  })
  useModelFiles.setState({
    lengths: length === null ? {} : { [DOCUMENT]: { a: { 'bundled:Capoeira': length } } },
  })
  render(<CharacterMotionPickerPreview documentId={DOCUMENT} nodeId="a" clipId={CLIP} />)
}

describe('watching the block that was laid', () => {
  beforeEach(() => {
    useModelFiles.setState({ clips: {}, rigs: {}, lengths: {} })
    useSceneViews.setState({ views: {} })
  })

  it('plays from the start, and gives the model back when it is stopped', async () => {
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Jouer l’aperçu' }))
    expect(watchedNow()).toMatchObject({ clipId: CLIP, at: 0, playing: true })

    await userEvent.click(screen.getByRole('button', { name: 'Arrêter l’aperçu' }))
    expect(watchedNow()).toBeNull()
  })

  /** The whole point of a position: a pose is looked AT, so it must not run away under the eye. */
  it('holds the pose a scrub lands on', async () => {
    show()

    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '1.5' } })

    expect(watchedNow()).toMatchObject({ at: 1.5, playing: false })
  })

  it('resumes from where the scrub left it rather than from the start', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '2' } })

    await userEvent.click(screen.getByRole('button', { name: 'Jouer l’aperçu' }))

    expect(watchedNow()).toMatchObject({ at: 2, playing: true })
  })

  /**
   * A step short of the length, and that step is the whole point: the mixer wraps a looping clip
   * AT its length — `length % length` is the FIRST pose — so aiming at it would show frame zero
   * under a button that says « go to the end ».
   */
  it('goes to the last pose of a looping clip rather than back to its first', async () => {
    show()

    await userEvent.click(screen.getByRole('button', { name: 'Aller à la fin' }))

    expect(watchedNow()?.at).toBeLessThan(LENGTH)
    expect(watchedNow()).toMatchObject({ playing: false })
    expect(watchedNow()?.at).toBeGreaterThan(LENGTH - 0.5)
  })

  it('goes to the very end of a clip that holds its last pose instead', async () => {
    show(LENGTH, { loop: false })

    await userEvent.click(screen.getByRole('button', { name: 'Aller à la fin' }))

    expect(watchedNow()).toMatchObject({ at: LENGTH, playing: false })
  })

  it('starts over from zero however far the scrub had gone', async () => {
    show()
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: '3' } })

    await userEvent.click(screen.getByRole('button', { name: 'Revenir au début' }))

    expect(watchedNow()).toMatchObject({ at: 0, playing: true })
  })

  // The length lives in the GLB: a file still loading has no position to offer, and a slider from
  // zero to zero would read as a control that does nothing.
  it('offers no position at all while the file has not landed', () => {
    show(null)

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aller à la fin' })).toBeDisabled()
  })
})
