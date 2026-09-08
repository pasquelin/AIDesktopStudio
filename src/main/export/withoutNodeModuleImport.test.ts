import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withoutNodeModuleImport } from './withoutNodeModuleImport'

const ARTEFACT = join(process.cwd(), 'vendor/jolt-physics/dist/jolt-physics.wasm-compat.js')

describe('what an exported runtime may import', () => {
  it('strips the Node probe Jolt ships, which a browser page cannot load', () => {
    const source = readFileSync(ARTEFACT, 'utf8')

    expect(source).toContain('await import("node:module")')
    expect(withoutNodeModuleImport(source)).not.toContain('node:module')
  })

  it('is wired into the game runtime build, not left as a helper nobody calls', () => {
    const config = readFileSync(join(process.cwd(), 'config', 'vite.game.config.ts'), 'utf8')

    expect(config).toContain('withoutNodeModuleImport')
    expect(config).toContain('stubNodeBuiltins')
  })
})
