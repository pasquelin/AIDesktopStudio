export type LogLevel = 'info' | 'warn' | 'error'

/**
 * Where in the renderer a failure was born. An inventory rather than free text: it is what a
 * reader greps for, and a typo in a string nobody reads back is a line that never surfaces.
 * The main process checks a report against this very list — see `registerDiagnosticsHandlers`.
 */
export type LogScope =
  | 'scene.model'
  | 'scene.bvh'
  | 'scene.texture'
  // Apart from `scene.model`, though both read a `.glb`: a scope says a subject once, so an
  // animation that will not load would otherwise silence what the MODEL had to say.
  | 'scene.animation'
  /** A boolean cut that would not evaluate. The node goes on drawing its uncut brush. */
  | 'scene.carved'
  /** A second player module refused: which one plays would go back to being document order. */
  | 'scene.player'
  /** A gesture that would leave a player module standing without its body or its eye. */
  | 'scene.playerParts'
  | 'scene.export'
  /** A composition read back from a file another project wrote, or written out to one. */
  | 'scene.post'
  | 'scene.render'
  /** A still of the view, on its way into the project's pictures. */
  | 'scene.capture'
  | 'sequence.export'
  /** Reading a montage back from a bundle another application wrote. */
  | 'sequence.import'
  /** An export asked for from outside, whichever space rendered it. */
  | 'document.export'
  | 'material.map'
  | 'material.channel'
  | 'material.seam'
  | 'material.shader'
  | 'material.export'
  | 'skybox.source'
  /**
   * A working texture shipped beside the app that would not load. Apart from `skybox.source`,
   * whose sentence blames the picture the user chose: this one is a defect of our packaging.
   */
  | 'skybox.probes'
  | 'skybox.export'
  | 'canvas.layer'
  /**
   * Laying an asset down as a layer — a drop, or a double-click in the shelf. Apart from
   * `canvas.layer` above, which is SPONTANEOUS: that one comes from a mount effect and must
   * speak once, while this is a gesture and answers every time the hand repeats it.
   */
  | 'canvas.place'
  /**
   * A generated script the editor refused: it held changes nobody saved, and `⌘Z` does not reach
   * into the code editor — so the answer is announced rather than written over the work.
   */
  | 'code.land'
  // Not `assets.open`, and the split is the point: the document DOES open here, and the code
  // carries on building it. What is reported is that it could not take the size of the picture
  // behind it — which matters because ⌘S writes the document's size back over that picture.
  // Said under `assets.open`, it read « this asset has nowhere to go » while the asset was
  // appearing on screen.
  | 'canvas.size'
  // An edit sent to a model, whose picture the editor could not produce.
  | 'canvas.edit'
  | 'canvas.smartSelect'
  | 'image.export'
  | 'document.load'
  | 'document.save'
  | 'document.close'
  | 'document.delete'
  // A name the folder refused. The field has closed by then — it commits on blur as much as on
  // Enter — so the journal is the only place left to say the name did not take.
  | 'document.rename'
  | 'assets.reveal'
  | 'assets.open'
  // ⌘S reaches the asset behind a document as well as the document itself, and the two halves
  // fail apart: the file can be written while the picture behind it is not.
  | 'assets.save'
  // ⇧⌘S makes a COPY and never rewrites anything, so its failures cannot be read as a save that
  // did not happen. One of them fires once the copy is already on disk — under `assets.save` the
  // journal denied a write that had just succeeded.
  | 'assets.copy'
  /** A sheet of the chosen pictures, whose failure has no row of its own to appear in. */
  | 'assets.contactSheet'
  | 'assets.extract'
  // The catalogue refusing a new name. The field has closed by then — it commits on blur as much
  // as on Enter — so the journal is the only place left to say the name did not take.
  | 'assets.rename'
  // The catalogue refusing what a file IS. Corrected from a menu that closes on the pick, so
  // there is nothing left on screen for a refusal to appear in.
  | 'assets.retype'
  // The home's shelf: a folder moved since it was last opened is the ordinary case there, so
  // all three of its gestures need somewhere to say they did nothing.
  | 'project.reveal'
  | 'project.forget'
  | 'project.close'
  | 'project.rename'
  | 'font.face'
  // Not a document's: a render that threw and a stored layout React refused belong to the shell
  // holding the documents, and both used to leave nothing behind in a packaged build.
  | 'shell.render'
  | 'shell.layout'
  // A menu the system refused to draw. It leaves nothing on screen to look at — no surface, no
  // half-open flyout — so a right-click that does nothing at all is the only symptom there is.
  | 'shell.menu'
  // The video return is a WINDOW, and a window the main process refuses to open leaves nothing
  // on screen to look at — the button simply appears not to work.
  | 'sequence.mirror'
  // Asking what a file IS can FAIL, and a failure is not the answer « the studio has no editor
  // for this ». Swallowed, it sent a file the studio opens to the system instead — measured on a
  // `.glb` double-clicked while a download held the catalogue.
  | 'explorer.open'

/**
 * A logged line, travelling either way.
 *
 * Towards the renderer, it is what the main process wants visible in devtools: the API calls
 * leave from the main process, so they never show up in the renderer's Network tab, and without
 * this mirror the terminal the app was launched from is the only place to watch them.
 *
 * Towards the main process, it is a failure the renderer has no other way to record — the log
 * belongs to the main process, and a `console.error` in a component would leave nothing behind
 * in a packaged build. The scope is prefixed on arrival, so a line always says which side it
 * came from.
 */
export type LogEntry = {
  level: LogLevel
  scope: string
  message: string
}

/**
 * What a trace is about — and the reason it is a union of its own rather than another `LogScope`.
 *
 * A scope names a failure the reader is meant to SEE: it lands in the project's journal, under a
 * translated sentence, and shows up as a toast on the way. A trace names one that only ever
 * reaches the log file the main process owns. Nothing about it is drawn.
 *
 * Merging the two lists would cost both sides: `TOPIC_OF_SCOPE` would have to answer "nowhere"
 * for some of its rows, and the bundle guard would ask for a sentence no surface displays.
 */
export type TraceScope =
  // The renderer's own SILENCE, whether or not anything awaited: the calls that cross to the main
  // process throw their answer away, so a full disk on a rename reaches no `catch` — and a caught
  // rejection that ends in a state rather than a sentence says nothing either.
  'shell.dropped'

/** No level: a trace is always a failure, and a field with one legal value is a branch to test. */
export type TraceEntry = { scope: TraceScope; message: string }

export const LOG_LEVELS: readonly LogLevel[] = ['info', 'warn', 'error']

export const LOG_SCOPES: readonly LogScope[] = [
  'scene.carved',
  'scene.player',
  'scene.playerParts',
  'scene.model',
  'scene.bvh',
  'scene.texture',
  'scene.animation',
  'scene.export',
  'scene.post',
  'scene.render',
  'scene.capture',
  'sequence.export',
  'sequence.import',
  'document.export',
  'material.map',
  'material.channel',
  'material.seam',
  'material.shader',
  'material.export',
  'skybox.source',
  'skybox.probes',
  'skybox.export',
  'canvas.layer',
  'canvas.place',
  'code.land',
  'canvas.size',
  'canvas.edit',
  'canvas.smartSelect',
  'image.export',
  'document.load',
  'document.save',
  'document.close',
  'document.delete',
  'assets.reveal',
  'assets.open',
  'assets.save',
  'assets.copy',
  'assets.contactSheet',
  'assets.extract',
  'assets.rename',
  'assets.retype',
  'document.rename',
  'project.reveal',
  'project.forget',
  'project.close',
  'project.rename',
  'font.face',
  'shell.render',
  'shell.layout',
  'shell.menu',
  'sequence.mirror',
  'explorer.open',
]

export const MAX_LOG_MESSAGE = 4000

export const TRACE_SCOPES: readonly TraceScope[] = ['shell.dropped']
