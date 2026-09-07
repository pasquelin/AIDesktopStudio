import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const main = readFileSync('src/main/pickingValidation.ts', 'utf8')
const renderer = readFileSync('src/renderer/pickingValidation.html', 'utf8')
const config = readFileSync('electron.vite.config.ts', 'utf8')

describe('production picking validation', () => {
  it('ships the existing SAFE validation as isolated production entries', () => {
    expect(config).toContain("pickingValidation: resolve('src/main/pickingValidation.ts')")
    expect(config).toContain("pickingValidation: resolve('src/renderer/pickingValidation.html')")
    expect(renderer).toContain('/src/engines/scene/pickingProductionValidation.browser.ts')
  })

  it('runs without a bridge, developer tools, or renderer privileges', () => {
    expect(main).not.toContain('preload:')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('sandbox: true')
    expect(main).toContain('devTools: false')
  })
})
