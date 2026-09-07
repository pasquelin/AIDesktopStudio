import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { aimedAt } from '@shared/domain/target'
import { allLayers, layerById, type CanvasState, type Layer } from '@/engines/canvas/canvasState'
import type { Command } from '@/engines/core/history'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { activeImageId, useDocuments } from '@/stores/documents'
import { textOf } from './actionInputs'

export type CanvasCommands = readonly Command<CanvasState>[]

/** What a caller does about it, spelled once for the sites that answer `wrongSurface`. */
export const NO_IMAGE =
  'the document in front is no image — documents.list answers what is open and of which kind, and ' +
  'document.activate brings an image forward'

export function mountedCanvas(): { documentId: string; state: CanvasState } | null {
  const documentId = activeImageId(useDocuments.getState())
  return documentId === null
    ? null
    : { documentId, state: canvasOf(useCanvases.getState(), documentId) }
}

/**
 * One entry per command, deliberately — NOT wrapped in a gesture. Coalescing only merges commands
 * sharing an `id`, keeping the FIRST one's `revert`: a gesture around three different dials would
 * undo the opacity and leave the blend mode set.
 */
export function runCanvas(
  documentId: string,
  commands: CanvasCommands,
  nothing: string,
): ActionOutcome {
  if (commands.length === 0) return refused('badInput', nothing)
  const store = useCanvases.getState()
  for (const command of commands) store.runCommand(documentId, command)
  return { ok: true }
}

/**
 * Edits the image in front, whatever the stack holds. The document's id is handed to the builder
 * as well as its state: a command that reaches the ENGINE — a quarter turn — needs to say which.
 */
export function editCanvas(
  build: (state: CanvasState, documentId: string) => CanvasCommands,
  nothing: string,
): ActionOutcome {
  const open = mountedCanvas()
  return open
    ? runCanvas(open.documentId, build(open.state, open.documentId), nothing)
    : refused('wrongSurface', NO_IMAGE)
}

export function aimedLayer(state: CanvasState, given: string | null): Layer | undefined {
  return aimedAt(allLayers(state.layers), id => layerById(state, id), given)
}

export const noSuchLayer = (named: string | null): string =>
  `no layer "${named ?? ''}" in the image in front, by id or name — canvas.state answers "layers" ` +
  'with their ids and their names'

/**
 * The same, for one named layer, found before anything runs. The lookup is the point: a command
 * whose layer is gone answers by returning the state untouched, so without it every miss would
 * be reported as done.
 */
export function editCanvasLayer(
  input: Record<string, unknown>,
  build: (layer: Layer, state: CanvasState) => CanvasCommands,
  nothing: string,
  answer?: (layer: Layer) => unknown,
): ActionOutcome {
  const open = mountedCanvas()
  if (!open) return refused('wrongSurface', NO_IMAGE)
  const named = textOf(input, 'layerId')
  const layer = aimedLayer(open.state, named)
  if (!layer) return refused('notFound', noSuchLayer(named))
  const outcome = runCanvas(open.documentId, build(layer, open.state), nothing)
  if (!outcome.ok || !answer) return outcome
  const after = layerById(canvasOf(useCanvases.getState(), open.documentId), layer.id)
  return after ? { ok: true, data: answer(after) } : outcome
}
