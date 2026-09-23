import { useTranslation } from 'react-i18next'
import type { DocumentKind } from '@shared/domain/document'
import type { SceneTemplateId } from '@shared/domain/sceneTemplate'
import type { UiTemplateId } from '@shared/domain/uiTemplates'
import { NewDocumentTemplates } from './NewDocumentTemplates'
import { NewDocumentUiTemplates } from './NewDocumentUiTemplates'

export type NewDocumentTemplateFieldProps = {
  kind: DocumentKind
  scene: SceneTemplateId
  onScene: (template: SceneTemplateId) => void
  ui: UiTemplateId
  onUi: (template: UiTemplateId) => void
}

/**
 * What the two kinds that open on something choose it from, and nothing at all for the seven
 * that do not. Two states rather than one because `empty` is the id both families spell.
 */
export function NewDocumentTemplateField({
  kind,
  scene,
  onScene,
  ui,
  onUi,
}: NewDocumentTemplateFieldProps) {
  const { t } = useTranslation()
  if (kind !== 'scene' && kind !== 'gui') return null

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted text-xs">{t('documents.templateField')}</span>
      {kind === 'scene' ? (
        <NewDocumentTemplates value={scene} onChange={onScene} />
      ) : (
        <NewDocumentUiTemplates value={ui} onChange={onUi} />
      )}
    </div>
  )
}
