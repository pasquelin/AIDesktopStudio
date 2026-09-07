import ts from 'typescript'
import { INPUT_MAP_EXTENSION, type InputMapModule } from '@shared/domain/inputMap'

/** What a script may name, and the only thing it may: `@studio` is types, erased on compile. */
const STUDIO_MODULE = '@studio'

export type Transpiled = { code: string } | { trouble: string; line: number }

/**
 * TypeScript to what the sandbox runs, and nothing else.
 *
 * 🛑 `transpileModule`, never a program: the types are Monaco's business, and asking for them here
 * would mean a whole compiler host over a project the editor has already read.
 */
export type TranspileOptions = {
  script: string
  inputMaps: readonly InputMapModule[]
}

type Replacement = { from: number; to: number; text: string }
type ImportTrouble = { trouble: string; line: number }

export function transpile(source: string, options?: TranspileOptions): Transpiled {
  const read = imports(source, options)
  if ('trouble' in read) return read

  const held = ts.transpileModule(read.code, {
    compilerOptions: {
      // CommonJS, so `export default` lands on `exports` — which is what the sandbox reads back.
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
      removeComments: false,
    },
  })

  return { code: held.outputText }
}

/**
 * 🛑 Parsed, never scanned line by line: an import spread over three lines is ordinary TypeScript.
 * `@studio` is emptied rather than deleted — it is globals, so `isolatedModules` would keep a
 * `require` the machine does not hold, and the blank lines keep a fault on its author's line.
 */
function imports(
  source: string,
  options: TranspileOptions | undefined,
): { code: string } | ImportTrouble {
  const file = ts.createSourceFile('script.ts', source, ts.ScriptTarget.ES2020, true)
  const replacements: Replacement[] = []

  for (const statement of file.statements) {
    const replacement = replacementFor(statement, file, options)
    if (!replacement) continue
    if ('trouble' in replacement) return replacement
    replacements.push(replacement)
  }

  let code = source
  // Backwards, so an earlier replacement does not move the offsets of a later one.
  for (const span of replacements.reverse()) {
    const lineBreaks = source.slice(span.from, span.to).match(/\n/g)?.length ?? 0
    const replacement = span.text + '\n'.repeat(lineBreaks)
    code = code.slice(0, span.from) + replacement + code.slice(span.to)
  }
  return { code }
}

function replacementFor(
  statement: ts.Statement,
  file: ts.SourceFile,
  options: TranspileOptions | undefined,
): Replacement | ImportTrouble | null {
  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return null
  if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return null
  const named = statement.moduleSpecifier.text
  let text = ''
  if (named.endsWith(INPUT_MAP_EXTENSION)) {
    const imported = inputMapImport(statement, named, options)
    if (imported === null) return importTrouble(file, statement, named)
    text = imported
  } else if (named !== STUDIO_MODULE) return importTrouble(file, statement, named)
  return { from: statement.getStart(file), to: statement.end, text }
}

function importTrouble(
  file: ts.SourceFile,
  statement: ts.Statement,
  trouble: string,
): ImportTrouble {
  return { trouble, line: file.getLineAndCharacterOfPosition(statement.getStart(file)).line + 1 }
}

function inputMapImport(
  statement: ts.ImportDeclaration | ts.ExportDeclaration,
  named: string,
  options: TranspileOptions | undefined,
): string | null {
  if (!ts.isImportDeclaration(statement) || !statement.importClause?.name || !options) return null
  const path = inputPath(options.script, named)
  const input = options.inputMaps.find(candidate => candidate.path === path)
  return input ? `const ${statement.importClause.name.text} = ${JSON.stringify(input.map)};` : null
}

function inputPath(script: string, imported: string): string {
  const path = script.startsWith('script:') ? script.slice('script:'.length) : script
  const parts = [...path.split('/').slice(0, -1), ...imported.split('/')]
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}
