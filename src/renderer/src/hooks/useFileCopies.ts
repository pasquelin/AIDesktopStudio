import { useEffect, useState } from 'react'
import { orElse } from '@shared/promises'
import type { CopyGroup } from '@shared/domain/fileCopies'
import type { FileUse } from '@shared/domain/fileUse'
import { getBridge } from '@/services/bridge'
import { useReloadKey } from './useReloadKey'

export type FileCopies = {
  /** Groups of files holding the same bytes. Empty is an answer: nothing is held twice. */
  groups: readonly CopyGroup[]
  /**
   * Which documents MENTION each copied path, keyed by path.
   *
   * Mention, not need: the reader over-reports — a citation is matched on the file's name and on
   * its catalogue ids, so two files of one name in two folders answer for each other
   * (`fileDependents.ts`). What is established is that a path with no entry here is mentioned by
   * no document; the converse is a question, and the surface words it as one.
   */
  uses: ReadonlyMap<string, readonly FileUse[]>
  reading: boolean
  reload: () => void
}

/**
 * The copies diagnosis, read on demand and never kept.
 *
 * Both reads in ONE pass: the groups first, then the citations of every path they name at once.
 * `usedBy` walks the project's documents once whatever it is asked about, so asking per path
 * would be one full walk per candidate — which is exactly the cost `fileDependents.ts` says a
 * cleanup pass would have to pay, and the reason it is paid here rather than at every opening.
 *
 * `hash` narrows the whole thing to one file's group, which is what a file's information asks.
 */
export function useFileCopies(hash?: string): FileCopies {
  const [held, setHeld] = useState<{ groups: CopyGroup[]; uses: Map<string, FileUse[]> } | null>(
    null,
  )
  const [key, reload] = useReloadKey()

  useEffect(() => {
    let live = true

    void (async () => {
      const groups = await orElse(getBridge()?.project.fileCopies(hash), [])
      const paths = groups.flatMap(group => group.copies.map(copy => copy.path))
      const found = await orElse(getBridge()?.project.fileUses(paths), [])
      if (!live) return

      const uses = new Map<string, FileUse[]>()
      for (const use of found) {
        for (const path of use.used) uses.set(path, [...(uses.get(path) ?? []), use])
      }
      setHeld({ groups, uses })
    })()

    return () => {
      live = false
    }
  }, [hash, key])

  return {
    groups: held?.groups ?? [],
    uses: held?.uses ?? new Map(),
    reading: held === null,
    reload,
  }
}
