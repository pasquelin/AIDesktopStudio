import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { isSettingsSection, SETTINGS_SECTION_IDS } from '@shared/domain/settings'
import { TOOL_IDS, type ToolId } from '@shared/domain/tool'
import { WINDOW_PAGES } from '@shared/domain/window'
import { closeTool, revealTool, toolIsShown } from '@/helpers/revealPanel'
import { availableToolIds } from '@/helpers/toolRegistry'
import { getBridge } from '@/services/bridge'
import { studioFonts } from '@/services/fonts'
import { useDictation } from '@/stores/dictation'
import { toolSurface } from '@/stores/layouts'
import { withBridge, type ActionHandlers } from './actionHandler'
import { boolOf, oneOf, textOf } from './actionInputs'

/**
 * The window, the account and the small lists the studio keeps outside every project.
 *
 * Every one of these is a pass-through to a channel of `shared/ipc.ts`, and that is the whole of
 * what they are: the work already lives in the main process, it simply had no door.
 */

const NO_BRIDGE = 'this window is not connected to the studio process'

/**
 * Opens or closes the panel named, refused for one this surface cannot OFFER.
 *
 * Asked of `availableToolIds` rather than of the placement alone, which is what `panels.list`
 * answers with: a placement `requires` a model or a project, and opening one that does not have
 * it puts a different panel on screen while answering yes.
 */
function showPanel(input: Record<string, unknown>, run: (panel: ToolId) => boolean): ActionOutcome {
  const panel = oneOf(input, 'panel', TOOL_IDS)
  if (!panel) return refused('badInput', `"panel" wants one of: ${TOOL_IDS.join(', ')}`)
  if (!availableToolIds(toolSurface()).some(offered => offered === panel)) {
    return refused(
      'wrongSurface',
      `the surface in front does not carry the "${panel}" panel — panels.list answers which it does, and workspace.open brings another space forward`,
    )
  }

  return run(panel)
    ? { ok: true }
    : refused(
        'wrongSurface',
        `the studio did not move the "${panel}" panel — either it already stands that way, or the screen has just changed and the docks have not caught up with it. panels.list answers what is up right now`,
      )
}

export const SHELL_HANDLERS: ActionHandlers = {
  'auth.state': () => withBridge(bridge => bridge.settings.authState()),
  'updates.state': () => withBridge(bridge => bridge.updates.state()),
  'media.capabilities': () => withBridge(bridge => bridge.media.capabilities()),
  // The picker's own list, faces that ship included: `layer.editTextLayer` takes a source as well as a
  // family, and bare installed names left the three shipped ones unnameable.
  'fonts.list': () => withBridge(() => studioFonts.families()),
  'favorites.listPinnedRecipes': () => withBridge(bridge => bridge.favorites.list()),
  'mirror.openVideoReturnWindow': () => withBridge(bridge => bridge.mirror.open()),

  'help.openStudioWindow': input => {
    const page = oneOf(input, 'page', WINDOW_PAGES)
    return page
      ? withBridge(bridge => bridge.help.open(page))
      : refused('badInput', `"page" wants one of: ${WINDOW_PAGES.join(', ')}`)
  },

  'window.fullScreen': () => withBridge(bridge => bridge.window.toggleFullScreen()),

  /**
   * The window AND the language it draws in, in one answer: the language is resolved by the main
   * process — the setting may say `system`, and only that side sees what the machine prefers.
   */
  'window.state': () =>
    withBridge(async bridge => ({
      ...(await bridge.window.state()),
      language: await bridge.window.language(),
    })),

  'settings.open': input => {
    const section = textOf(input, 'section')
    return isSettingsSection(section)
      ? withBridge(bridge => bridge.settings.open(section))
      : Promise.resolve(
          refused('badInput', `"section" wants one of: ${SETTINGS_SECTION_IDS.join(', ')}`),
        )
  },

  /**
   * Answers the row itself rather than `ok` alone: `adopt` gives back `null` for a file the
   * studio cannot read, and a client told only "done" would go looking for an asset that was
   * never created.
   */
  'media.indexFileInPlace': async input => {
    const outcome = await withBridge(bridge => bridge.media.adopt(textOf(input, 'path') ?? ''))
    return outcome.ok && outcome.data === null
      ? refused(
          'badInput',
          '"path" names no file the studio can read as media — media.capabilities answers the kinds it takes, and file.facts says what is at a path',
        )
      : outcome
  },

  'favorite.pinAssetRecipe': input =>
    withBridge(bridge => bridge.favorites.pin(textOf(input, 'assetId') ?? '')),

  'favorite.unpinAssetRecipe': input =>
    withBridge(bridge => bridge.favorites.unpin(textOf(input, 'favoriteId') ?? '')),

  'fileInfo.openWindow': input =>
    withBridge(bridge => bridge.fileInfo.open(textOf(input, 'path') ?? '')),

  /**
   * Asked about because it quits the studio — so answering `ok` on a state that installs nothing
   * would have the person accept a relaunch that never comes. `install` is silent below `ready`.
   */
  'updates.install': async () => {
    const bridge = getBridge()
    if (!bridge) return refused('noBridge', NO_BRIDGE)

    const update = await bridge.updates.state()
    if (update.phase !== 'ready')
      return refused(
        'nothingPrepared',
        `no update is ready to install — updates.state answers "phase", which reads "${update.phase}" and has to read "ready"`,
      )

    await bridge.updates.install()
    return { ok: true }
  },

  // Only what this surface serves: a panel it does not carry cannot be opened there, so offering
  // it would be offering a refusal.
  'panels.list': () => {
    const surface = toolSurface()
    const panels = availableToolIds(surface).map(id => ({ id, open: toolIsShown(id) }))
    return { ok: true, data: panels }
  },

  'panel.open': input => showPanel(input, revealTool),
  'panel.close': input => showPanel(input, closeTool),

  'dictation.state': () => withBridge(bridge => bridge.dictation.state()),

  /**
   * The verdict is READ BACK from the main process, never off the store: `listening` reaches this
   * side on the event channel while `start()` answers on the invoke one, and nothing orders the
   * two — a microphone that did open would be reported refused.
   */
  'dictation.start': async () => {
    const bridge = getBridge()
    if (!bridge) return refused('noBridge', NO_BRIDGE)

    await useDictation.getState().start()
    const settled = await bridge.dictation.state()
    if (settled.state === 'listening') return { ok: true, data: settled }

    // `permissionRequired` is the person's own no; a model still missing or downloading is the
    // studio not being ready, which is not the same answer.
    return settled.state === 'permissionRequired'
      ? refused(
          'notAllowed',
          'the microphone was refused to this app — the permission is granted in the system settings, and nothing here can grant it',
        )
      : refused(
          'failed',
          `dictation did not open: its state reads "${settled.state}" — the speech model may still be missing or downloading, and dictation.state answers where it stands`,
        )
  },

  'dictation.stop': async input => {
    const dictation = useDictation.getState()
    await (boolOf(input, 'discard') ? dictation.cancel() : dictation.stop())
    return { ok: true }
  },
}
