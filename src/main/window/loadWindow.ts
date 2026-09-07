import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { isDevelopment } from '@main/environment'

export function loadWindow(
  window: BrowserWindow,
  options: { entry?: string; hash?: string } = {},
): void {
  const { entry = 'index.html', hash } = options
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDevelopment && devUrl) {
    const base = entry === 'index.html' ? devUrl : `${devUrl}/${entry}`
    void window.loadURL(hash ? `${base}#${hash}` : base)
    return
  }
  const file = join(import.meta.dirname, '../renderer', entry)
  void window.loadFile(file, hash ? { hash } : {})
}
