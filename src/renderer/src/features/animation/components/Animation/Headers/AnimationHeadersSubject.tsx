import { mdiChevronDown, mdiChevronRight, mdiRhombus } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { SCENE_SUBJECT_ID } from '@shared/domain/animation'
import { snapToFrame } from '@shared/domain/time'
import { channelNames } from '@/helpers/channelNames'
import { ToolButton } from '@/components/ToolButton'
import { UiIcon } from '@/components/UiIcon'
import { keyNode, reorderCameraShots, unkeySubject } from '@/engines/scene/animationCommands'
import { trackIdsOf } from '@/engines/scene/animationRows'
import { type SubjectRow } from '@/engines/timeline/bandRows'
import { shotsWithCameraMoved } from '@/engines/scene/cameraShots'
import { newId } from '@/helpers/ids'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { HINT_RIGHT, TIP_RIGHT } from '@/helpers/tooltip'
import { useAnimationViews } from '@/stores/animationView'
import { sceneOf, useScenes, writeAnimationTrack } from '@/stores/scenes'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { TimelineRow } from '../../../../timeline/components/Timeline/Row/TimelineRow'
import type { RowReorder } from '../../../../timeline/components/rowReorder'
import { TrackFlagButton } from '../../../../timeline/components/Track/TrackFlagButton'
import { isFlagOnAll, TRACK_FLAGS } from '../../../../timeline/components/trackFlags'

/** A row id back into the pair its channels are addressed by — the inverse of `subjectKey`. */
function subjectOf(rowId: string): { nodeId: string; bone?: string } {
  const cut = rowId.indexOf('/')
  return cut === -1
    ? { nodeId: rowId }
    : { nodeId: rowId.slice(0, cut), bone: rowId.slice(cut + 1) }
}

export function AnimationHeadersSubject({
  documentId,
  row,
  shown,
}: {
  documentId: string
  row: SubjectRow
  shown: readonly string[]
}) {
  const { t } = useTranslation()
  const fps = useScenes(state => sceneOf(state, documentId).animation.fps)
  // The ANSWER is subscribed to rather than the head: this row asks the clock one question, and
  // there is one of these per subject — thirty of them woke sixty times a second to learn nothing.
  const standing = useSceneViews(state =>
    row.keys.includes(snapToFrame(sceneViewOf(state, documentId).playhead, fps)),
  )

  const key = (): void => {
    const { state, at } = sceneKeyingAt(documentId)

    // Pressed where a key already stands, it takes that key off: a pose one cannot undo is a
    // pose one is stuck with, and nothing else in the panel removes one.
    const command = standing
      ? unkeySubject(state, trackIdsOf(row), at)
      : keyNode(state, subjectOf(row.id), at, channelNames(t, row.name), () => `track_${newId()}`)

    if (command) useScenes.getState().runCommand(documentId, command)
  }

  // The composition has no pose to key, only the channels its panel opened: the diamond stands
  // for what those channels hold, and there is nothing at all behind it while they are none.
  const keyable = row.id !== SCENE_SUBJECT_ID || row.tracks.length > 0

  const label = t('animation.reorderRow', { name: row.name })

  // A camera's line IS the montage's law, so dragging it edits the document — where a plain
  // subject's line is only rearranged on screen, which no history holds.
  const reorder: RowReorder = row.bars
    ? {
        label,
        move: by => {
          const store = useScenes.getState()
          const moved = shotsWithCameraMoved(sceneOf(store, documentId).animation.shots, row.id, by)
          if (!moved) return 0

          store.runCommand(documentId, reorderCameraShots(row.id, moved.shots))
          return moved.steps
        },
        // A drag across three places is one thing the user did: without the gesture, `runCommand`
        // pushes an entry per step and ⌘Z gives the stack back a line at a time.
        begin: () => useScenes.getState().beginGesture(documentId),
        end: () => useScenes.getState().endGesture(documentId),
      }
    : {
        label,
        // The sheet's own arrangement, never the scene: the outliner keeps the hierarchy it has.
        move: by => useAnimationViews.getState().moveRow(documentId, shown, row.id, by),
      }

  return (
    <TimelineRow height={row.height} reorder={reorder} data-testid={`anim-subject-${row.id}`}>
      <button
        type="button"
        {...HINT_RIGHT(t('animation.foldHint'))}
        className="text-text text-tiny flex min-w-0 items-center gap-0.5 text-left"
        onClick={() => useAnimationViews.getState().toggleExpanded(documentId, row.id)}
      >
        <UiIcon path={row.expanded ? mdiChevronDown : mdiChevronRight} size={12} />
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
      </button>

      <div className="flex items-center gap-0.5">
        <ToolButton
          icon={mdiRhombus}
          label={
            standing
              ? t('animation.unkeySubject', { name: row.name })
              : t('animation.keySubject', { name: row.name })
          }
          description={standing ? t('animation.unkeySubjectHint') : t('animation.keySubjectHint')}
          tooltip={TIP_RIGHT}
          variant="header"
          active={standing}
          disabled={!keyable}
          onClick={key}
        />
        {TRACK_FLAGS.map(flag => (
          <TrackFlagButton
            key={flag.key}
            flag={flag}
            on={isFlagOnAll(row.tracks, flag)}
            name={row.name}
            tooltip={TIP_RIGHT}
            onToggle={next => {
              for (const track of row.tracks) {
                writeAnimationTrack(documentId, track.id, current => ({
                  ...current,
                  [flag.key]: next,
                }))
              }
            }}
          />
        ))}
      </div>
    </TimelineRow>
  )
}
