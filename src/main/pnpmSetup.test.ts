import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'

const ROOT = join(import.meta.dirname, '..', '..')

const workflow = (name: string): string =>
  readFileSync(join(ROOT, '.github', 'workflows', `${name}.yml`), 'utf8')

const withoutComments = (contents: string): string =>
  contents
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n')

describe('the pnpm 12 toolchain', () => {
  it('pins pnpm 12.3.4', () => {
    expect(manifest.packageManager).toBe(
      'pnpm@12.3.4+sha512.961aa41fb077da3a04a441d9f8e15ebc0c96da8ef710b2eb67bf9ee7cb0610eabd48f1fd85f51cffe73846785fa0f87c56a3a872a1d893f8446741b5cce45457',
    )
  })

  it.each(['ci', 'pages', 'release'])('uses the native setup action in %s', name => {
    const contents = withoutComments(workflow(name))
    const setupSteps =
      contents.match(/- uses: pnpm\/setup@v2\n {8}with:\n {10}install: false/g) ?? []

    expect(setupSteps).toHaveLength(1)
    expect(contents).not.toContain('pnpm/action-setup')
  })

  it('documents the standalone installation required outside CI', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')

    expect(readme).toContain(
      '[pnpm 12.3.4 installed with its standalone installer](https://pnpm.io/installation)',
    )
    expect(readme).toContain('(Corepack does not yet run pnpm 12)')
  })

  it('locks the native package manager independently of project dependencies', () => {
    const lockfile = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8')

    expect(lockfile).toMatch(/^---\nlockfileVersion: '9.0'/)
    // 🛑 Its own entry, whoever else sits in that block: pnpm 12 locks `@pnpm/exe` beside `pnpm`,
    // and reading the two as one line made this refuse the very lockfile it is meant to describe.
    const managers = lockfile.split('packageManagerDependencies:\n')[1]?.split('\npackages:')[0]
    expect(managers).toMatch(/^ {6}pnpm:\n {8}specifier: 12\.3\.4\n {8}version: 12\.3\.4$/m)
    expect(lockfile).toContain("\n---\nlockfileVersion: '9.0'")
  })
})
