import { boundedDiagnosticMessage, localizedError } from '@shared/localizedError'
import { MAX_LOG_MESSAGE, type LogLevel, type LogScope, type TraceScope } from '@shared/ipc'
import { getBridge } from './bridge'

/**
 * The scopes whose failures follow a gesture the user made — a ⌘S, an export, a tab closed.
 *
 * They are reported every time. Everything else is reported once per subject, because an engine
 * is rebuilt on every detach and every reopen (invariant 3) and asks again for the same missing
 * asset: without that, a project whose folder moved refills the journal on each detach. That is
 * also why `document.load` is NOT here — it is reported from a mount effect, not from a gesture.
 *
 * A repeated gesture is the opposite case. Somebody pressed the key a second time precisely
 * because the first did nothing, and answering that with silence is how a save that keeps
 * failing looks like a save that worked.
 *
 * Here rather than in `shared/ipc.ts`: nothing about this crosses the boundary. It is what this
 * module does with a scope, not what a scope is.
 */
const GESTURE_SCOPES: ReadonlySet<LogScope> = new Set<LogScope>([
  'scene.export',
  // A refusal repeated is a person pressing again because the first press did nothing: silenced
  // from the second, a module that will not go in looks like a studio that ignores the toolbar.
  'scene.player',
  'scene.playerParts',
  // A menu row pressed again after a failure, like its export neighbours: silenced from the
  // second press, a capture that writes nothing looks exactly like one that worked.
  'scene.capture',
  'image.export',
  'document.save',
  'document.close',
  'document.delete',
  'assets.reveal',
  // Asked for again, refused again: a second generation the editor turns down is a second thing
  // the person paid for and did not get.
  'code.land',
  // A double-click is a gesture too: refusing the same asset twice must say so twice.
  'assets.open',
  // The same double-click, one step earlier — before there is an asset to open. A reader whose
  // file did nothing tries again; silenced from the second press, the studio looks broken.
  'explorer.open',
  // Same gesture, same rule — and here silence costs more: each reopening re-arms a ⌘S that
  // would write the document's size back over a bigger picture.
  'canvas.size',
  // A click that selects nothing is a click the person makes again: the model may be missing, the
  // engine silent, or the box too thin — silenced from the second, the tool looks simply broken.
  'canvas.smartSelect',
  'canvas.smartComment',
  // Picking an edit from the Image menu is a gesture too, and it was the one refusal of that menu
  // that said nothing at all — the caller swallowed everything it threw.
  'canvas.edit',
  // A drop and a double-click are gestures: a cloud row that has not been downloaded yet is
  // dropped again precisely because the first attempt did nothing visible.
  'canvas.place',
  // ⌘S is a gesture, and the half that reaches the asset can fail while the document is written.
  'assets.save',
  // ⇧⌘S is the same kind of gesture: asked again precisely because the first said nothing.
  'assets.copy',
  // Both rows of the home's project menu: chosen again precisely because the first attempt
  // said nothing, and a shelf whose row does nothing twice in silence reads as a dead menu.
  'project.reveal',
  'project.forget',
  // A drop is a gesture: dropping the same cloud picture twice must say so twice, which is the
  // very defect `feat/documents-erreurs` fixed for the others.
  'material.channel',
  // And so is pressing Measure: the second press happens precisely because the first said
  // nothing, and a silent button is how a measurement that keeps failing looks like one that ran.
  'material.seam',
  // Picking a row of the export menu is one as well, and it is the same row twice that says the
  // first attempt failed — silenced, a second try looks exactly like a dialog somebody dismissed.
  'material.export',
  'skybox.export',
  // The two of this branch, for that same reason and one more: both spend minutes before they can
  // fail, so a second press silenced is a wait nobody is told the outcome of.
  'sequence.export',
  'assets.contactSheet',
])

/**
 * Records a failure the renderer would otherwise swallow. Without this, a model that fails to
 * load is a node that draws nothing and says nothing.
 *
 * It goes to the main process, which owns the log, and from there into the project's journal —
 * which is what puts it on screen, as a toast and then as a line in the activity panel.
 *
 * Silent when there is no bridge — tests and a plain browser have none, exactly as everywhere
 * else `getBridge` is read.
 */
export function reportFailure(scope: LogScope, subject: string, error: unknown): void {
  // Said once per thing that failed — but only for the failures nobody asked for.
  if (!GESTURE_SCOPES.has(scope)) {
    const said = `${scope}:${subject}`
    if (reported.has(said)) return
    reported.add(said)
  }

  send('error', scope, lineFor(subject, error))
}

/**
 * Something the user has to be told that is not a failure: work that went through with less than
 * it was asked for. Never deduplicated — the same document opened twice loses the same thing
 * twice, and a second silence would read as a second open that went fine.
 */
export function reportNotice(scope: LogScope, message: string): void {
  send('warn', scope, message.slice(0, MAX_LOG_MESSAGE))
}

/**
 * The rejection is dropped on purpose: this IS the path a failure travels, and a failure to
 * report one has nowhere left to go. Silent with no bridge — tests and a plain browser have none.
 */
function send(level: LogLevel, scope: LogScope, message: string): void {
  void deliverDiagnostic(getBridge()?.diagnostics.report({ level, scope, message }))
}

/**
 * A failure the terminal keeps and no surface shows.
 *
 * Never deduplicated, unlike `reportFailure`: nothing here is read while it happens, and a
 * rejection firing on every detach is telling whoever reads the log precisely that.
 *
 * Bounded instead. A promise rejected inside an animation frame would send one message per
 * frame, and no path of this application is allowed an unbounded burst — a hundred lines already
 * say that something repeats.
 */
export function traceFailure(scope: TraceScope, subject: string, error: unknown): void {
  if (traced >= MAX_TRACES) return
  traced += 1

  void deliverDiagnostic(
    getBridge()?.diagnostics.trace({ scope, message: lineFor(subject, error) }),
  )
}

const MAX_TRACES = 100
let traced = 0

function lineFor(subject: string, error: unknown): string {
  return boundedDiagnosticMessage(subject, error, MAX_LOG_MESSAGE)
}

/**
 * A render React could not finish.
 *
 * The blamed component stands as the subject rather than the whole stack: the message becomes a
 * toast, and a toast is not where a stack is read. The deepest frame is the actionable line in
 * it, and it is also what dedupes a component that throws on every re-render.
 */
export function reportRenderFailure(error: unknown, componentStack: string | undefined): void {
  reportFailure('shell.render', blamedComponent(componentStack), error)
}

function blamedComponent(componentStack: string | undefined): string {
  return componentStack?.match(/^\s*at (\S+)/m)?.[1] ?? localizedError('unnamedComponent').message
}

const reported = new Set<string>()

/**
 * Lets a subject be reported again — the studio moved on, and a repeat would now be news. The
 * trace budget refills for the same reason: what filled it belonged to the project before.
 */
export function forgetReportedFailures(): void {
  reported.clear()
  traced = 0
}

async function deliverDiagnostic(report: Promise<void> | undefined): Promise<void> {
  try {
    await report
  } catch {
    // Reporting failures cannot report themselves without recursing through the broken channel.
  }
}
