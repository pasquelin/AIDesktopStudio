import { COMMAND_REGISTRY, scopeOfWorkspace } from '@shared/domain/command'
import type { DocumentKind } from '@shared/domain/document'
import { DISPLAY_MODES, VIEW_DIRECTIONS } from '@shared/domain/scene'
import { CAPTURE_QUALITIES } from '@shared/domain/sceneCapture'
import { type WorkspaceId } from '@shared/domain/workspace'
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

describe('the Image menu', () => {
  /**
   * Turning a picture has no conventional shortcut, so the menu is the only way in. A command in
   * the registry that nothing surfaces is a command that cannot be run — the defect the image
   * toolbar has already shown twice.
   */
  it('offers the whole-document operations where a picture is being edited', () => {
    const entries = labels(submenuOf(menuTemplate(options({ workspace: 'image' })), 'Image'))

    expect(entries).toEqual([
      'Fusionner vers le bas',
      'Aplatir l’image',
      '',
      'Miroir horizontal',
      'Miroir vertical',
      '',
      'Rotation horaire',
      'Rotation antihoraire',
      '',
      'Faire un masque de la sélection',
      '',
      'Régénérer la zone',
      'Étendre',
      'Détourer',
      'Agrandir',
      'Vectoriser',
    ])
  })

  /**
   * The five edits had no default shortcut and no menu row: `COMMAND_REGISTRY` declared them,
   * `ImageDocument` ran them, and nothing anywhere could reach them. The menu is the only door,
   * and it stays keyless on purpose — each one spends credit.
   */
  it('offers the edits without binding a key to any of them', () => {
    const entries = submenuOf(menuTemplate(options({ workspace: 'image' })), 'Image')
    const edits = ['Régénérer la zone', 'Étendre', 'Détourer', 'Agrandir', 'Vectoriser']

    const rows = entries.filter(entry => edits.includes(String(entry.label)))
    expect(rows).toHaveLength(edits.length)
    expect(rows.map(row => row.accelerator)).toEqual(edits.map(() => undefined))
  })

  it('fires the edit the row names', () => {
    const runCommand = vi.fn()
    const entries = submenuOf(
      menuTemplate(options({ workspace: 'image', actions: actions({ runCommand }) })),
      'Image',
    )

    activate(entries.find(entry => entry.label === 'Détourer'))

    expect(runCommand).toHaveBeenCalledWith('canvas.cutout')
  })

  it('leaves it out of every other workspace, where it would turn nothing', () => {
    expect(labels(menuTemplate(options({ workspace: '3d' })))).not.toContain('Image')
    expect(labels(menuTemplate(options({ workspace: null })))).not.toContain('Image')
  })

  it('fires the command the row names', () => {
    const runCommand = vi.fn()
    const entries = submenuOf(
      menuTemplate(options({ workspace: 'image', actions: actions({ runCommand }) })),
      'Image',
    )

    activate(entries.find(entry => entry.label === 'Rotation horaire'))

    expect(runCommand).toHaveBeenCalledWith('canvas.rotateCw')
  })
})

/**
 * The rows that took the place of fifteen toolbar buttons. Seven of the nine were reachable by
 * pointer through that bar alone, which is what made shrinking it to eight impossible until now.
 */
describe('the 3D View rows', () => {
  const viewOf = (given: Partial<MenuOptions> = {}): MenuItemConstructorOptions[] =>
    submenuOf(menuTemplate(options(given)), 'Affichage')

  it('are offered in the 3D workspace alone', () => {
    expect(labels(viewOf())).toContain('Mode de rendu')
    expect(labels(viewOf({ workspace: 'image' }))).not.toContain('Mode de rendu')
    expect(labels(viewOf({ workspace: null }))).not.toContain('Mode de rendu')
  })

  it('offers one row per side, and per way of drawing', () => {
    // The six, a separator, and the camera the seventh looks through.
    expect(submenuOf(viewOf(), 'Point de vue')).toHaveLength(VIEW_DIRECTIONS.length + 2)
    expect(submenuOf(viewOf(), 'Mode de rendu')).toHaveLength(DISPLAY_MODES.length)
  })

  /** A command rather than an action of its own: the keypad reaches these too, under Blender. */
  it('fires the command of the side the row names', () => {
    const runCommand = vi.fn()
    const rows = submenuOf(
      submenuOf(menuTemplate(options({ actions: actions({ runCommand }) })), 'Affichage'),
      'Point de vue',
    )

    activate(rows.find(row => row.label === 'De dessus'))
    expect(runCommand).toHaveBeenCalledWith('scene.viewTop')
  })

  it('asks the scene to draw the way the row names', () => {
    const setDisplay = vi.fn()
    const rows = submenuOf(
      submenuOf(menuTemplate(options({ actions: actions({ setDisplay }) })), 'Affichage'),
      'Mode de rendu',
    )

    activate(rows.find(row => row.label === 'Filaire'))
    expect(setDisplay).toHaveBeenCalledWith({ mode: 'wireframe' })
  })

  it('offers one capture row per definition, in the 3D workspace alone', () => {
    expect(submenuOf(viewOf(), 'Capturer la vue')).toHaveLength(CAPTURE_QUALITIES.length)
    expect(labels(viewOf({ workspace: 'video' }))).not.toContain('Capturer la vue')
  })

  it('captures at the definition the row names', () => {
    const captureScene = vi.fn()
    const rows = submenuOf(
      submenuOf(menuTemplate(options({ actions: actions({ captureScene }) })), 'Affichage'),
      'Capturer la vue',
    )

    activate(rows.find(row => row.label === '4K'))
    expect(captureScene).toHaveBeenCalledWith({ quality: 'ultraHd' })
  })

  // The row at the view's own size IS the command, which is what makes the capture remappable —
  // and what stops `can be reached` from calling a keyless command unreachable.
  it('fires the command itself for the row that takes the view as it is', () => {
    const runCommand = vi.fn()
    const rows = submenuOf(
      submenuOf(menuTemplate(options({ actions: actions({ runCommand }) })), 'Affichage'),
      'Capturer la vue',
    )

    activate(rows.find(row => row.label === 'Taille de la vue'))
    expect(runCommand).toHaveBeenCalledWith('scene.capture')
  })

  /**
   * A toggle that reads the same on and off is half a control, and the reason the six of them
   * could not simply be moved: the state belongs to the document, which the main process has no
   * access to. It arrives through `checked`.
   */
  it('ticks exactly the rows the window reported', () => {
    const rows = viewOf({ checked: ['scene.quad', 'scene.skeletons'] })
    const ticked = rows.filter(row => row.checked === true).map(row => row.label)

    expect(ticked).toEqual(['Quatre vues', 'Afficher les squelettes'])
  })

  it('draws its toggles as checkboxes rather than as plain rows', () => {
    const rows = viewOf().filter(row => row.label === 'Mode pose')
    expect(rows[0]?.type).toBe('checkbox')
  })

  /** Exactly one way of drawing is true at a time, which a row of checkboxes would not say. */
  it('draws the ways of drawing as alternatives, and ticks the one in force', () => {
    const rows = submenuOf(viewOf({ checked: ['scene.display:matcap'] }), 'Mode de rendu')

    expect(rows.every(row => row.type === 'radio')).toBe(true)
    expect(rows.filter(row => row.checked === true).map(row => row.label)).toEqual(['Matcap'])
  })

  /** The tick follows the value, not the row: nothing is on in a scene nobody has touched. */
  it('ticks nothing at all when the window reported nothing', () => {
    expect(viewOf().filter(row => row.checked === true)).toEqual([])
  })
})

describe('every command the studio declares', () => {
  /**
   * A command with no default key and no menu row cannot be run at all. Four of them were in
   * that state — the guides, the snapping and the mask from a selection — implemented, tested,
   * and unreachable. The registry is where a command is declared; this is where it earns a way in.
   *
   * Read off the `id` each row carries rather than off its LABEL: a row is worded for where it
   * sits — « Vidéo… » under Export says Export once — and matching on the title made three
   * commands read as unreachable the day the menu gained a submenu.
   */
  it('can be reached, by a key or by a row', () => {
    const fired = new Set<string>()
    const collect = (items: readonly MenuItemConstructorOptions[]): void => {
      for (const item of items) {
        if (item.id) fired.add(String(item.id))
        if (Array.isArray(item.submenu)) collect(item.submenu)
      }
    }

    // Every workspace posts its own rows, so the union is what the studio actually offers.
    const spaces: WorkspaceId[] = ['image', '3d', 'video', 'audio', 'materials', 'skyboxes']
    for (const workspace of spaces) collect(menuTemplate(options({ workspace })))

    const stranded = COMMAND_REGISTRY.filter(
      descriptor => !descriptor.defaultBinding && !fired.has(descriptor.id),
    )

    expect(stranded.map(descriptor => descriptor.id)).toEqual([])
  })
})

describe('the Edit menu', () => {
  /**
   * `role: 'editMenu'` registers ⌘Z with the system: AppKit served the key to the menu and the
   * window never saw it, so `canvas.undo`, `scene.undo` and `sequence.undo` were unreachable by
   * keyboard in all three spaces — an application that appeared to have no undo at all.
   */
  it('binds undo to the surface the workspace edits', () => {
    const cases: [WorkspaceId, string][] = [
      ['image', 'canvas.undo'],
      ['3d', 'scene.undo'],
      ['video', 'sequence.undo'],
      ['skyboxes', 'skybox.undo'],
      // The take editor joined them when its bar was asked to stop drawing the only undo it
      // had: the row below is now the whole of how that history is reached by pointer.
      ['audio', 'audio.undo'],
    ]

    for (const [workspace, expected] of cases) {
      const runCommand = vi.fn()
      const entries = submenuOf(
        menuTemplate(options({ workspace, actions: actions({ runCommand }) })),
        'Édition',
      )

      activate(entries.find(entry => entry.label === 'Annuler'))
      expect(runCommand).toHaveBeenCalledWith(expected)
    }
  })

  /**
   * The three gestures that left the 3D bar. Not the clipboard trio beside them: those keep the
   * native roles so a text field goes on copying, and a command row would act on the scene with
   * the caret in a field — the menu path carries no `isTyping` guard.
   */
  describe('the rows a scene adds', () => {
    const editOf = (workspace: WorkspaceId | null): (string | undefined)[] =>
      submenuOf(menuTemplate(options({ workspace })), 'Édition').map(item => item.label)

    it('offers duplicate, group and delete in the 3D workspace alone', () => {
      expect(editOf('3d')).toEqual(expect.arrayContaining(['Dupliquer', 'Grouper', 'Supprimer']))
      expect(editOf('image')).not.toContain('Grouper')
      expect(editOf(null)).not.toContain('Grouper')
    })

    it('leaves the clipboard to the platform, so a field goes on copying', () => {
      const rows = submenuOf(menuTemplate(options({ workspace: '3d' })), 'Édition')
      const clipboard = rows.filter(row => ['cut', 'copy', 'paste'].includes(row.role ?? ''))

      expect(clipboard).toHaveLength(3)
      expect(clipboard.every(row => row.click === undefined)).toBe(true)
    })

    it('fires the command the row names', () => {
      const runCommand = vi.fn()
      const rows = submenuOf(
        menuTemplate(options({ workspace: '3d', actions: actions({ runCommand }) })),
        'Édition',
      )

      activate(rows.find(row => row.label === 'Grouper'))
      expect(runCommand).toHaveBeenCalledWith('scene.group')
    })

    it('opens whole-world performance from the scene menu', () => {
      const runCommand = vi.fn()
      const rows = submenuOf(
        menuTemplate(options({ workspace: '3d', actions: actions({ runCommand }) })),
        'Édition',
      )

      activate(rows.find(row => row.label === 'Performances du monde…'))
      expect(runCommand).toHaveBeenCalledWith('scene.worldPerformance')
    })
  })

  // The skeleton window: no space, no document, a history all the same.
  it('binds undo to a history the window reports without any space', () => {
    const entries = submenuOf(
      menuTemplate(options({ workspace: null, scope: 'character' })),
      'Édition',
    )

    expect(entries[0]?.id).toBe('character.undo')
    expect(entries[1]?.id).toBe('character.redo')
  })

  /**
   * What the menu does when the focused window names no surface at all — the settings window,
   * the splash: the platform keeps the key rather than a command answering for a history the
   * menu cannot name.
   *
   * `null` and not a workspace, deliberately: every one of the seven now maps to a scope, the
   * last two having been wired the day the toolbars stopped drawing their own undo. A test
   * pinned on a workspace would go stale the moment that stopped being true — which is exactly
   * what happened to this one when it named Textures.
   */
  it('leaves undo to the platform where the window edits nothing', () => {
    const entries = submenuOf(menuTemplate(options({ workspace: null })), 'Édition')

    expect(entries[0]?.role).toBe('undo')
  })

  /**
   * Reserving ⌘Z would take it from a field being typed into: the menu would hear it first and
   * undo a brush stroke instead of the word just mistyped. Unreserved, the window sees the key
   * and `useShortcuts` steps aside whenever the caret sits in a text field.
   */
  it('shows the undo key without reserving it either', () => {
    const entries = submenuOf(menuTemplate(options({ workspace: 'image' })), 'Édition')
    const history = entries.filter(entry => ['Annuler', 'Rétablir'].includes(String(entry.label)))

    expect(history).toHaveLength(2)
    expect(history.map(entry => entry.registerAccelerator)).toEqual([false, false])
    expect(history[0]?.accelerator).toBeTruthy()
  })

  /**
   * The clipboard rows keep their native roles — a text field has to go on copying — but must
   * not reserve the key: `scene.copy` is bound to ⌘C too, and `useShortcuts` is what decides
   * between the two by looking at whether text is highlighted.
   */
  it('shows the clipboard keys without reserving them', () => {
    const entries = submenuOf(menuTemplate(options({ workspace: 'image' })), 'Édition')
    const clipboard = entries.filter(entry => ['cut', 'copy', 'paste'].includes(String(entry.role)))

    expect(clipboard).toHaveLength(3)
    expect(clipboard.map(entry => entry.registerAccelerator)).toEqual([false, false, false])
  })
})
