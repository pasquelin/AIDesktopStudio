import { APP_NAME } from '@shared/constants'
import { scopeOfWorkspace } from '@shared/domain/command'
import type { DocumentKind } from '@shared/domain/document'
import type { NavigationPreset } from '@shared/domain/navigationPreset'
import { WORKSPACE_IDS } from '@shared/domain/workspace'
import { LANGUAGES, TRANSLATIONS } from '@shared/i18n'
import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { menuTemplate, type MenuActions, type MenuOptions } from './template'

const actions = (overrides: Partial<MenuActions> = {}): MenuActions => ({
  setNavigationPreset: () => {},
  openSettings: () => {},
  openLicences: () => {},
  openManual: () => {},
  openUsage: () => {},
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

describe('every native role', () => {
  const rolesWithout = (
    items: MenuItemConstructorOptions[],
    sound: (item: MenuItemConstructorOptions) => boolean,
  ): string[] =>
    items.flatMap(item => [
      ...(item.role && !sound(item) ? [item.role] : []),
      ...(Array.isArray(item.submenu) ? rolesWithout(item.submenu, sound) : []),
    ])

  /**
   * Four shapes, because three branches only exist in some of them: `nativeHistory` is reached
   * only by a window that edits no workspace — Settings, the splash — and `close` becomes `quit`
   * off macOS. A single shape walked a menu that had neither, and passed while both shipped bare.
   */
  const SHAPES: Partial<MenuOptions>[] = [
    { workspace: '3d', isMac: true },
    { workspace: null, isMac: true },
    { workspace: '3d', isMac: false },
    { workspace: null, isMac: false },
  ]

  it('carries a label of ours, in every language and every shape of the menu', () => {
    for (const { code } of LANGUAGES) {
      for (const shape of SHAPES) {
        const template = menuTemplate(options({ ...shape, language: code }))

        expect(
          rolesWithout(template, item => typeof item.label === 'string'),
          `${code}, workspace ${shape.workspace}, mac ${shape.isMac}`,
        ).toEqual([])
      }
    }
  })

  /**
   * The walk above cannot reach the rows of a submenu the template never wrote: these six roles
   * compose one themselves, out of the same English literals, when none is given. Only
   * `windowMenu` is reached for today — the other five are held for the day one is.
   *
   * Typed rather than left as strings: a misspelt role would match nothing and pass silently.
   */
  const CONTAINER_ROLES: NonNullable<MenuItemConstructorOptions['role']>[] = [
    'appMenu',
    'fileMenu',
    'editMenu',
    'viewMenu',
    'windowMenu',
    'shareMenu',
  ]

  it('leaves no submenu for Electron to compose', () => {
    for (const shape of SHAPES) {
      expect(
        rolesWithout(
          menuTemplate(options(shape)),
          item => !item.role || !CONTAINER_ROLES.includes(item.role) || item.submenu !== undefined,
        ),
        `workspace ${shape.workspace}, mac ${shape.isMac}`,
      ).toEqual([])
    }
  })

  // The rows Electron would have composed, in our words: same roles, same order, same separator.
  it('names the window rows itself, on both platforms', () => {
    const rows = (
      isMac: boolean,
      workspace: MenuOptions['workspace'] = '3d',
    ): MenuItemConstructorOptions[] =>
      submenuOf(menuTemplate(options({ isMac, workspace })), TRANSLATIONS.fr.menu.window)
    const shapeOf = (items: MenuItemConstructorOptions[]): (string | undefined)[] =>
      items.map(item => item.role ?? item.type)

    expect(shapeOf(rows(true))).toEqual(['minimize', 'zoom', 'separator', 'front'])
    expect(labels(rows(true))).toEqual(['Réduire', 'Zoom', '', 'Tout ramener au premier plan'])
    expect(shapeOf(rows(false))).toEqual(['minimize', 'zoom'])
    expect(labels(rows(false))).toEqual(['Réduire', 'Zoom'])
    expect(shapeOf(rows(false, null))).toEqual(['minimize', 'zoom', 'close'])
    expect(labels(rows(false, null))).toEqual(['Réduire', 'Zoom', 'Fermer la fenêtre'])
  })

  const file = (given: Partial<MenuOptions>) =>
    submenuOf(menuTemplate(options(given)), TRANSLATIONS.fr.menu.file)
  const last = (given: Partial<MenuOptions>) => file(given).at(-1)

  it('closes a tab from the studio File menu, and the window from an auxiliary one', () => {
    const runCommand = vi.fn()

    const studioMac = last({ isMac: true, actions: actions({ runCommand }) })
    expect(studioMac?.label).toBe('Fermer l’onglet')
    expect(studioMac?.accelerator).toBe('CmdOrCtrl+W')
    activate(studioMac)
    expect(runCommand).toHaveBeenCalledWith('document.close')

    expect(last({ workspace: null, isMac: true })?.role).toBe('close')
    expect(last({ isMac: false })?.role).toBe('quit')
    expect(file({ isMac: false }).at(-2)?.label).toBe('Fermer l’onglet')
  })

  // An enabled row promises it will do something, and this one had nothing left to close.
  it('greys closing the tab when the window announces none in front', () => {
    expect(last({ abilities: ['document.close'] })?.enabled).toBe(true)
    expect(last({ abilities: [] })?.enabled).toBe(false)
  })

  // A label read off the wrong bundle is worse than none: it would look deliberate.
  it('reads its label from the language it was asked for', () => {
    const french = menuTemplate(options({ language: 'fr' }))
    const english = menuTemplate(options({ language: 'en' }))
    const cutIn = (template: MenuItemConstructorOptions[]): string | undefined =>
      submenuOf(template, TRANSLATIONS.fr.menu.edit)
        .concat(submenuOf(template, TRANSLATIONS.en.menu.edit))
        .find(item => item.role === 'cut')?.label

    expect(cutIn(french)).toBe('Couper')
    expect(cutIn(english)).toBe('Cut')
  })

  // The product name is pinned in one place; a bundle spelling it out would drift past it.
  it('names the product in the entries that mention it', () => {
    const app = submenuOf(menuTemplate(options()), APP_NAME)

    expect(app.find(item => item.role === 'quit')?.label).toBe(`Quitter ${APP_NAME}`)
    expect(app.find(item => item.role === 'hide')?.label).toBe(`Masquer ${APP_NAME}`)
  })
})

/**
 * The home covers a workspace rather than replacing it, so the renderer used to publish the
 * space behind it: the studio offered the twenty-two image tools and the whole Image menu over
 * a screen that edits no picture, and every one of them fired into nothing.
 *
 * Named as a surface for that reason — `home` is not a workspace, so each section that belongs
 * to a document drops on its own, with no list of exceptions to keep in step.
 */
describe('the home', () => {
  const home = (): MenuItemConstructorOptions[] => menuTemplate(options({ workspace: 'home' }))

  it('offers neither the image tools nor the Image menu', () => {
    expect(labels(home())).not.toContain('Outils')
    expect(labels(home())).not.toContain('Image')
  })

  it('offers no section that only a document can answer', () => {
    const sections = labels(home())

    expect(sections).not.toContain('Graphe')
    expect(sections).not.toContain('Ajouter')
    expect(submenuOf(home(), 'Fichier').map(entry => entry.label)).not.toContain(
      'Exporter la scène',
    )
  })

  /**
   * Undo belongs to the surface being edited, and the home edits none. The rows keep their
   * NATIVE roles there — the platform's own undo is the only one there is — where a workspace
   * turns them into command rows that hand ⌘Z to the document in front.
   */
  it('leaves undo to the platform', () => {
    const rows = submenuOf(home(), 'Édition').filter(entry =>
      ['Annuler', 'Rétablir'].includes(String(entry.label)),
    )

    expect(rows.map(entry => entry.role)).toEqual(['undo', 'redo'])
    expect(rows.map(entry => entry.click)).toEqual([undefined, undefined])
  })

  /**
   * The gain, and the reason the surface is published rather than `null`: the home carries
   * panels of its own, and a window announcing no surface at all is offered none.
   */
  it('still offers the panels the home itself carries', () => {
    const reported = menuTemplate(options({ workspace: 'home', tools: ['projects', 'meshes'] }))
    const panels = submenuOf(submenuOf(reported, 'Affichage'), 'Modules')

    expect(labels(panels)).toEqual(['Vos projets'])
  })
})

/**
 * The keys a caret has a use for — bare letters, `[`, `Delete`, anything Shift or Alt reaches. On
 * macOS a declared accelerator is reserved with the system whatever `registerAccelerator` says,
 * and typing a layer name armed a tool, letter by letter.
 *
 * A `global` command is the exception, and the case below says why: no window listens for that
 * scope, so the menu is its only door and its key stays declared.
 */
describe('the keys the menu leaves to a field', () => {
  const rowsOf = (items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
    items.flatMap(item => [item, ...(Array.isArray(item.submenu) ? rowsOf(item.submenu) : [])])

  const everyRow = (given: Partial<MenuOptions> = {}): MenuItemConstructorOptions[] =>
    [...WORKSPACE_IDS, null].flatMap(workspace =>
      rowsOf(menuTemplate(options({ ...given, workspace }))),
    )

  const typedRows = (rows: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
    rows.filter(row => row.accelerator !== undefined && !/Cmd|Ctrl/.test(String(row.accelerator)))

  const macRows = everyRow()

  it('declares none of them on macOS, where the system would take the key', () => {
    const declared = typedRows(macRows).map(
      row => `${String(row.label)} — ${String(row.accelerator)}`,
    )

    expect(declared).toEqual([])
  })

  it('shows them elsewhere without reserving them', () => {
    const shown = typedRows(everyRow({ isMac: false }))

    expect(shown.length).toBeGreaterThan(0)
    expect(shown.filter(row => row.registerAccelerator !== false)).toEqual([])
  })

  /** A remap is what the registry never saw coming — and Alt writes a character on a Mac. */
  it('answers to the binding in force, not to the default', () => {
    const overrides = { 'scene.duplicate': 'Alt+KeyK' }
    // Off macOS the row still SHOWS the remapped key, which is what proves it reached it.
    const shown = typedRows(everyRow({ overrides, isMac: false })).map(row => row.accelerator)

    expect(shown).toContain('Alt+K')
    expect(typedRows(everyRow({ overrides }))).toEqual([])
  })

  /**
   * The one scope no window hears — `commandFor` excludes it. Dropping the key would leave the
   * row as the only way in and no key at all, where the studio would rather keep both.
   */
  it('leaves a global command its key, the menu being its only door', () => {
    const remapped = everyRow({ overrides: { 'document.save': 'KeyS' } })

    expect(typedRows(remapped).map(row => row.accelerator)).toContain('S')
  })

  it('keeps the chords a field would never write', () => {
    expect(macRows.find(row => row.id === 'scene.group')?.accelerator).toBe('CmdOrCtrl+G')
  })
})

/**
 * The 3D space opens a scene AND the interfaces shown over it. What the Edit menu offers has to
 * follow the tab in front: Group, Carve or Weld over an interface act on a scene nobody is
 * looking at, and Undo has to pop the history the tab actually holds.
 */
describe('the edit menu of a space that opens two kinds', () => {
  const editRows = (kind: DocumentKind): string =>
    labels(submenuOf(menuTemplate(options({ workspace: '3d', kind })), 'Édition')).join(' ')

  it('offers what acts on a scene over a scene, and none of it over an interface', () => {
    expect(editRows('scene')).toContain('Grouper')
    expect(editRows('gui')).not.toContain('Grouper')
  })

  /** Both keep an Undo — what changes is WHOSE history it pops, which the scope decides. */
  it('keeps an undo over either kind', () => {
    expect(editRows('scene')).toContain('Annuler')
    expect(editRows('gui')).toContain('Annuler')
  })
})

describe('the navigation schemes', () => {
  const rows = (preset: NavigationPreset) =>
    submenuOf(
      submenuOf(menuTemplate(options({ scope: 'scene', navigationPreset: preset })), 'Affichage'),
      'Navigation',
    )

  it('offers the four applications, the studio and one of one’s own, exactly one ticked', () => {
    const shown = rows('blender')

    expect(shown.map(row => row.label)).toEqual([
      'IA Studio',
      'Unreal Engine',
      'Unity',
      'Blender',
      'Roblox Studio',
      'Personnalisé',
    ])
    // `radio` and not a row of checkboxes: one is true at a time, and AppKit draws the mark.
    expect(shown.every(row => row.type === 'radio')).toBe(true)
    expect(shown.filter(row => row.checked).map(row => row.label)).toEqual(['Blender'])
  })

  it('writes the one that was picked, and nothing else', () => {
    const picked: string[] = []
    const template = menuTemplate(
      options({
        scope: 'scene',
        actions: actions({ setNavigationPreset: preset => picked.push(preset) }),
      }),
    )

    activate(submenuOf(submenuOf(template, 'Affichage'), 'Navigation')[3])

    expect(picked).toEqual(['blender'])
  })

  /** A menu of the image space has no 3D view to drive, so it must not offer one. */
  it('says nothing of navigation outside a scene', () => {
    const shown = submenuOf(menuTemplate(options({ workspace: 'image' })), 'Affichage')
    expect(shown.map(row => row.label)).not.toContain('Navigation')
  })
})

describe('the View menu of a model tab', () => {
  const rows = (checked: MenuOptions['checked'] = []) =>
    submenuOf(menuTemplate(options({ kind: 'character', checked })), 'Affichage')

  // The model tab moves its view and nothing else: a row that answered `false` would sit active
  // and do nothing, which is what the menu context promises it never does.
  it('offers navigation, the way of drawing, the capture and the skeletons — and no scene row', () => {
    const labels = rows().map(row => row.label)

    expect(labels).toEqual(expect.arrayContaining(['Navigation', 'Mode de rendu', 'Capturer la vue', 'Afficher les squelettes']))
    expect(labels).not.toContain('Projection')
    expect(labels).not.toContain('Quatre vues')
    expect(labels).not.toContain('Point de vue')
    expect(labels).not.toContain('Mode pose')
  })

  it('ticks the skeletons off what the window reports', () => {
    expect(rows(['scene.skeletons']).find(row => row.label === 'Afficher les squelettes')?.checked).toBe(true)
    expect(rows().find(row => row.label === 'Afficher les squelettes')?.checked).toBe(false)
  })
})
