import type { FileFacts } from './domain/fileInfo'
import type { FileHistory, FileOutcome } from './domain/fileOp'
import type { FolderEntry } from './domain/folder'
import type { FolderRole, RoleFolders } from './domain/folderRole'
import type { Project, RescanState } from './domain/project'
import type { ContextCard, ContextState } from './domain/projectContext'
import type { ProjectBinned, Unsubscribe } from './ipcEvents'
import type { FolderExportRequest } from './ipcExports'
import type { InputMap } from './domain/inputMap'
import type { AnimationGraph } from './domain/animationGraph'

export type StudioBridgeProject = {
  inputMaps: {
    list: () => Promise<string[]>
    read: (path: string) => Promise<InputMap | null>
    write: (path: string, map: InputMap) => Promise<boolean>
    /** Told when ANY window wrote one, with its path: a held map is stale from that moment. */
    onWritten: (callback: (path: string) => void) => Unsubscribe
  }
  /** The state machines a body is animated by. The same three gestures, on `.anim.json` files. */
  animationGraphs: {
    list: () => Promise<string[]>
    read: (path: string) => Promise<AnimationGraph | null>
    write: (path: string, graph: AnimationGraph) => Promise<boolean>
  }
  project: {
    /**
     * Turns the CHOSEN folder into a project — it becomes the root, and the studio's folders are
     * laid inside it. No folder is made from a name: the one the user picked in the dialog is
     * the one they meant, and the project takes ITS name.
     *
     * Three answers rather than one, because a folder can already mean something. A folder that
     * is already a project is OPENED, never written over. One sitting inside another project is
     * refused. One holding files of its own asks the user first, and `null` is their "no" — a
     * cancelled gesture, not a failure, so nothing is journalled and nothing changes.
     */
    create: (path: string) => Promise<Project | null>
    open: (path: string) => Promise<Project>
    current: () => Promise<Project | null>
    /**
     * Leaves the open project with none in its place: the catalogue is closed and every window is
     * told through `onChange`, exactly as opening another one tells them. The folder is untouched.
     */
    close: () => Promise<void>
    /**
     * Whether leaving this project may go ahead, asked when generations are still running: they
     * survive it, but they leave the bar until this project is opened again, and nothing else in
     * the studio would say so. `true` with none running — no question is raised.
     */
    askLeave: () => Promise<boolean>
    onChange: (callback: (project: Project | null) => void) => Unsubscribe
    /**
     * One level of the project folder, `''` being the root. The explorer walks it a folder at a
     * time: `assets/img` holds thousands of files in an ordinary project, and a reader who never
     * opens it must not pay for them.
     *
     * `hidden` reveals what a leading dot hides — `.index/` and `.project.json`, the studio's own
     * bookkeeping. They are shown and stay READ-ONLY: every gesture over them is refused.
     */
    listFolder: (relative: string, hidden: boolean) => Promise<FolderEntry[]>
    /**
     * Every entry of the project folder whose name holds `term` — the explorer's second source of
     * nodes, and the only one that can answer for a folder nobody has unfolded.
     *
     * A flat list, in no order the reader should rely on: the tree rebuilds the ancestors of each
     * match and sorts what it draws. An empty term answers nothing rather than the whole folder.
     *
     * **Not `node_modules`.** It is listed and it unfolds; it is never crossed, holding thousands
     * of entries and not one of them the user's — a project beside a checkout answered forty
     * thousand matches nobody wrote.
     */
    searchFolder: (term: string, hidden: boolean) => Promise<FolderEntry[]>
    /**
     * Every FILE the project folder holds, at any depth — what the explorer reads to show the
     * project by what its files ARE rather than by where they sit.
     *
     * Folders do not come back: a folder is not a domain. A document written as a folder does,
     * as the item it is. The listing is flat and unordered; the panel groups and sorts it, and
     * asks the catalogue about the whole of it in one go (`AssetQuery.paths`).
     *
     * **Not `node_modules`**, at either setting of `hidden`: nothing under it is the user's work,
     * and crossing it cost a save 142 ms where the rest of the project costs 8.
     */
    walkFolder: (hidden: boolean) => Promise<FolderEntry[]>
    /**
     * Hands a file the studio cannot open to the system — a `.pdf` to its viewer. Answers
     * whether it was taken; a refusal is already in the journal, since a folder someone chose
     * is not a place to throw an exception from.
     */
    openFile: (relative: string) => Promise<boolean>
    /**
     * Something moved in the project folder. It does not say what: the panel re-reads the
     * folders it has open, which is cheaper than carrying a path through and never wrong.
     */
    onFolderChanged: (callback: () => void) => Unsubscribe
    /**
     * How far the pass reconciling the catalogue with the folder has got.
     *
     * A window is never the one who ASKS for a pass — opening a project and coming back to the
     * front are what do, and both are decided in the main process. What a window gets is the
     * right to see it happening and to call it off.
     */
    onRescan: (callback: (state: RescanState) => void) => Unsubscribe
    /** What a window opening mid-pass should be showing, since it missed the announcement. */
    rescanState: () => Promise<RescanState>
    /** Calls off the pass that is running. What it had already written stays written. */
    stopRescan: () => Promise<void>
    /**
     * Where each role's folder sits in the open project — PARTIAL, a role whose folder is gone
     * being absent rather than pointed at its default. `{}` while no project is open.
     *
     * For DRAWING, never for deciding where to write: `folderFor` is what a write asks, and it
     * lays the folder down. A window that composed a landing path from this map would file into
     * a folder nothing marked — and a map replicated over an event is empty for a few frames.
     */
    folderRoles: () => Promise<RoleFolders>
    /**
     * The folder a role names, laid down with its marker if the project has none.
     *
     * Asked rather than composed, and that is the whole mechanism: only the main process reads
     * the markers, so only it can say where a role went after a rename in the Finder — and
     * laying the folder down is what keeps the role resolvable at the next open.
     */
    folderFor: (role: FolderRole) => Promise<string>
    onFolderRoles: (callback: (roles: RoleFolders) => void) => Unsubscribe
    /**
     * What the disk says about one entry — size and stamps, for a folder as much as for a file.
     *
     * Asked path by path rather than folded into `listFolder`: a listing of four hundred rows
     * would pay four hundred `stat` calls for facts one window reads about one of them.
     *
     * `null` for a path that is no longer there, which is the ordinary case for a window left
     * open while the file it names was moved in the Finder.
     */
    fileFacts: (relative: string) => Promise<FileFacts | null>
    /**
     * The project's own context — the world every generation made in it is set in.
     *
     * Empty for a project that carries none, which is most of them. `trouble` says the file is
     * there and this build will not touch it: repair it, or update the studio.
     */
    readContext: () => Promise<ContextState>
    /**
     * The whole list at once — one write, one truth back. Rejected while `trouble` is set, so a
     * file nobody could read is never overwritten by a window that showed none of it.
     */
    writeContext: (cards: readonly ContextCard[]) => Promise<ContextState>
    /** Fires for every window when any of them writes: two replicas of one file is one too many. */
    onContextChanged: (callback: (state: ContextState) => void) => Unsubscribe
    /**
     * Writes an export INSIDE the open project, in a folder of its own named by the caller.
     *
     * The other three export channels raise a native picker, which is why they exist as they do
     * and why no outside client can use them: nobody is there to fill it. This one takes the
     * destination instead, and pays for that by never letting it leave the project — `folder` is
     * one `pathSegment`, and the main process resolves both ends before it writes.
     *
     * Answers the folder name, never the path, exactly as its three neighbours do. `null` when
     * the destination resolved outside the project, which is the one refusal worth telling apart
     * from a failure.
     */
    exportInto: (request: FolderExportRequest) => Promise<string | null>
    /** Shows the file in the system's own file manager, so the path never leaves the process. */
    revealFile: (relative: string) => Promise<void>
    /**
     * Shows a project FOLDER, named by its own absolute path — the home's shelf points at
     * projects that are not open, and `revealFile` above can only name something inside the one
     * that is. The same path `open` already takes, and refused by the same parser.
     *
     * Answers whether the folder was there to show. `showItemInFolder` reports nothing and
     * no-ops on a path that has gone, and a folder moved since it was last opened is the
     * ordinary case for that shelf.
     */
    revealFolder: (path: string) => Promise<boolean>
    /**
     * Renames a PROJECT: its FOLDER moves, and that is the whole of it — a project is named by
     * its folder. Named by its own absolute path, so the home's shelf can rename one it has not
     * opened, and it answers the project at its NEW path.
     *
     * 🛑 What is keyed on the folder moves with it, and the caller owns that half: the shelf,
     * `storage.lastProject`, `storage.projectAccounts` and `ai.projectRoles`. The catalogue does
     * not — its rows are relative, so it travels inside the folder.
     *
     * Answers the project as it now reads. Throws when the folder will not open — a project
     * renamed out from under the studio is the same failure `open` reports.
     */
    rename: (path: string, name: string) => Promise<Project>
    /**
     * Puts a project's FOLDER, and everything in it, in the system's trash. Named by its own
     * absolute path, as `rename` is, so a project that is not open can go.
     *
     * 🛑 The trash, never a delete: `shell.trashItem` leaves the person a way back, and nothing
     * here has one. The project is closed first when it is the open one — its catalogue holds a
     * file inside the folder that is about to leave.
     *
     * 🛑 What is keyed on the folder is the caller's half, exactly as for `rename`: the shelf,
     * `storage.lastProject`, `storage.projectAccounts` and `ai.projectRoles`. Left behind, they
     * point a live account key at a folder that is gone.
     *
     * 🛑 Answers WHICH ending, never a boolean: `missing` is a folder the disk no longer holds —
     * an unplugged drive as much as a deletion — and `not-a-project` is a folder that is there and
     * holds no project. Read as one `false`, a caller pruned the account link of a project sitting
     * on a drive that was merely not plugged in, which is the one thing `projectAccounts` exists
     * to prevent. Throws only when the system refused the move.
     */
    trash: (path: string) => Promise<ProjectBinned>
    /**
     * Asks the person whether that project's folder may go, naming it — and answers what they
     * said. Nothing is moved here.
     *
     * 🛑 A route of its OWN, apart from `trash`, and the split is the point: the native dialog
     * belongs to a gesture made AT the machine, where somebody can answer it. `project.trash` is
     * reachable from the wire, and a question raised there would stand for good — the measure
     * `document.deleteFromDisk` holds, and `documents.confirmDelete` is the shape copied here.
     */
    confirmTrash: (name: string) => Promise<boolean>
    /**
     * Renames in place — the name only, never the folder it sits in.
     *
     * The seven gestures below answer the same shape, and it is not a boolean: a batch is a
     * partial result by design, so what comes back is what MOVED and what was refused, with the
     * reason for each. A single rename simply has one member.
     */
    renameFile: (relative: string, name: string) => Promise<FileOutcome>
    /** Into another folder, keeping their names — the drag in the tree, and Couper puis Coller. */
    moveFiles: (paths: readonly string[], folder: string) => Promise<FileOutcome>
    /**
     * To the system's trash, never deleted. The studio does not erase anything in a folder that
     * belongs to someone else — and this is the one gesture `undoFile` cannot take back.
     */
    trashFiles: (paths: readonly string[]) => Promise<FileOutcome>
    /** One folder, inside `folder` — `''` for the project root itself. */
    newFolder: (folder: string, name: string) => Promise<FileOutcome>
    /** A copy of each beside itself, under the first free name — `Ruelle bleue 2.png`. */
    duplicateFiles: (paths: readonly string[]) => Promise<FileOutcome>
    /** What the clipboard holds, into `folder`: moved when it was cut, copied when it was not. */
    pasteFiles: (paths: readonly string[], folder: string, cut: boolean) => Promise<FileOutcome>
    /**
     * Takes the last batch back, and puts it back again. The stack lives in the main process,
     * per project: a file gesture belongs to no document, and two windows on one project would
     * otherwise keep two stacks that disagree.
     */
    undoFile: () => Promise<FileOutcome>
    redoFile: () => Promise<FileOutcome>
    /** Whether either gesture would do anything — what greys a menu row before it is clicked. */
    fileHistory: () => Promise<FileHistory>
    /**
     * A batch settled, in this window or another one. Carries what it did, so a tree can point
     * the selection at what has just appeared rather than guessing at it after a re-read.
     */
    onFilesChanged: (callback: (outcome: FileOutcome) => void) => Unsubscribe
  }
}
