import { useTranslation } from 'react-i18next'
import { GIT_FAILURE_KEYS, remoteHost, type GitRepository } from '@shared/domain/git'
import { EmptyState } from '@/components/EmptyState'
import { toolIcon } from '@/helpers/toolRegistry'
import { useGitStatus } from '@/hooks/useGitStatus'
import { NoProject } from '@/features/shell/components/NoProject'
import { RefusedPanel } from '@/features/shell/components/RefusedPanel'
import { useGit } from '@/stores/git'
import { CredentialField } from '../CredentialField'
import { GitReady } from './GitReady'

/**
 * Version control over the PROJECT folder — the user's own files, never this repository's code.
 *
 * Five states rather than one with holes in it, and each is a screen somebody has to be able to
 * act on: no project, no git on this machine, a folder never initialised, a command that failed,
 * and the folder as it stands. The union arrives from the main process already settled, so
 * nothing here has to work out what a missing field would have meant.
 */
export function Git() {
  const { t } = useTranslation()
  const repository = useGitStatus()
  const busy = useGit(state => state.busy)
  const initRepository = useGit(state => state.initRepository)
  const refresh = useGit(state => state.refresh)
  const remote = useGit(state => state.remote)
  const host = remote ? remoteHost(remote.url) : null

  return gitContent(repository, {
    busy,
    host,
    initRepository,
    refresh,
    t,
  })
}

type GitContentContext = {
  busy: boolean
  host: string | null
  initRepository: () => Promise<void>
  refresh: () => Promise<void>
  t: ReturnType<typeof useTranslation>['t']
}

function gitContent(repository: GitRepository, context: GitContentContext) {
  const { busy, host, initRepository, refresh, t } = context
  switch (repository.kind) {
    case 'no-project':
      return <NoProject icon={toolIcon('git')} message={t('git.noProject')} />

    case 'no-binary':
      return <EmptyState icon={toolIcon('git')} message={t('git.noBinary')} />

    case 'uninitialised':
      return (
        <EmptyState
          icon={toolIcon('git')}
          message={t('git.uninitialised')}
          // Withdrawn while the command runs rather than disabled: `git init` answers in well
          // under a second, and a button that greys out and comes back reads as a flicker.
          action={
            busy
              ? undefined
              : {
                  label: t('git.start'),
                  hint: t('git.startHint'),
                  onClick: () => void initRepository(),
                }
          }
        />
      )

    case 'failed':
      if (repository.reason === 'authentication' && host !== null) {
        return <CredentialField host={host} />
      }

      // The detail is git's own line, credentials already stripped in the main process. A failure
      // with no way to try again is a panel one has to leave and come back to, and `git status`
      // is what half of these refusals need to be told they are over.
      return (
        <RefusedPanel
          tool="git"
          message={t(GIT_FAILURE_KEYS[repository.reason])}
          detail={repository.detail}
          onRetry={() => void refresh()}
        />
      )

    default:
      return <GitReady status={repository.status} />
  }
}
