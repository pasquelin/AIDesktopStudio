import { create } from 'zustand'
import { refFromString, refToString } from '@shared/domain/ref'
import { byCodeUnit } from '@shared/text'
import type { CodeProblem } from '@/engines/code/CodeEditor'
import { getBridge } from '@/services/bridge'
import { withoutKey } from '@/helpers/objects'
import { documentById, useDocuments } from './documents'

/** One script of the project, as the editor holds it. */
export type CodeFile = {
  /** `script:<path>` — the same reference a `Script` component carries and a fault names. */
  script: string
  /** What the disk last answered, so a change is told from a re-read. */
  saved: string
  source: string
}

export type CodeStoreState = {
  files: Record<string, CodeFile>
  /**
   * 🛑 Bumped by what writes a script from OUTSIDE the editor — a read off disk, a model — and
   * never by a keystroke. It is what the editor watches: pushing the store's text back on every
   * letter typed sends a version that is one gesture behind, which undoes the gesture, drops the
   * selection and moves the caret.
   */
  revision: number
  resourceRevisions: Record<string, number>
  resourceIncarnations: Record<string, string>
  problems: readonly CodeProblem[]
  /**
   * Where the cursor is wanted next, put there by whoever names a place — a problems row, or a
   * runtime error of a game that just ran. Cleared by the editor once it has moved.
   */
  goto: { script: string; line: number; column: number } | null
  /** Every script of the project, read whole. What a Play compiles is the same list. */
  reload: () => Promise<void>
  edited: (script: string, source: string) => void
  noted: (problems: readonly CodeProblem[]) => void
  /**
   * Puts a whole text into a script, whether or not the editor already held it.
   *
   * 🛑 Answers FALSE rather than overwriting work an author has not saved: the text comes from
   * outside the window — a model — and `⌘Z` does not reach into the code editor.
   */
  wrote: (script: string, source: string) => boolean
  /** Puts the cursor there. Opening the TAB is `openScriptAt` — a store does not reach the centre. */
  goTo: (script: string, line: number, column: number) => void
  /** Said by the editor once the cursor moved, so the same place is not jumped to twice. */
  arrived: () => void
  /** What the disk answered for a tab that has just opened — the text, and nothing to save yet. */
  installed: (script: string, source: string) => void
  /** Marks the text the disk now holds, after a ⌘S wrote it through the document channel. */
  committed: (script: string, source: string) => void
  /** Drops a script a closed tab was holding. */
  forget: (script: string) => void
  /** Writes it into the project. Answers whether the main process took it. */
  save: (script: string) => Promise<boolean>
}

export const useCode = create<CodeStoreState>()((set, get) => ({
  files: {},
  revision: 0,
  resourceRevisions: {},
  resourceIncarnations: {},
  problems: [],
  goto: null,

  reload: async () => {
    const held = (await getBridge()?.game.scripts()) ?? []
    const files: Record<string, CodeFile> = {}
    for (const file of held) {
      const script = scriptRefAt(file.path)
      // What is being TYPED wins over what the disk answered: a Play re-reads every script, and
      // an author who has not saved must not watch their work replaced under the cursor.
      const editing = get().files[script]
      files[script] = {
        script,
        saved: file.source,
        source: editing && editing.source !== editing.saved ? editing.source : file.source,
      }
    }
    set(state => {
      // 🛑 A script born in a tab has no file yet, so the walk cannot see it: dropping it would
      // erase a starter — and every keystroke since — the first time a Play re-read the project.
      for (const [script, held] of Object.entries(state.files)) {
        if (!(script in files) && isCodeDirty(held)) files[script] = held
      }

      return {
        files,
        revision: state.revision + 1,
        resourceIncarnations: Object.fromEntries(
          Object.keys(files).map(script => [
            script,
            state.resourceIncarnations[script] ?? crypto.randomUUID(),
          ]),
        ),
        // Dropped with the walk: a problem of the project before this one names a script that is
        // no longer there, and clicking it would open a tab on a file nothing holds.
        problems: state.problems.filter(problem => problem.script in files),
      }
    })
  },

  edited: (script, source) => {
    set(state => {
      const held = state.files[script]
      // 🛑 Refused for a script the store has not read, and it is NOT an oversight: `holds` is
      // read off this map, and `restoreDocument` re-reads it after its await — an entry made
      // here would make it skip the install and lose what the file held.
      if (!held || held.source === source) return state
      return {
        files: { ...state.files, [script]: { ...held, source } },
        resourceRevisions: {
          ...state.resourceRevisions,
          [script]: (state.resourceRevisions[script] ?? 0) + 1,
        },
        resourceIncarnations: {
          ...state.resourceIncarnations,
          [script]: state.resourceIncarnations[script] ?? crypto.randomUUID(),
        },
      }
    })
  },

  noted: problems => set({ problems }),

  wrote: (script, source) => {
    const held = get().files[script]
    if (held && held.source !== held.saved) return false

    set(state => ({
      files: { ...state.files, [script]: { script, saved: held?.saved ?? '', source } },
      revision: state.revision + 1,
      resourceRevisions: {
        ...state.resourceRevisions,
        [script]: (state.resourceRevisions[script] ?? 0) + 1,
      },
      resourceIncarnations: {
        ...state.resourceIncarnations,
        [script]: state.resourceIncarnations[script] ?? crypto.randomUUID(),
      },
    }))
    return true
  },

  goTo: (script, line, column) => set({ goto: { script, line, column } }),

  arrived: () => set({ goto: null }),

  installed: (script, source) => {
    set(state => ({
      files: { ...state.files, [script]: { script, saved: source, source } },
      revision: state.revision + 1,
      resourceRevisions: {
        ...state.resourceRevisions,
        [script]: (state.resourceRevisions[script] ?? 0) + 1,
      },
      resourceIncarnations: {
        ...state.resourceIncarnations,
        [script]: state.resourceIncarnations[script] ?? crypto.randomUUID(),
      },
    }))
  },

  committed: (script, source) => {
    set(state => {
      const held = state.files[script]
      return held ? { files: { ...state.files, [script]: { ...held, saved: source } } } : state
    })
  },

  forget: script =>
    set(state => ({
      files: withoutKey(state.files, script),
      resourceRevisions: withoutKey(state.resourceRevisions, script),
      resourceIncarnations: withoutKey(state.resourceIncarnations, script),
    })),

  save: async script => {
    const held = get().files[script]
    const ref = refFromString(script)
    if (!held || ref?.kind !== 'script') return false

    const written = (await getBridge()?.game.writeScript(ref.path, held.source)) ?? false
    if (written) get().committed(script, held.source)
    return written
  },
}))

/** The `script:` reference a path spells, for a caller holding the descriptor rather than an id. */
export const scriptRefAt = (path: string): string => refToString({ kind: 'script', path })

/**
 * The path back out of a `script:` reference — the value itself when it is not one, so a
 * component written before references existed still names a file rather than nothing.
 */
export function scriptPathOf(script: string): string {
  const ref = refFromString(script)
  return ref?.kind === 'script' ? ref.path : script
}

/** The `script:` reference of an OPEN document — `null` once the descriptor has left the store.
 * The centre keys tabs by document id where everything else names a script by PATH. */
export function scriptRefOf(documentId: string): string | null {
  const path = documentById(useDocuments.getState(), documentId)?.path
  return path === undefined ? null : scriptRefAt(path)
}

/**
 * Every script of the project that has just been adopted, the one before it dropped whole.
 *
 * 🛑 Whole, not tab by tab: a `script:` reference is built from a document DESCRIPTOR, and by the
 * time a project change forgets its documents there is none left to build one from — the scripts
 * of the project being left would stay in the store, and a ⌘Q would write them into the new one.
 */
export async function readProjectScripts(): Promise<void> {
  useCode.setState({
    files: {},
    resourceRevisions: {},
    resourceIncarnations: {},
    problems: [],
    goto: null,
  })
  await useCode.getState().reload()
}

/** The script a document holds, or nothing — the crossing `SCRIPT_IO` reads on every call. */
export function codeFileOf(documentId: string): CodeFile | undefined {
  const script = scriptRefOf(documentId)
  return script === null ? undefined : useCode.getState().files[script]
}

/**
 * The scripts of the project, in one order — what a Play compiles and what `script.list` says.
 * Takes the FILES, so a memo can hold it: it builds an array, and a selector that does loops.
 */
export function codeFilesOf(state: Pick<CodeStoreState, 'files'>): readonly CodeFile[] {
  return Object.values(state.files).sort((one, other) => byCodeUnit(one.script, other.script))
}

/** Whether that file holds something the disk does not. Takes the FILE, so a memo can hold it. */
export function isCodeDirty(file: CodeFile | undefined): boolean {
  return file !== undefined && file.source !== file.saved
}
