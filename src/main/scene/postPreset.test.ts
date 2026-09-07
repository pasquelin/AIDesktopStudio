import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANNELS } from '@shared/ipc'
import { invoke, resetHandlers } from '@main/ipc/testHarness'
import { registerPostPresetHandlers } from './postPreset'

vi.mock('electron', async () => (await import('@main/ipc/testHarness')).mockElectron())

const STACK = '{"type":"ai-desktop-studio.post-processing","version":1,"name":"Nuit","stack":{}}'

describe('carrying a composition to and from a file', () => {
  let folder: string
  let picked: string | null

  beforeEach(async () => {
    resetHandlers()
    folder = await mkdtemp(join(tmpdir(), 'scenario-post-'))
    picked = null
    registerPostPresetHandlers({
      pickSavePath: (name, extension) => Promise.resolve(join(folder, `${name}.${extension}`)),
      pickImportPath: () => Promise.resolve(picked),
    })
  })

  it('writes the composition where the dialog landed', async () => {
    await expect(invoke(CHANNELS.postExport, { name: 'Nuit', content: STACK })).resolves.toBe(
      'Nuit.json',
    )
  })

  it('reads a composition back, byte for byte', async () => {
    picked = join(folder, 'read.json')
    await writeFile(picked, STACK, 'utf8')

    await expect(invoke(CHANNELS.postImport)).resolves.toBe(STACK)
  })

  it('answers nothing at all when the dialog was dismissed', async () => {
    await expect(invoke(CHANNELS.postImport)).resolves.toBeNull()
  })

  /**
   * A stack is a few dozen numbers per effect, so the ceiling is four orders of magnitude of
   * room — and what it protects is this PROCESS: an unrefused file is held whole here, and then
   * again as a string on the way to the window.
   */
  it('refuses a file far too large to be a composition', async () => {
    picked = join(folder, 'huge.json')
    await writeFile(picked, 'x'.repeat(2 * 1024 * 1024), 'utf8')

    await expect(invoke(CHANNELS.postImport)).rejects.toThrow(/too large/)
  })

  // Nothing here decides what a composition may SAY — `readPostPresetFile` does, in the window.
  // This side must hand a file that parses as nothing over unchanged rather than refuse it.
  it('carries a file this side cannot make sense of, and lets the window judge it', async () => {
    picked = join(folder, 'odd.json')
    await writeFile(picked, 'not json at all', 'utf8')

    await expect(invoke(CHANNELS.postImport)).resolves.toBe('not json at all')
  })
})
