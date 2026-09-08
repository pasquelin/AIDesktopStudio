import { useState } from 'react'
import { Input } from '@/components/Input'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { PANEL_BAR } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { isComposing } from '@/helpers/composition'
import { HINT_TOP } from '@/helpers/tooltip'
import { useGit } from '@/stores/git'

/** What git calls a first remote everywhere, and what every server's instructions assume. */
const ORIGIN = 'origin'

/**
 * Naming the server this project will be sent to.
 *
 * The address is pasted rather than typed — it is the string every hosting service puts on the
 * page after a repository is made — so this is a field and a button, and nothing more. The name
 * is not asked for at all: `origin` is what git's own instructions, and every service's, assume.
 */
export function RemoteSetup() {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const busy = useGit(state => state.busy)
  const addRemote = useGit(state => state.addRemote)

  return (
    <div className={cn(PANEL_BAR, 'p-2')}>
      <Input
        data-sc="field:git.remoteUrl"
        type="url"
        value={url}
        aria-label={t('git.remoteUrl')}
        placeholder={t('git.remoteUrlPlaceholder')}
        disabled={busy}
        className="flex-1"
        onChange={event => setUrl(event.target.value)}
        onKeyDown={event => {
          // Enter belongs to the input method while it composes — see `isComposing`.
          if (event.key !== 'Enter' || isComposing(event)) return
          if (url.trim() !== '') void addRemote(ORIGIN, url.trim())
        }}
      />
      <Button
        {...HINT_TOP(t('git.addRemoteHint'))}
        disabled={busy || url.trim() === ''}
        onClick={() => void addRemote(ORIGIN, url.trim())}
      >
        {t('git.addRemote')}
      </Button>
    </div>
  )
}
