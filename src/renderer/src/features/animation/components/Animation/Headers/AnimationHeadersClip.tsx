import { mdiDeleteOutline, mdiPlus } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { clipLane, MAIN_LANE_ID, type ClipLane } from '@shared/domain/scene'
import { ToolButton } from '@/components/ToolButton'
import { lanesMinus, lanesMoved, lanesPlus } from '@/engines/scene/clipBlend'
import { setModelLanes } from '@/engines/scene/commands'
import type { LaneRow } from '@/engines/timeline/bandRows'
import { newId } from '@/helpers/ids'
import { HINT_RIGHT, TIP_RIGHT } from '@/helpers/tooltip'
import { sceneOf, useScenes } from '@/stores/scenes'
import { TimelineRow } from '../../../../timeline/components/Timeline/Row/TimelineRow'

/**
 * The lanes of a model as an edit must see them: what the sheet DRAWS, which for a model that has
 * never played anything is one lane the document does not hold yet.
 */
function lanesShown(documentId: string, nodeId: string): readonly ClipLane[] {
  const node = sceneOf(useScenes.getState(), documentId).nodes.find(one => one.id === nodeId)
  if (node?.type !== 'model') return []

  return node.model.lanes ?? [clipLane(MAIN_LANE_ID)]
}

/**
 * One lane of an object's track. Its blocks are drawn on the band beside it, so what this line
 * holds is the lane's own name and what can be done to the lane itself.
 */
export function AnimationHeadersClip({ documentId, row }: { documentId: string; row: LaneRow }) {
  const { t } = useTranslation()

  const write = (lanes: readonly ClipLane[] | null): void => {
    if (lanes) useScenes.getState().runCommand(documentId, setModelLanes(row.nodeId, lanes))
  }

  return (
    <TimelineRow
      height={row.height}
      nested
      level={2}
      reorder={{
        label: t('animation.reorderRow', { name: row.name }),
        // The order of the lanes is an EDIT, so the drag is banked as one entry — and the answer
        // is what the row ACTUALLY travelled, zero at the ends of the stack.
        move: by => {
          const shown = lanesShown(documentId, row.nodeId)
          const moved = lanesMoved(shown, row.laneId, by)
          if (!moved) return 0

          write(moved)
          return (
            moved.findIndex(lane => lane.id === row.laneId) -
            shown.findIndex(lane => lane.id === row.laneId)
          )
        },
        begin: () => useScenes.getState().beginGesture(documentId),
        end: () => useScenes.getState().endGesture(documentId),
      }}
      data-testid={`anim-clip-${row.laneId}`}
    >
      <div className="flex items-center gap-0.5">
        <span className="text-muted text-tiny min-w-0 flex-1 truncate" {...HINT_RIGHT(row.name)}>
          {row.name}
        </span>
        {row.last && (
          <ToolButton
            icon={mdiPlus}
            label={t('animation.addLane')}
            description={t('animation.addLaneHint')}
            tooltip={TIP_RIGHT}
            variant="header"
            onClick={() => write(lanesPlus(lanesShown(documentId, row.nodeId), `lane_${newId()}`))}
          />
        )}
        <ToolButton
          icon={mdiDeleteOutline}
          label={t('animation.removeLane', { name: row.name })}
          tooltip={TIP_RIGHT}
          variant="header"
          onClick={() => write(lanesMinus(lanesShown(documentId, row.nodeId), row.laneId))}
        />
      </div>
    </TimelineRow>
  )
}
