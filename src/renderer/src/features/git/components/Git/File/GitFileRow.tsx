import {
  mdiArrowLeftBoldOutline,
  mdiArrowRightBoldOutline,
  mdiFileCompare,
  mdiUndoVariant,
} from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { canRestore, type GitFile } from '@shared/domain/git'
import { Checkbox } from '@/components/Checkbox'
import { ToolButton } from '@/components/ToolButton'
import { revealTool } from '@/helpers/revealPanel'
import { TIP_LEFT } from '@/helpers/tooltip'
import { ChangedFileRow } from '@/features/git/components/ChangedFileRow'
import { useGit } from '@/stores/git'

/**
 * One changed file.
 *
 * The tick IS the index, which is the gesture every version tool has settled on: ticking a file
 * adds it to what the next commit will record, unticking takes it back out. No separate pair of
 * buttons, and no selection of its own to keep in step with what git thinks.
 *
 * Only `busy` is subscribed to. The five actions are read off the store when one is taken: their
 * identity never changes, so subscribing to them signs every row of a long list up for a wake-up
 * that can never tell it anything.
 */
export function GitFileRow({ file }: { file: GitFile }) {
  const { t } = useTranslation()
  const busy = useGit(state => state.busy)

  return (
    <ChangedFileRow
      file={file}
      leading={
        <Checkbox
          // The path, which is what tells one row from the next — its label is the file name.
          data-sc={`field:git.stage.${file.path}`}
          checked={file.stage === 'staged'}
          disabled={busy}
          aria-label={file.path}
          onChange={event => {
            const { stage, unstage } = useGit.getState()
            void (event.target.checked ? stage : unstage)([file.path])
          }}
        />
      }
      actions={
        <>
          {/* A conflict is settled BEFORE anything else can happen with the file, so its two
              buttons stand in front of the ordinary ones — and the ordinary ones are withheld:
              comparing a file whose two versions are both in it says nothing. */}
          {file.stage === 'conflicted' ? (
            <>
              <ToolButton
                icon={mdiArrowLeftBoldOutline}
                label={t('git.keepOurs', { name: file.path })}
                description={t('git.keepOursHint')}
                tooltip={TIP_LEFT}
                variant="row"
                disabled={busy}
                onClick={() => void useGit.getState().resolve([file.path], 'ours')}
              />
              <ToolButton
                icon={mdiArrowRightBoldOutline}
                label={t('git.keepTheirs', { name: file.path })}
                description={t('git.keepTheirsHint')}
                tooltip={TIP_LEFT}
                variant="row"
                disabled={busy}
                onClick={() => void useGit.getState().resolve([file.path], 'theirs')}
              />
            </>
          ) : null}

          {/* Asked here and answered in the band. This column is a side panel and a diff is read
              ACROSS — so the click sets what to compare and brings the wide panel forward.

              Withheld on two: a file holding both versions at once compares to nothing, and a
              file git has never seen has no earlier version to compare AGAINST — `git diff HEAD`
              says nothing about an untracked path, so the button answered "nothing changed"
              about a file that is entirely new. Which is the case of every generated asset. */}
          {file.stage !== 'conflicted' && file.change !== 'untracked' && (
            <ToolButton
              icon={mdiFileCompare}
              label={t('git.compareFile', { name: file.path })}
              description={t('git.compareHint')}
              tooltip={TIP_LEFT}
              variant="row"
              disabled={busy}
              onClick={() => {
                void useGit.getState().compare(file.path, null)
                revealTool('history')
              }}
            />
          )}

          {canRestore(file) && (
            <ToolButton
              icon={mdiUndoVariant}
              // Named for its FILE, not for the gesture. A panel with six changed files carried
              // six buttons a reader heard as « Restaurer » six times over, with nothing to tell
              // them apart — and no way to know which one was about to be undone.
              label={t('git.restoreFile', { name: file.path })}
              description={t('git.restoreHint')}
              tooltip={TIP_LEFT}
              variant="row"
              disabled={busy}
              onClick={() => void useGit.getState().restore([file.path])}
            />
          )}
        </>
      }
    />
  )
}
