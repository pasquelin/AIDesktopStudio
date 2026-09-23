import { mkdtemp, readdir, readFile } from 'node:fs/promises'

import { tmpdir } from 'node:os'

import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { documentFolderOf, DOCUMENT_VERSION } from '@shared/domain/document'

import { isHiddenEntry } from '@shared/domain/folder'

import { type DocumentFiles } from './documents'

import { documentFilesAt } from './project-fixtures'

const NOW = '2026-08-07T10:00:00.000Z'

/**
 * Where a first save lands, per kind — four shelves here, where `documents/` was one for all.
 * Read off the domain rather than spelt out: what these cases are about is that a document lands
 * with its own section, not that the section is called what it is called today.
 */
const SCENES = documentFolderOf('scene')

describe('createDocumentFiles', () => {
  let root = ''

  let documents: DocumentFiles

  /**
   * What a folder holds as a reader SEES it — the role marker left out, exactly as the explorer
   * leaves it out. `readdir` shows it; nothing in the studio does.
   */
  const held = async (folder: string): Promise<string[]> =>
    (await readdir(join(root, folder))).filter(name => !isHiddenEntry(name))

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-desktop-studio-documents-'))
    documents = documentFilesAt(root, NOW)
  })

  it('reads back what it wrote', async () => {
    await documents.write('doc-1', 'scene', { title: 'Untitled', content: '{"nodes":[]}' })

    expect(await documents.read('doc-1', 'scene')).toEqual({
      version: DOCUMENT_VERSION,
      kind: 'scene',
      title: 'Untitled',
      updatedAt: NOW,
      id: 'doc-1',
      content: '{"nodes":[]}',
    })
  })

  // One exact-equality assertion: it proves the folder was created, the extension comes from
  // the kind, and no staging file was left behind.
  //
  // The name is the document's own. It was the id — a uuid — which is what the explorer showed
  // the user beside a tab bearing the title, two names for one document.
  it('creates the landing folder, names the file after the document, and leaves no staging file', async () => {
    await documents.write('doc-1', 'scene', { title: 'Untitled', content: '{}' })
    expect(await held(SCENES)).toEqual(['Untitled.gltf'])
  })

  /**
   * 🛑 The whole of what a script is on disk — the text, and nothing around it. And the ID that
   * comes back is the file's STEM, not the one it was written under: nothing in a `.ts` can
   * carry an id, so a renamed script is a different document to the layout and the recent list.
   */
  it('writes a script as the text it is, and lists it under Code by its file name', async () => {
    // The folder the window hands it, which is `documentFolderOf('script')` — this side falls
    // back to the same answer when a caller names none.
    await documents.write(
      'doc-1',
      'script',
      { title: 'Walk', content: 'export default 1\n' },
      false,
      { folder: 'scripts' },
    )

    expect(await readFile(join(root, 'scripts', 'Walk.ts'), 'utf8')).toBe('export default 1\n')
    expect(await documents.list()).toEqual([
      { id: 'Walk', kind: 'script', title: 'Walk', workspace: 'code', path: 'scripts/Walk.ts' },
    ])
  })

  /**
   * 🛑 Under the id the DISK gives it — its stem — and that is why the window writes a script
   * before it opens a tab on it. Under a fresh uuid, `locate` could never find this file again
   * and every save would lay a `Walk 2.ts`, `Walk 3.ts` beside it, autosave included.
   */
  it('writes a script twice into the one file, its path being its identity', async () => {
    const draft = (content: string) => ({ title: 'Walk', content })
    await documents.write('Walk', 'script', draft('a\n'), false, { folder: 'scripts' })
    await documents.write('Walk', 'script', draft('b\n'), false, { folder: 'scripts' })

    expect(await readdir(join(root, 'scripts'))).toEqual(['Walk.ts'])
    expect((await documents.read('Walk', 'script'))?.content).toBe('b\n')
  })
})
