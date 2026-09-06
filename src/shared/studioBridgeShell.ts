import type { AiOverview, ChoiceScope, OwnModelProfile } from './domain/aiOverview'
import type { AiRoleId, RoleProvider } from './domain/aiRole'
import type { NewDocumentAnswer, NewDocumentAsk } from './domain/newDocument'
import type { NewsPage, NewsTopic } from './domain/news'
import type { CommandId, CommandScope, MenuAbility, MenuCheck } from './domain/command'
import type { ContextMenuItem } from './domain/contextMenu'
import type { SttEvent, SttSnapshot } from './domain/dictation'
import type { Language } from './i18n/languages'
import type { ToolId, ToolSurface } from './domain/tool'
import type { UpdateState } from './domain/update'
import type { WindowPage, WindowState } from './domain/window'
import type {
  MaterialExportCommand,
  NewDocumentRequest,
  RecentOpenRequest,
  SceneAddRequest,
  SceneCaptureCommand,
  SceneDisplayRequest,
  SceneExportCommand,
  SkyboxExportCommand,
  ToolRequest,
  Unsubscribe,
} from './ipcEvents'
import type { LogEntry, TraceEntry } from './ipcDiagnostics'

export type StudioBridgeShell = {
  /**
   * The model manager: which AI serves each role, what the machine can hold, and what to install.
   *
   * Everything answers the WHOLE overview rather than a delta. It is read when a screen opens and
   * after a gesture, never in a loop, and one row of it depends on a memory reading the window
   * does not hold — a partial answer would have the two sides disagree.
   */
  ai: {
    overview: () => Promise<AiOverview>
    /**
     * Writes the choice for a role, or clears it with `null` — which is not "none": the role
     * falls back to whatever the machine offers, and the local side wins.
     *
     * `scope` decides where it lands: the application default, or the open project alone. Asking
     * for `project` with none open is refused rather than silently written to the default.
     */
    choose: (
      role: AiRoleId,
      provider: RoleProvider | null,
      scope: ChoiceScope,
    ) => Promise<AiOverview>
    chooseMany: (
      writes: readonly { role: AiRoleId; provider: RoleProvider | null }[],
      scope: ChoiceScope,
    ) => Promise<AiOverview>
    /** Fetches a model's files. One at a time: a second would compete for the same disk. */
    install: (modelId: string) => Promise<AiOverview>
    cancelInstall: () => Promise<AiOverview>
    /** Puts Ollama on this computer when it is missing. Same disk lock as a model install. */
    installOllama: () => Promise<AiOverview>
    cancelInstallOllama: () => Promise<AiOverview>
    /** Asks the local engine what its tensor libraries are missing. Wakes no door. */
    readEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
    /** Installs exactly what it named, with the interpreter the app ships. Cancellable. */
    installEngine: (profile?: OwnModelProfile) => Promise<AiOverview>
    cancelInstallEngine: () => Promise<AiOverview>
    /**
     * Deletes the files. The choices that named it are left alone — they fall back on their own.
     *
     * A model the PERSON supplied loses its entry and keeps its file: they put it there, and the
     * studio was merely pointed at it.
     */
    remove: (modelId: string) => Promise<AiOverview>
    /**
     * Holds the weights in memory — "activate", and nothing about visibility.
     *
     * Answers the overview whatever happened: a machine too small leaves `loadFailure` set with
     * the two figures that were weighed, never an exception the window would have to word.
     */
    load: (modelId: string) => Promise<AiOverview>
    cancelLoad: () => Promise<AiOverview>
    unload: (modelId: string) => Promise<AiOverview>
    /**
     * Asks for a weights file and records what its header says — rank 3 of ADR-20.
     *
     * The picker is opened by the MAIN process, which is where a native dialog belongs, so this
     * accepts only the import profile. Answers the overview unchanged when the person
     * closed the dialog, and rejects when the file is not one the studio can read.
     */
    addOwnModel: (profile?: OwnModelProfile, taskId?: string) => Promise<AiOverview>
    onChanged: (callback: (overview: AiOverview) => void) => Unsubscribe
  }

  dictation: {
    /** The state as it stands, for a window that arrives after the events it missed. */
    state: () => Promise<SttSnapshot>
    /**
     * Opens a session: asks the operating system for the microphone, loads the engine if it is
     * not resident, and starts accepting audio. Resolves once the answer is known — which may
     * be `permissionRequired` or `modelMissing` rather than success.
     */
    start: () => Promise<void>
    /** Closes the segment in flight, so the last words are transcribed rather than dropped. */
    stop: () => Promise<void>
    /** Drops the segment in flight. What was said is not transcribed and not inserted. */
    cancel: () => Promise<void>
    /**
     * One chunk of 16-bit PCM at 16 kHz. Fire and forget, like `diagnostics.report`: nothing
     * decides on the answer, and awaiting one would put a round trip on every 100 ms of speech.
     */
    push: (chunk: ArrayBuffer) => Promise<void>
    downloadModel: () => Promise<void>
    cancelDownload: () => Promise<void>
    /**
     * Opens the operating system's microphone privacy screen. Takes no address: a renderer that
     * could name what gets opened would be a renderer that can open anything.
     */
    openPrivacySettings: () => Promise<void>
    onEvent: (callback: (event: SttEvent) => void) => Unsubscribe
  }

  window: {
    toggleFullScreen: () => Promise<void>
    state: () => Promise<WindowState>
    onState: (callback: (state: WindowState) => void) => Unsubscribe
    /**
     * The language this window draws in. Resolved by the main process and asked for rather than
     * worked out here, because the setting may say `'system'` and only that side sees what the
     * machine really prefers: the list this side can read starts with Chromium's UI locale,
     * which answers `en-US` for every system language Chromium ships no bundle for.
     *
     * The same value the native menu was built with, which is the point — an English menu above
     * a French window reads as a bug.
     */
    language: () => Promise<Language>
    onLanguage: (callback: (language: Language) => void) => Unsubscribe
    /**
     * Continues or drops a leave the renderer held while it asked about unsaved work.
     * `true` replays the original gesture (quit or close); `false` cancels it.
     */
    resumeLeave: (proceed: boolean) => Promise<void>
    /**
     * Tells the main process which surface is up, which panels it can currently open, which menu
     * rows are ticked and which of them can answer at all, so the menu can follow all four. None
     * of them can be worked out on the other side: whether the generator exists depends on a
     * model being chosen, and whether a scene is drawn in wireframe — or holds a selection to
     * export — is a fact of the document in front.
     *
     * The surface, not the workspace: the home covers the space behind it, and a menu built on
     * that space offered the image tools over a screen that edits no image.
     */
    setWorkspace: (
      /** `null` for a window with no docks at all — the skeleton window has no panels to offer. */
      surface: ToolSurface | null,
      tools: readonly ToolId[],
      checked: readonly MenuCheck[],
      abilities: readonly MenuAbility[],
      /**
       * Whose history Undo pops, `null` where nothing is undoable. The scope rather than the kind
       * of the tab in front: a window that shows no document at all — the skeleton window — still
       * holds a history, and the menu would otherwise reserve ⌘Z for the platform's own.
       */
      scope: CommandScope | null,
    ) => Promise<void>
  }

  /**
   * The video return — one window, revealed if it already exists.
   *
   * Nothing of the edit travels here: what the return SHOWS is published straight from one
   * renderer to the other, since every window of the studio runs the same bundle. This side only
   * owns what only the main process can do, which is to open a window.
   */
  mirror: {
    open: () => Promise<void>
  }

  /**
   * The module window. Same line as `mirror`: what it EDITS it reads for itself off the file the
   * route names, and the only thing this side owns is opening the window on one.
   */
  retargetWindow: {
    focusOrigin: () => Promise<void>
    open: (sessionId: string) => Promise<void>
  }

  playerModuleWindow: {
    open: (assetId: string) => Promise<void>
  }

  /**
   * The game window. Same line as `mirror`: what it PLAYS it reads for itself off a channel both
   * windows share, and the only things this side owns are opening the window and closing it.
   */
  gameWindow: {
    open: () => Promise<void>
    close: () => Promise<void>
    /**
     * The window went away — closed by its own traffic lights, or by anything else the studio did
     * not ask for. 🛑 The only way the studio learns it: a renderer that is being torn down has no
     * turn left in which to say so, so the fact belongs to the main process.
     */
    onClosed: (callback: () => void) => Unsubscribe
  }

  /**
   * The three windows of the Help menu. Same line as `mirror` above: what each one SHOWS it reads
   * for itself, and the only thing this side owns is opening the window.
   */
  help: {
    open: (page: WindowPage) => Promise<void>
  }

  /**
   * One file's information, as a window of its own — the studio's ⌘I.
   *
   * The only thing this side cannot do itself, exactly as `mirror` above: open a window. What
   * the window then SHOWS it reads for itself, through `project.fileFacts` and the catalogue.
   */
  fileInfo: {
    /** A path relative to the project folder — the spelling every panel names a file with. */
    open: (relative: string) => Promise<void>
  }

  /**
   * Naming a document, in a window of its own rather than a modal drawn over the studio.
   *
   * Three halves, and two windows: the studio ASKS and waits, the new window READS what was
   * asked and ANSWERS it. Closing that window is the answer `null` — cancelling has to mean
   * nothing was made, and the close button is the plainest way to say it.
   */
  newDocument: {
    ask: (ask: NewDocumentAsk) => Promise<NewDocumentAnswer | null>
    /** What the open window was asked, or `null` when nothing is pending. */
    request: () => Promise<NewDocumentAsk | null>
    answer: (answer: NewDocumentAnswer | null) => Promise<void>
  }

  menu: {
    /**
     * Draws these rows as a native context menu over the calling window, and answers the `id` of
     * the row that was chosen — `null` when the menu was dismissed.
     *
     * The window builds the rows because it is the only side that knows them: the labels come
     * from its own bundle, and `enabled` from state no other process replicates. What it does
     * NOT decide is where the menu appears — the system pops it at the pointer, which is the
     * whole reason for going through here rather than drawing a surface.
     */
    popup: (items: readonly ContextMenuItem[]) => Promise<string | null>
    onOpenTool: (callback: (request: ToolRequest) => void) => Unsubscribe
    onCommand: (callback: (command: CommandId) => void) => Unsubscribe
    onDocumentNew: (callback: (request: NewDocumentRequest) => void) => Unsubscribe
    onOpenRecent: (callback: (request: RecentOpenRequest) => void) => Unsubscribe
    onSceneAdd: (callback: (request: SceneAddRequest) => void) => Unsubscribe
    onSceneDisplay: (callback: (request: SceneDisplayRequest) => void) => Unsubscribe
    onSceneExport: (callback: (command: SceneExportCommand) => void) => Unsubscribe
    onSceneCapture: (callback: (command: SceneCaptureCommand) => void) => Unsubscribe
    onMaterialExport: (callback: (command: MaterialExportCommand) => void) => Unsubscribe
    onSkyboxExport: (callback: (command: SkyboxExportCommand) => void) => Unsubscribe
  }

  diagnostics: {
    onLog: (callback: (entry: LogEntry) => void) => Unsubscribe
    /**
     * The other direction: a failure born in the renderer, recorded by the process that owns the
     * log. Fire and forget — nothing decides anything on the answer, and a caller that awaited it
     * would make reporting a failure cost a round trip.
     */
    report: (entry: LogEntry) => Promise<void>
    /**
     * The same direction, for what nobody should be shown: this one stops at the log file. A
     * rejected promise is nothing the reader can act on — it names no gesture and no document —
     * so putting it in the journal would raise a toast about something already lost.
     *
     * Fire and forget, like `report`, and never deduplicated: a trace is read after the fact,
     * and how many times a thing happened is half of what it says.
     */
    trace: (entry: TraceEntry) => Promise<void>
  }

  news: {
    /**
     * One topic's rows — the models trending under a family, or the blog's articles.
     *
     * REJECTS rather than answering an empty page when the source refused: the band has to tell
     * "nothing published" from "nobody answered", and an empty list says the first.
     */
    read: (topic: NewsTopic) => Promise<NewsPage>
  }

  updates: {
    /**
     * The state as it stands. A window opened after the download finished would otherwise show
     * nothing until the next event, and there is no next event once an update is ready.
     */
    state: () => Promise<UpdateState>
    /**
     * Quits and installs. Only does anything once the state is `ready`; the update is applied
     * on the next quit regardless, so this is the shortcut, never the only way.
     */
    install: () => Promise<void>
    onState: (callback: (state: UpdateState) => void) => Unsubscribe
  }
}
