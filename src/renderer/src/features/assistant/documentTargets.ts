import { refused, type ActionOutcome } from '@shared/domain/assistant'
import type { DocumentKind } from '@shared/domain/document'
import type { Target } from '@shared/domain/target'
import { useDocuments } from '@/stores/documents'
import { layerTargets, selectLayer } from './canvasHandlers'
import { nodeTargets, selectNode } from './sceneHandlers'
import { montageTargets, selectInMontage } from './sequenceHandlers'

/** What one space answers about the document it holds: what may be aimed at, and how to aim. */
export type DocumentTargets = {
  targets: () => readonly Target[]
  select: (id: string) => ActionOutcome
}

/**
 * Every kind, and the one that answers so far — a `Record<DocumentKind, …>` rather than a mounted
 * host, the way `IO_BY_KIND` holds saving: a seventh kind does not compile until it has answered,
 * where a registry would leave the gap silent.
 *
 * `null` is a kind with nothing to aim at YET, and it is deliberately spelled out: the compiler
 * is what will name them the day another space grows something to aim at.
 */
const TARGETS_BY_KIND: Record<DocumentKind, DocumentTargets | null> = {
  // Reuses `layer.select` rather than a second path to arm a layer: a guard added there — a
  // locked layer, a collapsed group — has to reach a sentence too.
  image: { targets: layerTargets, select: id => selectLayer({ layerId: id }) },
  scene: { targets: nodeTargets, select: selectNode },
  // One montage, two kinds: the audio space edits the same state through the same handlers.
  sequence: { targets: montageTargets, select: selectInMontage },
  audio: { targets: montageTargets, select: selectInMontage },
  skybox: null,
  material: null,
  // A `Target` names a thing of a document — a layer, a node, a clip — and a text has none. A
  // line of a script is reached by `openScriptAt` instead.
  script: null,
  // Nothing aimable YET: elements become targets with the editor, in the lot that draws them.
  gui: null,
  // A bone carries no id — it is addressed by NAME, and the `rig.*` actions take one. A target
  // list would be a second way of naming the same joints, free to disagree with them.
  character: null,
}

/**
 * What the document in front can be aimed at, read at CALL time — the way every handler family
 * finds its surface. `null` is an answer: a home screen, or a space that declares nothing.
 */
export function frontTargets(): DocumentTargets | null {
  const { activeId, documents } = useDocuments.getState()
  const kind = activeId === null ? undefined : documents[activeId]?.kind

  return kind === undefined ? null : TARGETS_BY_KIND[kind]
}

/**
 * The document in front, as an id and a path — what a memory is anchored by.
 *
 * `null` on a home screen. Here rather than in `memoryHandlers` because this file already owns
 * the one reading of « what is in front », and a second one is free to disagree with it.
 */
export function frontDocument(): { id: string; path: string } | null {
  const { activeId, documents } = useDocuments.getState()
  const held = activeId === null ? undefined : documents[activeId]

  return held === undefined ? null : { id: held.id, path: held.path }
}

/** Aiming, whichever space holds the document. `target.select` is the one spoken door to it. */
export function aimAt(id: string): ActionOutcome {
  return (
    frontTargets()?.select(id) ??
    refused(
      'wrongSurface',
      'the document in front has nothing that can be aimed at — documents.list answers what is open and of which kind, and only an image, a scene and a montage carry targets',
    )
  )
}
