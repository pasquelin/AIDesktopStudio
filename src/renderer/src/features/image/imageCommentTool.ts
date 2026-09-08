import { mdiAutoFix, mdiCommentOutline } from '@mdi/js'
import type { ImageTool } from './imageTools'

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
      icon: mdiAutoFix,
    },
  ],
}
