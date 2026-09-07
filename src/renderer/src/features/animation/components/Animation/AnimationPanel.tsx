import { mdiRhombus } from '@mdi/js'
import { useMemo, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/EmptyState'
import { PanelHeader } from '@pasquelin/panels'
import { putOnAnimationSheet } from '@/engines/scene/animationCommands'
import { sceneNodeDrag } from '@/features/scene/components/dragged'
import { clipRefLabel } from '@/helpers/clipLabel'
import { useHeadInsideBand } from '@/hooks/useHeadInsideBand'
import {
  playedBlockOf,
  TimelineClipSettings,
} from '../../../timeline/components/Timeline/TimelineClipSettings'
import { animationViewOf, keySetOf, useAnimationViews } from '@/stores/animationView'
import { useModelFiles } from '@/stores/modelFiles'
import { sceneOf, useScenes } from '@/stores/scenes'
import { AnimationCanvas } from './AnimationCanvas'
import { AnimationHeaders } from './Headers/AnimationHeaders'
import { animationPanelRows } from './animationPanelRows'

export type AnimationPanelProps = { documentId: string }

/**
 * The animation of a 3D scene, laid out as a dope sheet: one line per object, its channels
 * folded underneath, and the keys as diamonds along a graduated ruler.
 *
 * Tracks ADD UP here rather than take turns — that was the decision, and it is why moving an
 * object writes into its rest pose unless auto-key is on: with the head recording, a drag
 * becomes a key instead, which is what `movesToCommand` reads the flag for.
 */
export function AnimationPanel({ documentId }: AnimationPanelProps) {
  const { t } = useTranslation()
  const timeline = useScenes(state => sceneOf(state, documentId).animation)
  const nodes = useScenes(state => sceneOf(state, documentId).nodes)
  const expandedList = useAnimationViews(state => animationViewOf(state, documentId).expanded)
  const pickedBlock = useAnimationViews(state => animationViewOf(state, documentId).pickedBlock)
  const order = useAnimationViews(state => animationViewOf(state, documentId).order)

  useHeadInsideBand(documentId, timeline.duration)

  // Both memos are keyed on identities zustand keeps stable; building either inside a selector
  // would hand it a new snapshot every render and the subscription would never settle.
  const expanded = useMemo(() => keySetOf(expandedList), [expandedList])
  const lengths = useModelFiles(state => state.lengths[documentId])
  const rows = useMemo(
    () => animationPanelRows(timeline, nodes, expanded, lengths, order, t),
    [timeline, nodes, expanded, lengths, order, t],
  )

  // The block whose settings stand beside the band, and what names them: one answer, read twice.
  const settled = playedBlockOf(nodes, pickedBlock)

  /**
   * The PANEL takes the drop, never the canvas: an empty band draws no canvas at all — the empty
   * state stands there — and that is the very moment a first object is dropped.
   */
  const onDropNodes = (event: DragEvent<HTMLDivElement>): void => {
    const nodeIds = sceneNodeDrag.idsFrom(event)
    if (nodeIds.length === 0) return

    event.preventDefault()
    const command = putOnAnimationSheet(sceneOf(useScenes.getState(), documentId), nodeIds)
    if (command) useScenes.getState().runCommand(documentId, command)
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={event => {
        if (!sceneNodeDrag.carries(event)) return
        event.preventDefault()
        // The `+` under the pointer, which its channel allows — see `panels/scene/dragged`.
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={onDropNodes}
    >
      {rows.length === 0 ? (
        <EmptyState icon={mdiRhombus} message={t('animation.noTrack')} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <AnimationHeaders documentId={documentId} rows={rows} />
          <div className="min-w-0 flex-1">
            <AnimationCanvas documentId={documentId} rows={rows} />
          </div>
          {/* Beside the block one is looking at, and only then: mounted whatever was picked, it
              was 224 px of bordered nothing on every band holding no block — the skeleton
              window's own band holds none at all. */}
          {settled && (
            <aside
              aria-label={t('animation.blockSettings')}
              className="border-edge w-56 shrink-0 overflow-y-auto border-l"
            >
              {/* Named, and named after the BLOCK: unlabelled it was a column of controls with
                  nothing saying what they settled — « c'est quoi à droite de la timeline ». */}
              <PanelHeader title={clipRefLabel(settled.played, t)} />
              <div className="px-2 py-1">
                <TimelineClipSettings documentId={documentId} />
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
