import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { WindowFailure } from '@/components/WindowFailure'
import { FormField } from '@/components/FormField'
import { checkAccountName } from '@shared/domain/account'
import {
  CLOUD_GROUPS,
  CLOUD_IDS,
  cloudAuth,
  cloudsOfGroup,
  SCENARIO_CLOUD,
} from '@shared/domain/aiCloud'
import { HINT_TOP } from '@/helpers/tooltip'
import { useAccounts, type AccountSaveFailure } from '@/stores/accounts'
import { FAILURE_KEYS } from './failureKeys'
import { WindowButton } from '@/components/WindowButton'
import { WindowInput } from '@/components/WindowInput'
import { WindowSelect } from '@/components/WindowSelect'

const accountFields = z
  .object({
    providerId: z.enum(CLOUD_IDS),
    name: z.string(),
    key: z.string().trim().min(1),
    secret: z.string(),
  })
  .superRefine((fields, context) => {
    if (cloudAuth(fields.providerId) === 'key-secret' && fields.secret.trim() === '') {
      context.addIssue({ code: 'custom', path: ['secret'], message: 'required' })
    }
  })

type AccountFields = z.infer<typeof accountFields>

export function AccountSettingsAddForm() {
  const form = useId()
  const { t } = useTranslation()
  const accounts = useAccounts(state => state.accounts)
  const add = useAccounts(state => state.add)

  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<AccountSaveFailure | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isValid },
  } = useForm<AccountFields>({
    resolver: zodResolver(accountFields),
    mode: 'onChange',
    defaultValues: { providerId: SCENARIO_CLOUD, name: '', key: '', secret: '' },
  })

  const providerId = watch('providerId')
  const name = watch('name')
  const wantsSecret = cloudAuth(providerId) === 'key-secret'
  const complete = isValid && checkAccountName(name, accounts) === null

  const submit = async (fields: AccountFields): Promise<void> => {
    setBusy(true)
    try {
      const refused = await add(
        fields.name.trim(),
        fields.key,
        wantsSecret ? fields.secret : '',
        fields.providerId,
      )
      setFailure(refused)
      if (refused) return
      // The provider STAYS: two accounts of the same cloud are added one after the other, and a
      // bare `reset()` snapped the picker back to Scenario — where a key and a secret look alike,
      // so the second account was filed under the wrong provider without a word.
      reset({ providerId: fields.providerId, name: '', key: '', secret: '' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-current/10 pt-4"
      onSubmit={event => void handleSubmit(submit)(event)}
    >
      <FormField label={t('accounts.provider')} htmlFor={`${form}provider`} required>
        <WindowSelect
          id={`${form}provider`}
          data-sc="field:newAccount.provider"
          className="w-full"
          {...register('providerId')}
        >
          {/* Grouped rather than flat: nine services in one run made a reader read every line to
              find whether the one they hold generates pictures or answers questions. */}
          {CLOUD_GROUPS.map(group => (
            <optgroup key={group} label={t(`aiCloudGroups.${group}`)}>
              {cloudsOfGroup(group).map(provider => (
                <option key={provider.id} value={provider.id}>
                  {t(`aiClouds.${provider.id}`)}
                </option>
              ))}
            </optgroup>
          ))}
        </WindowSelect>
      </FormField>

      <FormField label={t('accounts.name')} htmlFor={`${form}name`} required>
        <WindowInput
          id={`${form}name`}
          data-sc="field:newAccount.name"
          className="w-full"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('accounts.namePlaceholder')}
          {...register('name')}
        />
      </FormField>

      <FormField label={t('auth.key')} htmlFor={`${form}key`} required>
        <WindowInput
          id={`${form}key`}
          data-sc="field:newAccount.key"
          className="w-full"
          type="text"
          autoComplete="off"
          spellCheck={false}
          {...register('key')}
        />
      </FormField>

      {wantsSecret && (
        <FormField label={t('auth.secret')} htmlFor={`${form}secret`} required>
          <WindowInput
            id={`${form}secret`}
            data-sc="field:newAccount.secret"
            className="w-full"
            type="password"
            autoComplete="off"
            {...register('secret')}
          />
        </FormField>
      )}

      {failure && <WindowFailure>{t(FAILURE_KEYS[failure])}</WindowFailure>}

      <WindowButton
        type="submit"
        className="mt-1"
        {...HINT_TOP(t('accounts.addHint'))}
        disabled={busy || !complete}
      >
        {busy ? t('accounts.adding') : t('accounts.add')}
      </WindowButton>
    </form>
  )
}
