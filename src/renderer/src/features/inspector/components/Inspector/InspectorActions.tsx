import { mdiPaletteSwatchOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { ToolButton } from '@/components/ToolButton'
import { TreeFoldButton } from '@/components/TreeFoldButton'
import { TIP_BOTTOM } from '@/helpers/tooltip'
import { activeMaterialId, useDocuments } from '@/stores/documents'
import { anySectionOpen, useSectionFolds } from '@/stores/sectionFolds'
import { useStyles } from '@/stores/styles'
import { materialOf, useMaterials } from '@/stores/materials'

/**
 * What the inspector's title row carries.
 *
 * The fold is posted whatever the face — every one of them is made of sections, and a panel this
 * tall is read by folding what is not in hand. Saving a material is posted only on the material
 * face: the inspector is one panel with several, so an unconditional button would offer to save a
 * material while a video clip filled the panel below it. The texture in front answers which face
 * is drawn, and `InspectorFace` reads the same one.
 */
export function InspectorActions() {
  const { t } = useTranslation()
  const documentId = useDocuments(activeMaterialId)
  // What the sections ANSWER, never a flag that flips: the face is swapped on every selection and
  // its sections come back on their own defaults, so a flag would offer to unfold what is open.
  const foldable = useSectionFolds(anySectionOpen)
  const askAllSections = useSectionFolds(state => state.askAllSections)

  return (
    <>
      <TreeFoldButton expanded={foldable} onFold={askAllSections} onUnfold={askAllSections} />

      {documentId && (
        <ToolButton
          icon={mdiPaletteSwatchOutline}
          label={t('styles.save')}
          description={t('styles.saveHint')}
          // Without it `description` is never rendered and never announced: every other header
          // button of the studio hands one over, and this was the only one that did not.
          tooltip={TIP_BOTTOM}
          variant="header"
          // The settings are read at click time rather than subscribed to. They are never drawn
          // here, and a drag emits one value per frame: a subscription would redraw this button on
          // every one of them — the cost `useDocumentEdit` exists to keep off the inspector.
          onClick={() => {
            const { material } = materialOf(useMaterials.getState(), documentId)
            void useStyles.getState().save(material, t('styles.newName'))
          }}
        />
      )}
    </>
  )
}
