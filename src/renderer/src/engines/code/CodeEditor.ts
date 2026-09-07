import type * as Monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import STUDIO_TYPES from '@game/api/studio.d.ts?raw'
import { loadOnce } from '@game/host/loadOnce'
import { cachedToken, onPaletteChange } from '@/engines/core/palette'

/** One thing wrong with a script, where an editor opens it. The shape a problems list reads. */
export type CodeProblem = {
  script: string
  message: string
  line: number
  column: number
  severity: 'error' | 'warning'
}

export type CodeEditorDeps = {
  host: HTMLElement
  /** Told on every keystroke, debounced by the caller if it writes to disk. */
  onChanged: (script: string, source: string) => void
  /** Told whenever the type worker has finished: the whole list, never a delta. */
  onProblems: (problems: readonly CodeProblem[]) => void
}

/** Monaco behind a façade with no React — invariant 4. The type WORKER makes every diagnostic. */
export class CodeEditor {
  private readonly editor: Monaco.editor.IStandaloneCodeEditor
  private readonly mounted: HTMLElement
  private readonly holding = new Set<string>()
  private readonly watching: Monaco.IDisposable[] = []
  private open: string | null = null

  constructor(
    private readonly monaco: typeof Monaco,
    deps: CodeEditorDeps,
  ) {
    defineStudioTheme(monaco)

    // 🛑 Its OWN node under the host, never the host itself: Monaco marks the element it is given
    // with `data-keybinding-context` and STRIPS it on dispose, so two editors sharing one host —
    // what a remount makes — leave the survivor unmarked, and no key reaches a command again.
    this.mounted = deps.host.ownerDocument.createElement('div')
    this.mounted.style.position = 'absolute'
    this.mounted.style.inset = '0'
    deps.host.appendChild(this.mounted)

    this.editor = monaco.editor.create(this.mounted, {
      // 🛑 Monaco's own dark theme with FOUR studio colours over it — see `defineStudioTheme`.
      // The forty syntax tokens stay Monaco's: mapping those is a lot of its own.
      theme: STUDIO_THEME,
      automaticLayout: true,
      minimap: { enabled: false },
      // The bar minimap would have filled: empty, it reads as a second border down the side.
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      fontLigatures: true,
      tabSize: 2,
      renderWhitespace: 'selection',
    })

    this.watching.push(
      { dispose: onPaletteChange(() => defineStudioTheme(monaco)) },
      monaco.editor.onDidChangeMarkers(() => deps.onProblems(this.problems())),
      this.editor.onDidChangeModelContent(() => {
        const script = this.open
        const model = this.editor.getModel()
        if (script && model) deps.onChanged(script, model.getValue())
      }),
    )
  }

  /** Shows that script, taking a hold on the one model its URI may have — see `SHARED`. */
  show(script: string, source: string): void {
    const model = this.hold(script, source)
    if (model.getValue() !== source) {
      // 🛑 Pushed as an EDIT, never `setValue`: the latter clears the command manager and every
      // decoration (`textModel.js`, `_setValueFromTextBuffer`), so a re-read after a Play would
      // cost an author their undo history and put the cursor back on 1,1.
      model.pushEditOperations(
        null,
        [{ range: model.getFullModelRange(), text: source }],
        () => null,
      )
    }
    this.open = script
    this.editor.setModel(model)
  }

  /** The shared model for that script, made on first ask, counted once per editor. */
  private hold(script: string, source: string): Monaco.editor.ITextModel {
    let held = SHARED.get(script)
    if (!held) {
      // `getModel` before `createModel`: the latter THROWS on a URI already taken, and a model
      // outliving this map is what a hot reload leaves behind.
      const uri = uriOf(this.monaco, script)
      const model =
        this.monaco.editor.getModel(uri) ??
        this.monaco.editor.createModel(source, 'typescript', uri)
      held = { model, holders: 0 }
      SHARED.set(script, held)
    }

    if (!this.holding.has(script)) {
      this.holding.add(script)
      held.holders += 1
    }
    return held.model
  }

  /** Lets that script go, and disposes its model once no editor is showing it any more. */
  private release(script: string): void {
    if (!this.holding.delete(script)) return

    const held = SHARED.get(script)
    if (!held) return

    held.holders -= 1
    if (held.holders > 0) return

    held.model.dispose()
    SHARED.delete(script)
  }

  /** Puts the cursor on that line and scrolls to it — what a console error opens. */
  reveal(line: number, column: number): void {
    this.editor.revealPositionInCenter({ lineNumber: line, column })
    this.editor.setPosition({ lineNumber: line, column })
    this.editor.focus()
  }

  /**
   * 🛑 Drops the model, and it MUST be called when a tab closes: a model left alive stays
   * synchronised with the type worker, and its markers keep feeding `problems()` — which reads
   * every model of the page, not the open one.
   */
  forget(script: string): void {
    this.release(script)
    if (this.open === script) this.open = null
  }

  /**
   * What the project itself declares — the names of its assets, its scenes, its prefabs.
   *
   * 🛑 Held per MODULE and skipped when unchanged, because the lib is: `typescriptDefaults` is
   * process-wide, so an editor per tab re-registering the same string bumps its version and makes
   * the worker re-typecheck every model of the project at each tab that opens.
   */
  declareProject(types: string): void {
    if (types === declaredProject) return

    projectLib?.dispose()
    projectLib = this.monaco.typescript.typescriptDefaults.addExtraLib(types, PROJECT_TYPES)
    declaredProject = types
  }

  /** Everything the type worker has to say, over every open script. */
  problems(): readonly CodeProblem[] {
    return this.monaco.editor
      .getModelMarkers({})
      .filter(marker => marker.severity >= this.monaco.MarkerSeverity.Warning)
      .map(marker => ({
        script: scriptOf(marker.resource.path),
        message: marker.message,
        line: marker.startLineNumber,
        column: marker.startColumn,
        severity: severityOf(marker.severity === this.monaco.MarkerSeverity.Error),
      }))
  }

  dispose(): void {
    for (const held of this.watching) held.dispose()
    for (const script of [...this.holding]) this.release(script)
    this.editor.dispose()
    this.mounted.remove()
  }
}

const STUDIO_TYPES_PATH = 'file:///node_modules/@studio/index.d.ts'
const PROJECT_TYPES = 'file:///node_modules/@studio/project.d.ts'

const STUDIO_THEME = 'ai-desktop-studio'

/** 🛑 The caret line is a FILL whose BORDER takes the same colour: Monaco's dark theme draws that
 * one as a rule above and below, which reads as a rectangle around the line. `chassis` and not
 * `elevated` — the latter is the hover tone, and reads as a band across the width. */
function defineStudioTheme(monaco: typeof Monaco): void {
  const line = cachedToken('--color-chassis')

  monaco.editor.defineTheme(STUDIO_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': cachedToken('--color-surface'),
      'editor.foreground': cachedToken('--color-text'),
      'editorLineNumber.foreground': cachedToken('--color-muted'),
      'editorLineNumber.activeForeground': cachedToken('--color-text'),
      'editor.lineHighlightBackground': line,
      'editor.lineHighlightBorder': line,
    },
  })
  monaco.editor.setTheme(STUDIO_THEME)
}

/**
 * 🛑 One model per URI, COUNTED, because a model belongs to the path and not to the editor that
 * happened to make it: a tab is one editor, a remount makes a second before the first has gone,
 * and Monaco throws on a URI already taken — then blanks the survivor when the maker disposes.
 */
const SHARED = new Map<string, { model: Monaco.editor.ITextModel; holders: number }>()

// Module-wide, like the registration it holds — see `declareProject`.
let projectLib: Monaco.IDisposable | null = null
let declaredProject: string | null = null

const uriOf = (monaco: typeof Monaco, script: string): Monaco.Uri =>
  monaco.Uri.parse(`file:///${script.replace(/^script:/, '')}`)

const scriptOf = (path: string): string => `script:${path.replace(/^\//, '')}`

const severityOf = (worst: boolean): CodeProblem['severity'] => (worst ? 'error' : 'warning')

/**
 * 🛑 Loaded on FIRST OPEN, never at startup. Measured out of `pnpm build` on 2026-08-27:
 * `editor.main` 6,1 Mo, `ts.worker` 11,5 Mo, `editor.worker` 492 Ko and 186 Ko of CSS — some
 * eighteen megabytes, more than twice what the spike suggested. The entry chunk is unchanged at
 * 1,78 Mo, which is the whole point of asking for it here.
 */
const loadMonaco = loadOnce(start)

export async function loadCodeEditor(deps: CodeEditorDeps): Promise<CodeEditor> {
  return new CodeEditor(await loadMonaco(), deps)
}

async function start(): Promise<typeof Monaco> {
  // 🛑 Before the first model: Monaco reads this global when it spawns a worker, and a CDN is
  // what it falls back to — which the content security policy refuses, silently and for ever.
  // Cast with a reason: `MonacoEnvironment` is a property of the worker global that Monaco's own
  // types declare on `Window`, and this file compiles against neither.
  ;(self as unknown as { MonacoEnvironment: Monaco.Environment }).MonacoEnvironment = {
    getWorker: (_id: string, label: string) =>
      label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker(),
  }

  // The ESM entry by its PATH: the package publishes no main a bundler or a test runner
  // resolves, and `editor.main` is the one that brings the TypeScript contribution with it.
  const monaco = await import('monaco-editor/editor/editor.main')
  const typescript = monaco.typescript.typescriptDefaults

  typescript.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    module: monaco.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    strict: true,
    noEmit: true,
    allowNonTsExtensions: true,
    // What makes a missing hook or a wrong asset name red: nothing else is in scope.
    lib: ['es2020'],
  })
  // Without it a model created after the worker started is typed against an empty world.
  typescript.setEagerModelSync(true)
  typescript.addExtraLib(STUDIO_TYPES, STUDIO_TYPES_PATH)

  return monaco
}
