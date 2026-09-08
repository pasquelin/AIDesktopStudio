import { useTranslation } from 'react-i18next'
import { canCommit, type GitStatus } from '@shared/domain/git'
import { Checkbox } from '@/components/Checkbox'
import { Button } from '@/components/Button'
import { FIELD, PANEL_HEAD } from '@/components/styles'
import { cn } from '@/helpers/cn'
import { HINT_TOP } from '@/helpers/tooltip'
import { useGit } from '@/stores/git'

/**
 * Where a version is written down and recorded.
 *
 * Above the files rather than below them, which is the one place it can be: the list grows with
 * the project, and a button at its foot is a button that scrolls off the bottom of the panel on
 * the very day there is most to commit.
 */
export function CommitBox({ status }: { status: GitStatus }) {
  const { t } = useTranslation()
  const busy = useGit(state => state.busy)
  const message = useGit(state => state.message)
  const amend = useGit(state => state.amend)
  const writeMessage = useGit(state => state.writeMessage)
  const setAmend = useGit(state => state.setAmend)
  const commit = useGit(state => state.commit)

  return (
    <div className={PANEL_HEAD}>
      <textarea
        data-sc="field:git.message"
        rows={3}
        value={message}
        aria-label={t('git.message')}
        placeholder={t('git.messagePlaceholder')}
        disabled={busy}
        onChange={event => writeMessage(event.target.value)}
        className={cn(FIELD, 'h-auto resize-y py-1 text-xs')}
      />

      <div className="flex items-center justify-between gap-2">
        {/* Offered only once there IS a last version to rewrite. On a repository whose first
            commit has not happened, the box would be a promise about nothing. */}
        {status.head !== null ? (
          <label className="text-muted flex items-center gap-2 text-xs">
            <Checkbox
              data-sc="field:git.amend"
              checked={amend}
              disabled={busy}
              onChange={event => setAmend(event.target.checked)}
            />
            {t('git.amend')}
          </label>
        ) : (
          <span />
        )}

        <Button
          variant="primary"
          {...HINT_TOP(t('git.commitHint'))}
          disabled={busy || !canCommit(status.files, message, amend)}
          onClick={() => void commit()}
        >
          {t('git.commit')}
        </Button>
      </div>
    </div>
  )
}
