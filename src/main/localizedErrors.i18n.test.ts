import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, TRANSLATIONS } from '@shared/i18n'
import { PROJECT_TREES, SOURCE_ROOT, sourceFiles, WHOLE_PROJECT } from './sourceFiles'

function literalParts(expression: ts.Expression): string[] {
  if (ts.isStringLiteralLike(expression)) return [expression.text]
  if (ts.isTemplateExpression(expression))
    return [expression.head.text, ...expression.templateSpans.map(span => span.literal.text)]
  if (ts.isConditionalExpression(expression))
    return [...literalParts(expression.whenTrue), ...literalParts(expression.whenFalse)]
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  )
    return [...literalParts(expression.left), ...literalParts(expression.right)]
  return []
}

function hardcodedErrors(source: ts.SourceFile): string[] {
  const findings: string[] = []
  const visit = (node: ts.Node): void => {
    let argument: ts.Expression | undefined
    if (ts.isNewExpression(node) && node.expression.getText(source) === 'Error') {
      argument = node.arguments?.[0]
    } else if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : node.expression.getText(source)
      if (name === 'abandon' || name === 'failWorker') argument = node.arguments[1]
      if (name === 'failAll') argument = node.arguments[0]
    }
    if (argument) {
      for (const text of literalParts(argument)) {
        if (!/\p{Letter}[\s:]+\p{Letter}/u.test(text)) continue
        const { line } = source.getLineAndCharacterOfPosition(node.getStart())
        findings.push(`${source.fileName}:${line + 1}: ${text}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

function argumentsMissingFrom(source: ts.SourceFile): string[] {
  const findings: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'localizedError') {
      const key = node.arguments[0]
      if (key && ts.isStringLiteralLike(key)) {
        const values = node.arguments[1]
        const names = new Set(
          values && ts.isObjectLiteralExpression(values)
            ? values.properties.flatMap(property =>
                property.name ? [property.name.getText(source)] : [],
              )
            : [],
        )
        for (const { code } of LANGUAGES) {
          const texts: Record<string, string> = TRANSLATIONS[code].diagnostics
          const text = texts[key.text]
          if (!text) findings.push(`${source.fileName}: ${code}.${key.text} is missing`)
          for (const [, name] of text?.matchAll(/\{\{(\w+)\}\}/g) ?? []) {
            if (name && !names.has(name))
              findings.push(`${source.fileName}: ${key.text} needs ${name}`)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

function parsed(path: string): ts.SourceFile {
  return ts.createSourceFile(
    relative(SOURCE_ROOT, path),
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

// These modules drive validation probes or fake bridges, never user-facing diagnostic text.
const TECHNICAL_RENDERER = /(?:Validation|visualRegression|fakeBridge)/

// Main-only failures outside these paths can be logs or errors reduced to existing codes.
const NATIVE_DIAGNOSTICS = [
  'assets/convertedMesh.ts',
  'assets/cloudBackend.ts',
  'assets/textureExtraction.ts',
  'assets/openRasterFile.ts',
  'export/writePickedFile.ts',
  'export/validation.ts',
  'project/handlers.ts',
  'project/documentFilesCore.ts',
]

describe('localized diagnostic errors', () => {
  it(
    'keeps error phrases out of renderer and native diagnostic producers',
    () => {
      const paths = [
        ...sourceFiles(join(SOURCE_ROOT, 'renderer/src')).filter(
          path => !TECHNICAL_RENDERER.test(path),
        ),
        ...NATIVE_DIAGNOSTICS.map(path => join(SOURCE_ROOT, 'main', path)),
      ]
      expect(paths.flatMap(path => hardcodedErrors(parsed(path)))).toEqual([])
    },
    WHOLE_PROJECT,
  )

  it(
    'declares every literal diagnostic key and supplies its interpolation values',
    () => {
      expect(
        PROJECT_TREES.flatMap(tree => sourceFiles(tree)).flatMap(path =>
          argumentsMissingFrom(parsed(path)),
        ),
      ).toEqual([])
    },
    WHOLE_PROJECT,
  )

  it('detects phrases in errors including templates and fallbacks, while retaining codes', () => {
    const source = ts.createSourceFile(
      'probe.ts',
      "throw new Error(`file ${name} is missing`); throw new Error(reason ?? 'no document'); throw new Error('CANCELLED'); abandon(job, 'worker has failed'); inflight.failAll('worker is unreadable')",
      ts.ScriptTarget.Latest,
      true,
    )
    expect(hardcodedErrors(source)).toHaveLength(4)
  })
})
