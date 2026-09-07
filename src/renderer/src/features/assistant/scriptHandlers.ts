import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { SCRIPT_EXTENSION } from '@shared/domain/game'
import { codeFilesOf, scriptPathOf, scriptRefAt, useCode } from '@/stores/code'
import { scriptTrouble } from '@/stores/play'
import { useProject } from '@/stores/project'
import type { ActionHandlers } from './actionHandler'
import { textOf } from './actionInputs'

/**
 * The `.ts` files a game runs, read and written from outside the window.
 *
 * 🛑 Through the EDITOR's own store, never the bridge directly: a script the panel is holding
 * unsaved would otherwise be read from disk as it was before, and written over without a word.
 * The refusal of a path that leaves the project is the main process's, and stays there.
 */

const noProject = (): ActionOutcome | null =>
  useProject.getState().project === null
    ? refused(
        'noProject',
        'no project is open, and a script is a file of one — projects.list answers what there is, and project.open opens one',
      )
    : null

export const SCRIPT_HANDLERS: ActionHandlers = {
  'script.list': async () => {
    const shut = noProject()
    if (shut) return shut

    await useCode.getState().reload()
    return {
      ok: true,
      data: {
        scripts: codeFilesOf(useCode.getState()).map(file => ({
          ref: file.script,
          path: scriptPathOf(file.script),
          lines: file.source.split('\n').length,
        })),
      },
    }
  },

  'script.read': async input => {
    const shut = noProject()
    if (shut) return shut

    const path = textOf(input, 'path') ?? ''
    await useCode.getState().reload()
    const held = useCode.getState().files[scriptRefAt(path)]
    if (!held) return refused('notFound', `no script "${path}" in this project`)

    return { ok: true, data: { ref: held.script, source: held.source } }
  },

  'script.write': async input => {
    const shut = noProject()
    if (shut) return shut

    const path = textOf(input, 'path') ?? ''
    if (!path.endsWith(SCRIPT_EXTENSION)) {
      return refused('badInput', `a script is a ${SCRIPT_EXTENSION} file, not "${path}"`)
    }
    const source = textOf(input, 'source') ?? ''

    const script = scriptRefAt(path)
    // 🛑 Refused BEFORE it lands, with the line: a file that names a module the sandbox does not
    // hold is one the next Play would refuse anyway, and a model told `ok` never looks again.
    const trouble = await scriptTrouble(script, source)
    if (trouble) {
      return refused('badInput', `line ${trouble.line}: cannot import ${trouble.message}`)
    }

    // 🛑 Refused rather than written over: an author typing in that very file would otherwise
    // lose it, with no word and no undo — `⌘Z` does not reach into the code editor.
    if (!useCode.getState().wrote(script, source)) {
      return refused('badInput', `"${path}" is open with unsaved changes`)
    }
    if (!(await useCode.getState().save(script))) {
      // Taken back out: a file the project refused must not sit in the list as one it holds,
      // where the window's own guard would retry writing it on the way out.
      useCode.getState().forget(script)
      return refused('badInput', `"${path}" is not a script of this project`)
    }
    return { ok: true, data: { ref: script } }
  },
}

/** The file a script reference names — the one reading of it, for whoever answers a path. */
