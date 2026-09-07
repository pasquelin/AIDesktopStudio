import type { TFunction } from 'i18next'
import { commandDescriptor, type CommandId } from '@shared/domain/command'
import type { ContextMenuItem } from '@shared/domain/contextMenu'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { menuIcon } from './menuIcon'

export type ContextMenuAction = {
  /** Already translated: this side owns the bundle, and the system only draws what it is given. */
  label: string
  /** An `@mdi/js` path, the same one `UiIcon` would draw. */
  icon?: string
  /** Greyed rather than dropped — a menu whose length follows the selection cannot be learnt. */
  disabled?: boolean
  /**
   * What the row does, already translated. **Required**, exactly as `MenuRow` and `ToolButton`
   * require theirs: the system only shows it on macOS, but a row whose explanation was never
   * written has none to show anywhere — and it is a menu the studio can no longer inspect on
   * screen, so the compiler is the only thing left to ask for it.
   */
  tooltip: string
  /** The key in force, as `acceleratorOf` spells it. Drawn only — see `ContextMenuItem`. */
  accelerator?: string
  onSelect: () => void
}

/** A rule between two groups. Nothing to choose, so nothing to explain. */
export type ContextMenuRule = { separator: true }

/**
 * A row that opens onto others rather than doing anything itself — Add ▸ Mesh ▸ Cube.
 *
 * Its rows are actions and only actions: one level, which the shared type is what bounds. Twenty-
 * four ways of adding to a scene are unreadable flat, and unpointable three deep.
 */
export type ContextMenuGroup = {
  label: string
  icon?: string
  disabled?: boolean
  tooltip: string
  rows: readonly ContextMenuAction[]
}

export type ContextMenuRow = ContextMenuAction | ContextMenuRule | ContextMenuGroup

/** A row that fires a studio command: its title and help are the command's own, translated. */
export function commandRow(
  id: CommandId,
  icon: string,
  t: TFunction,
  run: (command: CommandId) => void,
): ContextMenuAction {
  const descriptor = commandDescriptor(id)
  return {
    label: descriptor ? t(descriptor.titleKey) : id,
    icon,
    tooltip: descriptor ? t(descriptor.helpKey) : id,
    onSelect: () => run(id),
  }
}

const isRule = (row: ContextMenuRow): row is ContextMenuRule => 'separator' in row
const isGroup = (row: ContextMenuRow): row is ContextMenuGroup => 'rows' in row

/**
 * Raises the rows as the system's own context menu, at the pointer, and runs the one chosen.
 *
 * Rows are addressed by their position, which is what lets a caller write them as it always
 * has — a list built in place, with the conditions it already had. Nothing needs an id of its
 * own for a menu that lives for as long as one press.
 *
 * **Where the menu appears is not this side's business.** The system pops it at the pointer and
 * keeps it clear of the screen edges, which is the reason for going through the main process
 * rather than drawing a surface: a menu drawn in the window is bounded by the window.
 *
 * Does nothing without a bridge, which is a plain browser and every test that does not double
 * it: a menu that cannot be popped is a menu nobody chose from.
 */
export async function showContextMenu(rows: readonly ContextMenuRow[]): Promise<void> {
  // Indexed over the whole list, rules included: what comes back is a position in what was
  // SENT, and numbering only the actions would answer the row above every rule. A row of a
  // submenu carries its parent's position too — `3.1` — for the same reason.
  const leafOf = (row: ContextMenuAction, id: string): ContextMenuItem => {
    const icon = row.icon ? menuIcon(row.icon) : undefined
    return {
      id,
      label: row.label,
      enabled: !row.disabled,
      ...(icon ? { icon } : {}),
      ...(row.accelerator ? { accelerator: row.accelerator } : {}),
      tooltip: row.tooltip,
    }
  }

  const items: ContextMenuItem[] = rows.map((row, index) => {
    if (isRule(row)) return { id: String(index), label: '', separator: true }
    if (isGroup(row)) {
      const icon = row.icon ? menuIcon(row.icon) : undefined
      return {
        id: String(index),
        label: row.label,
        enabled: !row.disabled,
        ...(icon ? { icon } : {}),
        tooltip: row.tooltip,
        submenu: row.rows.map((leaf, inner) => leafOf(leaf, `${index}.${inner}`)),
      }
    }
    return leafOf(row, String(index))
  })

  // Caught rather than left to `void`: the main process validates what arrives and REFUSES what
  // it cannot draw, and a menu that never appears leaves no half-open surface behind to hint at
  // it — an unhandled rejection would be the only trace, and it is not one anybody reads.
  const first = rows.find(row => !isRule(row))
  let chosen
  try {
    chosen = await getBridge()?.menu.popup(items)
  } catch (error) {
    reportFailure('shell.menu', first && !isRule(first) ? first.label : '', error)
    return
  }

  // Spelt out rather than `!chosen`: the first row's id is `'0'`, which reads as falsy to anyone
  // skimming even though the string is not.
  if (chosen === null || chosen === undefined) return

  const [outer, inner] = chosen.split('.')
  const row = rows[Number(outer)]
  if (!row || isRule(row)) return
  // A group is opened, never chosen: without a second half there is no row to run, and
  // `rows[NaN]` is what says so.
  if (isGroup(row)) row.rows[Number(inner)]?.onSelect()
  else row.onSelect()
}
