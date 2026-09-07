import { describe, expect, it } from 'vitest'
import { commandIn, scopeOfWorkspace, type CommandScope } from '@shared/domain/command'
import { workspaceForKind, type DocumentKind } from '@shared/domain/document'
import { WRITTEN_SOURCES } from '@/components/testHarness'

/**
 * The half of the `SCOPE_BY_WORKSPACE` trap that `shared/` cannot see.
 *
 * A store built on `createDocumentStore` records an undo history from its first `runCommand`.
 * If the workspace it serves names no scope, the native `role: 'undo'` keeps ⌘Z, the window
 * never sees the key, and no menu row can name a command — the history fills up and nothing
 * can pop it. Silent, and it has happened three times: Skyboxes, the take editor, and Materials,
 * whose manual promised ⌘Z on an applied style for as long as nothing answered.
 *
 * `command.test.ts` holds the other half — a scope named in the table declares both commands —
 * but no test there can reach this one: which stores hold a history is a fact of `renderer/`.
 */
const HISTORY_STORES: Readonly<Record<string, DocumentKind>> = {
  'audioEdits.ts': 'audio',
  'canvases.ts': 'image',
  'scenes.ts': 'scene',
  'sequences.ts': 'sequence',
  'skyboxes.ts': 'skybox',
  'materials.ts': 'material',
  'gui.ts': 'gui',
}

/**
 * Read off the tree rather than listed by hand, so the table above cannot fall behind it.
 *
 * `documentStore.ts` declares the factory rather than calling it, and the bench builds one for
 * a fake state: neither edits a document, so neither serves a workspace.
 */
const FACTORY_ITSELF = 'documentStore'

/**
 * The stores whose subject is a FILE rather than a document — they serve no workspace, so the
 * rule below cannot read their scope off a kind. Named with the scope they answer under, and
 * held to the same bargain: a pair of commands, or ⌘Z fills a stack nothing can pop.
 */
const HISTORY_WITHOUT_A_DOCUMENT: Readonly<Record<string, CommandScope>> = {
  // The skeleton window edits a `.glb` of the project, and the studio has no document for one.
  'character.ts': 'character',
}

const storesWithHistory = (): string[] =>
  WRITTEN_SOURCES.filter(
    ([path, source]) =>
      path.startsWith('../stores/') &&
      !path.includes(FACTORY_ITSELF) &&
      source.includes('createDocumentStore<'),
  ).map(([path]) => path.split('/').pop() ?? '')

describe('every store that records a history', () => {
  /** A store added without an entry below leaves this file describing a tree it no longer reads. */
  it('is named in the table this file checks', () => {
    expect(storesWithHistory().sort()).toEqual(
      [...Object.keys(HISTORY_STORES), ...Object.keys(HISTORY_WITHOUT_A_DOCUMENT)].sort(),
    )
  })

  /**
   * The guard proper, keyed by KIND rather than by workspace — which is what it is worth: the
   * 3D space opens a scene AND an interface, so asking the space alone would answer the scene's
   * scope for both, green while ⌘Z on an interface pops the wrong history. It would have failed
   * on `textures.ts` the day it was written, for the older reason: a store held a history and
   * its workspace named no scope at all.
   */
  it('serves a document whose scope declares undo and redo', () => {
    const unreachable = Object.entries(HISTORY_STORES).filter(([, kind]) => {
      const scope = scopeOfWorkspace(workspaceForKind(kind), kind)
      return !scope || !commandIn(scope, 'undo') || !commandIn(scope, 'redo')
    })

    expect(unreachable.map(([store]) => store)).toEqual([])
  })

  /** The same bargain for the ones that serve no document: a scope, and both of its commands. */
  it('reaches undo and redo for a history whose subject is a file', () => {
    const unreachable = Object.entries(HISTORY_WITHOUT_A_DOCUMENT).filter(
      ([, scope]) => !commandIn(scope, 'undo') || !commandIn(scope, 'redo'),
    )

    expect(unreachable.map(([store]) => store)).toEqual([])
  })
})
