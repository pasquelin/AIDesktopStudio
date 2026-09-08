import { useEffect, useState } from 'react'
import { Input } from '@/components/Input'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { QuietNote } from '@/components/QuietNote'
import { isComposing } from '@/helpers/composition'
import { HINT_TOP } from '@/helpers/tooltip'
import { useGit } from '@/stores/git'

/**
 * Where a token is handed over, once — after the server has refused.
 *
 * Asked at the moment of the refusal rather than up front, because up front is asking for a
 * secret before it is needed, from somebody who may never push at all.
 *
 * It goes DOWN and does not come back. The main process encrypts it with the system keychain and
 * hands it to git through the environment of one command; nothing here can read it again, and no
 * channel exists that would. That is invariant 1, and it is the same shape the API key has.
 *
 * The field is a password field, so a screen being recorded — which is what a studio's screen
 * often is — does not put the token in the recording.
 */
export function CredentialField({ host }: { host: string }) {
  const { t } = useTranslation()
  const [user, setUser] = useState('')
  const [token, setToken] = useState('')
  const [held, setHeld] = useState(false)
  const busy = useGit(state => state.busy)
  const setCredentials = useGit(state => state.setCredentials)
  const retryRemote = useGit(state => state.retryRemote)

  // Whether one is already held changes what this screen MEANS: a refusal with no token is a
  // token that was never given, a refusal with one is a token that is wrong — and the second is
  // the only one where erasing it is the way out.
  useEffect(() => {
    void useGit.getState().hasCredentials(host).then(setHeld)
  }, [host])

  const submit = (): void => {
    if (user.trim() === '' || token === '') return

    void setCredentials(host, user.trim(), token).then(() => {
      setToken('')
      // Straight back to what was refused — the very command, not a push made up here. The
      // refusal is the only reason this field is on screen, so leaving the user to find the
      // button again would be leaving the job half done; and the send that meets a refusal is
      // most often the FIRST push of a branch, which carries `--set-upstream` and fails without.
      return retryRemote()
    })
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <QuietNote>{held ? t('git.tokenHeld', { host }) : t('git.tokenAsked', { host })}</QuietNote>

      <Input
        data-sc="field:git.tokenUser"
        type="text"
        value={user}
        aria-label={t('git.tokenUser')}
        placeholder={t('git.tokenUserPlaceholder')}
        autoComplete="username"
        disabled={busy}
        className="min-w-0 flex-1"
        onChange={event => setUser(event.target.value)}
      />
      <Input
        data-sc="field:git.token"
        type="password"
        value={token}
        aria-label={t('git.token')}
        placeholder={t('git.tokenPlaceholder')}
        autoComplete="current-password"
        disabled={busy}
        className="min-w-0 flex-1"
        onChange={event => setToken(event.target.value)}
        onKeyDown={event => {
          // Enter belongs to the input method while it composes — see `isComposing`.
          if (event.key === 'Enter' && !isComposing(event)) submit()
        }}
      />

      <Button
        variant="primary"
        {...HINT_TOP(t('git.tokenSaveHint'))}
        disabled={busy || user.trim() === '' || token === ''}
        onClick={submit}
      >
        {t('git.tokenSave')}
      </Button>

      {held && (
        <Button
          {...HINT_TOP(t('git.tokenForgetHint'))}
          disabled={busy}
          onClick={() => {
            void useGit
              .getState()
              .clearCredentials(host)
              .then(() => setHeld(false))
          }}
        >
          {t('git.tokenForget')}
        </Button>
      )}
    </div>
  )
}
