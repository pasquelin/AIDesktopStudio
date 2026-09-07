import { mdiGaugeFull, mdiMenu, mdiPauseCircleOutline, mdiRectangleOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { roleForKind } from '@shared/domain/document'
import { UI_TEMPLATE_IDS, type UiTemplateId } from '@shared/domain/uiTemplates'
import { roleInk } from '@/helpers/workspaces'
import { NewDocumentTemplateTile, TEMPLATE_STRIP } from './NewDocumentTemplateTile'

/** No still is shipped for these: an interface template is four elements, and a glyph says more. */
const ICONS: Record<UiTemplateId, string> = {
  empty: mdiRectangleOutline,
  hud: mdiGaugeFull,
  mainMenu: mdiMenu,
  pause: mdiPauseCircleOutline,
  mainMenuControls: mdiMenu,
  pauseControls: mdiPauseCircleOutline,
}

export type NewDocumentUiTemplatesProps = {
  value: UiTemplateId
  onChange: (id: UiTemplateId) => void
}

/** The hue the section gives an interface, as the scene's row takes the one it gives a scene. */
const INK = roleInk(roleForKind('gui'))

/**
 * What a new interface opens on. The scene's row, minus the shelves: four templates differ by what
 * they ARE, and grouping four things is a heading nobody reads.
 */
export function NewDocumentUiTemplates({ value, onChange }: NewDocumentUiTemplatesProps) {
  const { t } = useTranslation()

  return (
    <ul className={TEMPLATE_STRIP}>
      {UI_TEMPLATE_IDS.map(id => (
        <li key={id}>
          <NewDocumentTemplateTile
            id={id}
            caption={t(`documents.uiTemplates.${id}`)}
            hint={t(`documents.uiTemplateHints.${id}`)}
            icon={ICONS[id]}
            ink={INK}
            selected={value === id}
            onPick={() => onChange(id)}
          />
        </li>
      ))}
    </ul>
  )
}
