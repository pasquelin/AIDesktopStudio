import { useTranslation } from 'react-i18next'
import { BODY_PARTS, WHOLE_BODY } from '@shared/domain/humanoid'
import {
  CLIP_SPEED,
  MAX_CLIP_FADE,
  ROOT_MOTIONS,
  type ClipLane,
  type ClipRef,
} from '@shared/domain/scene'
import { secondsToUs, usToSeconds } from '@shared/domain/time'
import { SelectField } from '@/components/SelectField'
import { SliderField } from '@/components/SliderField'
import { ToggleField } from '@/components/ToggleField'
import { laneHolding, lanesWith } from '@/engines/scene/clipBlend'
import { setModelLanes } from '@/engines/scene/commands'
import { animationViewOf, useAnimationViews } from '@/stores/animationView'
import { sceneOf, useScenes } from '@/stores/scenes'
import type { ModelNode, SceneNode } from '@/engines/scene/sceneState'

export type TimelineClipSettingsProps = { documentId: string }

/**
 * How the chosen block plays: its speed, whether it loops, how it joins its neighbours, whether
 * it moves the character, and which half of the body it drives.
 *
 * 🛑 On the BAND and not in the inspector, which is where these used to live. What one edits is a
 * block, and the band is the one surface that shows which — the inspector had to guess, and it
 * guessed wrong: Play was armed over a block nobody had picked.
 */
/** The block the band holds picked, and the model that plays it — `null` while none is. */
export function playedBlockOf(
  nodes: readonly SceneNode[],
  picked: string | null,
): { holder: ModelNode; played: ClipRef } | null {
  const holder = nodes.find(
    (node): node is ModelNode =>
      node.type === 'model' &&
      (node.model.lanes ?? []).some(lane => lane.clips.some(clip => clip.id === picked)),
  )
  const played = holder?.model.lanes?.flatMap(lane => lane.clips).find(clip => clip.id === picked)

  return holder && played ? { holder, played } : null
}

export function TimelineClipSettings({ documentId }: TimelineClipSettingsProps) {
  const { t } = useTranslation()
  const picked = useAnimationViews(state => animationViewOf(state, documentId).pickedBlock)
  const nodes = useScenes(state => sceneOf(state, documentId).nodes)

  const block = playedBlockOf(nodes, picked)
  if (!block) return null

  const { holder, played } = block

  // The chosen block replaced INSIDE its own lane, every other lane carried over untouched:
  // rewriting the whole field from one control would drop every block this row does not show.
  const write = (next: ClipRef): void => {
    const lanes: readonly ClipLane[] = holder.model.lanes ?? []
    const written = lanesWith(lanes, laneHolding(lanes, played.id)?.id ?? '', clips =>
      clips.map(clip => (clip.id === played.id ? next : clip)),
    )
    if (written) useScenes.getState().runCommand(documentId, setModelLanes(holder.id, written))
  }

  return (
    <>
      <SliderField
        label={t('inspector.clipSpeed')}
        scId="animation.clipSpeed"
        value={played.speed}
        min={CLIP_SPEED.min}
        max={CLIP_SPEED.max}
        step={0.1}
        onChange={speed => write({ ...played, speed })}
      />
      <ToggleField
        label={t('inspector.clipLoop')}
        scId="animation.clipLoop"
        value={played.loop}
        onChange={loop => write({ ...played, loop })}
      />
      {/* One value for both edges: what is being set is how this move JOINS its neighbours, and a
          block whose two ends faded differently would have no such thing. */}
      <SliderField
        label={t('inspector.clipFade')}
        scId="animation.clipFade"
        value={usToSeconds(played.fadeIn)}
        min={0}
        max={MAX_CLIP_FADE}
        step={0.05}
        onChange={seconds =>
          write({ ...played, fadeIn: secondsToUs(seconds), fadeOut: secondsToUs(seconds) })
        }
      />
      <SelectField
        label={t('inspector.clipRootMotion')}
        value={played.rootMotion}
        options={ROOT_MOTIONS.map(motion => ({
          value: motion,
          label: t(`inspector.rootMotion_${motion}`),
        }))}
        onChange={rootMotion => write({ ...played, rootMotion })}
        scId="animation.rootMotion"
      />
      {/* What makes two blocks stack rather than average each other out. */}
      <SelectField
        label={t('inspector.clipPart')}
        value={played.part ?? WHOLE_BODY}
        options={BODY_PARTS.map(part => ({
          value: part,
          label: t(`inspector.clipPart_${part}`),
        }))}
        onChange={part => write({ ...played, part })}
        scId="animation.clipPart"
      />
    </>
  )
}
