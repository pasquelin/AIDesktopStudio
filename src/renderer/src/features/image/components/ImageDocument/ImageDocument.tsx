import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bindingOf, type CommandId } from '@shared/domain/command'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useLatest } from '@/hooks/useLatest'
import type { Asset } from '@shared/domain/asset'
import { cn } from '@/helpers/cn'
import { useRestoredDocument } from '@/hooks/useRestoredDocument'
import { useShortcuts } from '@/hooks/useShortcuts'
import { layerById } from '@/engines/canvas/canvasState'
import { DEFAULT_BRUSH, type BrushSettings } from '@/engines/canvas/brush'
import { RULER_SIZE } from '@/engines/canvas/CanvasOverlay'
import { useBindingOverrides } from '@/stores/bindings'
import { removeLayer } from '@/engines/canvas/commands'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { canvasOf, isCanvasDirty, useCanvases } from '@/stores/canvases'
import { selectionOf, useCanvasViews, canvasViewOf, cropFrameOf } from '@/stores/canvasViews'
import { useDocumentIsInFront } from '@/stores/documents'
import {
  AI_EDIT_TOOL,
  armingCommand,
  canvasToolFor,
  CROP_TOOLS,
  DEFAULT_MODES,
  IMAGE_TOOLS,
  selectionShapeFor,
  shapeKindFor,
} from '../../imageTools'
import { placeAsset } from '../../placeAsset'
import { revealAssets } from '@/helpers/revealPanel'
import { useLivePreview } from '@/hooks/useLivePreview'
import { useDocuments } from '@/stores/documents'
import { useImageDocumentEngine } from '@/hooks/useImageDocumentEngine'
import { useImageDocumentCommands } from '@/hooks/useImageDocumentCommands'
import { ImageDocumentView } from './ImageDocumentView'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import { useCanvasGenerationComments } from '@/hooks/useCanvasGenerationComments'
import { useGeneratorCommentSubmission } from '@/hooks/useGeneratorCommentSubmission'
import { reportFailure } from '@/services/diagnostics'

export type ImageDocumentProps = { documentId: string }

/**
 * The transparency checker, as one repeating gradient — no image, and no hex: a painted white
 * has to be distinguishable from nothing at all, which a plain white page never allows.
 */
const CHECKER = cn(
  'bg-[length:16px_16px]',
  'bg-[image:repeating-conic-gradient(var(--color-chassis)_0_25%,var(--color-panel)_0_50%)]',
)

export function ImageDocument({ documentId }: ImageDocumentProps) {
  const { t, i18n } = useTranslation()

  // What this editor is drawing, published to every slot pointing at the asset it edits — the
  // live half of « edit the picture and the model follows », ahead of any save.
  useLivePreview(
    documentId,
    useDocuments(state => state.documents[documentId]?.sourceAssetId),
  )

  // The pointer, not the brush: a document opens on the tool that inspects rather than the one
  // that writes, so the first click on a freshly opened picture cannot leave a mark on it.
  const [tool, setTool] = useState('pointer')
  // One armed mode per group, not one state per tool: a new group would otherwise mean a new
  // `useState` and a new branch in the mapping below.
  const [modes, setModes] = useState<Record<string, string>>(DEFAULT_MODES)
  const [brush, setBrush] = useState<BrushSettings>(DEFAULT_BRUSH)
  /** Whether a model edit is being flattened and uploaded — the AI group is greyed while it is. */
  const [preparing, setPreparing] = useState(false)
  const comments = useGenerationComments(state => generationCommentsOf(state, documentId))
  const updateComment = useGenerationComments(state => state.update)
  const removeComment = useGenerationComments(state => state.remove)
  const addCanvasComment = useCanvasGenerationComments(documentId)
  const submitComment = useGeneratorCommentSubmission()

  const canvas = useCanvases(state => canvasOf(state, documentId))
  const view = useCanvasViews(state => canvasViewOf(state, documentId))
  // What the rulers take from the top and the left when they are on, and nothing when they are off.
  const rulerInset = view.rulers ? RULER_SIZE : 0
  const selection = useCanvasViews(state => selectionOf(state, documentId))
  const cropFrame = useCanvasViews(state => cropFrameOf(state, documentId))
  const bindings = useBindingOverrides()
  const label = useShortcutLabel()
  const active = useDocumentIsInFront(documentId)

  const {
    hostRef,
    engineRef: engine,
    editing,
    setEditing,
  } = useImageDocumentEngine(documentId, setBrush, addCanvasComment)

  // After the engine is registered, never before: the pixels are handed to it, and it has to be
  // reachable.
  useDocumentTitle(
    documentId,
    useCanvases(state => isCanvasDirty(state, documentId)),
  )

  useRestoredDocument(documentId)

  // The engine holds the pixels, never the stack: every state change is pushed into it.
  useEffect(() => {
    engine.current?.apply(canvas)
  }, [canvas, engine])

  useEffect(() => {
    engine.current?.setView(view)
  }, [view, engine])

  useEffect(() => {
    engine.current?.setLanguage(i18n.language)
  }, [i18n.language, engine])

  useEffect(() => {
    engine.current?.setSelection(selection)
  }, [selection, engine])

  useEffect(() => {
    engine.current?.setBrush(brush)
  }, [brush, engine])

  // The layer steps aside while the field draws it, so the words are drawn once and by one thing.
  useEffect(() => {
    engine.current?.setEditingText(editing)
  }, [editing, engine])

  /** The caption being typed, read back from the stack: the field edits the layer, not a copy. */
  const typed = editing ? layerById(canvas, editing) : null
  const typing = typed?.kind === 'text' ? typed : null

  /**
   * Ends a typing session. A caption nobody typed into is REMOVED rather than left standing: an
   * empty text layer draws nothing at all, and a stack full of them is what a mis-click leaves.
   */
  const endTyping = useCallback(
    (closed: string): void => {
      // Read from the store rather than from `typing`: the last keystroke is written
      // asynchronously, and a captured layer is one render old exactly when it matters.
      const layer = layerById(canvasOf(useCanvases.getState(), documentId), closed)
      if (layer?.kind === 'text' && layer.text.trim() === '') {
        useCanvases.getState().runCommand(documentId, removeLayer(closed))
      }
      // Only while it is still the caption on screen. A click elsewhere on the canvas opens the
      // NEXT one before this blur is delivered, and closing then shut the editor that click had
      // just opened — and deleted the empty caption it had just made.
      setEditing(current => (current === closed ? null : current))
    },
    [documentId, setEditing],
  )

  const mode = modes[tool]
  // Read by the memoised `run` below, which must not be rebuilt every time the armed tool
  // changes — the shortcut listener it feeds would be torn down and hung again with it.
  const armed = useLatest(canvasToolFor(tool, mode) ?? 'move')

  useEffect(() => {
    const canvasTool = canvasToolFor(tool, mode)
    if (canvasTool) engine.current?.setTool(canvasTool)
    // The region group holds three gestures behind one tool; the bar says which is armed.
    const region = selectionShapeFor(tool, mode)
    if (region) engine.current?.setSelectionShape(region)
    // Same for the shapes group, whose six modes are one tool drawing six things.
    const shape = shapeKindFor(tool, mode)
    if (shape) engine.current?.setShape(shape)
  }, [tool, mode, engine])

  /**
   * Choosing a row arms its group: picking `Ellipse` from the shapes menu while the brush is
   * active has to hand over the ellipse, not merely remember it for later.
   */
  const pick = useCallback((toolId: string, modeId?: string) => {
    // Placing a picture arms no gesture: it is a choice, and the shelf is where one is made.
    if (modeId === 'image') return revealAssets()

    if (modeId) setModes(current => ({ ...current, [toolId]: modeId }))
    setTool(toolId)
  }, [])

  /**
   * What a key press means here. One `switch`, as every other space has one: the surface that is
   * listening is the one that answers, so `Meta+Equal` zooms an image here and stretches the
   * timeline there without either knowing about the other.
   */
  const run = useImageDocumentCommands({
    documentId,
    engineRef: engine,
    armed,
    pick,
    setBrush,
    setPreparing,
  })

  useShortcuts({
    scope: 'canvas',
    // Dockview keeps hidden tabs mounted, and the hook swallows the keys it recognises: an
    // image left in a background tab would eat the keys the space in front is listening for.
    enabled: active,
    // What the Layers panel addresses when it sends one — its rows edit the document it shows,
    // never whichever one is in front.
    documentId,
    onCommand: run,
  })

  /** A picture dropped on the canvas becomes a layer of its own, on top and armed. */
  const onDrop = (asset: Asset): void => placeAsset(documentId, asset)

  /**
   * The colour input fires continuously while the swatch is dragged; without this every frame of
   * that drag rebuilds one object per group for a list that did not change.
   *
   * Every key shown is read off the registry, never written on the button: a key remapped in the
   * settings has to move on the bar with it, exactly as `ZoomBar`'s already do.
   */
  const tools = useMemo(() => {
    // Absent rather than empty when a gesture has no key: a button says nothing instead of
    // wearing a blank where a shortcut is meant to be.
    const keyFor = (command: CommandId | null): string | undefined =>
      command ? label(bindingOf(command, bindings)) || undefined : undefined

    const keyOf = (toolId: string, modeId?: string): string | undefined =>
      keyFor(armingCommand(toolId, modeId))

    return [
      ...IMAGE_TOOLS.map(entry => ({
        ...entry,
        activeMode: modes[entry.id],
        shortcut: keyOf(entry.id),
        modes: entry.modes?.map(item => ({ ...item, shortcut: keyOf(entry.id, item.id) })),
      })),
      // No `activeMode`, and that is what makes it a menu of actions rather than a choice of
      // tool: none of its rows can be armed, so the click opens what hovering would have.
      //
      // Greyed while one is being prepared: flattening the document and uploading it takes as
      // long as the network does, and until the generator opened there was nothing at all on
      // screen to say the click had been heard.
      { ...AI_EDIT_TOOL, disabled: preparing },
      ...CROP_TOOLS.map(entry => ({
        ...entry,
        disabled: !cropFrame,
        shortcut: keyFor(entry.command),
      })),
    ]
  }, [modes, bindings, label, cropFrame, preparing])

  // Read off the registry rather than written on the buttons: a key remapped in the settings
  // has to move on the bar with it.
  const shortcuts = useMemo(
    () => ({
      zoomIn: label(bindingOf('canvas.zoomIn', bindings)),
      zoomOut: label(bindingOf('canvas.zoomOut', bindings)),
      fit: label(bindingOf('canvas.zoomFit', bindings)),
      actual: label(bindingOf('canvas.zoomActual', bindings)),
    }),
    [bindings, label],
  )

  const brushKeys = useMemo(
    () => ({
      smaller: label(bindingOf('canvas.brushSmaller', bindings)),
      larger: label(bindingOf('canvas.brushLarger', bindings)),
    }),
    [bindings, label],
  )

  return (
    <ImageDocumentView
      documentId={documentId}
      hostRef={hostRef}
      tool={tool}
      mode={mode}
      typing={typing}
      view={view}
      editingLabel={t('imageTools.textEditing')}
      endTyping={endTyping}
      rulerInset={rulerInset}
      tools={tools}
      run={run}
      pick={pick}
      setTool={setTool}
      pixelCell={canvas.pixelCell}
      brush={brush}
      setBrush={setBrush}
      brushKeys={brushKeys}
      shortcuts={shortcuts}
      onDrop={onDrop}
      checker={CHECKER}
      comments={comments}
      commentSize={canvas}
      onCommentChange={(id, text) => updateComment(documentId, id, text)}
      onCommentRemove={id => removeComment(documentId, id)}
      onCommentGenerate={
        submitComment ? id => void submitCanvasComment(submitComment, documentId, id) : undefined
      }
    />
  )
}

async function submitCanvasComment(
  submit: NonNullable<ReturnType<typeof useGeneratorCommentSubmission>>,
  documentId: string,
  commentId: string,
): Promise<void> {
  try {
    await submit(documentId, commentId)
  } catch (error) {
    reportFailure('canvas.edit', documentId, error)
  }
}
