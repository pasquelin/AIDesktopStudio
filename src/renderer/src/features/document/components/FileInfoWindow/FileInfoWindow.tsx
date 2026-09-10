import { useTranslation } from 'react-i18next'
import { WindowNote } from '@/components/WindowNote'
import { fileInfoPathOf } from '@shared/domain/fileInfo'
import { nameOf } from '@shared/domain/folder'
import { WindowShell } from '@/components/WindowShell'
import { useAppliedSettings } from '@/hooks/useAppliedSettings'
import { useFileInfo } from '@/hooks/useFileInfo'
import { fileInfoSectionsOf } from './sections'
import { FileInfoWindowBody } from './FileInfoWindowBody'

/**
 * Everything the studio knows about ONE file, in a window of its own — the ⌘I of this studio.
 *
 * The file is named by the URL FRAGMENT, not by a selection, which is the whole difference with
 * the inspector panel: that one answers for whatever the main window holds at that instant.
 *
 * One block, scrolled, its runs told apart by the rule `PropertySection` already draws — no column
 * and no tabs, since a reader after a size should not have to find which screen holds it.
 */
export function FileInfoWindow() {
  const { t } = useTranslation()
  useAppliedSettings()

  const path = fileInfoPathOf(window.location.hash) ?? ''
  const { facts, asset, status, uses, reading } = useFileInfo(path)

  return (
    <WindowShell title={t('fileInfo.title', { name: nameOf(path) })}>
      {facts ? (
        // Git reports FILES: a folder has no line of its own there, and a Git run for one would
        // answer about the project rather than about the entry the right-click named.
        fileInfoSectionsOf({
          asset,
          versioned: status !== null && facts.kind === 'file',
          file: facts.kind === 'file',
        }).map(id => (
          <FileInfoWindowBody
            key={id}
            id={id}
            path={path}
            facts={facts}
            asset={asset}
            status={status}
            uses={uses}
          />
        ))
      ) : (
        <WindowNote>{reading ? t('fileInfo.reading') : t('fileInfo.missing')}</WindowNote>
      )}
    </WindowShell>
  )
}
