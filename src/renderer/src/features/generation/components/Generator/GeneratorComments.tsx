import { mdiClose, mdiCommentOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { layerById } from '@/engines/canvas/canvasState'
import { Row } from '@/components/Row'
import { PANEL_GROUP_LABEL } from '@/components/styles'
import { ToolButton } from '@/components/ToolButton'
import { TIP_LEFT } from '@/helpers/tooltip'
import { canvasOf, useCanvases } from '@/stores/canvases'
import { activeImageId, useDocuments } from '@/stores/documents'
import { generationCommentsOf, useGenerationComments } from '@/stores/generationComments'
import type { FieldDescriptor } from '@shared/domain/model'
import { supportsGenerationComments } from '@/features/image/generationComments'

export function GeneratorComments({ fields }: { fields: readonly FieldDescriptor[] }) {
  const { t } = useTranslation()
  const documentId = useDocuments(activeImageId)
  const comments = useGenerationComments(state => generationCommentsOf(state, documentId))
  const remove = useGenerationComments(state => state.remove)
  const canvas = useCanvases(state => (documentId ? canvasOf(state, documentId) : null))
  if (!documentId || !canvas || comments.length === 0 || !supportsGenerationComments(fields)) {
    return null
  }

  return (
    <section className="flex flex-col gap-1.5" data-sc="section:generation.imageComments">
      <h3 className={PANEL_GROUP_LABEL}>{t('generation.imageComments')}</h3>
      <ul className="flex flex-col gap-1.5">
        {comments.map(comment => {
          const layer = comment.layerId ? layerById(canvas, comment.layerId) : null
          return (
            <li key={comment.id}>
              <Row
                icon={mdiCommentOutline}
                title={comment.text.trim() || t('generation.imageCommentEmpty')}
                subtitle={
                  layer
                    ? t('generation.imageCommentLayer', { name: layer.name })
                    : t('generation.imageCommentGlobal')
                }
                actions={
                  <ToolButton
                    icon={mdiClose}
                    variant="row"
                    acts
                    label={t('imageComments.remove')}
                    description={t('imageComments.removeHint')}
                    tooltip={TIP_LEFT}
                    onClick={() => remove(documentId, comment.id)}
                  />
                }
              />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
