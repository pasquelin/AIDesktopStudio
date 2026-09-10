import { useState, type DragEventHandler } from 'react'
import type { AssetType } from '@shared/domain/asset'
import { carriesAsset } from '@/helpers/assetDrag'
import { cn } from '@/helpers/cn'
import { copiesDropTone, warnsDropTone, type DropTone } from '@/helpers/drag'
import { carriesScene } from '@/helpers/sceneDrag'
import {
  carriesExternalFiles,
  externalFileTargetTone,
  importExternalFilesInto,
} from '@/services/externalFiles'
import {
  placeTimelineAssetAt,
  timelineTakesType,
} from '@/features/video/components/TimelineCanvas/timelineDrop'
import type { Us } from '@/engines/timeline/timelineState'

const TIMELINE_ASSET_TYPES = ['video', 'audio', 'image'] satisfies readonly AssetType[]

type TimelineDropContext = Parameters<typeof placeTimelineAssetAt>[0]
type TimelineDropHandlers = {
  onDragOver: DragEventHandler<HTMLCanvasElement>
  onDragLeave: DragEventHandler<HTMLCanvasElement>
  onDrop: DragEventHandler<HTMLCanvasElement>
}

export function useExternalTimelineDrop(
  context: TimelineDropContext,
  fallback: DragEventHandler<HTMLCanvasElement>,
): { className: string; handlers: TimelineDropHandlers } {
  const [tone, setTone] = useState<DropTone | null>(null)
  return {
    className: cn(
      tone === 'accepted' && 'outline-accent outline-2 -outline-offset-2',
      warnsDropTone(tone) && 'outline-danger outline-2 -outline-offset-2',
    ),
    handlers: {
      onDragOver: event => {
        if (carriesAsset(event) || carriesScene(event)) {
          setTone(null)
          event.preventDefault()
          return
        }
        const point = context.pointAt(event)
        const accepted = TIMELINE_ASSET_TYPES.filter(type =>
          timelineTakesType(context, type, point),
        )
        const externalTone = externalFileTargetTone(event, accepted)
        if (!externalTone) return
        setTone(externalTone)
        event.preventDefault()
        event.dataTransfer.dropEffect = copiesDropTone(externalTone) ? 'copy' : 'none'
      },
      onDragLeave: () => setTone(null),
      onDrop: event => {
        setTone(null)
        if (!carriesExternalFiles(event)) return fallback(event)
        const point = context.pointAt(event)
        const accepted = TIMELINE_ASSET_TYPES.filter(type =>
          timelineTakesType(context, type, point),
        )
        if (externalFileTargetTone(event, accepted) === 'refused') return
        event.preventDefault()
        event.stopPropagation()
        // End to end from the point the pointer was let go at — V5. One time carried across the
        // lot, so five rushes dropped together read as a cut rather than as five clips on one
        // frame; a landing the montage refuses does not move it on.
        let from: Us | null = null
        void importExternalFilesInto(event.dataTransfer.files, accepted, asset => {
          const landed = placeTimelineAssetAt(context, asset, point, from)
          if (landed === null) return false
          from = landed
          return true
        })
      },
    },
  }
}
