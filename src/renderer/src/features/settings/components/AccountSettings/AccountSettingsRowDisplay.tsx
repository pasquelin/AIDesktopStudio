import { useTranslation } from 'react-i18next'
import { SCENARIO_CLOUD } from '@shared/domain/aiCloud'
import type { AccountSummary } from '@shared/domain/account'
import { WindowTag } from '@/components/WindowTag'
import { WindowButton } from '@/components/WindowButton'
import { WINDOW_CAPTION } from '@/components/windowStyles'
import { describeCredit } from '@/helpers/describeCredit'
import { HINT_LEFT } from '@/helpers/tooltip'
import { useAccounts } from '@/stores/accounts'
import { useCredits } from '@/stores/credits'

type Props = { account: AccountSummary; authenticated: boolean; onRename: (draft: string) => void }

export function AccountSettingsRowDisplay({ account, authenticated, onRename }: Props) {
  const { t, i18n } = useTranslation()
  const remove = useAccounts(state => state.remove)
  const activate = useAccounts(state => state.activate)
  const balances = useCredits(state => state.balances)
  const keyWorks = (account.providerId ?? SCENARIO_CLOUD) !== SCENARIO_CLOUD || authenticated
  const credit = describeCredit(balances?.[account.id], i18n.language, t)
  return (
    <li className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="flex flex-1 items-center gap-2 truncate text-sm">
          {account.name}
          {account.active && (
            <WindowTag tone={keyWorks ? 'success' : 'error'}>
              {keyWorks ? t('accounts.active') : t('accounts.notConnected')}
            </WindowTag>
          )}
        </span>
        {!account.active && (
          <WindowButton
            {...HINT_LEFT(t('accounts.useHint'))}
            onClick={() => void activate(account.id)}
          >
            {t('accounts.use')}
          </WindowButton>
        )}
        <WindowButton
          variant="secondary"
          {...HINT_LEFT(t('accounts.renameHint'))}
          onClick={() => onRename(account.name)}
        >
          {t('accounts.rename')}
        </WindowButton>
        <WindowButton
          variant="secondary"
          className="text-error"
          {...HINT_LEFT(t('accounts.removeHint'))}
          onClick={() => void remove(account.id)}
        >
          {t('accounts.remove')}
        </WindowButton>
      </div>
      {balances && (
        <p className={WINDOW_CAPTION}>{t(credit.sentenceKey, { amount: credit.figure })}</p>
      )}
    </li>
  )
}
