import { action, type ActionField, type AssistantAction } from './assistantAction'
import { SETTINGS_SECTION_IDS } from './settings'
import { TOOL_IDS } from './tool'
import { WINDOW_PAGES } from './window'

const PANEL: ActionField = {
  key: 'panel',
  kind: 'choice',
  labelKey: 'assistant.fields.panel',
  required: true,
  options: TOOL_IDS,
}

/**
 * What surrounds the documents — the window, the account, the updates, and the three small lists
 * the studio keeps outside every project.
 *
 * None of these edits a document, and none of them can be undone by ⌘Z, which is why they carry no
 * history and why `commitment` stays `none` all the same: pinning a recipe or opening a window
 * takes nothing away from anyone.
 *
 * Two of them answer a command as well — `settings.open` and `window.fullScreen` — and are here
 * all the same: a program asks for a capability by name, and finding it under `command.runStudioCommand` means
 * knowing the id of a menu row first.
 */

export const SHELL_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'auth.state',
    titleKey: 'assistant.actions.authState.title',
    descriptionKey: 'assistant.actions.authState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'window.state',
    titleKey: 'assistant.actions.windowState.title',
    descriptionKey: 'assistant.actions.windowState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'window.fullScreen',
    titleKey: 'assistant.actions.windowFullScreen.title',
    descriptionKey: 'assistant.actions.windowFullScreen.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'settings.open',
    titleKey: 'assistant.actions.settingsOpen.title',
    descriptionKey: 'assistant.actions.settingsOpen.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'section',
        kind: 'choice',
        labelKey: 'assistant.fields.settingsSection',
        required: true,
        options: SETTINGS_SECTION_IDS,
      },
    ],
  }),
  action({
    name: 'updates.state',
    titleKey: 'assistant.actions.updatesState.title',
    descriptionKey: 'assistant.actions.updatesState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'media.capabilities',
    titleKey: 'assistant.actions.mediaCapabilities.title',
    descriptionKey: 'assistant.actions.mediaCapabilities.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * The path-taking half of `media.ingest`, whose own channel raises the native picker no client
     * can fill. Adds a row, takes nothing away — hence `none`, like a new folder.
     */
    name: 'media.indexFileInPlace',
    titleKey: 'assistant.actions.mediaIndexFileInPlace.title',
    descriptionKey: 'assistant.actions.mediaIndexFileInPlace.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    name: 'fonts.list',
    titleKey: 'assistant.actions.fontsList.title',
    descriptionKey: 'assistant.actions.fontsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'favorites.listPinnedRecipes',
    titleKey: 'assistant.actions.favoritesListPinnedRecipes.title',
    descriptionKey: 'assistant.actions.favoritesListPinnedRecipes.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'favorite.pinAssetRecipe',
    titleKey: 'assistant.actions.favoritePinAssetRecipe.title',
    descriptionKey: 'assistant.actions.favoritePinAssetRecipe.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: true },
    ],
  }),
  action({
    name: 'favorite.unpinAssetRecipe',
    titleKey: 'assistant.actions.favoriteUnpinAssetRecipe.title',
    descriptionKey: 'assistant.actions.favoriteUnpinAssetRecipe.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      { key: 'favoriteId', kind: 'text', labelKey: 'assistant.fields.favoriteId', required: true },
    ],
  }),
  action({
    name: 'fileInfo.openWindow',
    titleKey: 'assistant.actions.fileInfoOpenWindow.title',
    descriptionKey: 'assistant.actions.fileInfoOpenWindow.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [{ key: 'path', kind: 'text', labelKey: 'assistant.fields.filePath', required: true }],
  }),
  action({
    name: 'mirror.openVideoReturnWindow',
    titleKey: 'assistant.actions.mirrorOpenVideoReturnWindow.title',
    descriptionKey: 'assistant.actions.mirrorOpenVideoReturnWindow.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * Windows of the main process and not panels — so no command of the registry reaches them,
     * and this was the whole of what an outside client could not open. Named for the Help menu,
     * which three of the four belong to; see `WindowPage`.
     */
    name: 'help.openStudioWindow',
    titleKey: 'assistant.actions.helpOpenStudioWindow.title',
    descriptionKey: 'assistant.actions.helpOpenStudioWindow.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'page',
        kind: 'choice',
        labelKey: 'assistant.fields.helpPage',
        required: true,
        options: WINDOW_PAGES,
      },
    ],
  }),
  action({
    // Quits and relaunches, which is why it asks: whatever the studio holds unsaved goes with it.
    name: 'updates.install',
    titleKey: 'assistant.actions.updatesInstall.title',
    descriptionKey: 'assistant.actions.updatesInstall.description',
    commitment: 'files',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'dictation.state',
    titleKey: 'assistant.actions.dictationState.title',
    descriptionKey: 'assistant.actions.dictationState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * The microphone, held open until `dictation.stop`. What it hears is written wherever the
     * caret is — so a client that starts it without a field focused writes into nothing.
     */
    name: 'dictation.start',
    titleKey: 'assistant.actions.dictationStart.title',
    descriptionKey: 'assistant.actions.dictationStart.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'dictation.stop',
    titleKey: 'assistant.actions.dictationStop.title',
    descriptionKey: 'assistant.actions.dictationStop.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      // Told apart because they differ where it matters: one keeps what was heard, the other
      // drops it. Absent keeps it, which is what stopping ordinarily means.
      { key: 'discard', kind: 'boolean', labelKey: 'assistant.fields.discard', required: false },
    ],
  }),
  action({
    name: 'panels.list',
    titleKey: 'assistant.actions.panelsList.title',
    descriptionKey: 'assistant.actions.panelsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * The zone is resolved against the surface in front rather than named: one panel sits in
     * different zones from one workspace to the next, and a caller cannot know which.
     */
    name: 'panel.open',
    titleKey: 'assistant.actions.panelOpen.title',
    descriptionKey: 'assistant.actions.panelOpen.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [PANEL],
  }),
  action({
    name: 'panel.close',
    titleKey: 'assistant.actions.panelClose.title',
    descriptionKey: 'assistant.actions.panelClose.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [PANEL],
  }),
]
