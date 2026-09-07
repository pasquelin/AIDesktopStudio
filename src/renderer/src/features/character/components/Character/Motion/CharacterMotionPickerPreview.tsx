import { mdiPause, mdiPlay, mdiSkipNext, mdiSkipPrevious } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { clipKeyOf, type ClipLane } from '@shared/domain/scene'
import { usToSeconds } from '@shared/domain/time'
import { nodeById } from '@/engines/scene/sceneState'
import { clipSpanOf, laneHolding } from '@/engines/scene/clipBlend'
import { clipLengthOf, useModelFiles } from '@/stores/modelFiles'
import { SliderField } from '@/components/SliderField'
import { ToolButton } from '@/components/ToolButton'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { sceneOf, useScenes } from '@/stores/scenes'
import { useScenePreview, useSceneViews } from '@/stores/sceneViews'

export type CharacterMotionPickerPreviewProps = {
  documentId: string
  nodeId: string
  clipId: string
}

/** One identity for « this model plays nothing », so the subscription can settle. */
const NO_LANES: readonly ClipLane[] = []

/** Seconds. Fine enough to land on a pose, and the grain the end of the run is measured in. */
const SCRUB_STEP = 0.05

/**
 * Listening to the block that was just laid: play, restart, and where along it to stand.
 *
 * It plays the REAL block through the real retargeting, on the real character — nothing here is
 * a rehearsal. 🛑 What SETTLES the block — speed, loop, transition, root motion — belongs to
 * `TimelineClipSettings`, which stands beside the band the block was laid on and is on screen at
 * the same moment: drawn here too, the same two controls appeared twice.
 */
export function CharacterMotionPickerPreview({
  documentId,
  nodeId,
  clipId,
}: CharacterMotionPickerPreviewProps) {
  const { t } = useTranslation()
  const preview = useScenePreview(documentId)
  const lanes = useScenes(state => {
    const node = nodeById(sceneOf(state, documentId), nodeId)
    // NO_LANES and never a fresh `[]`: a selector handing zustand a new array on every render
    // is a subscription that never settles, and React stops at the update limit.
    return node?.type === 'model' ? (node.model.lanes ?? NO_LANES) : NO_LANES
  })

  const lane = laneHolding(lanes, clipId)
  const played = lane?.clips.find(clip => clip.id === clipId)
  const length = useModelFiles(state =>
    played ? clipLengthOf(state, documentId, nodeId, clipKeyOf(played.source)) : null,
  )
  if (!lane || !played) return null

  const watching = preview?.clipId === clipId ? preview : null
  const running = watching?.playing === true
  // The clip's own length, at the speed it plays: what the band draws the block by, and what a
  // position along it has to mean. Zero while the file has not landed — nothing to scrub yet.
  const seconds = usToSeconds(clipSpanOf(played, length))
  // A looping block wraps AT its length — the mixer reads `length % length` as the first pose —
  // so the end of the run is the step before it. A block that holds its last pose ends on it.
  const end = played.loop ? Math.max(0, seconds - SCRUB_STEP) : seconds

  const watch = (at: number, playing: boolean): void =>
    useSceneViews.getState().setPreview(documentId, { nodeId, clipId, at, playing })

  /** Gives the model back to the scene's head. */
  const stop = (): void => useSceneViews.getState().setPreview(documentId, null)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <ToolButton
          icon={mdiSkipPrevious}
          label={t('inspector.animationRestart')}
          tooltip={TIP_BOTTOM}
          onClick={() => watch(0, true)}
        />
        <ToolButton
          icon={running ? mdiPause : mdiPlay}
          label={t(running ? 'inspector.animationPause' : 'inspector.animationPlay')}
          tooltip={TIP_BOTTOM}
          active={running}
          onClick={() => (running ? stop() : watch(watching?.at ?? 0, true))}
        />
        <ToolButton
          icon={mdiSkipNext}
          label={t('inspector.animationToEnd')}
          tooltip={TIP_BOTTOM}
          disabled={seconds <= 0}
          onClick={() => watch(end, false)}
        />
      </div>
      {seconds > 0 && (
        <SliderField
          label={t('inspector.animationPosition')}
          scId="animationPicker.position"
          min={0}
          max={end}
          step={SCRUB_STEP}
          value={watching?.at ?? 0}
          onChange={at => watch(at, false)}
        />
      )}
    </div>
  )
}
