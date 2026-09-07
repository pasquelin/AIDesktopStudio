import type { MenuItemConstructorOptions } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATIONS } from '@shared/i18n'
import { CHANNELS } from '@shared/ipc'
import { setWindowLanguage } from './language'
import { registerContextMenu, registerFieldMenu } from './contextMenu'

function emptyNativeImage() {
  return {
    representations: [] as unknown[],
    template: false,
    addRepresentation(representation: unknown) {
      this.representations.push(representation)
    },
    setTemplateImage(value: boolean) {
      this.template = value
    },
  }
}

/**
 * Electron in a bottle for this file alone, rather than the shared `ipc/testHarness`: what is
 * doubled here — a web contents that reports a right-click, a menu that pops up — is of no use to
 * the sixteen suites that harness serves, and teaching it about the spellchecker would put a
 * special case under all of them.
 *
 * `vi.hoisted` because `vi.mock` factories run above the imports: a plain const would still be in
 * its temporal dead zone when the factory is called.
 */
const electron = vi.hoisted(() => {
  const created: ((event: unknown, window: unknown) => void)[] = []
  const popped: {
    items: MenuItemConstructorOptions[]
    window: unknown
    /** Called by the system when the menu goes away, whether or not a row was chosen. */
    close: () => void
  }[] = []
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  /** The one window every web contents belongs to here: which window is not what these cases ask. */
  const owner = { name: 'the window that was clicked in' }

  return {
    created,
    popped,
    handlers,
    owner,
    app: {
      on: (event: string, listener: (event: unknown, window: unknown) => void) => {
        if (event === 'browser-window-created') created.push(listener)
      },
    },
    ipcMain: {
      handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
        void handlers.set(channel, handler),
    },
    BrowserWindow: { fromWebContents: (contents: unknown) => (contents ? owner : null) },
    nativeImage: { createEmpty: emptyNativeImage },
    Menu: {
      buildFromTemplate: (items: MenuItemConstructorOptions[]) => ({
        popup: (options: { window: unknown; callback?: () => void }) =>
          void popped.push({
            items,
            window: options.window,
            close: () => options.callback?.(),
          }),
      }),
    },
  }
})

vi.mock('electron', () => ({
  app: electron.app,
  ipcMain: electron.ipcMain,
  BrowserWindow: electron.BrowserWindow,
  nativeImage: electron.nativeImage,
  Menu: electron.Menu,
}))

/** A caret in a text field, with a misspelled word under the pointer. */
const inField = {
  isEditable: true,
  misspelledWord: 'coleur',
  dictionarySuggestions: ['couleur', 'chaleur'],
  editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
}

type RightClick = Partial<Omit<typeof inField, 'editFlags'>> & {
  editFlags?: Partial<typeof inField.editFlags>
}

/** A window as Electron announces it, with what a case reads of what the menu did to it. */
function openWindow() {
  const corrected: string[] = []
  const learned: string[] = []
  let raise: ((event: unknown, params: unknown) => void) | null = null

  const window = {
    webContents: {
      on: (event: string, listener: (event: unknown, params: unknown) => void) => {
        if (event === 'context-menu') raise = listener
      },
      replaceMisspelling: (word: string) => void corrected.push(word),
      session: { addWordToSpellCheckerDictionary: (word: string) => void learned.push(word) },
    },
  }

  for (const announce of electron.created) announce({}, window)

  return {
    window,
    corrected,
    learned,
    rightClick: (params: RightClick = {}) =>
      raise?.(
        {},
        { ...inField, ...params, editFlags: { ...inField.editFlags, ...params.editFlags } },
      ),
  }
}

/** The menu the last right-click raised, or nothing at all if it raised none. */
function lastMenu(): MenuItemConstructorOptions[] {
  const menu = electron.popped.at(-1)
  if (!menu) throw new Error('no menu was popped up')
  return menu.items
}

const labels = (): (string | undefined)[] => lastMenu().map(item => item.label)

function choose(label: string | undefined): void {
  const click: unknown = lastMenu().find(item => item.label === label)?.click
  if (typeof click !== 'function') throw new Error(`the menu has no ${label} row`)
  click()
}

beforeEach(() => {
  electron.created.length = 0
  electron.popped.length = 0
  electron.handlers.clear()
  setWindowLanguage('fr')
  registerFieldMenu()
  registerContextMenu()
})

describe('the menu a right-click raises', () => {
  it('offers the clipboard in the language of the studio', () => {
    const field = openWindow()

    field.rightClick({ misspelledWord: '' })
    const french = labels()
    setWindowLanguage('en')
    field.rightClick({ misspelledWord: '' })

    expect(french).toEqual([
      TRANSLATIONS.fr.menu.cut,
      TRANSLATIONS.fr.menu.copy,
      TRANSLATIONS.fr.menu.paste,
      TRANSLATIONS.fr.menu.selectAll,
    ])
    expect(labels()).toEqual([
      TRANSLATIONS.en.menu.cut,
      TRANSLATIONS.en.menu.copy,
      TRANSLATIONS.en.menu.paste,
      TRANSLATIONS.en.menu.selectAll,
    ])
  })

  /**
   * The whole reason a native menu exists here: everywhere else the studio draws its own in the
   * renderer, and a second one for a single press is what this would otherwise be.
   */
  it('raises nothing outside a field one can type in', () => {
    const field = openWindow()

    field.rightClick({ isEditable: false })

    expect(electron.popped).toEqual([])
  })
})

describe('context menu editing actions', () => {
  it('disables what the caret cannot do', () => {
    const field = openWindow()

    field.rightClick({ misspelledWord: '', editFlags: { canCut: false, canCopy: false } })

    expect(lastMenu().map(item => item.enabled)).toEqual([false, false, true, true])
  })

  it('corrects a misspelled word to the suggestion that was chosen', () => {
    const field = openWindow()

    field.rightClick()
    choose('chaleur')

    expect(field.corrected).toEqual(['chaleur'])
  })

  // Chromium answers with no suggestion at all for a word it cannot guess at, and this row is
  // then the only thing the menu has to say about it.
})

describe('context menu spelling actions', () => {
  it('learns a word Chromium had no suggestion for', () => {
    const field = openWindow()

    field.rightClick({ dictionarySuggestions: [] })

    expect(labels()[0]).toBe(TRANSLATIONS.fr.menu.addToDictionary)
    choose(TRANSLATIONS.fr.menu.addToDictionary)
    expect(field.learned).toEqual(['coleur'])
  })

  // Wired per window: the menu belongs to the one that was clicked in, not to whichever was
  // focused when it opened.
  it('pops up over the window the click came from', () => {
    openWindow()
    const second = openWindow()

    second.rightClick()

    expect(electron.popped).toHaveLength(1)
    expect(electron.popped[0]?.window).toBe(second.window)
  })
})

/** A PNG as short as one can be — these cases read where it goes, never what it draws. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

function popup(items: unknown): Promise<string | null> {
  const handler = electron.handlers.get(CHANNELS.menuPopup)
  if (!handler) throw new Error('nothing answers the context menu channel')
  return handler({ sender: { id: 1 } }, items) as Promise<string | null>
}

/** A window asking for a menu of its own, and the two ways the system can answer it. */
function raise(items: unknown) {
  const answer = popup(items)
  const menu = electron.popped.at(-1)
  if (!menu) throw new Error('no menu was popped up')

  return {
    answer,
    rows: menu.items,
    /**
     * In the order macOS uses, which is the one that catches the mistake: the menu closes FIRST,
     * and only then does the row it was left on send its action.
     */
    choose: (label: string) => {
      menu.close()
      const click: unknown = menu.items.find(item => item.label === label)?.click
      if (typeof click !== 'function') throw new Error(`the menu has no ${label} row`)
      click()
    },
    dismiss: () => menu.close(),
  }
}

const windowRows = [
  {
    id: 'reveal',
    label: 'Afficher dans le dossier',
    icon: PIXEL,
    tooltip: 'Ouvre le gestionnaire de fichiers sur le fichier sélectionné',
  },
  { id: 'rename', label: 'Renommer', enabled: false },
]

describe('the menu a window raises over its own surfaces', () => {
  it('answers the row that was chosen, though the menu closed before sending it', async () => {
    const menu = raise(windowRows)

    menu.choose('Afficher dans le dossier')

    await expect(menu.answer).resolves.toBe('reveal')
  })

  it('answers that nothing was chosen when the menu is dismissed', async () => {
    const menu = raise(windowRows)

    menu.dismiss()

    await expect(menu.answer).resolves.toBeNull()
  })

  it('greys the row the window declared unavailable', () => {
    expect(raise(windowRows).rows.map(row => row.enabled)).toEqual([true, false])
  })

  /**
   * "Tout bouton explique son action", and this is the only place left that can carry it: the
   * menu is drawn by the platform, so nothing in the window can be inspected for it. macOS is
   * the one platform that shows it — the others drop `toolTip` without a word.
   */
  it('carries what each row does, for the platform that can show it', () => {
    expect(raise(windowRows).rows[0]?.toolTip).toBe(
      'Ouvre le gestionnaire de fichiers sur le fichier sélectionné',
    )
  })

  /**
   * A bitmap filed at 1× draws at twice the height of a menu row, which is the whole reason
   * `addRepresentation` is used over `createFromDataURL`.
   */
  it('files the glyph at the density the window drew it for', () => {
    const icon = raise(windowRows).rows[0]?.icon

    expect(icon).toMatchObject({
      template: true,
      representations: [{ scaleFactor: 2, dataURL: PIXEL }],
    })
  })
})

describe('validating a window menu', () => {
  // The one channel where a window composes something handed straight to the platform, and
  // `addRepresentation` takes any URL string it is given — `file:` included.
  it('refuses a picture the window did not draw', () => {
    expect(() => popup([{ id: 'reveal', label: 'Révéler', icon: 'file:///etc/passwd' }])).toThrow()
    expect(electron.popped).toEqual([])
  })

  /**
   * The key a row answers to, DRAWN and never reserved: registering it would take it from the
   * window for good, and on macOS AppKit would then swallow the very ⌘Z the surface underneath
   * is listening for.
   */
  it('shows the key of a row without taking it from the window', () => {
    const shown = raise([{ id: 'cut', label: 'Couper', accelerator: 'CmdOrCtrl+X' }]).rows[0]

    expect(shown?.accelerator).toBe('CmdOrCtrl+X')
    expect(shown?.registerAccelerator).toBe(false)
  })

  // Electron parses an accelerator itself and throws on a shape it does not know, which would
  // leave the click with no menu at all. Only the four names `acceleratorOf` writes get through.
  it('refuses a modifier the studio never writes', () => {
    expect(() => popup([{ id: 'cut', label: 'Couper', accelerator: 'Foobar+X' }])).toThrow()
    expect(electron.popped).toEqual([])
  })

  // A rule is a row with nothing to choose, and twelve gestures in one menu need the groups.
  it('draws a separator as a rule rather than as a row', () => {
    const drawn = raise([{ id: '0', label: '', separator: true }, ...windowRows]).rows

    expect(drawn[0]).toEqual({ type: 'separator' })
  })

  /**
   * A row that OPENS onto others — twenty-four ways of adding to a scene do not read flat. It
   * carries no `click` of its own: the system reports the leaf, and the window resolves one id.
   */
  it('draws a row with rows underneath it, and gives it nothing to choose', () => {
    const drawn = raise([
      {
        id: '0',
        label: 'Ajouter',
        tooltip: 'Pose un élément dans la scène',
        submenu: [{ id: '0.0', label: 'Cube', tooltip: 'Pose un cube' }],
      },
    ]).rows[0]

    expect(drawn?.label).toBe('Ajouter')
    expect(drawn?.click).toBeUndefined()
    expect(drawn?.submenu).toMatchObject([{ label: 'Cube', toolTip: 'Pose un cube' }])
  })

  // The schema is the only thing between the two: the template would draw a labelled parent and
  // no rule at all, which is neither of the things the window asked for.
  it('refuses a rule that opens onto rows', () => {
    expect(() =>
      popup([{ id: '0', label: '', separator: true, submenu: [{ id: '0.0', label: 'Cube' }] }]),
    ).toThrow()
    expect(electron.popped).toEqual([])
  })

  // An empty one takes the WHOLE menu down rather than one row: `handle` rejects the invoke, and
  // a window that swallows the failure shows nothing at all where a menu was asked for.
  it('refuses a row that opens onto nothing', () => {
    expect(() => popup([{ id: '0', label: 'Ajouter', submenu: [] }])).toThrow()
    expect(electron.popped).toEqual([])
  })
})
