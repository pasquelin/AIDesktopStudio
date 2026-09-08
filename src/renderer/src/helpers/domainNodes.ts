import { FILE_DOMAINS, type FileDomain } from '@shared/domain/fileRole'
import { nameOf } from '@shared/domain/folder'
import type { ProjectItem } from '@/helpers/projectItem'
import type { FolderNode } from '@/hooks/useFolderTree'

/** One of the domains, standing as a root of the tree — a row that names rather than opens. */
export type DomainHeading = {
  id: string
  parentId: null
  domain: FileDomain
  /** How many files are filed under it. Drawn beside the name, and never zero: see below. */
  count: number
}

/** What the explorer's tree holds in either mode: a file of the project, or a domain naming some. */
export type ExplorerNode = FolderNode | DomainHeading

const domainRowId = (domain: FileDomain): string => `domain:${domain}`

export function isDomainHeading(node: ExplorerNode): node is DomainHeading {
  return 'domain' in node
}

/**
 * The project read by what its files ARE — six domains and the one for everything else, each
 * holding the files filed under it.
 *
 * The two halves come back APART: the headings keep the order `FILE_DOMAINS` declares, which is
 * the order the shelf and the rail already use, while the files are the caller's to sort — a
 * sort of file names has nothing to say about which domain comes first. A domain nothing is
 * filed under is left out rather than drawn empty: the view answers what the project holds, and
 * seven headings over an empty project say nothing at all.
 *
 * The files are `FolderNode`s, `name` included, and that is deliberate: the rows are drawn by
 * the same reading the file tree uses — the document behind a file is found by its FILE name,
 * so an item named after its document's title would find nothing.
 */
export function domainNodes(items: readonly ProjectItem[]): {
  headings: DomainHeading[]
  files: FolderNode[]
  expandedIds: Set<string>
} {
  // One pass over the items rather than one per domain: seven scans of a project of four
  // hundred files is seven times the work for an answer a single grouping gives.
  const filed = new Map<FileDomain, ProjectItem[]>()
  for (const item of items) {
    const under = filed.get(item.domain)
    if (under) under.push(item)
    else filed.set(item.domain, [item])
  }

  const headings: DomainHeading[] = []
  const files: FolderNode[] = []
  const expandedIds = new Set<string>()

  // The domains in the order the studio names them everywhere else, never the order the disk
  // happened to answer in.
  for (const domain of FILE_DOMAINS) {
    const under = filed.get(domain)
    if (!under) continue

    const id = domainRowId(domain)
    headings.push({ id, parentId: null, domain, count: under.length })
    // Open by default: a browser that answers with seven closed folds has answered nothing.
    expandedIds.add(id)

    for (const item of under) {
      files.push({
        id: item.path,
        path: item.path,
        name: nameOf(item.path),
        kind: 'file',
        parentId: id,
      })
    }
  }

  return { headings, files, expandedIds }
}
