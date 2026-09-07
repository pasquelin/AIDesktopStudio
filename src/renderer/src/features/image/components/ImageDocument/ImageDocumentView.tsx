import type { RefObject } from 'react'
import type { Asset } from '@shared/domain/asset'
import type { CommandId } from '@shared/domain/command'
import type { BrushSettings } from '@/engines/canvas/brush'
import type { TextLayer } from '@/engines/canvas/canvasState'
import type { CanvasView } from '@/engines/canvas/viewport'
import { AssetDropTarget } from '@/components/AssetDropTarget'
import { PANE_TOOLBAR } from '@/components/styles'
import { Toolbar, type ToolbarProps } from '@/components/Toolbar/Toolbar'
import { cn } from '@/helpers/cn'
import { PICTURES } from '@shared/domain/asset'
import {
  AI_EDIT_TOOL_ID,
  aiEditCommand,
  canvasToolFor,
  cropCommandOf,
  cursorFor,
} from '../../imageTools'
import { ImageDocumentBrush } from './ImageDocumentBrush'
import { ImageDocumentText } from './ImageDocumentText'
import { ZoomBar } from '../ZoomBar'
import { ImageDocumentComments } from './ImageDocumentComments'
import type { GenerationComment } from '../../generationComments'
import type { Size } from '@/engines/core/geometry'

type Shortcuts = { zoomIn: string; zoomOut: string; fit: string; actual: string }
type BrushKeys = { smaller: string; larger: string }

type ImageDocumentViewProps = {
  documentId: string
  hostRef: RefObject<HTMLDivElement | null>
  tool: string
  mode?: string
  typing: TextLayer | null
  view: CanvasView
  editingLabel: string
  endTyping: (id: string) => void
  rulerInset: number
  tools: NonNullable<ToolbarProps['tools']>
  run: (command: CommandId) => unknown
  pick: (toolId: string, modeId?: string) => void
  setTool: (tool: string) => void
  pixelCell: number | null
  brush: BrushSettings
  setBrush: (brush: BrushSettings) => void
  brushKeys: BrushKeys
  shortcuts: Shortcuts
  onDrop: (asset: Asset) => void
  checker: string
  comments: readonly GenerationComment[]
  commentSize: Size
  onCommentChange: (id: string, text: string) => void
  onCommentRemove: (id: string) => void
  onCommentGenerate?: (id: string) => void
}

export function ImageDocumentView(props: ImageDocumentViewProps) {
  const { documentId, hostRef, tool, mode, typing, view, rulerInset, tools } = props
  return (
    <div className="flex h-full min-h-0">
      <AssetDropTarget
        accepts={PICTURES}
        onDrop={props.onDrop}
        outlined={false}
        className={cn('relative min-w-0 flex-1 overflow-hidden', props.checker)}
      >
        <div ref={hostRef} className="absolute inset-0" style={{ cursor: cursorFor(tool, mode) }} />
        <ImageDocumentComments
          comments={props.comments}
          view={view}
          size={props.commentSize}
          onChange={props.onCommentChange}
          onRemove={props.onCommentRemove}
          onGenerate={props.onCommentGenerate}
        />
        {typing && (
          <ImageDocumentText
            documentId={documentId}
            layer={typing}
            viewport={view.viewport}
            label={props.editingLabel}
            onDone={props.endTyping}
          />
        )}
        <Toolbar
          className={PANE_TOOLBAR}
          style={{ marginTop: rulerInset, marginLeft: rulerInset }}
          tools={tools}
          activeTool={tool}
          onTool={toolId => {
            const command = cropCommandOf(toolId)
            return command ? props.run(command) : props.setTool(toolId)
          }}
          onMode={(toolId, modeId) => {
            if (toolId !== AI_EDIT_TOOL_ID) return props.pick(toolId, modeId)
            const command = aiEditCommand(modeId)
            if (command) props.run(command)
          }}
          extras={
            <ImageDocumentBrush
              armed={canvasToolFor(tool, mode)}
              cell={props.pixelCell}
              brush={props.brush}
              onBrush={props.setBrush}
              shortcuts={props.brushKeys}
            />
          }
        />
        <ZoomBar
          scale={view.viewport.scale}
          shortcuts={props.shortcuts}
          onZoomIn={() => props.run('canvas.zoomIn')}
          onZoomOut={() => props.run('canvas.zoomOut')}
          onFit={() => props.run('canvas.zoomFit')}
          onActual={() => props.run('canvas.zoomActual')}
        />
      </AssetDropTarget>
    </div>
  )
}
