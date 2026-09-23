import { scopeOfWorkspace } from '@shared/domain/command'
import type { DocumentKind } from '@shared/domain/document'
import type { RecentDocument } from '@shared/domain/project'
import { LIGHT_ENTRIES, MESH_ENTRIES } from '@shared/domain/scene'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { LANGUAGES } from '@shared/i18n'
import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { menuTemplate, type MenuActions, type MenuOptions } from './template'

const actions = (overrides: Partial<MenuActions> = {}): MenuActions => ({
  setNavigationPreset: () => {},
  openSettings: () => {},
  openLicences: () => {},
  openManual: () => {},
  openUsage: () => {},
  openCopies: () => {},
  openShipped: () => {},
  openWelcome: () => {},
  toggleFullScreen: () => {},
  openTool: () => {},
  runCommand: () => {},
  newDocument: () => {},
  openRecent: () => {},
  addNode: () => {},
  setDisplay: () => {},
  exportScene: () => {},
  captureScene: () => {},
  exportMaterial: () => {},
  exportSkybox: () => {},
  ...overrides,
})

/** The scope derived from the space and the kind, as the studio window derives it before announcing. */
const options = ({
  kind = null,
  workspace = '3d',
  ...given
}: Partial<MenuOptions> & { kind?: DocumentKind | null } = {}): MenuOptions => ({
  language: 'fr',
  workspace,
  scope: scopeOfWorkspace(workspace, kind),
  tools: ['meshes', 'lights', 'explorer', 'generator', 'inspector', 'assets'],
  checked: [],
  navigationPreset: 'studio',
  abilities: [],
  isMac: true,
  isDevelopment: true,
  openProject: '/projects/One',
  recentProjects: [],
  recentDocuments: [],
  overrides: {},
  actions: actions(),
  ...given,
})

function submenuOf(
  items: MenuItemConstructorOptions[],
  label: string,
): MenuItemConstructorOptions[] {
  const found = items.find(item => item.label === label)?.submenu
  return Array.isArray(found) ? found : []
}

/** The three arguments Electron hands a click are of no interest to any handler here. */
function activate(item: MenuItemConstructorOptions | undefined): void {
  item?.click?.(...([] as unknown as Parameters<NonNullable<MenuItemConstructorOptions['click']>>))
}

const labels = (template: MenuItemConstructorOptions[]): string[] =>
  template.map(item => (typeof item.label === 'string' ? item.label : ''))

function rolesUnder(template: MenuItemConstructorOptions[], label: string): (string | undefined)[] {
  const menu = template.find(item => item.label === label)
  return Array.isArray(menu?.submenu) ? menu.submenu.map(entry => entry.role) : []
}

describe('menuTemplate', () => {
  it('names the application menu after the product, not the binary', () => {
    expect(labels(menuTemplate(options()))[0]).toBe('AI Desktop Studio')
  })

  it('leaves About to the application menu on macOS, where it belongs', () => {
    const entries = submenuOf(menuTemplate(options()), 'Aide')
    expect(entries.map(entry => entry.role)).not.toContain('about')
  })

  it('adds a Help menu elsewhere, the only place About can be reached', () => {
    expect(labels(menuTemplate(options({ isMac: false })))).toContain('Aide')
  })

  it('drops the developer items once packaged', () => {
    const roles = rolesUnder(menuTemplate(options({ isDevelopment: false })), 'Affichage')
    expect(roles).not.toContain('toggleDevTools')
    expect(roles).not.toContain('reload')
  })

  it('keeps them in development, where they are the only way in', () => {
    expect(rolesUnder(menuTemplate(options()), 'Affichage')).toContain('toggleDevTools')
  })

  it('interpolates the product name rather than spelling it out per language', () => {
    const appMenu = menuTemplate(options())[0]
    const about = Array.isArray(appMenu?.submenu) ? appMenu.submenu[0] : undefined
    expect(about?.label).toBe('À propos d’AI Desktop Studio')
    expect(about?.label).not.toContain('{{name}}')
  })

  // The case above pins one sentence; a hole left standing anywhere else reaches the menu bar
  // spelled `{{name}}`, and only reading every label says nobody forgot to fill one.
  it('leaves no hole standing in a label, in either language or any workspace', () => {
    const labelsUnder = (items: MenuItemConstructorOptions[]): string[] =>
      items.flatMap(item => [
        typeof item.label === 'string' ? item.label : '',
        ...(Array.isArray(item.submenu) ? labelsUnder(item.submenu) : []),
      ])

    const holed = LANGUAGES.map(({ code }) => code).flatMap(language =>
      WORKSPACE_IDS.flatMap(workspace =>
        labelsUnder(menuTemplate(options({ language, workspace }))).filter(one =>
          one.includes('{{'),
        ),
      ),
    )

    expect(holed).toEqual([])
  })

  it('lets Electron render the About panel rather than hand-rolling a dialog', () => {
    // Windows does have a native panel, fed by `setAboutPanelOptions` — the role suffices.
    const help = menuTemplate(options({ isMac: false })).find(item => item.label === 'Aide')
    const entries = Array.isArray(help?.submenu) ? help.submenu : []
    expect(entries[0]?.role).toBe('about')
  })

  // Every shipped licence asks for its notice to travel with the binary; Help is where an
  // application keeps it, on all three platforms.
  it('offers the welcome under Help, so a developer can reopen it', () => {
    const openWelcome = vi.fn()
    for (const isMac of [true, false]) {
      const entries = submenuOf(
        menuTemplate(options({ isMac, actions: actions({ openWelcome }) })),
        'Aide',
      )
      expect(labels(entries)).toContain('Bienvenue')
      activate(entries.find(entry => entry.label === 'Bienvenue'))
    }
    expect(openWelcome).toHaveBeenCalledTimes(2)
  })

  it('offers the licences under Help, macOS included', () => {
    for (const isMac of [true, false]) {
      expect(labels(submenuOf(menuTemplate(options({ isMac })), 'Aide'))).toContain('Licences')
    }
  })

  // Consumption is read, never edited: it belongs beside About, not among the preferences.
  it('offers the usage window under Help on every platform', () => {
    for (const isMac of [true, false]) {
      expect(labels(submenuOf(menuTemplate(options({ isMac })), 'Aide'))).toContain('Consommation…')
    }
  })

  it('opens the usage window through the main process too', () => {
    const openUsage = vi.fn()
    const entries = submenuOf(menuTemplate(options({ actions: actions({ openUsage }) })), 'Aide')

    activate(entries.find(entry => entry.label === 'Consommation…'))
    expect(openUsage).toHaveBeenCalledOnce()
  })

  it('opens them through the main process, which owns the window', () => {
    const openLicences = vi.fn()
    const entries = submenuOf(menuTemplate(options({ actions: actions({ openLicences }) })), 'Aide')

    activate(entries.find(entry => entry.label === 'Licences'))
    expect(openLicences).toHaveBeenCalledOnce()
  })

  it('lists only the panels the section has', () => {
    const items = submenuOf(submenuOf(menuTemplate(options()), 'Affichage'), 'Modules')
    expect(labels(items)).toContain('Mailles')
    expect(labels(items)).not.toContain('Calques')
  })

  // The renderer is the only side that knows whether a model was chosen, and generating
  // without one is impossible: a menu entry offering it would open an empty panel.
  it('leaves out a panel the renderer did not report', () => {
    const tools = options().tools.filter(id => id !== 'generator')
    const items = submenuOf(submenuOf(menuTemplate(options({ tools })), 'Affichage'), 'Modules')
    expect(labels(items)).not.toContain('Génération')
  })

  it('offers no panel to a window that announced no workspace', () => {
    const view = submenuOf(menuTemplate(options({ workspace: null })), 'Affichage')
    expect(submenuOf(view, 'Modules')).toHaveLength(0)
  })

  it('offers Add only in the 3D workspace', () => {
    expect(labels(menuTemplate(options({ workspace: 'image' })))).not.toContain('Ajouter')
    expect(labels(menuTemplate(options()))).toContain('Ajouter')
  })

  // The settings window and the splash edit no workspace: neither is offered a scene menu.
  it('offers no Add to a window that announced no workspace', () => {
    expect(labels(menuTemplate(options({ workspace: null })))).not.toContain('Ajouter')
  })

  it('covers every primitive and every light', () => {
    const add = submenuOf(menuTemplate(options()), 'Ajouter')

    expect(submenuOf(add, 'Maille')).toHaveLength(MESH_ENTRIES.length)
    expect(submenuOf(add, 'Lumière')).toHaveLength(LIGHT_ENTRIES.length)
  })

  it('offers every object, each of them reachable', () => {
    const objects = submenuOf(submenuOf(menuTemplate(options()), 'Ajouter'), 'Objet')

    expect(objects.map(item => item.label)).toEqual([
      'Sprite',
      'Texte',
      'Caméra',
      'Chemin',
      'Joueur',
    ])
    expect(objects.filter(item => item.enabled === false)).toEqual([])
  })

  // Every mesh the table declares is buildable: what is not lives under Object.
  it('greys out no mesh at all', () => {
    const meshes = submenuOf(submenuOf(menuTemplate(options()), 'Ajouter'), 'Maille')

    expect(meshes.filter(item => item.enabled === false)).toEqual([])
  })

  it('asks for the node by kind, so the payload cannot drift from the entry', () => {
    const addNode = vi.fn()
    const template = menuTemplate(options({ actions: actions({ addNode }) }))

    activate(submenuOf(submenuOf(template, 'Ajouter'), 'Maille')[0])

    expect(addNode).toHaveBeenCalledWith({ kind: 'box' })
  })

  it('keeps Add between Edit and View, where every editor puts it', () => {
    const names = labels(menuTemplate(options()))

    expect(names.indexOf('Ajouter')).toBeGreaterThan(names.indexOf('Édition'))
    expect(names.indexOf('Ajouter')).toBeLessThan(names.indexOf('Affichage'))
  })

  it('names every panel it lists — an unnamed entry is a way back nobody finds', () => {
    const tools = submenuOf(submenuOf(menuTemplate(options()), 'Affichage'), 'Modules')

    expect(tools).toHaveLength(options().tools.length)
    for (const item of tools) expect(item.label).toBeTruthy()
  })
})

describe('File ▸ New file', () => {
  const newFileItems = (given: Partial<MenuOptions> = {}) =>
    submenuOf(submenuOf(menuTemplate(options(given)), 'Fichier'), 'Nouveau fichier')

  /**
   * Every kind, from every space. `gui` is the one this row exists for: it was reachable from
   * nowhere at all, the New button reading only the head of its space's kinds.
   */
  it('offers every kind of document, in the order of the rail', () => {
    expect(newFileItems().map(item => item.label)).toEqual([
      'Image',
      'Vidéo',
      'Scène',
      'Interface',
      'Script',
      'Audio',
      'Matière',
      'Ciel',
    ])
  })

  it('asks the window for the kind of the row that was picked', () => {
    const asked: DocumentKind[] = []
    const items = submenuOf(
      submenuOf(
        menuTemplate(
          options({ actions: actions({ newDocument: ({ kind }) => asked.push(kind) }) }),
        ),
        'Fichier',
      ),
      'Nouveau fichier',
    )

    items
      .find(item => item.label === 'Interface')
      ?.click?.(null as never, undefined as never, null as never)

    expect(asked).toEqual(['gui'])
  })

  /**
   * A document is a file in a project folder: with none open the row would fail after the click
   * rather than before it. Greyed and not dropped — a menu that changes length is a menu one has
   * to read again.
   */
  it('greys every kind with no project open, and keeps them all', () => {
    const items = newFileItems({ openProject: null })

    expect(items).toHaveLength(8)
    expect(items.every(item => item.enabled === false)).toBe(true)
  })
})

/**
 * Both refuse in silence over a screen with no document — `routeCommand` answers `noSurface` and
 * nothing on the menu said so, which is what an enabled row promises it will not do.
 */
describe('the two Save rows', () => {
  const saveRows = (given: Partial<MenuOptions> = {}) =>
    submenuOf(menuTemplate(options(given)), 'Fichier').filter(item =>
      ['Enregistrer', 'Enregistrer sous…'].includes(item.label ?? ''),
    )

  it('answer with a document in front', () => {
    const rows = saveRows({ abilities: ['document.save', 'document.saveAs'] })

    expect(rows.map(row => row.enabled)).toEqual([true, true])
  })

  it('are greyed with none', () => {
    expect(saveRows().map(row => row.enabled)).toEqual([false, false])
  })
})

describe('File ▸ Open recent', () => {
  const PROJECTS = [
    { path: '/projects/One', openedAt: '2026-09-01T10:00:00.000Z', createdAt: '2026-08-01' },
    { path: '/projects/Two', openedAt: '2026-09-02T10:00:00.000Z', createdAt: '2026-08-02' },
  ]

  const DOCUMENTS: RecentDocument[] = [
    {
      project: '/projects/One',
      path: 'Scenes/Niveau.gltf',
      kind: 'scene',
      openedAt: '2026-09-02T11:00:00.000Z',
    },
    {
      project: '/projects/Two',
      path: 'Images/Planche.ora',
      kind: 'image',
      openedAt: '2026-09-02T10:00:00.000Z',
    },
  ]

  const recentItems = (given: Partial<MenuOptions> = {}) =>
    submenuOf(submenuOf(menuTemplate(options(given)), 'Fichier'), 'Ouvrir récent')

  it('lists the projects newest first, then the documents last opened first', () => {
    const items = recentItems({ recentProjects: PROJECTS, recentDocuments: DOCUMENTS })

    expect(items.map(item => item.label ?? item.type)).toEqual([
      'Two',
      'One',
      'separator',
      'Niveau',
      'Planche — Two',
    ])
  })

  /** A row that performs a project SWITCH has to say so before it is clicked. */
  it('names the project only where it is not the one in front', () => {
    const items = recentItems({
      openProject: '/projects/Two',
      recentProjects: [],
      recentDocuments: DOCUMENTS,
    })

    expect(items.map(item => item.label)).toEqual(['Niveau — One', 'Planche'])
  })

  it('asks for the project alone on a project row, and for both on a document', () => {
    const asked: unknown[] = []
    const items = submenuOf(
      submenuOf(
        menuTemplate(
          options({
            recentProjects: PROJECTS,
            recentDocuments: DOCUMENTS,
            actions: actions({ openRecent: request => asked.push(request) }),
          }),
        ),
        'Fichier',
      ),
      'Ouvrir récent',
    )

    const fire = (label: string) =>
      items
        .find(item => item.label === label)
        ?.click?.(null as never, undefined as never, null as never)

    fire('Two')
    fire('Planche — Two')

    expect(asked).toEqual([
      { project: '/projects/Two' },
      { project: '/projects/Two', path: 'Images/Planche.ora' },
    ])
  })

  /** An empty submenu is a row that looks broken — a first launch has nothing to list. */
  it('is not there at all with nothing to list', () => {
    const file = submenuOf(menuTemplate(options()), 'Fichier')

    expect(file.find(item => item.label === 'Ouvrir récent')).toBeUndefined()
  })
})

describe('the accelerators the menu advertises', () => {
  const fileItems = (given: Partial<MenuOptions> = {}) =>
    submenuOf(menuTemplate(options(given)), 'Fichier')

  it('reads them off the command registry rather than spelling them out', () => {
    const item = fileItems().find(entry => entry.label === 'Nouveau projet…')

    // ⌥⌘N since 2026-09-02: ⌘N makes a FILE here as it does everywhere else, and ⇧⌘N is the
    // Explorer's New folder.
    expect(item?.accelerator).toBe('Alt+CmdOrCtrl+N')
  })

  it('gives ⌘N to the window that makes a file, as every other application does', () => {
    const item = fileItems().find(entry => entry.label === 'Nouveau…')

    expect(item?.accelerator).toBe('CmdOrCtrl+N')
  })

  // The bug this replaces: the menu wrote its own accelerators, so it kept advertising a key
  // the command no longer answered to — and the remap reached the window but never the menu.
  it('follows a remap', () => {
    const item = fileItems({ overrides: { 'project.new': 'Shift+Meta+KeyN' } }).find(
      entry => entry.label === 'Nouveau projet…',
    )

    expect(item?.accelerator).toBe('Shift+CmdOrCtrl+N')
  })

  it('leaves a command bound to nothing without one, rather than an empty string', () => {
    const view = submenuOf(menuTemplate(options()), 'Affichage')
    const item = view.find(entry => entry.label === 'Réinitialiser la disposition')

    expect(item?.accelerator).toBeUndefined()
  })

  it('fires the command the registry names, not a verb of its own', () => {
    const fired: string[] = []
    const item = submenuOf(
      menuTemplate(
        options({ actions: actions({ runCommand: command => void fired.push(command) }) }),
      ),
      'Fichier',
    ).find(entry => entry.label === 'Nouveau projet…')

    item?.click?.(
      // The three arguments Electron hands a click handler, none of which this one reads.
      ...([{}, undefined, {}] as Parameters<NonNullable<MenuItemConstructorOptions['click']>>),
    )

    expect(fired).toEqual(['project.new'])
  })
})

/**
 * `role: 'reload'` carries ⌘R implicitly, and ⌘R is the rulers of the image workspace. Two items
 * of one submenu claiming a single key is served by whichever AppKit finds first.
 */
describe('accelerators within the View menu', () => {
  it('never lets two items claim the same key', () => {
    const items = submenuOf(menuTemplate(options()), 'Affichage')
    const keys = items.flatMap(item =>
      item.accelerator ? [item.accelerator] : item.role === 'reload' ? ['CmdOrCtrl+R'] : [],
    )

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps the developer reload reachable, one modifier further', () => {
    const items = submenuOf(menuTemplate(options()), 'Affichage')
    expect(items.find(item => item.role === 'reload')?.accelerator).toBe('Shift+CmdOrCtrl+R')
  })
})

/** Fichier ▸ Exporter, which is where every space now puts what it sends out. */
