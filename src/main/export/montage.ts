import { localizedError } from '@shared/localizedError'
import { basename } from 'node:path'
import { z } from 'zod'
import { taskRatio } from '@shared/domain/taskProgress'
import { exportTargetOf } from '@shared/domain/exportRegistry'
import { isBundleEntry, MAX_CONTENT_BYTES } from '@shared/domain/otioz'
import { CHANNELS, EVENTS, type MontageExportRequest } from '@shared/ipc'
import { handle } from '@main/ipc/handle'
import { sendToSender } from '@main/ipc/broadcast'
import { fileInsideProject } from '@main/project/fileInsideProject'
import { pathSegment } from '@main/validation'
import type { BundleClient } from '@main/bundle/bundleClient'
import type { BundleMedium } from '@main/bundle/bundleProtocol'
import type { RunningTasks } from '@main/task/runningTasks'
import { writePickedFile } from './writePickedFile'

export type MontageHandlerDeps = {
  /** Injected, like every dialog: `dialog` needs a live app, which no test has. */
  pickSavePath: (name: string, extension: string) => Promise<string | null>
  /** Where the open project sits, or nothing when none is. Injected as the folder writer's is. */
  projectPath: () => string | null
  /** The process that packs the archive — injected as the waveform's client is, same reason. */
  bundles: () => BundleClient
  running: RunningTasks
}

/** The widest a cut gets. A bundle carries the media beside it, never a clip each. */
const MAX_MEDIA = 2048

/**
 * A medium the bundle cannot take: gone from the disk, or sitting outside the open project.
 *
 * One error for both because this side answers both the same way — `fileInsideProject` says no
 * without saying which — and naming only one of them sends somebody hunting for a file that is
 * exactly where they left it.
 */
class UnreachableMediumError extends Error {
  constructor(readonly entry: string) {
    super(localizedError('bundleMediumUnreachable', { entry }).message)
  }
}

// `entry` becomes a path INSIDE the archive, and the sandboxed side names it: unchecked, the
// studio would emit a zip-slip file and hand it to somebody else.
const medium = z.object({ source: z.string(), entry: z.string().refine(isBundleEntry) })

const montageExport = z
  .object({
    // Only ever a map key on this side, so nothing about it needs to be a path — but bounded,
    // since an unbounded string from the sandbox becomes an entry in a table this process keeps.
    id: z.string().min(1).max(64),
    name: pathSegment,
    target: z.union([
      z.literal('montage.otio'),
      z.literal('montage.otioz'),
      z.literal('montage.edl'),
      z.literal('montage.fcpxml'),
    ]),
    // Bytes, not code units: a cut full of accented clip names encodes to up to three times its
    // length in UTF-8, so the ceiling a `.length` holds is three times the one meant here.
    content: z.string().refine(text => Buffer.byteLength(text, 'utf8') <= MAX_CONTENT_BYTES),
    media: z.array(medium).max(MAX_MEDIA).optional(),
  })
  // Two media under one entry is one rush's pixels landing under the other's clip — and a zip
  // holding the same path twice is a file readers disagree about.
  .refine(value => new Set(value.media?.map(one => one.entry)).size === (value.media?.length ?? 0))

/**
 * Writing the montage out. The cut alone, or the cut with its media inside it.
 *
 * The bundle is the one that settles the Media Pool of another application, and it is also the
 * one that reads files: every url is resolved against the OPEN PROJECT before anything is opened,
 * so a montage naming `/etc/passwd` packs nothing.
 */
export function registerMontageHandlers({
  pickSavePath,
  projectPath,
  bundles,
  running,
}: MontageHandlerDeps): void {
  handle(CHANNELS.montageExport, async (event, request) => {
    const { id, name, target, content, media }: MontageExportRequest = montageExport.parse(request)
    const { extension } = exportTargetOf(target)

    // Both of the text targets take the same road: what tells them apart is what the window
    // composed, and this side writes the bytes it was handed either way.
    if (target !== 'montage.otioz') {
      return writePickedFile(() => pickSavePath(name, extension), new TextEncoder().encode(content))
    }

    const root = projectPath()
    // A bundle names its media relative to the project, so without one there is nothing to
    // resolve them against — and every path would be refused one by one for the wrong reason.
    if (!root) return null

    // Named to the table BEFORE anything long starts. The window shows the row and its stop
    // button from the moment it invokes, so an id only registered once the media are resolved and
    // the dialog has answered would answer `false` to every press until then — and the export
    // would run to completion and be reported as a success.
    return running.run(id, async signal => {
      const resolved: BundleMedium[] = []
      for (const one of media ?? []) {
        const path = await fileInsideProject(root, one.source)
        // Both causes at once, deliberately: this side cannot tell « gone » from « out of bounds »
        // without saying which, and « go find a file that is not there » sends somebody looking
        // for a rush sitting exactly where they left it.
        if (!path) throw new UnreachableMediumError(one.entry)
        resolved.push({ ...one, path })
      }

      const destination = await pickSavePath(name, extension)
      if (!destination) return null

      const written = await bundles().write({
        path: destination,
        content,
        media: resolved,
        // To the window that asked, never broadcast: the row belongs to one status line, and a
        // second window would show a bar for an export it cannot stop.
        onStep: (done, total) =>
          sendToSender(event.sender, EVENTS.taskProgress, {
            id,
            ratio: taskRatio(done, total),
          }),
        signal,
      })

      // The name, never the path: where a file sits is this side's business, as everywhere here.
      return written ? basename(destination) : null
    })
  })
}
