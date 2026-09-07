import { useTranslation } from 'react-i18next'
import { PropertySection } from '@/components/PropertySection'
import type { ScatterLayer } from '@shared/domain/scene'
import { WorldToolsScatterActions } from './WorldToolsScatterActions'
import { WorldToolsScatterAssets } from './WorldToolsScatterAssets'
import { WorldToolsScatterRules } from './WorldToolsScatterRules'

type WorldToolsScatterProps = { documentId: string; scatter: ScatterLayer }

export function WorldToolsScatter({ documentId, scatter }: WorldToolsScatterProps) {
  const { t } = useTranslation()

  return (
    <PropertySection title={t('world.tools')} scId="world.scatterTools" defaultOpen>
      <WorldToolsScatterActions documentId={documentId} scatter={scatter} />
      <WorldToolsScatterAssets documentId={documentId} scatter={scatter} />
      <WorldToolsScatterRules documentId={documentId} scatter={scatter} />
    </PropertySection>
  )
}
