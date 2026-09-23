import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { oneOf } from '@shared/guards'
import type { DocumentKind } from '@shared/domain/document'
import { RENDER_ENGINES, type RenderEngine } from '@shared/domain/renderEngine'
import { Select } from '@/components/Select'

export type NewDocumentEngineFieldProps = {
  kind: DocumentKind
  value: RenderEngine
  onChange: (engine: RenderEngine) => void
}

/**
 * Which engine a SCENE is drawn by, asked here because here is the only place it can be asked.
 *
 * A whole scene lives inside one graphics context, so nothing hands a mounted viewport over to
 * the other API: the choice is written into the document's world and read at every mount from
 * then on. The field opens on the preference and never writes back to it — see `SceneWorld.engine`.
 *
 * Each option carries its own description rather than a help line under the field: what the two
 * words mean is what one is choosing between, and a sentence below the closed list describes
 * whichever option is already picked.
 *
 * Drawn for no other kind: the five that are not scenes have no viewport of their own to draw.
 */
export function NewDocumentEngineField({ kind, value, onChange }: NewDocumentEngineFieldProps) {
  const { t } = useTranslation()
  const fieldId = useId()
  if (kind !== 'scene') return null

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-muted text-xs">
        {/* The setting's own title: one word for one union, already carried in fifteen tongues. */}
        {t('settings.renderEngine.title')}
      </label>
      <Select
        id={fieldId}
        data-sc="field:newDocument.engine"
        className="text-xs"
        value={value}
        onChange={event => onChange(oneOf(RENDER_ENGINES, event.target.value, value))}
      >
        {RENDER_ENGINES.map(engine => (
          <option key={engine} value={engine}>
            {t(`documents.engines.${engine}`)}
          </option>
        ))}
      </Select>
    </div>
  )
}
