import {
  mdiAirplane,
  mdiAutoFix,
  mdiCarHatchback,
  mdiCubeOutline,
  mdiEyeOutline,
  mdiGrid,
  mdiGridLarge,
  mdiHomeOutline,
  mdiMovieOpenOutline,
  mdiSpotlightBeam,
  mdiVideoOutline,
} from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { roleForKind } from '@shared/domain/document'
import { SCENE_TEMPLATE_IDS, type SceneTemplateId } from '@shared/domain/sceneTemplate'
import { roleInk } from '@/helpers/workspaces'
import { NewDocumentTemplateTile, TEMPLATE_STRIP } from './NewDocumentTemplateTile'

/** The glyph a template falls back on until its still has been drawn. */
const ICONS: Record<SceneTemplateId, string> = {
  empty: mdiCubeOutline,
  basic: mdiGridLarge,
  photoStudio: mdiSpotlightBeam,
  cinematic: mdiMovieOpenOutline,
  archvis: mdiHomeOutline,
  postProcessing: mdiAutoFix,
  firstPerson: mdiEyeOutline,
  thirdPerson: mdiVideoOutline,
  topDown: mdiGrid,
  car: mdiCarHatchback,
  plane: mdiAirplane,
}

/**
 * The hue the SECTION already gives a scene — the very one the column beside these tiles draws
 * `Scène` in. Read off the role rather than written: one colour code in the window, not two, and a
 * hue of its own here would be a belonging nobody claimed.
 */
const INK = roleInk(roleForKind('scene'))

export type NewDocumentTemplatesProps = {
  value: SceneTemplateId
  onChange: (id: SceneTemplateId) => void
}

/**
 * What a scene opens on, picked before it is made — a floor and a camera, a photo set, a shot on
 * a rail.
 *
 * Only the scene kind draws this: the other five have one thing to be. Its state is
 * `aria-pressed`, like every other exclusive row of this studio (see `Chip`), and each tile
 * carries a `data-sc` so a script can pick one without reading a translated word.
 *
 * ONE line that scrolls, where three shelves once spread over two: the height they took is the
 * height the folder picker under them was missing, and a twelfth template now costs none. The
 * shelves survive as the ORDER of the row — general, then character, then machine.
 */
export function NewDocumentTemplates({ value, onChange }: NewDocumentTemplatesProps) {
  const { t } = useTranslation()

  return (
    <ul className={TEMPLATE_STRIP}>
      {SCENE_TEMPLATE_IDS.map(id => (
        <li key={id}>
          <NewDocumentTemplateTile
            id={id}
            caption={t(`documents.templates.${id}`)}
            hint={t(`documents.templateHints.${id}`)}
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
