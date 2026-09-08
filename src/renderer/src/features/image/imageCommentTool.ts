import { mdiCommentFlashOutline, mdiCommentOutline } from '@mdi/js'
import { SMART_SELECTION_MODEL } from '@shared/domain/smartSelectionInference'
import type { ImageTool } from './imageTool'

export const COMMENT_TOOL: ImageTool = {
  id: 'comment',
  tool: 'comment',
  labelKey: 'imageTools.comment',
  descriptionKey: 'imageTools.commentHint',
  icon: mdiCommentOutline,
  modes: [
    {
      id: 'freeform',
      labelKey: 'imageTools.comment',
      descriptionKey: 'imageTools.commentHint',
      icon: mdiCommentOutline,
    },
    {
      id: 'smart',
      labelKey: 'imageTools.smartComment',
      descriptionKey: 'imageTools.smartCommentHint',
      // A BUBBLE with a spark, never the plain wand the selector wears: an armed mode replaces
      // the tool's own glyph in the bar, and the wand said "automatic" while losing "comment".
      icon: mdiCommentFlashOutline,
      needsModel: SMART_SELECTION_MODEL,
    },
  ],
}
