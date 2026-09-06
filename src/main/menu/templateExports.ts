import type { MenuItemConstructorOptions } from 'electron'
import { EXPORT_FORMATS } from '@shared/domain/scene'
import { MATERIAL_EXPORT_TARGETS } from '@shared/domain/materialExport'
import { FACE_SIZES, SKY_PANORAMAS } from '@shared/domain/skybox'
import { fillHoles } from '@shared/i18n'
import type { MenuContext } from './templateContext'

function sceneExportItems(
  context: MenuContext,
  scope: 'scene' | 'selection',
): MenuItemConstructorOptions[] {
  return EXPORT_FORMATS.map(format => ({
    label: context.t.exportFormats[format],
    click: () => context.options.actions.exportScene({ format, scope }),
  }))
}

function materialExportItems(context: MenuContext): MenuItemConstructorOptions[] {
  return MATERIAL_EXPORT_TARGETS.map(target => ({
    label: context.t.materialExportTargets[target],
    click: () => context.options.actions.exportMaterial({ target }),
  }))
}

function skyboxExportItems(context: MenuContext): MenuItemConstructorOptions[] {
  return [
    ...FACE_SIZES.map(size => ({
      label: fillHoles(context.t.skyboxFaceSize, { size }, context.options.language),
      click: () => context.options.actions.exportSkybox({ kind: 'faces', size }),
    })),
    { type: 'separator' },
    ...SKY_PANORAMAS.map(target => ({
      label: context.t.skyboxPanoramas[target],
      click: () => context.options.actions.exportSkybox({ kind: 'panorama', target }),
    })),
  ]
}

function sequenceExportItems(
  context: MenuContext,
  includeVideo: boolean,
): MenuItemConstructorOptions[] {
  const { commandItem, t } = context
  return [
    ...(includeVideo ? [commandItem('sequence.export', t.menu.exportVideo)] : []),
    commandItem('sequence.exportCut', t.menu.exportCut),
    commandItem('sequence.exportBundle', t.menu.exportBundle),
    ...(includeVideo
      ? [
          commandItem('sequence.exportEdl', t.menu.exportEdl),
          commandItem('sequence.exportFcpxml', t.menu.exportFcpxml),
        ]
      : []),
    commandItem('sequence.exportStems', t.menu.exportStems),
  ]
}

function exportSubmenu(context: MenuContext): MenuItemConstructorOptions[] {
  const { options, t } = context
  // The model tab exports its workshop through the same rows: one model, written as a scene of one.
  if (options.scope === 'scene' || options.scope === 'character') {
    return [
      { label: t.menu.exportScene, submenu: sceneExportItems(context, 'scene') },
      {
        label: t.menu.exportSelection,
        enabled: options.abilities.includes('scene.exportSelection'),
        submenu: sceneExportItems(context, 'selection'),
      },
    ]
  }
  if (options.workspace === 'materials')
    return [{ label: t.menu.exportMaterial, submenu: materialExportItems(context) }]
  if (options.workspace === 'skyboxes')
    return [{ label: t.menu.exportSkybox, submenu: skyboxExportItems(context) }]
  if (options.workspace === 'video') return sequenceExportItems(context, true)
  if (options.workspace === 'audio') return sequenceExportItems(context, false)
  if (options.workspace === 'image') {
    return [
      context.commandItem('canvas.export', t.menu.exportPicture),
      context.commandItem('canvas.exportLayered', t.menu.exportLayers),
    ]
  }
  return []
}

export function importMenu(context: MenuContext): MenuItemConstructorOptions[] {
  return [
    {
      label: context.t.menu.import,
      submenu: [context.commandItem('montage.import', context.t.menu.importBundle)],
    },
  ]
}

export function exportMenu(context: MenuContext): MenuItemConstructorOptions[] {
  const items = exportSubmenu(context)
  return items.length === 0 ? [] : [{ label: context.t.menu.export, submenu: items }]
}
