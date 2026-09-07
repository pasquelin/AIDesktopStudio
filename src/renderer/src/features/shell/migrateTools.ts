import {
  SLOTS,
  ZONES,
  type LayoutState,
  type Lengths,
  type OpenByZone,
  type SizesByZone,
  type Zone,
  type ZoneSlots,
} from '@pasquelin/panels'
import { placementOf, workspacePlacementsOf, type ToolId } from '@shared/domain/tool'
import { isRecord, readOptionalNumber } from '@shared/guards'

/** The last version the tools store wrote. Below it, what the home holds is rebuilt. */
const TOOLS_VERSION = 20

/** The version that stopped naming a panel in every default half — see `workspacesOpenOf`. */
const CHOSEN_FROM = 8

/** The band's half carrying the strip's height. It was one zone called `bottom` until 15. */
const BAND_MAIN: Zone = 'bottomRight'

/**
 * The layout the tools store wrote, read into the chassis' own shape. A view this cannot read is
 * left OUT rather than filled in: the chassis settles it against the panels declared today.
 */
export function migrateTools(
  persisted: Record<string, unknown>,
  version: number,
): LayoutState<ToolId> {
  const held = persisted.arrangements
  // Before `arrangements` existed, the one workspaces arrangement lay flat at the root. Read as
  // the later shape it finds nothing, and every width and named panel is lost without a word.
  const workspaces = isRecord(held) ? held.workspaces : persisted

  const views: Record<string, OpenByZone<ToolId>> = {}
  const open = workspacesOpenOf(workspaces, version)
  if (open) views.workspaces = open

  // The home only from the version that last wrote it: every bump below gave it a half no stored
  // arrangement could name, and a half nobody can name stays shut.
  if (version >= TOOLS_VERSION && isRecord(held) && isRecord(held.home)) {
    // Sanitised, never re-hung: `openEverywhereItSits` reads the placements a WORKSPACE declares.
    const home = slotsByZone(held.home.open)
    if (home) views.home = home
  }

  return { views, lengths: lengthsOf(persisted, workspaces) }
}

/** The halves an older version had up, re-hung on the placements this one declares. */
function workspacesOpenOf(persisted: unknown, version: number): OpenByZone<ToolId> | undefined {
  const stored = slotsByZone(isRecord(persisted) ? persisted.open : undefined)
  if (!stored) return undefined

  const open = openEverywhereItSits(stored)
  // Up to version 7 every half named a panel, the default included. Kept as chosen, an untouched
  // Image would still open on the explorer rather than its layers, and no update would fix it.
  return version < CHOSEN_FROM ? unchosen(open) : open
}

/** Every half a stored arrangement names, in the zones and slots this version still has. */
function slotsByZone(stored: unknown): OpenByZone<ToolId> | undefined {
  if (!isRecord(stored)) return undefined

  const open: OpenByZone<ToolId> = {}
  for (const zone of ZONES) {
    const slots = slotsFrom(stored[zone])
    if (slots) open[zone] = slots
  }

  // Up to version 14 the band was ONE zone called `bottom`. Dropped as an unknown key, everyone
  // who had a montage or a shelf down there would find the band closed.
  const band = slotsFrom(stored.bottom)
  if (band) open[BAND_MAIN] ??= band

  return open
}

/**
 * Re-hangs every stored tool on the placements it declares today, and nowhere else — a tool
 * leaves the zones it no longer declares. It never displaces a tool already there.
 */
function openEverywhereItSits(open: OpenByZone<ToolId>): OpenByZone<ToolId> {
  const next: OpenByZone<ToolId> = {}
  // A zone that was open is kept, even once emptied — its length lives apart, in `lengths`.
  for (const zone of ZONES) if (open[zone]) next[zone] = {}

  for (const zone of ZONES) {
    for (const slot of SLOTS) {
      const tool = open[zone]?.[slot]
      if (tool === undefined) continue

      // A half open on no panel in particular has no placement to follow: it stays where it was
      // opened, and every section reads it as the first panel it puts there.
      if (tool === null) {
        const target = (next[zone] ??= {})
        target[slot] ??= null
        continue
      }

      for (const placement of workspacePlacementsOf(tool)) {
        const target = (next[placement.zone] ??= {})
        // `??=`, so a named panel wins the half over one merely left on its default.
        target[placement.slot] ??= tool
      }
    }
  }
  return next
}

/** The same halves, open on no panel in particular: which panel is then the section's call. */
function unchosen(open: OpenByZone<ToolId>): OpenByZone<ToolId> {
  const next: OpenByZone<ToolId> = {}
  for (const zone of ZONES) {
    const slots = open[zone]
    if (!slots) continue

    const cleared: ZoneSlots<ToolId> = {}
    for (const slot of SLOTS) if (slot in slots) cleared[slot] = null
    next[zone] = cleared
  }
  return next
}

function slotsFrom(stored: unknown): ZoneSlots<ToolId> | undefined {
  if (typeof stored === 'string') {
    const placement = placementOf(stored)
    return placement ? { [placement.slot]: placement.id } : {}
  }
  if (!isRecord(stored)) return undefined

  const slots: ZoneSlots<ToolId> = {}
  for (const slot of SLOTS) {
    const value = stored[slot]
    // An open half with no panel named keeps the half it was written in — there is no placement
    // to move it by, and every section answers it on its own.
    if (value === null) {
      slots[slot] = null
      continue
    }

    // Through `placementOf`, so an id no version knows any more is dropped rather than
    // reaching the registry and blanking the half.
    const placement = placementOf(value)
    if (placement) slots[placement.slot] = placement.id
  }
  return slots
}

/**
 * What that layout was dragged to. 🛑 Version 16 moved the lengths from the per-family
 * arrangement up to the root: read only where they used to live, four versions of widths are lost.
 */
function lengthsOf(persisted: Record<string, unknown>, workspaces: unknown): Lengths {
  // The SPACES' lengths where they were still per family, and never the home's: those are the
  // six a reader drags every day, where the home is passed through.
  const held = isRecord(persisted.lengths) ? persisted.lengths : workspaces
  if (!isRecord(held)) return { sizes: {}, splits: {} }

  return {
    sizes: sizesFrom(held.sizes),
    splits: sizesFrom(held.splits),
    bandSplit: readOptionalNumber(held, 'bandSplit'),
  }
}

/** The lengths of the zones this version has, plus the band's: `bottom` was ONE zone up to 14. */
function sizesFrom(persisted: unknown): SizesByZone {
  if (!isRecord(persisted)) return {}

  const sizes: SizesByZone = {}
  for (const zone of ZONES) {
    const stored = readOptionalNumber(persisted, zone)
    if (stored !== undefined) sizes[zone] = stored
  }

  const band = readOptionalNumber(persisted, 'bottom')
  if (band !== undefined) sizes[BAND_MAIN] ??= band

  return sizes
}
