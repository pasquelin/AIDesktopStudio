import { useEffect, useState } from 'react'
import type { Asset } from '@shared/domain/asset'
import type { FileFacts } from '@shared/domain/fileInfo'
import type { FileUse } from '@shared/domain/fileUse'
import type { GitStatus } from '@shared/domain/git'
import { assetAt } from '@/helpers/assetAt'
import { getBridge } from '@/services/bridge'

export type FileInfo = {
  /** `null` while the first read is out, and again for an entry that has gone. */
  facts: FileFacts | null
  /** `null` for everything the catalogue holds no row for — a `.txt`, a folder, a `.pdf`. */
  asset: Asset | null
  /** `null` where the project is not under version control, or git could not answer. */
  status: GitStatus | null
  /**
   * The documents that cite this file — §11's S3, read on demand. Empty is an answer: nothing
   * cites it. It over-reports rather than under-reports — see `fileDependents.ts`.
   */
  uses: readonly FileUse[]
  reading: boolean
}

/** What one read answered, and WHICH path it answered for. */
type Read = FileInfo & { path: string }

/**
 * Everything one path can be told about: what the disk says, what the catalogue adds, and what
 * git holds against it.
 *
 * The three are asked side by side — none needs another — and re-asked when the project folder
 * moves, which is what keeps « this entry is no longer there » true rather than merely true at
 * the moment the window opened.
 *
 * NOT through `useGitStatus`: that hook also reads the remotes and re-asks on every window
 * focus, for a panel that draws a server bar. This window draws a branch and one line, and a
 * second `git` process per focus per window is not what it costs to show them.
 *
 * `reading` is DERIVED from which path the held answer belongs to, never set in the effect: a
 * synchronous `setState` there cascades a render, and comparing the two paths says the same
 * thing without a second pass.
 */
export function useFileInfo(path: string): FileInfo {
  const [read, setRead] = useState<Read | null>(null)

  useEffect(() => {
    // An empty path is not an entry, it is the project folder — and a fragment naming no file is
    // the one way to get here with one. Reading it would answer for the root, and the window
    // would describe the project instead of saying it has nothing to describe.
    if (path === '') return

    let live = true

    const refresh = (): void => {
      const bridge = getBridge()
      void Promise.all([
        bridge?.project.fileFacts(path).catch(() => null) ?? null,
        assetAt(path),
        bridge?.git.read().catch(() => null) ?? null,
        bridge?.project.fileUses([path]).catch(() => []) ?? [],
      ]).then(([facts, asset, repository, uses]) => {
        if (!live) return
        setRead({
          path,
          facts,
          asset,
          status: repository?.kind === 'ready' ? repository.status : null,
          uses,
          reading: false,
        })
      })
    }

    refresh()
    const stop = getBridge()?.project.onFolderChanged(refresh)

    return () => {
      live = false
      stop?.()
    }
  }, [path])

  const held = read?.path === path ? read : null
  return {
    facts: held?.facts ?? null,
    asset: held?.asset ?? null,
    status: held?.status ?? null,
    uses: held?.uses ?? [],
    reading: path !== '' && !held,
  }
}
