import { TRANSLATIONS, type Language } from '@shared/i18n'
import type { OwnModelProfile } from '@shared/domain/aiOverview'
import type { PathKind } from '@shared/domain/settingsRegistry'
import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import { ANIMATION_EXTENSIONS } from '@shared/domain/animationLibrary'
import { mediaFilters } from './media/link'
import type { AskUser } from './project/documentDialogs'

async function openDialog(options: Electron.OpenDialogOptions): Promise<string[]> {
  const parent = BrowserWindow.getFocusedWindow()
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

export async function pickPath(kind: PathKind, startIn?: string): Promise<string | null> {
  const picked = await openDialog({
    properties: kind === 'folder' ? ['openDirectory', 'createDirectory'] : ['openFile'],
    ...(startIn ? { defaultPath: startIn } : {}),
  })
  return picked[0] ?? null
}

async function saveDialog(options: Electron.SaveDialogOptions): Promise<string | null> {
  const parent = BrowserWindow.getFocusedWindow()
  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options)
  return result.canceled ? null : (result.filePath ?? null)
}

export const askUser: AskUser = async options => {
  const parent = BrowserWindow.getFocusedWindow()
  const shown: Electron.MessageBoxOptions = { type: 'warning', ...options }
  const result = parent
    ? await dialog.showMessageBox(parent, shown)
    : await dialog.showMessageBox(shown)
  return result.response
}

export async function savePicture(name: string, bytes: Uint8Array): Promise<string | null> {
  const path = await saveDialog({ defaultPath: name })
  if (!path) return null
  await writeFile(path, bytes)
  return path
}

export function pickSavePath(name: string, extension: string): Promise<string | null> {
  return saveDialog({
    defaultPath: `${name}${extension}`,
    filters: [{ name: extension.slice(1).toUpperCase(), extensions: [extension.slice(1)] }],
  })
}

export async function pickImportPath(
  extension: string,
  language: Language,
): Promise<string | null> {
  const chosen = await openDialog({
    properties: ['openFile'],
    filters: [{ name: TRANSLATIONS[language].dialog.bundle, extensions: [extension.slice(1)] }],
  })
  return chosen[0] ?? null
}

export async function pickWeights(
  language: Language,
  profile?: OwnModelProfile,
): Promise<string | null> {
  if (profile === 'motion') {
    const t = TRANSLATIONS[language]
    const selected = await openDialog({
      properties: ['openDirectory'],
      title: t.aiModels.motionFolder,
    })
    if (!selected[0]) return null
    const accepted = await askUser({
      message: t.aiModels.motionFolder,
      detail: t.aiModels.motionTerms,
      buttons: [t.aiModels.motionAccept, t.actions.cancel],
      defaultId: 1,
      cancelId: 1,
    })
    return accepted === 0 ? selected[0] : null
  }
  const chosen = await openDialog({
    properties: ['openFile'],
    filters: [{ name: TRANSLATIONS[language].dialog.weights, extensions: ['gguf'] }],
  })
  return chosen[0] ?? null
}

export function pickMedia(language: Language): Promise<string[]> {
  const t = TRANSLATIONS[language].dialog
  return openDialog({
    properties: ['openFile', 'multiSelections'],
    filters: mediaFilters({
      all: t.allMedia,
      video: t.video,
      audio: t.audio,
      image: t.image,
      mesh: t.mesh,
    }),
  })
}

export function pickAnimation(language: Language): Promise<string[]> {
  const t = TRANSLATIONS[language].dialog
  const extensions = ANIMATION_EXTENSIONS.map(extension => extension.slice(1))
  return openDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: t.animation, extensions }],
  })
}
