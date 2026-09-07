import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { lockNavigation } from '@main/window/navigation'

const VALIDATION_CALL = `(() => {
  const validate = Reflect.get(window, '__iaValidateProductionPicking')
  if (typeof validate !== 'function') throw new Error('production picking validation is absent')
  return validate()
})()`

async function runPickingValidation(): Promise<unknown> {
  const window = new BrowserWindow({
    width: 128,
    height: 128,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      backgroundThrottling: false,
    },
  })

  try {
    await window.loadFile(join(import.meta.dirname, '../renderer/pickingValidation.html'))
    return await window.webContents.executeJavaScript(VALIDATION_CALL, true)
  } finally {
    window.destroy()
  }
}

async function reportPickingValidation(): Promise<void> {
  try {
    const result = await runPickingValidation()
    process.stdout.write(`${JSON.stringify(result)}\n`)
    app.exit(0)
  } catch (error) {
    process.stderr.write(`Picking validation failed: ${String(error)}\n`)
    app.exit(1)
  }
}

lockNavigation()
app.once('ready', () => void reportPickingValidation())
