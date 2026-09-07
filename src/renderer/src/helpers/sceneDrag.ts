import { dragChannel, type DragLike } from './drag'

/**
 * Dragging a 3D document onto a montage, so a scene can be laid on a track the way an asset is.
 *
 * Its own MIME type rather than the asset one: what flies here is a DOCUMENT, and a target that
 * mistook it for a catalogue id would look the scene up in the catalogue and find nothing. The
 * type is also what lets the strip say, during the drag, that it takes the drop — `getData`
 * answers nothing until the drop itself.
 */
export const SCENE_DRAG_TYPE = 'application/x-ai-desktop-studio-scene'

const SCENES = dragChannel(SCENE_DRAG_TYPE)

export function startSceneDrag(event: DragLike, sceneId: string): void {
  SCENES.start(event, sceneId)
  // Laying a scene on a track takes nothing away from the list it came from — the same "+"
  // under the pointer an asset drag asks for, rather than the arrow that means "moved".
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

/** Whether a scene document is what is flying. Askable during `dragover`, unlike its payload. */
export function carriesScene(event: DragLike): boolean {
  return SCENES.carries(event)
}

/** Which scene was dropped. Null before the drop, by design of the platform. */
export function droppedSceneId(event: DragLike): string | null {
  return SCENES.idFrom(event)
}
