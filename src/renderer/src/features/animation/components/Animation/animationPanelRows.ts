import type { TFunction } from 'i18next'
import { clipKeyOf, clipLane, MAIN_LANE_ID } from '@shared/domain/scene'
import { animationRows, type SheetLane } from '@/engines/scene/animationRows'
import type { ClipBlock } from '@/engines/timeline/bandRows'
import { clipSpanOf } from '@/engines/scene/clipBlend'
import { clipRefLabel } from '@/helpers/clipLabel'
import type { SceneNode } from '@/engines/scene/sceneState'

type Timeline = Parameters<typeof animationRows>[0]
type Nodes = readonly SceneNode[]
type Lengths = Readonly<Record<string, Readonly<Record<string, number>>>> | undefined

function sheetLanesOf(
  timeline: Timeline,
  nodes: Nodes,
  lengths: Lengths,
  t: TFunction,
): SheetLane[] {
  // Only the models the band shows: building lanes for every model made an 8,000-model scene
  // with three visible models throw 7,997 lane calculations away.
  const onBand = new Set([
    ...timeline.sheet,
    ...timeline.tracks.map(track => track.target.nodeId),
    ...nodes.flatMap(node =>
      node.type === 'model' && (node.model.lanes ?? []).some(lane => lane.clips.length > 0)
        ? node.id
        : [],
    ),
  ])
  const sheetLanes: SheetLane[] = []
  for (const node of nodes) {
    if (node.type !== 'model' || !onBand.has(node.id)) continue
    for (const [rank, lane] of (node.model.lanes ?? [clipLane(MAIN_LANE_ID)]).entries()) {
      const blocks: ClipBlock[] = []
      for (const ref of lane.clips) {
        const seconds = lengths?.[node.id]?.[clipKeyOf(ref.source)] ?? null
        if (seconds === null) continue
        blocks.push({
          clipId: ref.id,
          name: clipRefLabel(ref, t),
          start: ref.start,
          duration: clipSpanOf(ref, seconds),
        })
      }
      sheetLanes.push({
        nodeId: node.id,
        laneId: lane.id,
        name: t('animation.lane', { index: rank + 1 }),
        blocks,
      })
    }
  }
  return sheetLanes
}

export function animationPanelRows(
  timeline: Timeline,
  nodes: Nodes,
  expanded: ReadonlySet<string>,
  lengths: Lengths,
  order: readonly string[],
  t: TFunction,
) {
  return animationRows(timeline, {
    nodes,
    expanded,
    lanes: sheetLanesOf(timeline, nodes, lengths, t),
    order,
    sceneName: t('animation.sceneSubject'),
  })
}
