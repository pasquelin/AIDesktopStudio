import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  COMPLEXITY_THRESHOLD,
  LIMITS,
  analyseTypeScript,
  violationsFor,
} from '../../scripts/check-sizes.mjs'

const temporary: string[] = []

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true })
})

const block = (header: string, footer: string, count: number): string =>
  [
    header,
    ...Array.from({ length: count - 2 }, (_, index) => `  const value${index} = ${index}`),
    footer,
  ].join('\n')

describe('size guard', () => {
  it('treats every limit as strict', () => {
    const source = `${block('class Large {', '}', LIMITS.class)}\n${'// filler\n'.repeat(LIMITS.file - LIMITS.class)}`
    const file = join(mkdtempSync(join(tmpdir(), 'sizes-')), 'fixture.ts')
    temporary.push(file.slice(0, file.lastIndexOf('/')))
    writeFileSync(file, source)
    const findings = violationsFor(file)
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'file', lines: LIMITS.file }),
        expect.objectContaining({ kind: 'class', lines: LIMITS.class }),
      ]),
    )
  })

  it('distinguishes functions, hooks and JSX components', () => {
    const source = [
      block('function ordinary() {', '}', LIMITS.function),
      block('function useLarge() {', '}', LIMITS.hook),
      block('function Panel() {', '  return <div />\n}', LIMITS.component - 1),
    ].join('\n')
    expect(analyseTypeScript(source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'function', name: 'ordinary', lines: LIMITS.function }),
        expect.objectContaining({ kind: 'hook', name: 'useLarge', lines: LIMITS.hook }),
        expect.objectContaining({ kind: 'component', name: 'Panel', lines: LIMITS.component }),
      ]),
    )
  })

  it('applies the reduced limit at cyclomatic complexity 10', () => {
    const decisions = Array.from(
      { length: COMPLEXITY_THRESHOLD - 1 },
      (_, index) => `  if (values[${index}]) return ${index}`,
    ).join('\n')
    const filler = Array.from(
      { length: LIMITS.complex - COMPLEXITY_THRESHOLD - 2 },
      () => '  void values',
    ).join('\n')
    const source = `function decide(values: boolean[]) {\n${decisions}\n${filler}\n  return -1\n}`
    expect(analyseTypeScript(source)).toContainEqual(
      expect.objectContaining({
        kind: 'complex',
        complexity: COMPLEXITY_THRESHOLD,
        lines: LIMITS.complex,
      }),
    )
  })

  it('keeps the complex limit for hooks and JSX components', () => {
    const branches = Array.from(
      { length: COMPLEXITY_THRESHOLD - 1 },
      (_, index) => `  if (value === ${index}) return ${index}`,
    ).join('\n')
    const source = [
      `function useFeature(value) {\n${branches}\n  return value\n}`,
      `function Panel({ value }) {\n${branches}\n  return <div />\n}`,
    ].join('\n')

    expect(analyseTypeScript(source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'complex', name: 'useFeature' }),
        expect.objectContaining({ kind: 'complex', name: 'Panel' }),
      ]),
    )
  })

  it('counts a non-empty default switch arm', () => {
    const cases = Array.from(
      { length: COMPLEXITY_THRESHOLD - 2 },
      (_, index) => `case ${index}: return ${index}`,
    ).join('\n')
    const source = `function choose(value) { switch (value) { ${cases}\ndefault: return -1 } }`

    expect(analyseTypeScript(source)).toEqual([
      expect.objectContaining({ kind: 'complex', complexity: COMPLEXITY_THRESHOLD }),
    ])
  })

  it.each(['fixture.mts', 'fixture.cts', 'fixture.jsx', 'fixture.cjs'])(
    'analyses maintained module extension %s',
    filename => {
      const source = block('function oversized() {', '}', LIMITS.function)
      expect(violationsFor(filename, source)).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'function', name: 'oversized' })]),
      )
    },
  )

  it('does not charge an ordinary function for nested function lines', () => {
    const nested = block('  const callback = () => {', '  }', LIMITS.function + 20)
    const source = `function compose() {\n${nested}\n  return callback\n}`
    expect(analyseTypeScript(source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'compose', lines: 3 }),
        expect.objectContaining({ name: 'callback', lines: LIMITS.function + 20 }),
      ]),
    )
  })

  it('keeps full spans for components, hooks, and classes', () => {
    const nested = block('  const callback = () => {', '  }', 40)
    const source = [
      `function Panel() {\n${nested}\n  return <div />\n}`,
      `function useFeature() {\n${nested}\n  return callback\n}`,
      `class Controller {\n  method() {\n${nested}\n  }\n}`,
    ].join('\n')
    expect(analyseTypeScript(source)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Panel', kind: 'component', lines: 43 }),
        expect.objectContaining({ name: 'useFeature', kind: 'hook', lines: 43 }),
        expect.objectContaining({ name: 'Controller', kind: 'class', lines: 44 }),
      ]),
    )
  })

  it('analyses Python classes and functions with the same strict bounds', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sizes-'))
    temporary.push(directory)
    const file = join(directory, 'fixture.py')
    writeFileSync(
      file,
      ['class Large:', ...Array.from({ length: LIMITS.class - 1 }, () => '    pass')].join('\n'),
    )
    expect(violationsFor(file)).toContainEqual(
      expect.objectContaining({ kind: 'class', lines: LIMITS.class }),
    )
  })

  it('excludes nested Python function ranges from their parent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sizes-'))
    temporary.push(directory)
    const file = join(directory, 'nested.py')
    const nested = ['    def callback():', ...Array.from({ length: 60 }, () => '        pass')]
    writeFileSync(file, ['def compose():', ...nested, '    return callback'].join('\n'))
    expect(violationsFor(file)).toEqual([
      expect.objectContaining({ kind: 'function', name: 'callback', lines: 61 }),
    ])
  })
})
