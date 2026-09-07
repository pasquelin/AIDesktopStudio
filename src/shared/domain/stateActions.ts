import { action, type AssistantAction } from './assistantAction'
import { EXPORT_FORMATS } from './scene'
import { MATERIAL_EXPORT_TARGETS } from './materialExport'

/**
 * What the studio is, and which document is in front.
 *
 * The family that had to come first: `command.runStudioCommand` refuses anything whose surface is not
 * active, and before these there was no way to ask which one WAS. A client that cannot read
 * state does not drive the studio, it guesses at it — and a guess that reaches
 * `generator.submit` spends.
 *
 * All of them `mcp`: the assistant lives in the window and can see the answer already.
 */
export const STATE_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'studio.state',
    titleKey: 'assistant.actions.studioState.title',
    descriptionKey: 'assistant.actions.studioState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'documents.list',
    titleKey: 'assistant.actions.documentsList.title',
    descriptionKey: 'assistant.actions.documentsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'document.open',
    titleKey: 'assistant.actions.documentOpen.title',
    descriptionKey: 'assistant.actions.documentOpen.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    name: 'document.activate',
    titleKey: 'assistant.actions.documentActivate.title',
    descriptionKey: 'assistant.actions.documentActivate.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    capabilities: { targets: ['document'] },
    fields: [
      { key: 'documentId', kind: 'text', labelKey: 'assistant.fields.documentId', required: true },
    ],
  }),
  action({
    /**
     * `none`, and that is not an oversight: `closeDocument` raises its OWN question about unsaved
     * work, and it is the one that knows whether there is any. A `files` level here asked twice
     * for one gesture, and the first question could not say what was at stake.
     */
    name: 'document.close',
    titleKey: 'assistant.actions.documentClose.title',
    descriptionKey: 'assistant.actions.documentClose.description',
    commitment: 'none',
    repeatable: false,
    asksItself: true,
    reach: 'mcp',
    fields: [
      { key: 'documentId', kind: 'text', labelKey: 'assistant.fields.documentId', required: true },
    ],
  }),
  action({
    name: 'document.rename',
    titleKey: 'assistant.actions.documentRename.title',
    descriptionKey: 'assistant.actions.documentRename.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'documentId', kind: 'text', labelKey: 'assistant.fields.documentId', required: true },
      { key: 'title', kind: 'text', labelKey: 'assistant.fields.title', required: true },
    ],
  }),
  action({
    /**
     * ⌘S on a NAMED document, awaited — which is what `command.runStudioCommand('document.save')` could not
     * be. That route saves whatever tab is in front and answers before the write lands, so a
     * client had no way to save a document it was not looking at, nor to know it was written.
     *
     * Answers `written: false` rather than refusing when there was nothing to write: an untouched
     * tab is not a failure, and a client told `failed` would retry forever.
     */
    name: 'document.save',
    titleKey: 'assistant.actions.documentSave.title',
    descriptionKey: 'assistant.actions.documentSave.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'documentId', kind: 'text', labelKey: 'assistant.fields.documentId', required: false },
    ],
  }),
  action({
    /**
     * Deletes the document's FILE and closes its tab. The one gesture of the studio that destroys
     * work the user made, and the last of the five verbs an outside client had no way to reach.
     *
     * `asksItself` is deliberately NOT set: the tab menu's own route raises a native dialog, and
     * this one must not — nobody on the other side of the machine can answer it, and the call
     * would stand there for good. The assistant's own gate is what stands in front of this.
     */
    name: 'document.deleteFromDisk',
    titleKey: 'assistant.actions.documentDeleteFromDisk.title',
    descriptionKey: 'assistant.actions.documentDeleteFromDisk.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'documentId', kind: 'text', labelKey: 'assistant.fields.documentId', required: true },
    ],
  }),
  action({
    /**
     * The one export an outside client can ask for, and the reason it takes a FOLDER rather than a
     * path: every other export channel raises a native picker nobody outside can fill, and a path
     * a client chose freely is a write anywhere on the disk. Held inside the open project instead.
     *
     * `files` rather than `none`: it writes into the project folder, and a folder that was already
     * there is written over.
     *
     * A montage answers with its CUT — an `.otio` another editing application opens — and not
     * with a film of it: the film is rendered frame by frame through a session the viewport
     * drives, which no outside client can hold. Both montage kinds answer, Video and Audio.
     */
    name: 'document.export',
    titleKey: 'assistant.actions.documentExport.title',
    descriptionKey: 'assistant.actions.documentExport.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'folder', kind: 'text', labelKey: 'assistant.fields.exportFolder', required: false },
      {
        key: 'format',
        kind: 'choice',
        labelKey: 'assistant.fields.exportFormat',
        required: false,
        options: EXPORT_FORMATS,
      },
      {
        key: 'scope',
        kind: 'choice',
        labelKey: 'assistant.fields.exportScope',
        required: false,
        options: ['scene', 'selection'],
      },
      {
        key: 'target',
        kind: 'choice',
        labelKey: 'assistant.fields.exportTarget',
        required: false,
        options: MATERIAL_EXPORT_TARGETS,
      },
      {
        key: 'size',
        kind: 'integer',
        labelKey: 'assistant.fields.faceSize',
        required: false,
        min: 1,
      },
    ],
  }),
  action({
    name: 'activity.recent',
    titleKey: 'assistant.actions.activityRecent.title',
    descriptionKey: 'assistant.actions.activityRecent.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'limit',
        kind: 'integer',
        labelKey: 'assistant.fields.limit',
        required: false,
        min: 1,
        max: 200,
      },
    ],
  }),
]
