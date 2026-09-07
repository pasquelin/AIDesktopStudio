export const GENERATION_COMMENT_TEXT_MAX = 2_000
export const GENERATION_COMMENT_OUTLINE_MAX = 512

const CANVAS_SOURCE = 'canvas:'

export function generationCanvasSource(documentId: string): string {
  return `${CANVAS_SOURCE}${documentId}`
}

export function isGenerationCanvasSource(value: string | undefined): boolean {
  return value?.startsWith(CANVAS_SOURCE) === true
}
