import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { PropertySection } from '@/components/PropertySection'
import { QuietNote } from '@/components/QuietNote'
import { rigFitFaultOf } from '@/engines/scene/rigFit'
import { openCharacter } from '@/character/openCharacter'
import type { ModelNode } from '@/engines/scene/sceneState'
import { rigOfNode, useModelFiles } from '@/stores/modelFiles'

export type RigSectionProps = {
  documentId: string
  node: ModelNode
}

/**
 * What this model IS, as far as animating it goes — and the one door to where that is changed.
 *
 * 🛑 It carries no form any more. A skeleton belongs to a FILE, and it is edited in the window
 * that opens on one: an inspector that also posed bones was a second place to do the same thing,
 * on a subject it could only half see.
 */
export function RigSection({ documentId, node }: RigSectionProps) {
  const { t } = useTranslation()
  const rig = useModelFiles(state => rigOfNode(state, documentId, node.id))

  // Nothing has landed yet: a section describing a model the studio has not read would be wrong
  // rather than empty.
  if (!rig) return null

  const fault = rig.bounds && rigFitFaultOf(rig.bounds)

  return (
    <PropertySection title={t('inspector.rig')} scId="rig">
      <QuietNote>{t(`inspector.rigStatus_${rig.status}`)}</QuietNote>
      {fault && <QuietNote>{t(`inspector.rigFault_${fault}`)}</QuietNote>}

      <Button variant="primary" onClick={() => void openCharacter(node.model.assetId)}>
        {rig.status === 'staticMesh' ? t('inspector.makeAnimatable') : t('inspector.editSkeleton')}
      </Button>
    </PropertySection>
  )
}
