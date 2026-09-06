import { scopeOfWorkspace } from '@shared/domain/command'
import type { DocumentKind } from '@shared/domain/document'
import { EXPORT_FORMATS } from '@shared/domain/scene'
import { WORKSPACE_IDS, type WorkspaceId } from '@shared/domain/workspace'
import { NO_BREAK_SPACE } from '@shared/i18n/typography'
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

const exportsIn = (menu: ReturnType<typeof menuTemplate>) =>
  submenuOf(submenuOf(menu, 'Fichier'), 'Exporter')

describe('the export menu', () => {
  /**
   * One row rather than several at the top of the File menu. Flat, the two montage spaces put
   * three « Exporter … » in a row beside Save — which is not what an application looks like.
   */
  it('puts everything a space sends out under one row', () => {
    const file = submenuOf(menuTemplate(options({ workspace: 'video' })), 'Fichier')

    expect(file.map(item => item.label)).toContain('Exporter')
    expect(file.map(item => item.label)).not.toContain('Vidéo…')
    expect(
      exportsIn(menuTemplate(options({ workspace: 'video' }))).map(item => item.label),
    ).toEqual([
      'Vidéo…',
      'Montage (OTIO)…',
      'Montage et médias (OTIOZ)…',
      'Liste de montage (EDL)…',
      'Montage (FCPXML)…',
      'Sons par piste (WAV)…',
    ])
  })

  /** Every space that MAKES something sends it out; Code does not, and the row is absent rather
   * than empty. Both halves asserted, so a Code export would be named here. */
  it('shows the row in every space that makes a file of its own, and in no other', () => {
    for (const workspace of WORKSPACE_IDS) {
      const file = submenuOf(menuTemplate(options({ workspace })), 'Fichier').map(one => one.label)

      expect(file.includes('Exporter'), workspace).toBe(workspace !== 'code')
    }
  })

  /**
   * 🛑 The 3D space opens two KINDS, and the row follows the kind rather than the space: a
   * `.ui.json` is already a file of the project, like a script, so there is nothing to export.
   */
  it('drops the row for an interface, which the 3D space opens beside its scenes', () => {
    const file = (kind: DocumentKind) =>
      submenuOf(menuTemplate(options({ workspace: '3d', kind })), 'Fichier').map(one => one.label)

    expect(file('scene')).toContain('Exporter')
    expect(file('gui')).not.toContain('Exporter')
  })

  // A model tab writes its one model out through the scene rows; nothing there is ever selected.
  it('offers the scene formats to a model tab, with the selection row greyed', () => {
    const exports = exportsIn(menuTemplate(options({ workspace: '3d', kind: 'character' })))

    expect(submenuOf(exports, 'Scène')).toHaveLength(EXPORT_FORMATS.length)
    expect(exports.find(item => item.label === 'Sélection')?.enabled).toBe(false)
  })

  it('offers every declared format, for the scene and for the selection', () => {
    const exports = exportsIn(menuTemplate(options()))

    expect(submenuOf(exports, 'Scène').map(item => item.label)).toEqual([
      'glTF binaire (.glb)',
      'glTF (.gltf)',
      'USDZ (.usdz)',
      'Wavefront, formes seules (.obj)',
      'Stanford, formes seules (.ply)',
      'STL, triangles seuls (.stl)',
    ])
    // The same list on both, and derived from the same one: a format offered for the scene and
    // not for the selection would be a row that appears and disappears with a click.
    expect(submenuOf(exports, 'Sélection')).toHaveLength(EXPORT_FORMATS.length)
  })

  it('asks for the format and the scope the row names', () => {
    const exportScene = vi.fn()
    const exports = exportsIn(menuTemplate(options({ actions: actions({ exportScene }) })))
    const usdz = submenuOf(exports, 'Sélection')[2]

    usdz?.click?.(...([] as never[] as [never, never, never]))

    expect(exportScene).toHaveBeenCalledWith({ format: 'usdz', scope: 'selection' })
  })

  it('greys the selection row where the window reports nothing picked', () => {
    const without = exportsIn(menuTemplate(options()))
    const holding = exportsIn(menuTemplate(options({ abilities: ['scene.exportSelection'] })))

    expect(without.find(item => item.label === 'Sélection')?.enabled).toBe(false)
    expect(holding.find(item => item.label === 'Sélection')?.enabled).toBe(true)
    // The scene itself is never greyed by it: an empty scene is still a scene to write out.
    expect(without.find(item => item.label === 'Scène')?.enabled).toBeUndefined()
  })

  it('offers the five targets where a texture is what is being edited', () => {
    const exports = exportsIn(menuTemplate(options({ workspace: 'materials' })))

    expect(submenuOf(exports, 'Matière').map(item => item.label)).toEqual([
      'glTF / GLB (.glb)',
      'Unity (URP)',
      'Unreal Engine',
      'Roblox',
      'Canaux bruts',
    ])
  })

  it('asks for the engine the row names', () => {
    const exportMaterial = vi.fn()
    const exports = exportsIn(
      menuTemplate(options({ workspace: 'materials', actions: actions({ exportMaterial }) })),
    )
    const roblox = submenuOf(exports, 'Matière')[3]

    roblox?.click?.(...([] as never[] as [never, never, never]))

    expect(exportMaterial).toHaveBeenCalledWith({ target: 'roblox' })
  })

  it('shows each workspace only the export that belongs to it', () => {
    const labels = (workspace: WorkspaceId): (string | undefined)[] =>
      exportsIn(menuTemplate(options({ workspace }))).map(item => item.label)

    expect(labels('3d')).toContain('Scène')
    expect(labels('3d')).not.toContain('Matière')
    expect(labels('materials')).toContain('Matière')
    expect(labels('materials')).not.toContain('Scène')
    expect(labels('skyboxes')).toContain('Ciel')
    expect(labels('skyboxes')).not.toContain('Matière')
    // Two rows rather than a submenu of formats, as the montage has: what an image writes is
    // composed by the window, and the flatten already answers a binding of its own.
    expect(labels('image')).toEqual(['Image aplatie (PNG)…', 'Image à calques (PSD)…'])
  })
})

describe('exporting a sky', () => {
  it('offers one row per face size, then the panoramas, and nothing else', () => {
    const exports = exportsIn(menuTemplate(options({ workspace: 'skyboxes' })))

    // Written through the constant, which is why it exists: the no-break space binding a size to
    // its `×` is invisible here, and a literal one would have been read as an ordinary space.
    const size = (side: number): string => `${side}${NO_BREAK_SPACE}×${NO_BREAK_SPACE}${side}`

    // The separator carries no label: what a row says is the assertion, and a separator says
    // nothing on purpose.
    expect(submenuOf(exports, 'Ciel').map(item => item.label)).toEqual([
      size(512),
      size(1024),
      size(2048),
      undefined,
      'Panorama Radiance (.hdr)',
      'Panorama OpenEXR (.exr)',
    ])
  })

  /** A panorama leaves at the source's own resolution: a size chosen for it would be a lie. */
  it('asks for a panorama by its target rather than by a size', () => {
    const exportSkybox = vi.fn()
    const exports = exportsIn(
      menuTemplate(options({ workspace: 'skyboxes', actions: actions({ exportSkybox }) })),
    )

    submenuOf(exports, 'Ciel')
      .find(item => item.label === 'Panorama OpenEXR (.exr)')
      ?.click?.(...([] as never[] as [never, never, never]))

    expect(exportSkybox).toHaveBeenCalledWith({ kind: 'panorama', target: 'sky.exr' })
  })

  it('asks for the size the row names', () => {
    const exportSkybox = vi.fn()
    const exports = exportsIn(
      menuTemplate(options({ workspace: 'skyboxes', actions: actions({ exportSkybox }) })),
    )
    const largest = submenuOf(exports, 'Ciel')[2]

    largest?.click?.(...([] as never[] as [never, never, never]))

    expect(exportSkybox).toHaveBeenCalledWith({ kind: 'faces', size: 2048 })
  })
})

/**
 * A role draws its own label, and Electron writes those labels as English literals in
 * `roleList` — "Cut", "Select All", `Hide ${app.name}`. No locale is consulted: an unlabelled
 * role reads English on every platform, whatever the system or the studio is set to.
 *
 * Walked rather than listed: a sixteenth role added without a label would pass a list.
 */
