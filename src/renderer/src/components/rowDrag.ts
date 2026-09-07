import { dragListChannel } from '@/helpers/drag'

/**
 * What a list of the project folder drags on — shared, because two spellings of one MIME type is a
 * drop the browser refuses without a word. The type still reads `tree-row`, where it was declared.
 */
export const rowDrag = dragListChannel('application/x-ai-desktop-studio-tree-row')
