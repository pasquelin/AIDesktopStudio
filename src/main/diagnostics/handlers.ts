import { CHANNELS, type LogScope } from '@shared/ipc'
import type { ActivityTopic } from '@shared/domain/activity'
import { handle } from '@main/ipc/handle'
import { log } from '@main/log'
import type { ActivityLog } from '@main/project/activityLog'
import { parseLogEntry, parseTraceEntry } from './validation'

/**
 * Which part of the journal a renderer scope belongs to. A closed union on both sides, so a new
 * scope cannot be added without deciding where its failures are read.
 */
const TOPIC_OF_SCOPE: Record<LogScope, ActivityTopic> = {
  'scene.model': 'document',
  'scene.bvh': 'document',
  'scene.carved': 'document',
  'scene.player': 'document',
  'scene.playerParts': 'document',
  'scene.texture': 'document',
  'scene.animation': 'document',
  'scene.export': 'document',
  'scene.post': 'document',
  'scene.render': 'document',
  // With the document although what it writes lands in the project: the subject is the scene
  // that could not be drawn, and the tab is what the user has to act on.
  'scene.capture': 'document',
  // With the document, as every other export is: it writes outside the project, and what its
  // failure says something about is the sequence that was open.
  'sequence.export': 'document',
  'sequence.import': 'document',
  // With the PROJECT, unlike its neighbours: this one writes inside the project folder, and what
  // a reader looks for afterwards is the folder that was or was not created.
  'document.export': 'project',
  'material.map': 'document',
  'material.channel': 'document',
  'material.seam': 'document',
  // With the document, not the library: an export writes outside the project, and what its
  // failure says something about is the texture that was open.
  'material.export': 'document',
  // A chunk three renamed upstream, so a material setting silently stopped applying. Read with
  // the document because that is where it shows — as a slider that moves nothing.
  'material.shader': 'document',
  'skybox.source': 'document',
  'skybox.probes': 'document',
  'skybox.export': 'document',
  'canvas.layer': 'document',
  'canvas.place': 'document',
  // The document, which is the script the answer could not be written into.
  'code.land': 'document',
  // With the document, not the shelf: what these three sites are about is a document that does
  // not measure its picture. The asset is the victim, the document is the subject — and reading
  // them by subject is how a user finds the tab to fix.
  'canvas.size': 'document',
  // Same reading as its neighbour: the subject is the document that outgrew its source file,
  // and the tab is what the user has to act on.
  'canvas.edit': 'document',
  'canvas.smartSelect': 'document',
  'canvas.smartComment': 'document',
  'image.export': 'document',
  'document.load': 'document',
  'document.save': 'document',
  'document.close': 'document',
  'document.delete': 'document',
  'document.rename': 'document',
  'assets.reveal': 'library',
  'assets.rename': 'library',
  'assets.retype': 'library',
  // An asset with nowhere to go is read with the shelf it was double-clicked in, not with the
  // document that refused it — there is none, and that is exactly what the line says.
  'assets.open': 'library',
  // Read with the shelf whose tile is now behind, not with the document — that one was saved.
  // The drift warning that used to justify this line moved to `canvas.size`, and ⇧⌘S to
  // `assets.copy`: what is left is ⌘S failing to write the asset, which is what this line said.
  'assets.save': 'library',
  // The copy lands in the shelf, and that is where a user goes looking for it — including in the
  // one case where it arrived and no document names it.
  'assets.copy': 'library',
  // The sheet is made OF the shelf's pictures and is asked for from its bar, so a refusal is read
  // beside the tiles it was asked over — not with a document, which a sheet does not belong to.
  'assets.contactSheet': 'library',
  // `import`, with the lines the extraction itself writes: what it produces is bytes landing in
  // the project, and a failure filed away from its own outcome reads as a different event.
  'assets.extract': 'import',
  // The shelf of recent projects: none of its three rows is about the project that is open in
  // particular, and all three are about a folder — read with the project topic the main process
  // already writes there.
  'project.reveal': 'project',
  'project.forget': 'project',
  'project.trash': 'project',
  'project.close': 'project',
  'project.rename': 'project',
  // A face that will not open is read where the document it was set in is read: the caption is
  // still there, drawn in the fallback, and this is what says why it does not look right.
  'font.face': 'document',
  'shell.render': 'shell',
  'shell.layout': 'shell',
  'shell.menu': 'shell',
  // A monitor belongs to the sequence it shows, so this is read where that document's own
  // failures are — not with the shell's, which is where the window and its menus report.
  'sequence.mirror': 'document',
  // With the PROJECT, not the library: what failed is a question about a file in the project
  // folder, asked before any asset exists — and the folder is where the reader will look.
  'explorer.open': 'project',
}

/**
 * The renderer's own failures. Without this channel they have nowhere to go: `console.error` in
 * a component leaves nothing behind in a packaged build.
 *
 * They reach the journal through here rather than through each caller, for the same reason the
 * API failures go through `reducedBy` — this IS the funnel, and `reportFailure` already
 * deduplicates on the other side (an engine is rebuilt on every detach, invariant 3).
 *
 * The message is the renderer's own: it has no SDK, so nothing it writes carries a request, and
 * `MAX_LOG_MESSAGE` bounds it on both sides of the boundary.
 */
export function registerDiagnosticsHandlers(journal: () => ActivityLog): void {
  handle(CHANNELS.diagnosticsReport, (_event, entry) => {
    const { level, scope, message } = parseLogEntry(entry)
    // Prefixed here rather than sent prefixed, so a line can never claim to come from this side.
    log[level](`renderer/${scope}`, message)

    journal().record({
      level,
      topic: TOPIC_OF_SCOPE[scope],
      messageKey: `activity.scope.${scope}`,
      detail: message,
    })
  })

  // The journal is deliberately not written here: what reaches this channel names no gesture and
  // no document, so a row would raise a toast the reader can do nothing about.
  handle(CHANNELS.diagnosticsTrace, (_event, entry) => {
    const { scope, message } = parseTraceEntry(entry)
    log.error(`renderer/${scope}`, message)
  })
}
