import { useState, type SubmitEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { checkAccountName, type AccountSummary } from '@shared/domain/account'
import { WindowButton } from '@/components/WindowButton'
import { WindowFailure } from '@/components/WindowFailure'
import { WindowInput } from '@/components/WindowInput'
import { HINT_TOP } from '@/helpers/tooltip'
import { useAccounts, type AccountSaveFailure } from '@/stores/accounts'
import { FAILURE_KEYS } from './failureKeys'

type Props = { account: AccountSummary; draft: string; onDraft: (draft: string | null) => void }

export function AccountSettingsRowEditor({ account, draft, onDraft }: Props) {
  const { t } = useTranslation()
  const accounts = useAccounts(state => state.accounts)
  const rename = useAccounts(state => state.rename)
  const [failure, setFailure] = useState<AccountSaveFailure | null>(null)
  const submit = async (event: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const refused = await rename(account.id, draft.trim())
    if (refused) setFailure(refused)
    else onDraft(null)
  }
  return (
    <li>
      <form className="flex items-center gap-2" onSubmit={submit}>
        <WindowInput
          data-sc="field:account.name"
          className="flex-1"
          aria-label={t('accounts.name')}
          autoFocus
          value={draft}
          onChange={event => onDraft(event.target.value)}
        />
        <WindowButton
          type="submit"
          {...HINT_TOP(t('accounts.saveHint'))}
          disabled={checkAccountName(draft, accounts, account.id) !== null}
        >
          {t('accounts.save')}
        </WindowButton>
        <WindowButton
          variant="secondary"
          {...HINT_TOP(t('accounts.cancelHint'))}
          onClick={() => onDraft(null)}
        >
          {t('accounts.cancel')}
        </WindowButton>
      </form>
      {failure && <WindowFailure className="mt-1">{t(FAILURE_KEYS[failure])}</WindowFailure>}
    </li>
  )
}
