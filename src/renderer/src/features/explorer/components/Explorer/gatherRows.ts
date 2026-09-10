import { mdiPackageVariant } from '@mdi/js'
import type { TFunction } from 'i18next'
import type { DocumentDescriptor } from '@shared/domain/document'
import { gatheredCountOf, type GatherReport } from '@shared/domain/gather'
import { projectName, projectsByCreation, type RecentProject } from '@shared/domain/project'
import type { ContextMenuRow } from '@/helpers/contextMenu'
import { getBridge } from '@/services/bridge'
import { reportFailure, reportNotice } from '@/services/diagnostics'

export type GatherRowsProps = {
  document: DocumentDescriptor | null
  /** The shelf, the open project included — it is dropped here rather than at the call. */
  recent: readonly RecentProject[]
  openProject: string | null
  t: TFunction
}

/**
 * « Gather into » — a document and everything it cites, put where another project can open it.
 *
 * A submenu over the shelf rather than a folder picker: the destination has to BE a project for
 * the word autonomous to mean anything, and a picker would let someone aim at a folder that is
 * not one — or at a folder inside the project they are copying out of.
 *
 * Absent for anything that is not a document: « what does this cite » is a question only a
 * document answers, and for an image the answer is always nothing.
 */
export function gatherRows({
  document,
  recent,
  openProject,
  t,
}: GatherRowsProps): ContextMenuRow[] {
  if (!document) return []

  const elsewhere = projectsByCreation([...recent]).filter(one => one.path !== openProject)
  if (elsewhere.length === 0) return []

  return [
    { separator: true },
    {
      label: t('explorer.gather'),
      tooltip: t('explorer.gatherHint'),
      icon: mdiPackageVariant,
      rows: elsewhere.map(one => ({
        label: projectName(one.path),
        tooltip: t('explorer.gatherIntoHint', { name: projectName(one.path) }),
        onSelect: () => void gather(document, one.path, t),
      })),
    },
  ]
}

/**
 * Says what happened, always — a gathering writes into a folder nobody is looking at, so a
 * silent one is indistinguishable from one that never ran.
 */
async function gather(document: DocumentDescriptor, destination: string, t: TFunction) {
  try {
    const report = await getBridge()?.project.gatherInto({
      documentId: document.id,
      kind: document.kind,
      destination,
    })
    if (report) reportNotice('assets.copy', gatheredLine(report, t))
  } catch (error) {
    reportFailure('assets.copy', `gather-${document.id}`, error)
  }
}

function gatheredLine(report: GatherReport, t: TFunction): string {
  if (report.refused) return t(`explorer.gatherRefused.${report.refused}`)

  const refused = gatheredCountOf(report, 'refused')
  const copied = t('explorer.gathered', {
    files: gatheredCountOf(report, 'copied'),
    rows: report.rows,
  })

  return refused === 0 ? copied : `${copied} ${t('explorer.gatherKept', { count: refused })}`
}
