import { useState } from 'react'
import type { AccountSummary } from '@shared/domain/account'
import { AccountSettingsRowDisplay } from './AccountSettingsRowDisplay'
import { AccountSettingsRowEditor } from './AccountSettingsRowEditor'

type AccountSettingsRowProps = {
  account: AccountSummary
  authenticated: boolean
}

export function AccountSettingsRow({ account, authenticated }: AccountSettingsRowProps) {
  const [draft, setDraft] = useState<string | null>(null)
  return draft === null ? (
    <AccountSettingsRowDisplay
      account={account}
      authenticated={authenticated}
      onRename={setDraft}
    />
  ) : (
    <AccountSettingsRowEditor account={account} draft={draft} onDraft={setDraft} />
  )
}
