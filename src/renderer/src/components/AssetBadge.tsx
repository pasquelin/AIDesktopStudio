import {
  mdiAlertCircleOutline,
  mdiFileHidden,
  mdiCloudDownloadOutline,
  mdiCloudOffOutline,
  mdiCloudOutline,
  mdiCloudSyncOutline,
  mdiCloudUploadOutline,
  mdiDownloadOutline,
  mdiEarthPlus,
  mdiHarddisk,
  mdiProgressClock,
  mdiSourceBranch,
} from '@mdi/js'
import type { AssetBadge as Badge } from '@shared/domain/asset'
import { cn } from '@/helpers/cn'
import { TILE_MARK } from './styles'
import { UiIcon } from './UiIcon'

/**
 * What each state looks like.
 *
 * A glyph rather than a colour alone: seven states have to be told apart on a 112 px tile, and
 * several are ordinary rather than alarming — colour on its own would either shout at all of
 * them or say nothing. Only what needs attention is coloured, so a shelf of settled assets does
 * not read as a list of problems.
 *
 * One table rather than two parallel ones: a badge added to the union is a compile error either
 * way, but "added a glyph, forgot a tone" is only possible when they are apart.
 */
const MARKS: Record<Badge, { icon: string; tone: string; busy?: true }> = {
  'local-only': { icon: mdiHarddisk, tone: 'text-muted' },
  synced: { icon: mdiCloudSyncOutline, tone: 'text-muted' },
  'to-push': { icon: mdiCloudUploadOutline, tone: 'text-accent-ink' },
  'to-pull': { icon: mdiCloudOutline, tone: 'text-accent-ink' },
  conflict: { icon: mdiSourceBranch, tone: 'text-danger' },
  error: { icon: mdiAlertCircleOutline, tone: 'text-danger' },
  // Its twin is in a project this key does not open onto: nothing to do, but not settled either.
  'other-account': { icon: mdiCloudOffOutline, tone: 'text-muted' },
  // The three that stand for no local row. All are actionable — two invite a download, the
  // third says to wait — so none is quiet, and all are drawn in a dense grid.
  'remote-only': { icon: mdiDownloadOutline, tone: 'text-accent-ink' },
  // Somebody else's, and the glyph says so rather than the tone: the gesture is the same
  // download `remote-only` offers, so colouring it apart would claim a difference in what to do
  // where there is only a difference in whose it is.
  published: { icon: mdiEarthPlus, tone: 'text-accent-ink' },
  generating: { icon: mdiProgressClock, tone: 'text-accent-ink' },
  // The one that says something is happening RIGHT NOW, hence the only animated mark. It stays
  // readable when `data-reduce-motion` freezes it: the pulse ends at full opacity, so what is
  // left is the glyph and its tone — which is why the movement carries no meaning of its own.
  fetching: { icon: mdiCloudDownloadOutline, tone: 'text-accent-ink', busy: true },
  // Coloured like an error because it is one the user has to act on: the row promises a file
  // that opening, dragging or pushing will all fail to find.
  missing: { icon: mdiFileHidden, tone: 'text-danger' },
}

/**
 * The corner mark that says where an asset lives. Not drawn for the one settled state in a dense
 * grid — see `showQuiet` — a mark on every one of two hundred tiles being noise.
 *
 * 🛑 `synced` is NOT that state: the grid it was quiet in listed the project, where nearly every
 * row is synchronised. This one lists a library, where « you already have it » is the exception.
 */
export type AssetBadgeProps = {
  badge: Badge
  label: string
  showQuiet?: boolean
  /**
   * Sits in the corner of a tile. Off in a row, which lays its marks out in the flow — the same
   * component in both places, and this badge is the one that places itself at the top right.
   */
  overlay?: boolean
}

export function AssetBadge({ badge, label, showQuiet = false, overlay = false }: AssetBadgeProps) {
  const quiet = badge === 'local-only'
  if (quiet && !showQuiet) return null

  const mark = MARKS[badge]

  return (
    <span
      className={cn(
        'pointer-events-none inline-flex items-center',
        overlay && cn('absolute end-1 top-1', TILE_MARK),
        mark.busy && 'animate-pulse',
        mark.tone,
      )}
      // The glyph carries the meaning, so it needs the words a colour cannot give.
      title={label}
      aria-label={label}
      role="img"
    >
      <UiIcon path={mark.icon} size={12} />
    </span>
  )
}
