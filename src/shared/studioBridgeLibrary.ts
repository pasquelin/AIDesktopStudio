import type { ActivityEntry, ActivityQuery } from './domain/activity'
import type { Asset, AssetChanges, AssetCounts, AssetQuery } from './domain/asset'
import type { FavoriteRecipe } from './domain/favorite'
import type { InstalledCharacter } from './domain/bundledCharacter'
import type { CharacterLevel } from './domain/characterLevel'
import type { GameManifest, GameScriptFile, GameState } from './domain/game'
import type { OraDocument } from './domain/openRaster'
import type { MaterialStyle } from './domain/style'
import type { CloudAsset, CloudPage, CloudQuery, ExploreQuery } from './domain/cloudAsset'
import type {
  CloseChoice,
  DocumentDescriptor,
  DocumentDraft,
  DocumentFile,
  DocumentKind,
  DocumentWrite,
} from './domain/document'
import type {
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitRemote,
  GitRepository,
  GitStashEntry,
} from './domain/git'
import type { GitDiff } from './domain/gitDiff'
import type { InstalledCheckerTexture } from './domain/checkerTexture'
import type { GameExportOutcome, GameExportRequest } from './domain/gameExport'
import type { PathKind } from './domain/settingsRegistry'
import type { SyncOutcome, SyncPlan, SyncPolicy } from './domain/sync'
import type { Unsubscribe } from './ipcEvents'
import type {
  SaveAnimationRequest,
  SaveAnimationThumbnailRequest,
  SaveAudioRequest,
  SaveLayeredRequest,
  SaveMeshRequest,
  ConvertMeshRequest,
  SavePictureRequest,
  SavePlayerModuleRequest,
  SaveTextureRequest,
} from './ipcExports'

export type StudioBridgeLibrary = {
  /**
   * Version control over the PROJECT folder — the user's own files. Nothing here reaches the
   * repository the studio itself is built from.
   */
  git: {
    /**
     * Everything the panel draws, in one answer. A union rather than a status plus a handful of
     * booleans: no project, no git on this machine, and a folder never initialised each want
     * their own screen, and asking three channels would let two of them disagree.
     */
    read: () => Promise<GitRepository>
    /** `git init` on the open project, plus the ignore file, then the state it left. */
    init: () => Promise<GitRepository>
    /**
     * Every gesture answers with the state it LEFT rather than with nothing. One round trip
     * instead of two, and no window in which two panels could draw a folder already out of date.
     */
    stage: (paths: readonly string[]) => Promise<GitRepository>
    unstage: (paths: readonly string[]) => Promise<GitRepository>
    /** Puts files back the way the last recorded version has them — see `canRestore`. */
    restore: (paths: readonly string[]) => Promise<GitRepository>
    commit: (message: string, amend: boolean) => Promise<GitRepository>
    /** Read when the menu opens rather than with every status: it costs a command of its own. */
    branches: () => Promise<GitBranch[]>
    createBranch: (name: string) => Promise<GitRepository>
    checkout: (name: string) => Promise<GitRepository>
    /**
     * A page of the history, newest first, across every branch. Paged rather than read whole: a
     * project of two years is tens of thousands of commits, and the band shows twenty.
     */
    log: (limit: number, skip: number) => Promise<GitCommit[]>
    /** What one recorded version changed. Read when a row is picked, never with the page. */
    commitFiles: (hash: string) => Promise<GitCommitFile[]>
    /**
     * What changed inside one file — within `commit`, or against the last recorded version when
     * it is `null`. `binary` is the ordinary answer for most of a studio project, and what sends
     * the panel to `bytes` below.
     */
    diff: (path: string, commit: string | null) => Promise<GitDiff>
    /**
     * The bytes of a file at one version, or as it stands on disk when `ref` is `null` — which
     * is how two versions of a picture are put side by side.
     *
     * `null` for a path that version does not hold, and for anything past the ceiling the main
     * process keeps: these cross the boundary and are held in a window, and a project holds video.
     */
    bytes: (path: string, ref: string | null) => Promise<Uint8Array | null>
    remotes: () => Promise<GitRemote[]>
    addRemote: (name: string, url: string) => Promise<GitRepository>
    /** Takes what the server has without touching the working tree. */
    fetch: () => Promise<GitRepository>
    pull: () => Promise<GitRepository>
    /** `setUpstream` on the first push of a branch — the one that has nothing to track yet. */
    push: (setUpstream: boolean) => Promise<GitRepository>
    /**
     * Settles a conflict by keeping one whole side, and marks it settled in the same breath.
     *
     * During a MERGE, `ours` is the branch that is out and `theirs` is what is being brought in.
     * The two swap during a rebase — one reason the studio pulls with `--ff-only` and offers no
     * rebase: a gesture whose meaning depends on which operation is running is a gesture nobody
     * can be sure of.
     */
    resolve: (paths: readonly string[], side: 'ours' | 'theirs') => Promise<GitRepository>
    abortMerge: () => Promise<GitRepository>
    /** Sets the whole working tree aside, untracked files included, and comes back clean. */
    stash: (message: string) => Promise<GitRepository>
    stashes: () => Promise<GitStashEntry[]>
    stashPop: (index: number) => Promise<GitRepository>
    stashDrop: (index: number) => Promise<GitRepository>
    tag: (name: string, commit: string) => Promise<GitRepository>
    /**
     * Whether a token is held for a host — and NOTHING else about it.
     *
     * There is no channel that answers with a token, and that absence is the point: invariant 1
     * says the window asks whether it is authenticated, never what the credential is. The token
     * goes down to the main process once and only ever comes back out inside the environment of
     * a git command.
     */
    hasCredentials: (host: string) => Promise<boolean>
    setCredentials: (host: string, user: string, token: string) => Promise<void>
    clearCredentials: (host: string) => Promise<void>
  }

  dialog: {
    /**
     * A native picker, answering the chosen path or null when it was cancelled. One channel for
     * every path the interface asks for — where a project goes, where ffmpeg lives — because
     * they differ only by which picker opens.
     */
    pickPath: (kind: PathKind, startIn?: string) => Promise<string | null>
    /**
     * Asks where to put a picture and writes it there. Base64 in, path out — the renderer has
     * no filesystem, and the bytes are what it has.
     */
    exportPicture: (name: string, image: string) => Promise<string | null>
  }

  /**
   * What makes a project a GAME — the manifest beside the documents, and the `.ts` files a Play
   * compiles. One project, one game: there is no document kind for either.
   *
   * 🛑 Only `scripts` has a caller in the window today; the three others are the editor's, and
   * nothing in `src/main` is what knip watches — so nothing would report them as unreached.
   */
  game: {
    read: () => Promise<GameState>
    /** The whole manifest in, the whole truth back. Refuses a file the studio cannot read. */
    write: (game: GameManifest) => Promise<GameState>
    /** Every script of the project, with its text. What a PLAY hands the sandbox. */
    scripts: () => Promise<readonly GameScriptFile[]>
    /** Whether it was written. Refused for a path that is not a script of THIS project. */
    writeScript: (path: string, source: string) => Promise<boolean>
    /**
     * Writes a game that runs with no studio, into a folder the person picks.
     *
     * 🛑 The WINDOW composes what goes in — the glTF of each scene and the JavaScript of each
     * script — and this side writes the files and resolves what the catalogue holds. The same
     * split every document format follows: the window makes the structure, the main the syntax.
     *
     * `null` when nobody picked a folder. Otherwise a report, whose `missing` names every asset
     * a scene points at and the catalogue no longer holds.
     */
    export: (request: GameExportRequest) => Promise<GameExportOutcome | null>
  }

  documents: {
    /** Every document the open project holds, read off its folder — the one source of truth. */
    list: () => Promise<DocumentDescriptor[]>
    /** `null` when nothing has been saved under that id yet. */
    read: (id: string, kind: DocumentKind) => Promise<DocumentFile | null>
    /**
     * The envelope — version, kind, timestamp — is stamped by the main process, not here.
     *
     * Answers `stale` and writes NOTHING when the file changed underneath — see `DocumentWrite`.
     * Ask with `confirmOverwrite`, then write again with `force`.
     *
     * `folder` is where a document written for the FIRST time lands — the folder its author
     * picked when they made it. It is read for a document with no file yet and ignored for one
     * that has: a save never moves what is already filed somewhere.
     */
    write: (
      id: string,
      kind: DocumentKind,
      draft: DocumentDraft,
      force?: boolean,
      folder?: string,
    ) => Promise<DocumentWrite>
    /**
     * Gives a document another name — which, the file being named after the document, moves it.
     *
     * The id does not change, and that is the point: the layout, the recent list and the open
     * tab all hold it, so a document may be renamed while it is open.
     *
     * Answers with the descriptor as it now stands, `path` included, so no window has to work
     * out where the document went — and it stays in the folder it was in, a rename being a name
     * and not a move. Rejects when THAT folder already holds the name —
     * `checkDocumentName` says the same thing before the gesture, this is what makes it true.
     */
    rename: (id: string, kind: DocumentKind, title: string) => Promise<DocumentDescriptor>
    remove: (id: string, kind: DocumentKind) => Promise<void>
    /**
     * Notes that this document was just put in front, for the shelf File ▸ Open recent draws.
     *
     * The window says WHICH document and nothing else: the project holding it is the main
     * process's to know — it owns the open project — and a window composing the pair would be a
     * second answer, late by exactly the switch that had just happened.
     */
    opened: (path: string, kind: DocumentKind) => Promise<void>
    /**
     * What to do with a modified document being closed. Native rather than drawn in the window:
     * this is the OS convention every desktop application answers with, and the wording lives
     * beside the menu's — the renderer asks the question, it does not phrase it.
     */
    confirmClose: (title: string) => Promise<CloseChoice>
    /** Whether the document's file really goes. Destructive, so the safe answer is the default. */
    confirmDelete: (title: string) => Promise<boolean>
    /**
     * Whether to write over changes another application made. Asked only after `write` answered
     * `stale`, and answering no is what a dismissed dialog gives back.
     */
    confirmOverwrite: (title: string) => Promise<boolean>
    /**
     * Whether to let the asset behind this document take the FLATTENED picture, its format
     * carrying no `lost`.
     *
     * Asked once per document and never again: ⌘S is the most frequent gesture of the studio, and
     * a question at each one would be unbearable on a picture that keeps its layers. Nothing is
     * destroyed either way — the document is written first, with the whole stack — so the safe
     * answer here is the one that writes, unlike every other confirmation of this file.
     */
    confirmFlatten: (title: string, format: string, lost: string) => Promise<boolean>
  }

  assets: {
    search: (query: AssetQuery) => Promise<Asset[]>
    /**
     * Says the catalogue was written — by this window or by any other, since every write goes
     * through the main process and comes back here.
     *
     * The rows it carries are NOT for the shelf, which is scoped and pages and would have to ask
     * anyway. They are for the version every texture slot compares (`assetVersionOf`): read from
     * the shelf, that version is capped at the page it holds, so an older asset stopped
     * propagating in silence. Written straight from here, it never is.
     *
     * An emitter that changed rows it cannot name — a rescan refiling twelve files — sends none,
     * which means « something moved, ask ».
     */
    onChanged: (callback: (changed: readonly Asset[]) => void) => Unsubscribe
    /**
     * How many assets of each kind the project holds — counted in SQL, so the answer is six
     * numbers rather than the catalogue itself.
     */
    counts: () => Promise<AssetCounts>
    /**
     * The waveform computed at ingest, as min/max pairs at `PEAKS_PER_SECOND`. Null when the
     * asset carries no sound, or when ffmpeg was missing when it was brought in.
     */
    peaks: (assetId: string) => Promise<Float32Array | null>
    /**
     * Shows the asset's file in the OS file manager — the errand the path itself never crosses
     * this boundary for, see `withoutSourcePath`. False when there was no file to show.
     */
    reveal: (assetId: string) => Promise<boolean>
    /**
     * Which of these assets no longer have the file the catalogue records — the ids, never the
     * paths, which do not cross this boundary (see `withoutSourcePath`).
     *
     * Asked of a handful at a time rather than of the whole catalogue: a project holds hundreds
     * of rows and only the cells on screen need an answer, so the shelf asks for what it draws.
     * A row with no file to begin with — one that lives only in the library — is never absent:
     * nothing was expected of it.
     */
    absent: (assetIds: readonly string[]) => Promise<string[]>
    /** Writes an edited take back: over its source when `replaces` is set, beside it otherwise. */
    saveAudio: (request: SaveAudioRequest) => Promise<Asset>
    /**
     * Puts an edited picture into the project, as a NEW asset beside the one it came from.
     *
     * Always a new one, like `saveTexture` and for a related reason: a document's base layer is
     * sourced from the asset it was opened from, so overwriting that asset would feed the
     * flattened stack back into the layer it was flattened from.
     *
     * The kind and the channel are the source's own, read from the catalogue — a texture channel
     * edited as a picture stays a channel, which keeps it on the right shelf.
     */
    savePicture: (request: SavePictureRequest) => Promise<Asset>
    /**
     * Files a player module as a glTF of its own. 🛑 Always a NEW file: nothing here replaces the
     * one a module was filed as before, so filing twice leaves the first behind.
     */
    savePlayerModule: (request: SavePlayerModuleRequest) => Promise<Asset>
    /**
     * Puts a LAYERED picture into the project, as an OpenRaster container.
     *
     * Unlike `savePicture` it may overwrite: the container holds the whole stack, so writing it
     * back over the file the document was opened from loses nothing — which is the difference an
     * open format buys, and the reason `formatCapability` exists to tell the two cases apart.
     */
    saveLayered: (request: SaveLayeredRequest) => Promise<Asset>
    /**
     * Writes a character's own file back, skeleton and all — what ⌘S means in the skeleton
     * window. It OVERWRITES, for `saveLayered`'s reason: the container holds everything, so
     * writing it over the file it was read from loses nothing.
     */
    saveMesh: (request: SaveMeshRequest) => Promise<Asset>
    /**
     * Files a motion in the project's `animations` folder — a new asset, or the one `replaces`
     * names: what makes a motion reusable is being a file no character owns.
     */
    saveAnimation: (request: SaveAnimationRequest) => Promise<Asset>
    /**
     * Lands the `.glb` the window converted a 3D file into: the row now points at it, the
     * original is kept beside it under `.sources`, and the row is refiled when the content said
     * another role than the folder did. Answers the row as it stands after that.
     */
    saveConverted: (request: ConvertMeshRequest) => Promise<Asset>
    animationThumbnailModel: () => Promise<Uint8Array>
    saveAnimationThumbnail: (request: SaveAnimationThumbnailRequest) => Promise<void>
    /**
     * Reads a layered picture back, or `null` for an asset that is not one.
     *
     * `null` rather than a throw: opening a `.png` through this path is the ordinary case, not a
     * failure — the caller falls back to the one-layer document any flat picture opens as.
     */
    readLayered: (assetId: string) => Promise<OraDocument | null>
    /**
     * Puts a channel the renderer computed into the project.
     *
     * Always a new asset: a derivation is cheap to run again, and overwriting the file the
     * user pointed at would destroy pixels the studio did not author.
     */
    saveTexture: (request: SaveTextureRequest) => Promise<Asset>
    /**
     * Brings a durable internal resource — a derived channel, an unpacked map — out into the
     * project's own tree, MOVED and never copied: the project weighs the same afterwards, and
     * the document that cites it goes on drawing it, citing an identity rather than a path.
     *
     * The pair of the hiding, and it has to exist: a resource nothing can bring back out is a
     * resource the user has lost. Answers the row as it now stands; one already out comes back
     * unchanged.
     */
    showResource: (assetId: string) => Promise<Asset>
    /**
     * Puts the working textures the app ships with into the open project, and answers what they
     * became. Idempotent: a project that already holds them keeps the assets it has, ids
     * included, so a document referencing one goes on resolving.
     *
     * Copied into the project rather than served from beside the app, because a scene is written
     * as glTF: what a document points at has to be a file another application can open.
     */
    installBundledTextures: () => Promise<InstalledCheckerTexture[]>
    /**
     * The shipped character at the density asked for — or the nearest one it HAS, which for a
     * character imported by hand is its only one. `null` only when there is none at all.
     */
    installBundledCharacter: (level: CharacterLevel) => Promise<InstalledCharacter | null>
    /**
     * Takes the pictures a `.glb` carries inside itself out into the project, one texture asset
     * each — which is what makes a downloaded model's own maps something the studio can open,
     * paint on, and hand back to a material.
     *
     * The bytes are copied, never decoded and re-encoded: what comes out is exactly what the
     * model was painted with. Each one is filed under the channel its glTF slot means, when the
     * slot means exactly one — `metallicRoughnessTexture` packs two and claims neither.
     *
     * Answers with what it created, newest last, and with an empty list for a model that carries
     * no picture at all. A picture already taken out is taken out again: the copy in the project
     * may have been painted since, and this is not the gesture that decides that.
     */
    extractTextures: (assetId: string) => Promise<Asset[]>
    /** Renames an asset or rewrites its tags. Whichever field is absent is left as it was. */
    update: (assetId: string, changes: AssetChanges) => Promise<Asset>
    /**
     * Drops assets from the project, and from the library too when asked.
     *
     * `alsoRemote` is not undone by anything: the API has no single-asset delete and no undo,
     * so the confirmation belongs to whoever calls this.
     */
    remove: (
      assetIds: readonly string[],
      alsoRemote: boolean,
      expectedProjectPath?: string,
    ) => Promise<void>
    /**
     * Names the chosen pictures from what the API sees in them, and answers how many it named.
     *
     * Only pictures the library already knows can be described — captioning takes an asset id —
     * so a selection of local-only files is answered with zero rather than an error.
     */
    describe: (assetIds: readonly string[]) => Promise<number>
  }

  /**
   * The account's library, which is not the project's catalogue.
   *
   * Kept apart on purpose: `catalog.db` belongs to a project, while the library belongs to the
   * key. Mirroring one into the other would copy the same library into every project and leave
   * as many stale copies to invalidate — so cloud assets are read through, and only become rows
   * once they are pulled.
   */
  cloud: {
    /** One page of the library. The cursor is opaque, and null once there is no more. */
    browse: (query: CloudQuery) => Promise<CloudPage>
    /**
     * One page of what everyone published, of a single kind and newest first — the home's
     * explore feed, and the one read here that returns assets this account does not own.
     *
     * Anything the API flagged is left out. Nothing is pulled by looking: a tile of the feed
     * belongs to somebody else until it is fetched like a library one.
     */
    explore: (query: ExploreQuery) => Promise<CloudPage>
    /**
     * Published assets that resemble the one named, that one taken out of its own results.
     *
     * The reference is the caller's to choose: the home measures against the library's most
     * recent asset, and a right-click elsewhere would name the asset under the pointer.
     */
    similar: (assetId: string) => Promise<CloudAsset[]>
    /**
     * Brings assets into the project, bytes and all. Answers what each one did — a download
     * that fails halfway has already written the ones before it, and a rejection would lose
     * that. The rows themselves arrive through the catalogue, which the store re-reads.
     */
    pull: (remoteAssetIds: readonly string[]) => Promise<SyncOutcome[]>
    /** Sends local assets up. Answers what each one did, successes and failures alike. */
    push: (assetIds: readonly string[]) => Promise<SyncOutcome[]>
    /** What a push or a pull would do, before it costs a single request. */
    plan: (assetIds: readonly string[], policy: SyncPolicy) => Promise<SyncPlan>
  }

  /** Recipes worth keeping, held outside every project — see `domain/favorite.ts`. */
  favorites: {
    list: () => Promise<FavoriteRecipe[]>
    /**
     * Pins what produced an asset of the open project. Answers the whole list, so a window never
     * has to guess where the new one landed. An asset nobody generated has no recipe to keep,
     * and the list comes back unchanged.
     */
    pin: (assetId: string) => Promise<FavoriteRecipe[]>
    unpin: (id: string) => Promise<FavoriteRecipe[]>
  }

  /** Saved ways of reading a material, held outside every project — see `domain/style.ts`. */
  styles: {
    list: () => Promise<MaterialStyle[]>
    /**
     * Keeps the values handed over. Each of the four answers the whole list, as the favourites
     * do: one write, one truth back, and a window that never has to guess where a row landed.
     */
    save: (style: MaterialStyle) => Promise<MaterialStyle[]>
    rename: (id: string, name: string) => Promise<MaterialStyle[]>
    remove: (id: string) => Promise<MaterialStyle[]>
  }

  /**
   * What the studio did, and what it failed to do — the surface it had none of.
   *
   * A line carries an i18n KEY and its parameters, never a sentence: the journal outlives the
   * language the interface was in when it was written. `detail` is `describeFailure` output and
   * nothing else, because an SDK message embeds the request, hence the API key.
   */
  activity: {
    read: (query: ActivityQuery) => Promise<ActivityEntry[]>
    /**
     * Lines as they are written, in batches. A push of two hundred assets is one message, not
     * two hundred — the same coalescing the ingest bar does with its progress.
     */
    onEntries: (callback: (entries: readonly ActivityEntry[]) => void) => Unsubscribe
  }
}
