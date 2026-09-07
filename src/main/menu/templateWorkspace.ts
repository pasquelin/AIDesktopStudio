import type { MenuItemConstructorOptions } from 'electron'
import {
  FIGURE_ENTRIES,
  LIGHT_ENTRIES,
  MESH_ENTRIES,
  OBJECT_ENTRIES,
  type FigureKind,
  type LightKind,
  type MeshKind,
  type ObjectKind,
  type SceneEntry,
} from '@shared/domain/scene'
import type { MenuContext } from './templateContext'

function imageToolItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { commandItem, t } = context
  return [
    commandItem('canvas.toolMove', t.commands.canvasToolMove.title),
    commandItem('canvas.toolHand', t.commands.canvasToolHand.title),
    { type: 'separator' },
    commandItem('canvas.toolCrop', t.commands.canvasToolCrop.title),
    { type: 'separator' },
    commandItem('canvas.toolSelectRectangle', t.commands.canvasToolSelectRectangle.title),
    commandItem('canvas.toolSelectEllipse', t.commands.canvasToolSelectEllipse.title),
    commandItem('canvas.toolSelectLasso', t.commands.canvasToolSelectLasso.title),
    commandItem('canvas.toolSmartSelect', t.commands.canvasToolSmartSelect.title),
    { type: 'separator' },
    commandItem('canvas.toolShapeRectangle', t.commands.canvasToolShapeRectangle.title),
    commandItem('canvas.toolShapeLine', t.commands.canvasToolShapeLine.title),
    commandItem('canvas.toolShapeArrow', t.commands.canvasToolShapeArrow.title),
    commandItem('canvas.toolShapeEllipse', t.commands.canvasToolShapeEllipse.title),
    commandItem('canvas.toolShapePolygon', t.commands.canvasToolShapePolygon.title),
    commandItem('canvas.toolShapeStar', t.commands.canvasToolShapeStar.title),
    { type: 'separator' },
    commandItem('canvas.toolBrush', t.commands.canvasToolBrush.title),
    commandItem('canvas.toolPencil', t.commands.canvasToolPencil.title),
    commandItem('canvas.toolEraser', t.commands.canvasToolEraser.title),
    commandItem('canvas.toolFill', t.commands.canvasToolFill.title),
    { type: 'separator' },
    commandItem('canvas.toolText', t.commands.canvasToolText.title),
    commandItem('canvas.toolPicker', t.commands.canvasToolPicker.title),
    { type: 'separator' },
    commandItem('canvas.brushSmaller', t.commands.canvasBrushSmaller.title),
    commandItem('canvas.brushLarger', t.commands.canvasBrushLarger.title),
  ]
}

export function imageToolsMenu(context: MenuContext): MenuItemConstructorOptions[] {
  if (context.options.workspace !== 'image') return []
  return [{ label: context.t.menu.imageTools, submenu: imageToolItems(context) }]
}

function imageActionItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { commandItem, t } = context
  return [
    {
      ...commandItem('canvas.mergeDown', t.commands.canvasMergeDown.title),
      enabled: context.options.abilities.includes('canvas.mergeDown'),
    },
    commandItem('canvas.flatten', t.commands.canvasFlatten.title),
    { type: 'separator' },
    commandItem('canvas.flipHorizontal', t.commands.canvasFlipHorizontal.title),
    commandItem('canvas.flipVertical', t.commands.canvasFlipVertical.title),
    { type: 'separator' },
    commandItem('canvas.rotateCw', t.commands.canvasRotateCw.title),
    commandItem('canvas.rotateCcw', t.commands.canvasRotateCcw.title),
    { type: 'separator' },
    {
      ...commandItem('canvas.maskFromSelection', t.commands.canvasMaskFromSelection.title),
      enabled: context.options.abilities.includes('canvas.maskFromSelection'),
    },
    { type: 'separator' },
    commandItem('canvas.regenerate', t.commands.canvasRegenerate.title),
    commandItem('canvas.extend', t.commands.canvasExtend.title),
    commandItem('canvas.cutout', t.commands.canvasCutout.title),
    commandItem('canvas.enlarge', t.commands.canvasEnlarge.title),
    commandItem('canvas.vectorize', t.commands.canvasVectorize.title),
  ]
}

export function imageMenu(context: MenuContext): MenuItemConstructorOptions[] {
  if (context.options.workspace !== 'image') return []
  return [{ label: context.t.menu.image, submenu: imageActionItems(context) }]
}

function entryItem<K extends MeshKind | LightKind | FigureKind | ObjectKind>(
  context: MenuContext,
  labels: Record<K, string>,
): (entry: SceneEntry<K>) => MenuItemConstructorOptions {
  return entry => ({
    label: labels[entry.kind],
    enabled: !entry.disabled,
    click: () => context.options.actions.addNode({ kind: entry.kind }),
  })
}

export function addMenu(context: MenuContext): MenuItemConstructorOptions[] {
  if (context.options.scope !== 'scene') return []
  const { t } = context
  return [
    {
      label: t.menu.add,
      submenu: [
        { label: t.menu.mesh, submenu: MESH_ENTRIES.map(entryItem<MeshKind>(context, t.meshes)) },
        {
          label: t.menu.light,
          submenu: LIGHT_ENTRIES.map(entryItem<LightKind>(context, t.lights)),
        },
        {
          label: t.menu.figure,
          submenu: FIGURE_ENTRIES.map(entryItem<FigureKind>(context, t.figures)),
        },
        {
          label: t.menu.object,
          submenu: OBJECT_ENTRIES.map(entryItem<ObjectKind>(context, t.objects)),
        },
      ],
    },
  ]
}
