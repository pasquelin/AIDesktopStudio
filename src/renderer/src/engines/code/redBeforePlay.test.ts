import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import STUDIO_TYPES from '@game/api/studio.d.ts?raw'
import { projectTypes } from './projectTypes'

/**
 * 🛑 The lot's own criterion, checked by the REAL compiler rather than by reading the text: a
 * name the project does not hold is refused before anything runs. Monaco's diagnostics come from
 * this same TypeScript, so what is red here is red on screen.
 */
function complaints(source: string, project: string): string[] {
  const files: Record<string, string> = {
    '/studio.d.ts': STUDIO_TYPES,
    '/project.d.ts': project,
    '/script.ts': source,
  }
  const host: ts.CompilerHost = {
    fileExists: name => name in files || ts.sys.fileExists(name),
    readFile: name => files[name] ?? ts.sys.readFile(name),
    getSourceFile: (name, language) => {
      const text = files[name] ?? ts.sys.readFile(name)
      return text === undefined ? undefined : ts.createSourceFile(name, text, language, true)
    },
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    writeFile: () => {},
    getCurrentDirectory: () => '/',
    getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
  }

  const program = ts.createProgram(
    ['/studio.d.ts', '/project.d.ts', '/script.ts'],
    {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      lib: ['lib.es2020.d.ts'],
    },
    host,
  )

  return program
    .getSemanticDiagnostics(program.getSourceFile('/script.ts'))
    .map(one => ts.flattenDiagnosticMessageText(one.messageText, ' '))
}

const wrote = (body: string): string =>
  `import { defineScript } from '@studio'\nexport default defineScript({ ${body} })`

const HELD = projectTypes({ components: ['Health', 'Movement'] })

describe('what a script is refused before it ever runs', () => {
  it('types a standard input map import without inventing a project declaration', () => {
    const said = complaints(
      "import character from './character.input.json'\nexport default character.actions[0]?.id",
      HELD,
    )

    expect(said).toEqual([])
  })

  /** 🛑 The sentence the whole lot exists for. */
  it('refuses a component name the project does not hold', () => {
    const said = complaints(wrote("onUpdate(self) { self.get('Helth') }"), HELD)

    expect(said.join(' ')).toContain('Helth')
  })

  it('takes a component name the project does hold', () => {
    expect(complaints(wrote("onUpdate(self) { self.get('Health') }"), HELD)).toEqual([])
  })

  /** A project that declared nothing must not make every name an error. */
  it('takes any name at all while the project declares none', () => {
    const said = complaints(
      wrote("onUpdate(self) { self.get('Whatever') }"),
      projectTypes({ components: [] }),
    )

    expect(said).toEqual([])
  })

  it('refuses a hook nobody drives, and a gesture the sandbox does not build', () => {
    expect(complaints(wrote('onWhenever() {}'), HELD).join(' ')).toContain('onWhenever')
    expect(
      complaints(wrote('onUpdate(self) { self.teleport(1, 2, 3) }'), HELD).join(' '),
    ).toContain('teleport')
  })

  /** What a script may NOT reach — the refusal the sandbox enforces, said by the editor first. */
  it('refuses a clock and a network of its own', () => {
    const said = complaints(wrote('onUpdate() { fetch("http://x"); Date.now() }'), HELD).join(' ')

    expect(said).toContain('fetch')
  })
})
