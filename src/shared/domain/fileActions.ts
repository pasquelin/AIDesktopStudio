import { action, type ActionField, type AssistantAction } from './assistantAction'

/**
 * The project folder, as something a program can walk and change.
 *
 * Paths are relative to the project root with `/` between segments on every platform — the same
 * spelling `FolderEntry` uses, so a listing's `path` is what every other action here takes.
 * `project.open` takes an absolute one: there is no project yet to be relative to. So does
 * `project.create` — but a NAME is enough there, and the studio puts it where this person keeps
 * projects: asked for a path, a model asked the person to type one.
 *
 * The native pickers stay where they are. `project.new` and `project.open` as COMMANDS raise a
 * system dialog nobody outside the machine can fill, so a client that called them would hang the
 * studio on a modal — these take the path instead.
 */
const PATHS: ActionField = {
  key: 'paths',
  kind: 'text',
  labelKey: 'assistant.fields.filePaths',
  required: true,
  repeated: true,
}

/**
 * Optional so that the project ROOT can be named at all: it is spelled `''` (`FOLDER_ROOT`), and
 * a required text may not be blank — see `fits`. Absent therefore means the root, exactly as
 * `files.list` already reads it.
 */
const FOLDER: ActionField = {
  key: 'folder',
  kind: 'text',
  labelKey: 'assistant.fields.folderPath',
  required: false,
}

/** The project folder an action names, which the question offers to point at. */
const PROJECT_FOLDER: ActionField = {
  key: 'path',
  kind: 'text',
  labelKey: 'assistant.fields.folderPath',
  required: true,
  picks: 'folder',
}

/**
 * 🛑 Creating takes a NAME and a place to put it, where opening and renaming take one PATH. Told
 * apart because the question offers to point at what a `picks` field holds: sharing one field,
 * the folder a person pointed at REPLACED the name, and the studio then tried to make a project
 * of a folder that already held some — which it refuses, rightly.
 */
const PROJECT_NAME: ActionField = {
  key: 'name',
  kind: 'text',
  labelKey: 'assistant.fields.projectName',
  required: true,
}

/** Where the new project goes. Absent, the studio uses where this person keeps them. */
const PROJECT_PARENT: ActionField = {
  key: 'folder',
  kind: 'text',
  labelKey: 'assistant.fields.projectParent',
  required: false,
  picks: 'folder',
}

export const FILE_ACTIONS: readonly AssistantAction[] = [
  action({
    /**
     * 🛑 Without it « Ouvre un projet récent » — a sentence the studio itself suggests — cannot be
     * answered at all: `project.open` wants a WHOLE path and nothing else ever says one. Measured
     * 2026-08-30, the model opened the projects panel and handed the request back, three rounds.
     *
     * 🛑 Neither this nor `project.open` is PRINTED: a RULE spells the pair, for 93 characters
     * where their two blocks cost 158 — and a rule is never dropped, where a block is the first
     * thing to go. Measured 2026-08-30: 7 510 of 8 500 became 7 603, and an expansion on « git
     * branch » prints five of the twenty-four it finds where it printed six.
     */
    name: 'projects.list',
    titleKey: 'assistant.actions.projectsList.title',
    descriptionKey: 'assistant.actions.projectsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'both',
    fields: [],
  }),
  action({
    name: 'project.open',
    titleKey: 'assistant.actions.projectOpen.title',
    descriptionKey: 'assistant.actions.projectOpen.description',
    commitment: 'studio',
    repeatable: false,
    // `both` so a spoken sentence may call it, and UNLISTED so nobody pays for its block — the
    // rule that spells it is in `instruction.ts`.
    reach: 'both',
    fields: [PROJECT_FOLDER],
  }),
  action({
    /**
     * No field: there is one open project, and naming it would let a caller close a project that
     * is not in front of anyone.
     *
     * `none` with `asksItself`, as `document.close` is: the store raises the question about
     * unsaved work, and it is the only one that knows whether there is any. A `studio` level
     * here asked twice for one gesture, the first time without being able to say what was at
     * stake. `project.open` deliberately keeps its own level — it reloads a whole catalogue,
     * which is more than the documents this question is about.
     */
    name: 'project.close',
    titleKey: 'assistant.actions.projectClose.title',
    descriptionKey: 'assistant.actions.projectClose.description',
    commitment: 'none',
    repeatable: false,
    asksItself: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * `both`, and the second of this family to be: « crée un nouveau projet » is the plainest
     * thing anyone says to a studio, and shown the short share alone a model reached for
     * `command.runStudioCommand project.new` — the one command it may not run, since it raises a picker.
     */
    name: 'project.create',
    titleKey: 'assistant.actions.projectCreate.title',
    descriptionKey: 'assistant.actions.projectCreate.description',
    commitment: 'studio',
    // 🛑 A project of that NAME is a named state: creating it twice in one turn brings nothing the
    // first did not, and the second raised the confirmation card a second time over a project the
    // person had just approved. Two DIFFERENT names still pass — the key holds the input.
    repeatable: false,
    reach: 'both',
    fields: [PROJECT_NAME, PROJECT_PARENT],
  }),
  action({
    /**
     * 🛑 This one drops a ROW, the next one bins a FOLDER — the confusion that costs work nobody
     * gets back, so both descriptions say which. `studio` because the shelf is a preference, the
     * level `settings.write` already carries.
     */
    name: 'project.forget',
    titleKey: 'assistant.actions.projectForget.title',
    descriptionKey: 'assistant.actions.projectForget.description',
    commitment: 'studio',
    // A row already off the shelf cannot come off it twice, and the second call raised the card
    // again over a project the person had just let go.
    repeatable: false,
    reach: 'both',
    fields: [PROJECT_FOLDER],
  }),
  action({
    /**
     * 🛑 `studio` is the ONE level no delegation switch waives — `files` would have run unasked
     * for anyone who armed `delegateFiles` to move rushes about. No native dialog behind it: a
     * call from the wire would stand on one for good, the measure `document.deleteFromDisk` holds.
     */
    name: 'project.trash',
    titleKey: 'assistant.actions.projectTrash.title',
    descriptionKey: 'assistant.actions.projectTrash.description',
    commitment: 'studio',
    repeatable: false,
    reach: 'both',
    fields: [PROJECT_FOLDER],
  }),
  action({
    /**
     * `both`, alone in this family: "open the green sailboat" is what a person SAYS, and a small
     * model shown only the short share could not answer it. `document.open` stayed `mcp` because
     * it needs a listing first; this one needs a name and a search.
     */
    name: 'file.open',
    titleKey: 'assistant.actions.fileOpen.title',
    descriptionKey: 'assistant.actions.fileOpen.description',
    commitment: 'none',
    repeatable: false,
    reach: 'both',
    uses: ['projectFilePaths'],
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    name: 'files.list',
    titleKey: 'assistant.actions.filesList.title',
    descriptionKey: 'assistant.actions.filesList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    returns: ['projectFilePaths'],
    fields: [
      { key: 'folder', kind: 'text', labelKey: 'assistant.fields.folderPath', required: false },
      { key: 'hidden', kind: 'boolean', labelKey: 'assistant.fields.hidden', required: false },
    ],
  }),
  action({
    name: 'files.search',
    titleKey: 'assistant.actions.filesSearch.title',
    descriptionKey: 'assistant.actions.filesSearch.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    returns: ['projectFilePaths'],
    fields: [
      { key: 'query', kind: 'text', labelKey: 'assistant.fields.query', required: true },
      { key: 'hidden', kind: 'boolean', labelKey: 'assistant.fields.hidden', required: false },
    ],
  }),
  action({
    name: 'files.move',
    titleKey: 'assistant.actions.filesMove.title',
    descriptionKey: 'assistant.actions.filesMove.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS, FOLDER],
  }),
  action({
    // Adds rather than destroys, so no question — see the note on `files` in `assistantAction`.
    name: 'files.copy',
    titleKey: 'assistant.actions.filesCopy.title',
    descriptionKey: 'assistant.actions.filesCopy.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS, FOLDER],
  }),
  action({
    name: 'files.duplicate',
    titleKey: 'assistant.actions.filesDuplicate.title',
    descriptionKey: 'assistant.actions.filesDuplicate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS],
  }),
  action({
    name: 'files.trash',
    titleKey: 'assistant.actions.filesTrash.title',
    descriptionKey: 'assistant.actions.filesTrash.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [PATHS],
  }),
  action({
    name: 'file.rename',
    titleKey: 'assistant.actions.fileRename.title',
    descriptionKey: 'assistant.actions.fileRename.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    name: 'file.facts',
    titleKey: 'assistant.actions.fileFacts.title',
    descriptionKey: 'assistant.actions.fileFacts.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    name: 'folder.new',
    titleKey: 'assistant.actions.folderNew.title',
    descriptionKey: 'assistant.actions.folderNew.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      FOLDER,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  /**
   * The stack the Explorer's ⌘Z drives, which lives in the main process and per project: a batch
   * made in one window is taken back from another, and from here.
   */
  action({
    name: 'files.undoFileOperation',
    titleKey: 'assistant.actions.filesUndoFileOperation.title',
    descriptionKey: 'assistant.actions.filesUndoFileOperation.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'files.redoFileOperation',
    titleKey: 'assistant.actions.filesRedoFileOperation.title',
    descriptionKey: 'assistant.actions.filesRedoFileOperation.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'files.canUndoRedo',
    titleKey: 'assistant.actions.filesCanUndoRedo.title',
    descriptionKey: 'assistant.actions.filesCanUndoRedo.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'file.reveal',
    titleKey: 'assistant.actions.fileReveal.title',
    descriptionKey: 'assistant.actions.fileReveal.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    // The absolute path, like the two above it: the shelf renames projects it has not opened.
    name: 'project.rename',
    titleKey: 'assistant.actions.projectRename.title',
    descriptionKey: 'assistant.actions.projectRename.description',
    // 🛑 `studio` and not `files`, though it renames: it MOVES the project folder, which is the
    // reach `project.trash` is held at. At `files`, the box armed to tidy rushes away carried a
    // whole project off with no card shown.
    commitment: 'studio',
    // The name a project carries is a named state too, and the same input asks for what stands.
    repeatable: false,
    reach: 'mcp',
    fields: [
      PROJECT_FOLDER,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
]
