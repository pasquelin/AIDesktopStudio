import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SttState } from '@shared/domain/dictation'
import { EMBEDDED_FONTS } from '@shared/domain/font'
import type { UpdateState } from '@shared/domain/update'
import type { Language } from '@shared/i18n/languages'
import { toolIsShown } from '@/helpers/revealPanel'
import { installFakeBridge } from '@/services/fakeBridge'
import { useDictation } from '@/stores/dictation'
import { useLayouts } from '@/stores/layouts'
import { chassisFor } from '@/stores/panels-fixtures'
import { runAction } from './executor'

/** What the main process answers about the microphone, which is the authority on it. */
const snapshot = (state: SttState) => vi.fn(async () => ({ state, download: null, failure: null }))

beforeEach(() => {
  installFakeBridge()
})

describe('what surrounds the documents', () => {
  it('answers the account, the window and the update without being told anything', async () => {
    expect(await runAction('auth.state', {})).toMatchObject({ ok: true })
    expect(await runAction('updates.state', {})).toMatchObject({ ok: true })
  })

  /**
   * The three faces that ship, which bare families left unnameable: `layer.editTextLayer` takes a source
   * as well, and a machine that has one of them installed offers it under the very same name.
   */
  it('names the shipped typefaces beside the installed ones, each with where it comes from', async () => {
    const outcome = await runAction('fonts.list', {})
    const listed = outcome.ok ? (outcome.data as { source: string; family: string }[]) : []

    expect(listed.filter(font => font.source === 'embedded').map(font => font.family)).toEqual(
      EMBEDDED_FONTS.map(font => font.family),
    )
  })

  /**
   * The language comes from the main process rather than from this side: the setting may say
   * `system`, and only that side sees what the machine really prefers.
   */
  it('answers the window with the language it actually draws in', async () => {
    const french: Language = 'fr'
    const language = vi.fn(async () => french)
    installFakeBridge({ window: { language } })

    const outcome = await runAction('window.state', {})

    expect(outcome).toMatchObject({ ok: true, data: { language: 'fr' } })
    expect(language).toHaveBeenCalled()
  })

  it('toggles full screen and opens the return, which no command could reach', async () => {
    const toggleFullScreen = vi.fn(async () => {})
    const open = vi.fn(async () => {})
    installFakeBridge({ window: { toggleFullScreen }, mirror: { open } })

    await runAction('window.fullScreen', {})
    await runAction('mirror.openVideoReturnWindow', {})

    expect(toggleFullScreen).toHaveBeenCalled()
    expect(open).toHaveBeenCalled()
  })

  /** The three of the Help menu are windows of the main process, so no command reaches them. */
  it('opens a help window by name, and refuses a page nothing offers', async () => {
    const open = vi.fn(async () => {})
    installFakeBridge({ help: { open } })

    expect(await runAction('help.openStudioWindow', { page: 'manual' })).toMatchObject({ ok: true })
    expect(open).toHaveBeenCalledWith('manual')

    expect(await runAction('help.openStudioWindow', { page: 'about' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('opens the settings on a section it knows, and refuses one it does not', async () => {
    const open = vi.fn(async () => {})
    installFakeBridge({ settings: { open } })

    expect(await runAction('settings.open', { section: 'general' })).toMatchObject({ ok: true })
    expect(open).toHaveBeenCalledWith('general')

    expect(await runAction('settings.open', { section: 'colours' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  it('pins and unpins a recipe, answering the whole list back', async () => {
    const pin = vi.fn(async () => [])
    const unpin = vi.fn(async () => [])
    installFakeBridge({ favorites: { pin, unpin } })

    await runAction('favorite.pinAssetRecipe', { assetId: 'asset-1' })
    await runAction('favorite.unpinAssetRecipe', { favoriteId: 'recipe-1' })

    expect(pin).toHaveBeenCalledWith('asset-1')
    expect(unpin).toHaveBeenCalledWith('recipe-1')
  })

  /**
   * `adopt` answers `null` for a file the studio cannot read, and a client told only "done" would
   * then go looking for an asset that was never created.
   */
  it('refuses a file the catalogue would not take rather than reporting it adopted', async () => {
    installFakeBridge({ media: { adopt: vi.fn(async () => null) } })

    expect(await runAction('media.indexFileInPlace', { path: 'Plans/a.raw' })).toMatchObject({
      ok: false,
      refusal: 'badInput',
    })
  })

  /**
   * `install` is silent below `ready`, and the action asks the person about a quit first — so
   * `ok` on a state that installs nothing is a relaunch accepted and never delivered.
   */
  it('installs an update that is ready, and refuses one that is not', async () => {
    const install = vi.fn(async () => {})
    const ready: UpdateState = { phase: 'ready', version: '2.0' }
    const idle: UpdateState = { phase: 'idle' }

    installFakeBridge({ updates: { install, state: vi.fn(async () => ready) } })
    expect(await runAction('updates.install', {})).toMatchObject({ ok: true })
    expect(install).toHaveBeenCalled()

    installFakeBridge({ updates: { install, state: vi.fn(async () => idle) } })
    expect(await runAction('updates.install', {})).toMatchObject({
      ok: false,
      refusal: 'nothingPrepared',
    })
    expect(install).toHaveBeenCalledTimes(1)
  })
})

describe('the panels of the surface in front', () => {
  beforeEach(() => {
    useLayouts.setState({ activeWorkspace: 'image', home: false })
    // The chassis as the shell would have set it up: an action reads the DECLARED panels, and
    // nothing declares them until `<Panels>` is on screen.
    chassisFor('image')
  })

  /**
   * Named rather than counted, and only what this surface serves: a panel the space does not
   * carry cannot be opened there, so offering it would be offering a refusal.
   */
  it('lists what this surface carries, saying which are up', async () => {
    const outcome = await runAction('panels.list', {})

    expect(outcome).toMatchObject({ ok: true })
    const listed = (outcome as { data: { id: string; open: boolean }[] }).data
    expect(listed.map(panel => panel.id)).toContain('layers')
    expect(listed.some(panel => panel.open)).toBe(true)
  })

  it('opens one, and closes it again', async () => {
    expect(await runAction('panel.open', { panel: 'assets' })).toEqual({ ok: true })
    expect(toolIsShown('assets')).toBe(true)

    expect(await runAction('panel.close', { panel: 'assets' })).toEqual({ ok: true })
    expect(toolIsShown('assets')).toBe(false)
  })

  // The Explorer sits on the home and in no space: naming it here is a refusal, not a no-op.
  it('refuses a panel this surface does not serve', async () => {
    expect(await runAction('panel.open', { panel: 'projects' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })

  /**
   * Two panels share the left half of every space, and `close` empties a half whatever stands in
   * it: asked to close the shelf while the half showed the generator, it closed the generator.
   */
  it('closes the panel named, or nothing at all', async () => {
    await runAction('panel.open', { panel: 'generator' })

    expect(await runAction('panel.close', { panel: 'assets' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
    expect(toolIsShown('generator')).toBe(true)
  })

  // A placement `requires` a project or a repository, and opening one without it put a DIFFERENT
  // panel on screen while answering yes — `panels.list` filtered on the very same question.
  it('refuses a panel this surface cannot offer yet', async () => {
    expect(await runAction('panel.open', { panel: 'history' })).toMatchObject({
      ok: false,
      refusal: 'wrongSurface',
    })
  })
})

describe('the microphone', () => {
  /**
   * Read back from the main process, never off the store: `listening` lands on the event channel
   * while `start()` answers on the invoke one, so a store consulted too early reports a
   * microphone that did open as refused.
   */
  it('opens it, and asks the main process what came of it', async () => {
    const start = vi.fn(async () => {})
    installFakeBridge({ dictation: { state: snapshot('listening') } })
    useDictation.setState({ state: 'idle', start })

    expect(await runAction('dictation.start', {})).toMatchObject({ ok: true })
    expect(start).toHaveBeenCalled()
  })

  // The person's own no, told apart from a studio that is not ready — a model still downloading
  // is not a permission refusal.
  it('says which of the two stopped it', async () => {
    useDictation.setState({ start: vi.fn(async () => {}) })

    installFakeBridge({ dictation: { state: snapshot('permissionRequired') } })
    expect(await runAction('dictation.start', {})).toMatchObject({
      ok: false,
      refusal: 'notAllowed',
    })

    installFakeBridge({ dictation: { state: snapshot('modelMissing') } })
    expect(await runAction('dictation.start', {})).toMatchObject({ ok: false, refusal: 'failed' })
  })

  /** The two ways of ending differ exactly there: one keeps what was heard, the other drops it. */
  it('keeps what was heard, or throws it away when asked', async () => {
    const stop = vi.fn(async () => {})
    const cancel = vi.fn(async () => {})
    useDictation.setState({ stop, cancel })

    await runAction('dictation.stop', {})
    expect(stop).toHaveBeenCalled()

    await runAction('dictation.stop', { discard: true })
    expect(cancel).toHaveBeenCalled()
  })
})
