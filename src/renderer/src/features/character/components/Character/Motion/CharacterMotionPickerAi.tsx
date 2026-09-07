import { mdiRobotOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { motionProvidersOf } from '@shared/domain/rigProvider'
import { Collection } from '@/components/Collection/Collection'
import { EmptyState } from '@/components/EmptyState'
import { Row } from '@/components/Row'
import { rigServiceNote } from '@/helpers/rigServiceNote'
import { useFamilyModels } from '@/hooks/useFamilyModels'
import { usePlanAccess } from '@/hooks/usePlanAccess'

/**
 * The Scenario models that MAKE a motion, each with the reason it cannot run when it cannot.
 *
 * Read-only for now, and said out loud rather than hidden: submitting one needs the whole
 * export-upload-job-import chain, which nothing here can verify — every one of them answers 403
 * on this account. What the screen owes the user meanwhile is the reason, before any click.
 */
export function CharacterMotionPickerAi() {
  const { t } = useTranslation()
  const plan = usePlanAccess()
  const providers = motionProvidersOf(useFamilyModels('3d'))

  return (
    <Collection
      label={t('inspector.animationAi')}
      items={providers.map(provider => ({ ...provider, id: provider.modelId }))}
      renderRow={provider => (
        <Row
          icon={mdiRobotOutline}
          title={provider.name}
          subtitle={rigServiceNote(provider, plan, { bytes: 0 }, t)}
        />
      )}
      empty={<EmptyState icon={mdiRobotOutline} message={t('inspector.animationAiNone')} />}
    />
  )
}
