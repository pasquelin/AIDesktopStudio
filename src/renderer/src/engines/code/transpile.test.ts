import { describe, expect, it } from 'vitest'
import { transpile } from './transpile'
import type { InputMapModule } from '@shared/domain/inputMap'

const CHARACTER: InputMapModule = {
  path: 'Scripts/character.input.json',
  map: { version: 1, id: 'character', priority: 0, defaultActive: true, actions: [] },
}

describe('an author’s TypeScript, turned into what the sandbox runs', () => {
  it('strips the types and leaves what a machine can run', () => {
    const held = transpile(
      "import { defineScript } from '@studio'\nexport default defineScript({ onUpdate(self: unknown, ctx: unknown, dt: number) { void dt } })",
    )

    expect('code' in held && held.code).toContain('exports.default')
    expect('code' in held && held.code).not.toContain(': number')
  })

  /**
   * 🛑 Refused at compile rather than at run: a `require` the sandbox does not hold would throw
   * halfway through a module, leaving an author with a name and no line.
   */
  it('refuses a module that is not the studio, and says which line', () => {
    const held = transpile(
      "import { defineScript } from '@studio'\nimport { readFile } from 'node:fs'\n",
    )

    expect(held).toEqual({ trouble: 'node:fs', line: 2 })
  })

  it('takes the studio module, which is types and disappears', () => {
    const held = transpile(
      "import { defineScript } from '@studio'\nexport default defineScript({})",
    )

    expect('code' in held).toBe(true)
    expect('code' in held && held.code).not.toContain('@studio')
  })

  it('inlines a validated input map imported beside the script', () => {
    const held = transpile(
      "import character from './character.input.json'\nexport default { character }",
      { script: 'script:Scripts/player.ts', inputMaps: [CHARACTER] },
    )

    expect('code' in held && held.code).toContain('"id": "character"')
    expect('code' in held && held.code).not.toContain('require(')
  })

  it('refuses an input map the project does not hold and keeps its source line', () => {
    const held = transpile(
      "import { defineScript } from '@studio'\nimport vehicle from './vehicle.input.json'",
      { script: 'script:Scripts/player.ts', inputMaps: [CHARACTER] },
    )

    expect(held).toEqual({ trouble: './vehicle.input.json', line: 2 })
  })

  /** 🛑 Ordinary TypeScript, and what a line scanner reads as three lines of nothing. */
  it('reads an import spread over several lines, on both counts', () => {
    const refused = transpile("import {\n  readFile,\n} from 'node:fs'\nexport default {}")
    const taken = transpile(
      "import {\n  defineScript,\n} from '@studio'\nexport default defineScript({})",
    )

    expect(refused).toEqual({ trouble: 'node:fs', line: 1 })
    expect('code' in taken && taken.code).not.toContain('@studio')
  })
})
