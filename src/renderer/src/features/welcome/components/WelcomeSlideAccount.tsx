import { mdiPlus } from '@mdi/js'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WindowButton } from '@/components/WindowButton'
import { UiIcon } from '@/components/UiIcon'
import { AccountSettingsAddForm } from '@/features/settings/components/AccountSettings/AccountSettingsAddForm'
import { HINT_TOP } from '@/helpers/tooltip'
import { providerOf } from '@shared/domain/account'
import { useAccounts } from '@/stores/accounts'
import { WelcomeAccountRow } from './WelcomeAccountRow'
import { WelcomeCopy } from './WelcomeCopy'

/**
 * The stored keys OR the form, never both (Alban): stacked they ran 536px into a 486px sheet.
 * Rows are read-only — renaming and deleting belong to the preferences.
 */
export function WelcomeSlideAccount() {
  const { t } = useTranslation()
  const accounts = useAccounts(state => state.accounts)
  const [adding, setAdding] = useState(false)

  if (accounts.length === 0 || adding) {
    return (
      <div>
        <WelcomeCopy
          title={t('welcome.account.title')}
          body={adding ? t('welcome.account.adding') : t('welcome.account.body')}
        />
        <AccountSettingsAddForm />
        {adding ? (
          <WindowButton
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => setAdding(false)}
            {...HINT_TOP(t('welcome.account.backToListHint'))}
          >
            {t('welcome.account.backToList')}
          </WindowButton>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      <WelcomeCopy title={t('welcome.account.title')} body={t('welcome.account.stored')} />
      {/* Flat rather than grouped by service: the tile says which one, so a heading over a single
          row spent a line saying what the row already showed. */}
      <ul className="border-base-300 mb-4 overflow-hidden rounded-(--radius-sc-md) border">
        {accounts.map(account => (
          <WelcomeAccountRow
            key={account.id}
            name={account.name}
            service={t(`aiClouds.${providerOf(account)}`)}
          />
        ))}
      </ul>
      <WindowButton
        variant="secondary"
        className="w-full gap-2"
        onClick={() => setAdding(true)}
        {...HINT_TOP(t('welcome.account.addServiceHint'))}
      >
        <UiIcon path={mdiPlus} size={16} />
        {t('welcome.account.addService')}
      </WindowButton>
    </div>
  )
}
