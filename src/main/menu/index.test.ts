import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scopeOfWorkspace } from '@shared/domain/command'
import { isWorkspaceId } from '@shared/domain/workspace'
import { TRANSLATIONS } from '@shared/i18n'
import { CHANNELS, EVENTS } from '@shared/ipc'
import {
  closeWindow,
  destroyWindow,
  focusWindow,
  invokeFrom,
  lastMenu,
  menuBuilds,
  openWindow,
  resetHandlers,
  type FakeWindow,
} from '@main/ipc/testHarness'
import { setWindowLanguage } from '@main/window/language'
import { buildMenu, noteProjectOpen, noteRecent, registerMenuHandlers } from './index'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())
// The three neighbours the menu calls into. Real, they pull the whole window layer in — and
// what is under test here is which window a command reaches, never what opening one does.
vi.mock('@main/window/windows', () => ({
  openSettingsWindow: vi.fn(),
  openLicencesWindow: vi.fn(),
  openUsageWindow: vi.fn(),
}))
vi.mock('@main/window/controls', () => ({ toggleFullScreen: vi.fn() }))

/** What a window announces on startup and on every click of the space rail. */
function announce(
  window: FakeWindow,
  workspace: string | null,
  tools: string[] = [],
  checked: string[] = [],
  abilities: string[] = [],
  scope: string | null = workspace && isWorkspaceId(workspace) ? scopeOfWorkspace(workspace) : null,
): void {
  invokeFrom(window, CHANNELS.windowWorkspace, workspace, tools, checked, abilities, scope)
}

/**
 * What the test reads of a row, which is not `MenuItemConstructorOptions`: the double hands the
 * template back untouched, and Electron's `click` names three arguments the menu never reads —
 * typing it as it is written here keeps a plain call out of a cast.
 */
type MenuRow = {
  label?: string
  accelerator?: string
  enabled?: boolean
  submenu?: readonly MenuRow[]
  click?: () => void
}

function isMenuRows(value: unknown): value is MenuRow[] {
  return Array.isArray(value)
}

function items(): MenuRow[] {
  const built = lastMenu()
  if (!isMenuRows(built)) throw new Error('no menu has been built')
  return built
}

/**
 * The same search, held to one branch of the tree.
 *
 * Needed since File ▸ New file arrived: a kind of document and what the studio exports are the
 * same words — « Scène », « Matière », « Ciel » — so a sweep of the whole menu answers `not null`
 * for an export row that is no longer there. Every case about a row a SPACE decides reads through
 * here; the plain sweep stays for the labels that are unique.
 */
function findUnder(parent: string, label: string): MenuRow | null {
  const branch = findByLabel(parent)?.submenu
  if (!branch) return null

  const walk = (level: readonly MenuRow[]): MenuRow | null => {
    for (const item of level) {
      if (item.label === label) return item
      const deeper = item.submenu ? walk(item.submenu) : null
      if (deeper) return deeper
    }
    return null
  }
  return walk(branch)
}

/** Walks the whole tree: what a case names is a leaf, and its depth is not the point. */
function findByLabel(label: string): MenuRow | null {
  const walk = (level: readonly MenuRow[]): MenuRow | null => {
    for (const item of level) {
      if (item.label === label) return item
      const deeper = item.submenu ? walk(item.submenu) : null
      if (deeper) return deeper
    }
    return null
  }
  return walk(items())
}

/**
 * The native menu is a single application-wide object, and what decides its contents lives in
 * module singletons. `vi.resetModules()` cannot isolate them: the `electron` mock factory
 * imports the harness itself, so a reset hands the module under test a SECOND registry and the
 * channel this file invokes is registered in the one nobody reads.
 *
 * So the module stays loaded and the state is normalised instead — the language at its source,
 * the overrides by a build that names them, the per-window maps by ids that never repeat.
 */
beforeEach(() => {
  resetHandlers()
  setWindowLanguage('fr')
  // Normalised like the language and the overrides above, and for the same reason: this module
  // stays loaded between cases, so a project left open by one would decide the next.
  noteProjectOpen(null)
  noteRecent([], [])
  registerMenuHandlers()
  buildMenu({})
})

describe('the window the menu belongs to', () => {
  it('shows what the focused window announced', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, '3d')

    buildMenu()

    expect(findUnder(TRANSLATIONS.fr.menu.export, TRANSLATIONS.fr.menu.exportScene)).not.toBeNull()
  })

  /**
   * On macOS the app outlives its last window, so the menu stays usable with nothing focused.
   * Dropping the command in silence there would leave a menu that answers nothing.
   */
  it('falls back to the first live window when nothing is focused', () => {
    const window = openWindow()
    announce(window, 'image')
    focusWindow(null)

    runUndo()

    expect(window.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'canvas.undo' }])
  })

  /**
   * Undo is scoped per workspace, so the row under one label fires two different commands.
   * That is the whole reason the menu follows the focus rather than being built once.
   */
  it('fires the undo of the focused workspace, not one undo for all of them', () => {
    const picture = openWindow()
    const scene = openWindow()
    announce(picture, 'image')
    announce(scene, '3d')

    focusWindow(picture)
    runUndo()
    focusWindow(scene)
    runUndo()

    expect(picture.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'canvas.undo' }])
    expect(scene.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'scene.undo' }])
  })

  // The skeleton window: no space announced, a history all the same.
  it('fires the undo of a window that shows no space but reports a history', () => {
    const skeleton = openWindow()
    announce(skeleton, null, [], [], [], 'character')
    focusWindow(skeleton)

    runUndo()

    expect(skeleton.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'character.undo' }])
  })

  // The splash has no bridge: a command sent there is lost, and the fallback must step over it.
  it('steps over a window that cannot take the focus', () => {
    const splash = openWindow({ focusable: false })
    const main = openWindow()
    announce(main, 'image')
    focusWindow(null)

    runUndo()

    expect(splash.sent).toHaveLength(0)
    expect(main.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'canvas.undo' }])
  })

  it('sends nothing at all when the only window is gone', () => {
    const window = openWindow()
    announce(window, 'image')
    focusWindow(window)
    buildMenu()
    destroyWindow(window)

    runUndo()

    expect(window.sent).toHaveLength(0)
  })

  it('routes a command to the focused window and to no other', () => {
    const other = openWindow()
    const focusedOne = openWindow()
    announce(other, 'image')
    announce(focusedOne, 'image')
    focusWindow(focusedOne)

    runUndo()

    expect(focusedOne.sent).toEqual([{ channel: EVENTS.menuCommand, payload: 'canvas.undo' }])
    expect(other.sent).toHaveLength(0)
  })
})

/**
 * The rebuild is what keeps the menu in step with the focused window, and doing it on every
 * focus change would rebuild a whole native menu for nothing several times a minute.
 */
describe('what makes the menu rebuild', () => {
  it('rebuilds when a window announces a workspace it was not showing', () => {
    const window = openWindow()
    focusWindow(window)
    const before = menuBuilds()

    announce(window, '3d')

    expect(menuBuilds()).toBe(before + 1)
  })

  // The 3D space keeps its panels across a scene and an interface; only the history changes.
  it('rebuilds when the same workspace reports another history', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, '3d', [], [], [], 'scene')
    const before = menuBuilds()

    announce(window, '3d', [], [], [], 'gui')

    expect(menuBuilds()).toBe(before + 1)
  })

  it('rebuilds nothing when the same workspace is announced twice', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, '3d')
    const before = menuBuilds()

    announce(window, '3d')

    expect(menuBuilds()).toBe(before)
  })

  it('rebuilds when the focus moves to a window in another workspace', () => {
    const scene = openWindow()
    const picture = openWindow()
    announce(scene, '3d')
    announce(picture, 'image')
    focusWindow(scene)
    const before = menuBuilds()

    focusWindow(picture)

    expect(menuBuilds()).toBe(before + 1)
  })

  it('rebuilds nothing when the focus moves between two windows showing the same thing', () => {
    const one = openWindow()
    const other = openWindow()
    announce(one, '3d', ['scene'])
    announce(other, '3d', ['scene'])
    focusWindow(one)
    const before = menuBuilds()

    focusWindow(other)

    expect(menuBuilds()).toBe(before)
  })

  // The workspace alone is not the fingerprint: two windows in the same space can offer
  // different panels, and a menu that only watched the workspace would keep the first one's.
  it('rebuilds when the same workspace reports a different set of panels', () => {
    const one = openWindow()
    const other = openWindow()
    announce(one, '3d', ['scene'])
    announce(other, '3d', ['scene', 'assets'])
    focusWindow(one)
    const before = menuBuilds()

    focusWindow(other)

    expect(menuBuilds()).toBe(before + 1)
  })

  /**
   * Nor are the panels: two scenes side by side are two points of view, and a menu that only
   * watched the workspace and the panels would tick the first window's wireframe on the second.
   */
  it('rebuilds when the same workspace reports different ticks', () => {
    const one = openWindow()
    const other = openWindow()
    announce(one, '3d', ['scene'], ['scene.display:shaded'])
    announce(other, '3d', ['scene'], ['scene.display:wireframe', 'scene.quad'])
    focusWindow(one)
    const before = menuBuilds()

    focusWindow(other)

    expect(menuBuilds()).toBe(before + 1)
  })

  /** A greyed row belongs to the window in front, exactly as a tick does. */
  it('rebuilds when the same workspace reports a different set of answerable rows', () => {
    const window = openWindow()
    announce(window, '3d', ['scene'], [], [])
    focusWindow(window)
    const before = menuBuilds()

    announce(window, '3d', ['scene'], [], ['scene.exportSelection'])

    expect(menuBuilds()).toBe(before + 1)
  })

  /** And the reverse, which is what the comparison is for: an identical report costs no menu. */
  it('rebuilds nothing when a window re-announces the same ticks', () => {
    const window = openWindow()
    announce(window, '3d', ['scene'], ['scene.quad'])
    focusWindow(window)
    const before = menuBuilds()

    announce(window, '3d', ['scene'], ['scene.quad'])

    expect(menuBuilds()).toBe(before)
  })
})

describe('what a window is allowed to announce', () => {
  /**
   * The only main-process state a renderer sets. A preload from an older build could name a
   * workspace this one has dropped, and the menu would then show a space that does not exist.
   */
  it('refuses a workspace the registry does not know', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, '3d')
    const before = menuBuilds()

    announce(window, 'holodeck')

    expect(menuBuilds()).toBe(before)
    expect(findUnder(TRANSLATIONS.fr.menu.export, TRANSLATIONS.fr.menu.exportScene)).not.toBeNull()
  })

  /**
   * `placementIn` already drops an unplaced panel from the Window menu, so the filter here shows
   * up somewhere else entirely: the fingerprint. Kept, an id nothing can place would make two
   * otherwise identical windows rebuild the whole native menu on every focus change.
   */
  it('drops a panel no placement knows, so it cannot make the menu rebuild for nothing', () => {
    const one = openWindow()
    const other = openWindow()
    announce(one, '3d', ['scene'])
    announce(other, '3d', ['scene', 'not-a-panel'])
    focusWindow(one)
    const before = menuBuilds()

    focusWindow(other)

    expect(menuBuilds()).toBe(before)
  })

  it('still offers the panels it does know', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, '3d', ['scene', 'not-a-panel'])

    expect(findUnder(TRANSLATIONS.fr.menu.tools, TRANSLATIONS.fr.panels.scene)).not.toBeNull()
  })
})

/**
 * The one fact the menu does NOT take from the focused window: the main process owns the open
 * project, and a fact routed through a renderer is a fact free to arrive late — File ▸ New file
 * would stay greyed over a project already open.
 */
describe('the project the main process holds', () => {
  const newFileRow = (kind: string) =>
    findUnder(TRANSLATIONS.fr.menu.newFile, TRANSLATIONS.fr.documents.kinds[kind as 'image'])

  it('arms the kinds of File ▸ New file when one opens, and disarms them when it goes', () => {
    noteProjectOpen('/projects/One')
    expect(newFileRow('image')?.enabled).toBe(true)

    noteProjectOpen(null)
    expect(newFileRow('image')?.enabled).toBe(false)
  })

  it('rebuilds when a shelf moves, and not when a settings write left it alone', () => {
    const shelf = [{ path: '/projects/One', openedAt: '2026-09-01T10:00:00.000Z' }]
    noteRecent(shelf, [])
    expect(findUnder(TRANSLATIONS.fr.menu.openRecent, 'One')).not.toBeNull()

    const before = menuBuilds()
    noteRecent([...shelf], [])

    expect(menuBuilds()).toBe(before)
  })

  it('rebuilds nothing when told what it already knows', () => {
    noteProjectOpen('/projects/One')
    const before = menuBuilds()

    noteProjectOpen('/projects/One')

    expect(menuBuilds()).toBe(before)
  })
})

describe('a window that goes away', () => {
  it('is forgotten, so its workspace cannot decide what a later window is offered', () => {
    const scene = openWindow()
    announce(scene, '3d')
    focusWindow(scene)

    closeWindow(scene)
    const picture = openWindow()
    announce(picture, 'image')
    focusWindow(picture)

    expect(findUnder(TRANSLATIONS.fr.menu.export, TRANSLATIONS.fr.menu.exportScene)).toBeNull()
  })

  it('takes the menu back to no workspace at all when it was the last one', () => {
    const window = openWindow()
    announce(window, '3d')
    focusWindow(window)
    const before = menuBuilds()

    closeWindow(window)

    expect(menuBuilds()).toBe(before + 1)
    expect(findUnder(TRANSLATIONS.fr.menu.export, TRANSLATIONS.fr.menu.exportScene)).toBeNull()
  })
})

/**
 * The overrides are remembered between builds and set from somewhere else: a rebuild driven by a
 * focus change passes none, so forgetting them would drop the user's remaps the first time they
 * clicked another window. The language is not remembered — it is read where the menu is drawn.
 */
describe('what a rebuild must not drop', () => {
  /**
   * The menu is built once, so it is told rather than asked. Measured: with the rebuild taken
   * out, the whole suite stayed green while an English studio kept a French menu bar.
   */
  it('rebuilds on the language alone, with nothing else having happened', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, 'image')
    const before = menuBuilds()

    setWindowLanguage('en')

    expect(menuBuilds()).toBe(before + 1)
    expect(findByLabel(TRANSLATIONS.en.menu.file)).not.toBeNull()
    expect(findByLabel(TRANSLATIONS.fr.menu.file)).toBeNull()
  })

  it('keeps the remapped keys a previous build was given', () => {
    const window = openWindow()
    focusWindow(window)
    announce(window, 'image', ['assets'])
    // A chord that carries ⌘: a remap onto a bare key is deliberately not drawn on macOS, where
    // the row would reserve it with the system — `template.test.ts` holds that half.
    buildMenu({ 'canvas.undo': 'Shift+Meta+KeyZ' })
    const remapped = undoItem()?.accelerator

    // A rebuild driven by the focus, which passes neither the language nor the overrides —
    // announcing another set of panels is the cheapest way to make one happen.
    announce(window, 'image', ['assets', 'layers'])

    expect(remapped).toBeDefined()
    expect(remapped).not.toBe(defaultUndoAccelerator)
    expect(undoItem()?.accelerator).toBe(remapped)
  })
})

/** What the row wears with nothing remapped, so a remap that changed nothing cannot pass. */
const defaultUndoAccelerator = 'Cmd+Z'

function undoItem(): MenuRow | null {
  return findByLabel(TRANSLATIONS.fr.commands.undo.title)
}

function runUndo(): void {
  const item = undoItem()
  if (!item?.click) throw new Error('the menu has no undo row')
  item.click()
}
