import { dragChannel } from '@/helpers/drag'

/**
 * Its own MIME type, so a file from the desktop never reads as one of the bar's pills.
 *
 * Here rather than in `TitleBar.tsx` because the bar starts and reads the drag while each pill
 * asks whether it carries one, and importing it back from the bar would close an import cycle.
 */
export const SPACES = dragChannel('application/x-ai-desktop-studio-workspace')
