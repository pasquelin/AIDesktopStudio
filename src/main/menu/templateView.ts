import type { MenuItemConstructorOptions } from 'electron'
import { DISPLAY_MODES, VIEW_DIRECTIONS } from '@shared/domain/scene'
import { placementIn } from '@shared/domain/tool'
import { NAVIGATION_PRESETS } from '@shared/domain/navigationPreset'
import { CAPTURE_QUALITIES, DEFAULT_CAPTURE_QUALITY } from '@shared/domain/sceneCapture'
import { SIDE_VIEW_COMMAND, viewsScene, type CommandId } from '@shared/domain/command'
import type { MenuContext } from './templateContext'

function canvasViewItems(context: MenuContext): MenuItemConstructorOptions[] {
  if (context.options.workspace !== 'image') return []
  const { commandItem, t } = context
  return [
    { type: 'separator' },
    commandItem('canvas.zoomIn', t.menu.zoomIn),
    commandItem('canvas.zoomOut', t.menu.zoomOut),
    commandItem('canvas.zoomFit', t.menu.zoomFit),
    commandItem('canvas.zoomActual', t.menu.zoomActual),
    { type: 'separator' },
    commandItem('canvas.rulers', t.menu.rulers),
    commandItem('canvas.guides', t.menu.guides),
    commandItem('canvas.grid', t.menu.grid),
    commandItem('canvas.clearGuides', t.menu.clearGuides),
    commandItem('canvas.snap', t.menu.snap),
  ]
}

function toggleItem(
  context: MenuContext,
  command: CommandId,
  label: string,
): MenuItemConstructorOptions {
  return {
    ...context.commandItem(command, label),
    type: 'checkbox',
    checked: context.options.checked.includes(command),
  }
}

function sceneViewItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { commandItem, t } = context
  return [
    ...VIEW_DIRECTIONS.map(direction =>
      commandItem(SIDE_VIEW_COMMAND[direction], t.sceneViews[direction]),
    ),
    { type: 'separator' },
    commandItem('scene.viewCamera', t.commands.sceneViewCamera.title),
  ]
}

function sceneDisplayItems(context: MenuContext): MenuItemConstructorOptions[] {
  return DISPLAY_MODES.map(mode => ({
    label: context.t.sceneDisplay[mode],
    type: 'radio',
    checked: context.options.checked.includes(`scene.display:${mode}`),
    click: () => context.options.actions.setDisplay({ mode }),
  }))
}

function sceneCaptureItems(context: MenuContext): MenuItemConstructorOptions[] {
  return CAPTURE_QUALITIES.map(quality =>
    quality === DEFAULT_CAPTURE_QUALITY
      ? context.commandItem('scene.capture', context.t.sceneCaptureQualities[quality])
      : {
          label: context.t.sceneCaptureQualities[quality],
          click: () => context.options.actions.captureScene({ quality }),
        },
  )
}

function navigationItems(context: MenuContext): MenuItemConstructorOptions[] {
  return NAVIGATION_PRESETS.map(preset => ({
    label: context.t.settings.navigationPreset[preset],
    type: 'radio',
    checked: preset === context.options.navigationPreset,
    click: () => context.options.actions.setNavigationPreset(preset),
  }))
}

/**
 * The scene's View rows. A model tab shows the ones that move its VIEW and no other: a row that
 * answered nothing there would sit active and do nothing, which the menu context promises against.
 */
function sceneMenuItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { scope } = context.options
  if (!viewsScene(scope)) return []
  const { t } = context
  const workshop = scope === 'character'
  const sceneOnly = (row: MenuItemConstructorOptions): MenuItemConstructorOptions[] =>
    workshop ? [] : [row]
  return [
    { type: 'separator' },
    { label: t.menu.sceneNavigation, submenu: navigationItems(context) },
    { label: t.menu.sceneDisplay, submenu: sceneDisplayItems(context) },
    ...sceneOnly({ label: t.menu.sceneView, submenu: sceneViewItems(context) }),
    { label: t.menu.sceneCapture, submenu: sceneCaptureItems(context) },
    { type: 'separator' },
    ...sceneOnly(toggleItem(context, 'scene.projection', t.commands.sceneProjection.title)),
    ...sceneOnly(toggleItem(context, 'scene.quad', t.commands.sceneQuad.title)),
    ...sceneOnly(toggleItem(context, 'scene.quadEdges', t.commands.sceneQuadEdges.title)),
    ...sceneOnly({ type: 'separator' }),
    toggleItem(context, 'scene.skeletons', t.commands.sceneSkeletons.title),
    ...sceneOnly(toggleItem(context, 'scene.poseMode', t.commands.scenePoseMode.title)),
  ]
}

function developerItems(context: MenuContext): MenuItemConstructorOptions[] {
  if (!context.options.isDevelopment) return []
  return [
    { type: 'separator' },
    context.roleItem('toggleDevTools'),
    { ...context.roleItem('reload'), accelerator: 'Shift+CmdOrCtrl+R' },
  ]
}

function toolItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { workspace } = context.options
  if (!workspace) return []
  return context.options.tools
    .flatMap(id => placementIn(id, workspace) ?? [])
    .map(placement => ({
      label: context.t.panels[placement.id],
      click: () => context.options.actions.openTool({ zone: placement.zone, tool: placement.id }),
    }))
}

export function viewMenu(context: MenuContext): MenuItemConstructorOptions {
  return {
    label: context.t.menu.view,
    submenu: [
      context.commandItem('app.assistant', context.t.commands.appAssistant.title),
      { type: 'separator' },
      { label: context.t.menu.tools, submenu: toolItems(context) },
      context.commandItem('layout.reset', context.t.menu.resetLayout),
      ...canvasViewItems(context),
      ...sceneMenuItems(context),
      { type: 'separator' },
      {
        label: context.t.menu.fullScreen,
        ...context.keyOf('window.fullScreen'),
        click: () => context.options.actions.toggleFullScreen(),
      },
      ...developerItems(context),
    ],
  }
}

export function windowMenu(context: MenuContext): MenuItemConstructorOptions {
  const { roleItem, t, options } = context
  const close = !options.isMac && options.workspace === null ? [roleItem('close')] : []
  return {
    role: 'windowMenu',
    label: t.menu.window,
    submenu: options.isMac
      ? [roleItem('minimize'), roleItem('zoom'), { type: 'separator' }, roleItem('front')]
      : [roleItem('minimize'), roleItem('zoom'), ...close],
  }
}
