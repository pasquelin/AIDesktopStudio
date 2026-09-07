import { isRecord } from '@shared/guards'

/**
 * What a row of the animations panel carries while it is dragged, and what the band reads when
 * it is dropped.
 *
 * In a module of its own because both halves need it: a type imported back from the panel by its
 * own row closes an import cycle, which `import-cycles.test.ts` holds at zero.
 */
export type DraggedAnimation =
  { kind: 'embedded'; clip: string } | { kind: 'bundled'; name: string }

/** The drag format. Namespaced so a file dropped from the desktop is never read as one of these. */
export const ANIMATION_DRAG_TYPE = 'application/x-ai-desktop-studio-animation'

/** What was dropped, or nothing: the payload crossed a `dataTransfer` as text and is not typed. */
export function draggedAnimationOf(value: unknown): DraggedAnimation | null {
  if (!isRecord(value)) return null

  if (value.kind === 'embedded' && typeof value.clip === 'string') {
    return { kind: 'embedded', clip: value.clip }
  }
  if (value.kind === 'bundled' && typeof value.name === 'string') {
    return { kind: 'bundled', name: value.name }
  }
  return null
}
