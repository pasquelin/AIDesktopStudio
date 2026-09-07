import { mdiPlus } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { TIP_RIGHT } from '@/helpers/tooltip'
import { ToolButton } from '@/components/ToolButton'
import { useToolSurface } from '@/stores/layouts'
import { openNewDocument } from '../newDocument'

/**
 * Above the tool icons rather than in the Explorer header: it stays reachable when every panel
 * is closed.
 *
 * It makes the same thing everywhere, which it did not always: it used to make a project on the
 * home and a document elsewhere, so the gesture meant two things and neither of them from the
 * other screen. It now opens the one window that offers both, ordered by the surface it was
 * pressed on — and it is never disabled, a project being makeable with no project.
 */
export function RailNewButton() {
  const { t } = useTranslation()
  const surface = useToolSurface()

  return (
    <ToolButton
      icon={mdiPlus}
      iconSize={22}
      label={t('documents.new')}
      tooltip={TIP_RIGHT}
      onClick={() => void openNewDocument(surface)}
      // Filled, unlike every tool icon around it: this one acts, the others only switch what is
      // shown. A grey plus among grey glyphs is a plus nobody finds.
      className="bg-create hover:bg-create-hover text-create-content hover:text-create-content size-(--sc-rail-button) rounded-(--radius-sc-md)"
    />
  )
}
