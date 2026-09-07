import type { MenuItemConstructorOptions } from 'electron'
import { APP_NAME } from '@shared/constants'
import { CREATABLES } from '@shared/domain/creatable'
import { pathBaseNameOf, stemOf } from '@shared/domain/fileName'
import { projectName, projectsByCreation } from '@shared/domain/project'
import { fillHoles } from '@shared/i18n'
import type { MenuContext } from './templateContext'
import { exportMenu, importMenu } from './templateExports'

function settingsItem(context: MenuContext): MenuItemConstructorOptions {
  return {
    label: context.t.menu.settings,
    ...context.keyOf('app.settings'),
    click: () => context.options.actions.openSettings(),
  }
}

function fileSettingsItems(context: MenuContext): MenuItemConstructorOptions[] {
  return context.options.isMac ? [] : [settingsItem(context), { type: 'separator' }]
}

export function appMenu(context: MenuContext): MenuItemConstructorOptions[] {
  if (!context.options.isMac) return []
  return [
    {
      label: APP_NAME,
      submenu: [
        {
          role: 'about',
          label: fillHoles(context.t.menu.about, { name: APP_NAME }, context.options.language),
        },
        { type: 'separator' },
        settingsItem(context),
        { type: 'separator' },
        context.roleItem('services'),
        { type: 'separator' },
        context.roleItem('hide'),
        context.roleItem('hideOthers'),
        context.roleItem('unhide'),
        { type: 'separator' },
        context.roleItem('quit'),
      ],
    },
  ]
}

function recentItems(context: MenuContext): MenuItemConstructorOptions[] {
  const projects = projectsByCreation([...context.options.recentProjects]).map(entry => ({
    label: projectName(entry.path),
    click: () => context.options.actions.openRecent({ project: entry.path }),
  }))
  const documents = context.options.recentDocuments.map(entry => {
    const title = stemOf(pathBaseNameOf(entry.path))
    return {
      label:
        entry.project === context.options.openProject
          ? title
          : `${title} — ${projectName(entry.project)}`,
      click: () => context.options.actions.openRecent({ project: entry.project, path: entry.path }),
    }
  })
  if (projects.length === 0 && documents.length === 0) return []
  const between: MenuItemConstructorOptions[] =
    projects.length > 0 && documents.length > 0 ? [{ type: 'separator' }] : []
  return [{ label: context.t.menu.openRecent, submenu: [...projects, ...between, ...documents] }]
}

function documentItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { options, t } = context
  return [
    {
      label: t.menu.newDocument,
      ...context.keyOf('app.new'),
      click: () => options.actions.runCommand('app.new'),
    },
    {
      label: t.menu.newProject,
      ...context.keyOf('project.new'),
      click: () => options.actions.runCommand('project.new'),
    },
    {
      label: t.menu.newFile,
      submenu: CREATABLES.map(({ kind }) => ({
        label: t.documents.kinds[kind],
        enabled: options.openProject !== null,
        click: () => options.actions.newDocument({ kind }),
      })),
    },
  ]
}

function openAndSaveItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { options, t } = context
  return [
    {
      label: t.menu.openProject,
      ...context.keyOf('project.open'),
      click: () => options.actions.runCommand('project.open'),
    },
    ...recentItems(context),
    { type: 'separator' },
    {
      label: t.menu.saveDocument,
      enabled: options.abilities.includes('document.save'),
      ...context.keyOf('document.save'),
      click: () => options.actions.runCommand('document.save'),
    },
    {
      label: t.menu.saveDocumentAs,
      enabled: options.abilities.includes('document.saveAs'),
      ...context.keyOf('document.saveAs'),
      click: () => options.actions.runCommand('document.saveAs'),
    },
  ]
}

function fileCloseItems(context: MenuContext): MenuItemConstructorOptions[] {
  const { options, t, commandItem, roleItem } = context
  // Auxiliary windows keep the native close: ⌘W there must take that window, not a tab
  // sitting in the studio behind it.
  if (options.workspace === null) {
    return options.isMac ? [roleItem('close')] : [roleItem('quit')]
  }
  const closeTab = {
    ...commandItem('document.close', t.documents.close),
    enabled: options.abilities.includes('document.close'),
  }
  return options.isMac ? [closeTab] : [closeTab, roleItem('quit')]
}

export function fileMenu(context: MenuContext): MenuItemConstructorOptions {
  return {
    label: context.t.menu.file,
    submenu: [
      ...documentItems(context),
      { type: 'separator' },
      ...openAndSaveItems(context),
      { type: 'separator' },
      ...importMenu(context),
      ...exportMenu(context),
      { type: 'separator' },
      ...fileSettingsItems(context),
      ...fileCloseItems(context),
    ],
  }
}

export function helpMenu(context: MenuContext): MenuItemConstructorOptions {
  const welcome = {
    label: context.t.menu.welcome,
    click: () => context.options.actions.openWelcome(),
  }
  const manual = { label: context.t.menu.manual, click: () => context.options.actions.openManual() }
  const usage = { label: context.t.menu.usage, click: () => context.options.actions.openUsage() }
  const licences = {
    label: context.t.menu.licences,
    click: () => context.options.actions.openLicences(),
  }
  const common: MenuItemConstructorOptions[] = [
    welcome,
    { type: 'separator' },
    manual,
    { type: 'separator' },
    usage,
    { type: 'separator' },
    licences,
  ]
  return {
    label: context.t.menu.help,
    submenu: context.options.isMac
      ? common
      : [
          {
            role: 'about',
            label: fillHoles(context.t.menu.about, { name: APP_NAME }, context.options.language),
          },
          ...common,
        ],
  }
}
