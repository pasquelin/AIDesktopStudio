export const GENERATION_COMMENT_TEXT_MAX = 2_000
/** A name for the area, not a second body: it sits on one line beside the note's number. */
export const GENERATION_COMMENT_TITLE_MAX = 60
export const GENERATION_COMMENT_OUTLINE_MAX = 512

const CANVAS_SOURCE = 'canvas:'

export function generationCanvasSource(documentId: string): string {
  return `${CANVAS_SOURCE}${documentId}`
}

export function isGenerationCanvasSource(value: string | undefined): boolean {
  return value?.startsWith(CANVAS_SOURCE) === true
}
