import type { BundledAnimation } from './domain/animationLibrary'
import type { WindowNote } from './domain/assistantNote'
import type { Asset } from './domain/asset'
import type {
  AssistantAnswer,
  AssistantProgress,
  AssistantThought,
  AssistantWindow,
} from './domain/assistant'
import type { IngestProgress, MediaCapabilities } from './domain/media'
import type { ExternalFileImport } from './domain/externalFile'
import type { TaskProgress } from './domain/taskProgress'
import type {
  AssistantActionRequest,
  AssistantActionResult,
  AssistantVisualCaptureRequest,
  AssistantVisualCaptureResult,
  Unsubscribe,
} from './ipcEvents'
import type {
  FolderExportRequest,
  MontageExportRequest,
  MontageImportResult,
  PostPresetExportRequest,
  RenderFrameRequest,
  RenderStartRequest,
  SceneExportRequest,
} from './ipcExports'

export type StudioBridgeCreation = {
  post: {
    /**
     * Writes a post-processing composition wherever the save dialog lands, and answers the file
     * NAME — never the path, exactly as a scene export does.
     */
    export: (request: PostPresetExportRequest) => Promise<string | null>
    /**
     * Opens the picker and hands back what the chosen file HOLDS, as text. `null` when the
     * dialog was dismissed.
     *
     * Text and not a parsed object on purpose: the reader is `readPostPresetFile`, which drops
     * every effect this build has no code for and names them — a decision about the STUDIO, and
     * therefore one the window takes. This process only reads bytes off a disk.
     */
    import: () => Promise<string | null>
  }

  scene: {
    /**
     * Writes an exported scene wherever the save dialog lands. Answers the file name it was
     * written under, or `null` when the dialog was dismissed — the name, never the path: where
     * a file sits is the main process's business, exactly as for an asset.
     */
    export: (request: SceneExportRequest) => Promise<string | null>
  }

  montage: {
    /**
     * Writes the cut as an OpenTimelineIO file wherever the save dialog lands — what `render`
     * below does for the picture, this does for the edit. Answers the file name, never the path.
     */
    export: (request: MontageExportRequest) => Promise<string | null>
    /**
     * Reads a bundle back: opens the picker, unpacks the media into the project and gives each a
     * catalogue row, then answers the cut and what it relinks to. `null` when the picker was
     * dismissed, no project is open, or the read was stopped.
     *
     * The id is minted by the window, as an export's is, and for the same reason: unpacking is
     * minutes of disk, and a name only handed back at the end would leave them unstoppable.
     */
    import: (id: string) => Promise<MontageImportResult | null>
    /**
     * The cut's SOUND, one `.wav` per audible track, into a folder of its own — same writer and
     * same bargain as a sky's faces. Stems mean nothing apart: a dialogue track alone is not
     * the mix somebody judged, which is why this is a folder and not a save dialog per track.
     */
    stems: (request: FolderExportRequest) => Promise<string | null>
  }

  /**
   * Rendering a scene to a film, in three steps: a session is opened once the save dialog has
   * answered, frames are staged one by one, and the encode happens at the end.
   *
   * Staged rather than piped, and asked for BEFORE anything is computed: a render is minutes of
   * work, and neither a broken pipe nor a dismissed dialog should throw all of it away.
   */
  render: {
    /** Answers the session id, or `null` when the save dialog was dismissed. */
    start: (request: RenderStartRequest) => Promise<string | null>
    frame: (request: RenderFrameRequest) => Promise<void>
    /** Encodes what was staged. Answers the file name, never the path. */
    finish: (id: string) => Promise<string | null>
    cancel: (id: string) => Promise<void>
  }

  material: {
    /**
     * Writes an exported texture into a folder of its own, inside the one the dialog landed on.
     * Answers the folder's name, or `null` when the dialog was dismissed — the name, never the
     * path, exactly as a scene answers.
     */
    export: (request: FolderExportRequest) => Promise<string | null>
  }

  skybox: {
    /** The six faces of a sky, same bargain as a texture's folder — and the same writer. */
    export: (request: FolderExportRequest) => Promise<string | null>
  }

  /**
   * The two halves invariant 6 asks of a long task, for the ones this side RUNS — the bundle
   * being the one that matters, since it moves gigabytes with the window learning nothing. It
   * carries reading one back in as much as writing one out, which is why it is not named for the
   * export.
   *
   * What the window bakes itself — six faces of a sky, five channels of a material — is watched
   * and stopped where its loop lives and never comes through here.
   */
  tasks: {
    /** How far it has got. Silent for anything that finishes in one go. */
    onProgress: (callback: (progress: TaskProgress) => void) => Unsubscribe
    /**
     * Stops the task that was started under this id, half-written file and all. Answers whether
     * one was still running — an id that already finished is not a failure, it is a click that
     * arrived a moment late.
     */
    cancel: (id: string) => Promise<boolean>
  }

  /**
   * The typefaces the machine has installed. The studio's own three are not here: they ship
   * inside it, and `EMBEDDED_FONTS` names them without anyone having to ask.
   */
  fonts: {
    /** Every installed family, sorted, one cut each — see `systemFonts`. */
    list: () => Promise<string[]>
    /**
     * A face's outlines, as a font file the renderer can parse. `null` when the machine no
     * longer has that family, which is the missing-font hole a shared document opens.
     */
    read: (family: string) => Promise<Uint8Array | null>
  }

  /**
   * The animations shipped with the app — one folder per animation under `resources/animations`,
   * common to every project and read-only. Empty while none has been installed.
   */
  animations: {
    list: () => Promise<BundledAnimation[]>
  }

  media: {
    /**
     * Opens the native picker and links what was chosen — the file is never copied, so a
     * twenty-minute rush costs a catalogue row. Resolves once the assets exist, while their
     * ingest runs on and reports through `onProgress`.
     */
    ingest: () => Promise<ExternalFileImport>
    /**
     * Gives a file the project ALREADY holds a row in the catalogue, so the studio can open it
     * instead of handing it to the system — the explorer's double-click on a `.jpg` somebody
     * copied in by hand. The bytes stay exactly where they are, as `ingest` leaves them.
     *
     * `null` when the studio has no editor for that file: the caller then opens it outside,
     * which is what a `.txt` and a `.pdf` are meant to do. The path is relative to the project,
     * and one that leaves it is refused.
     */
    adopt: (relative: string) => Promise<Asset | null>
    cancel: (assetId: string) => Promise<void>
    capabilities: () => Promise<MediaCapabilities>
    onProgress: (callback: (progress: IngestProgress) => void) => Unsubscribe
  }

  assistant: {
    /**
     * Works out what a sentence meant, and answers what to do about it.
     *
     * Thinking is the main process's business because the key, the rate limiter and the job loop
     * are there; deciding and acting is the window's, because that is where the actions are and
     * where the person is looking. So this asks a question and answers a plan — it never runs
     * anything itself.
     */
    think: (request: AssistantThought) => Promise<AssistantAnswer>
    /**
     * 🛑 Stops the round IN FLIGHT, which the chain's own stop cannot: that one is read BETWEEN
     * two rounds, and a local model holds one for minutes with the machine at full tilt. The
     * pending `think` then rejects, which the window reads as the end of the chain.
     */
    stop: () => Promise<void>
    /**
     * An action the main process is asking THIS window to run, because it came from outside it.
     * Sent to the window in front alone — running it in every window at once is the trap the
     * native menu already avoids.
     */
    onAction: (callback: (request: AssistantActionRequest) => void) => Unsubscribe
    onVisualCapture: (callback: (request: AssistantVisualCaptureRequest) => void) => Unsubscribe
    /**
     * What the model is writing, while it writes it — this window's turn alone.
     *
     * The answer still arrives whole through `think`; this is what makes the wait readable. A
     * door that cannot stream simply never calls it, and the window then shows what it always did.
     */
    onStream: (callback: (progress: AssistantProgress) => void) => Unsubscribe
    /** What that window made of it, quoting the `callId` it was asked under. */
    actionResult: (result: AssistantActionResult) => Promise<void>
    visualCaptureResult: (result: AssistantVisualCaptureResult) => Promise<void>
    /**
     * What the chain just did, for the journal — a call run, a refusal, a question answered.
     *
     * 🛑 Through the MAIN and not written here: the prompt and the raw answer are composed and
     * read over there, and a reader following a turn needs both sides in one order.
     */
    note: (note: WindowNote) => Promise<void>
    /**
     * What the door in front reads in ONE go, asked before a turn rather than learned from one.
     * `null` where it names no window — which the composer says, rather than inventing a ratio.
     */
    window: () => Promise<AssistantWindow | null>
    /**
     * What a round trip carried, whole — the journal keeps only its size, and a briefing is
     * 90 505 characters. `null` for a line older than the ring, or written by another launch.
     */
    said: (key: string) => Promise<string | null>
  }
}
