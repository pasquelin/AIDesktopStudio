import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { isSignature, reservedByPlatform } from './shortcut'
import { LANGUAGES, TRANSLATIONS } from '../i18n'
import {
  bindingOf,
  COMMAND_REGISTRY,
  COMMAND_SCOPES,
  commandDescriptor,
  commandFor,
  commandIn,
  commandsIn,
  conflicts,
  platformDefaults,
  scopeOfWorkspace,
} from './command'
import { HOME_SURFACE } from './tool'
import { WORKSPACE_IDS } from './workspace'

function resolve(bundle: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), bundle)
}

describe('the command registry', () => {
  it('names each command once', () => {
    const ids = COMMAND_REGISTRY.map(descriptor => descriptor.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('files every command under a scope that exists', () => {
    for (const descriptor of COMMAND_REGISTRY) {
      expect(COMMAND_SCOPES, descriptor.id).toContain(descriptor.scope)
    }
  })

  it.each(LANGUAGES.map(language => language.code))('says what every command does in %s', code => {
    for (const descriptor of COMMAND_REGISTRY) {
      for (const key of [descriptor.titleKey, descriptor.helpKey]) {
        const text = resolve(TRANSLATIONS[code], key)
        expect(typeof text === 'string' && text.trim() !== '', `${key} is missing`).toBe(true)
      }
    }
  })

  // Same bar as the settings: a command whose effect cannot be stated is one nobody can bind.
  it('explains, and does not merely repeat the title', () => {
    for (const descriptor of COMMAND_REGISTRY) {
      const help = resolve(TRANSLATIONS.fr, descriptor.helpKey)
      expect(String(help).length, `${descriptor.helpKey} explains nothing`).toBeGreaterThan(40)
    }
  })

  it('groups commands by the surface that listens to them', () => {
    expect(commandsIn('scene').every(descriptor => descriptor.scope === 'scene')).toBe(true)
    expect(COMMAND_SCOPES.flatMap(scope => [...commandsIn(scope)])).toHaveLength(
      COMMAND_REGISTRY.length,
    )
  })

  it('finds a descriptor by id, and nothing for one it does not describe', () => {
    expect(commandDescriptor('scene.frame')?.scope).toBe('scene')
  })
})

describe('resolving a binding', () => {
  it('answers the shipped key when nothing was remapped', () => {
    expect(bindingOf('scene.translate', {})).toBe('KeyG')
  })

  it('lets a remap win', () => {
    expect(bindingOf('scene.translate', { 'scene.translate': 'KeyT' })).toBe('KeyT')
  })

  // Adding a command must need no migration, and removing one must leave no ghost.
  it('leaves a command bound to nothing when that is what it ships with', () => {
    expect(bindingOf('layout.reset', {})).toBeNull()
  })
})

describe('firing a signature', () => {
  it('answers the command of the surface that is listening', () => {
    expect(commandFor('Delete', 'scene', {})).toBe('scene.delete')
    expect(commandFor('Delete', 'sequence', {})).toBe('sequence.delete')
  })

  it('follows a remap', () => {
    expect(commandFor('KeyT', 'scene', { 'scene.translate': 'KeyT' })).toBe('scene.translate')
    expect(commandFor('KeyG', 'scene', { 'scene.translate': 'KeyT' })).toBeNull()
  })

  // Electron fires the menu's accelerators itself; matching them here would run them twice.
  it('never answers a global command, which the native menu already fires', () => {
    expect(commandFor('Meta+KeyN', 'scene', {})).toBeNull()
  })
})

describe('conflicts', () => {
  it('says nothing about a key shared across two surfaces, which is the design', () => {
    // `Delete` removes a node in the scene and a clip on the timeline; only one ever listens.
    expect(conflicts({})).toEqual([])
  })

  it('reports two commands of one surface fighting over the same key', () => {
    const clashing = conflicts({ 'scene.rotate': 'KeyG' })

    expect(clashing).toContain('scene.rotate')
    expect(clashing).toContain('scene.translate')
  })

  // A global command is fired wherever the focus sits, so it competes with every scope.
  it('reports a surface command taking a key the menu already fires', () => {
    expect(conflicts({ 'scene.frame': 'Meta+KeyN' })).toContain('scene.frame')
  })

  it('ignores commands bound to nothing, which cannot clash with anything', () => {
    expect(conflicts({ 'scene.frame': undefined })).not.toContain('layout.reset')
  })
})

describe('every scope the registry declares', () => {
  /**
   * The shortcuts screen groups the commands by scope and names each group from the bundle.
   * `canvas` had no label at all: its whole group was headed by the raw key. A scope added
   * without one is a heading nobody can read.
   */
  it('is named in both bundles', () => {
    for (const language of LANGUAGES) {
      const labels = TRANSLATIONS[language.code].settings.scope
      const unnamed = COMMAND_SCOPES.filter(scope => !labels[scope])

      expect(unnamed).toEqual([])
    }
  })

  it('holds at least one command, or it is a heading over nothing', () => {
    const empty = COMMAND_SCOPES.filter(scope => commandsIn(scope).length === 0)

    expect(empty).toEqual([])
  })
})

describe('looking a command up by its suffix', () => {
  it('finds the one that scope declares', () => {
    expect(commandIn('scene', 'undo')).toBe('scene.undo')
  })

  /**
   * The native menu asks every scope for `undo` and `redo` and greys the row out when the
   * answer is `null` — so the answer for a scope that has no such command is what the menu is
   * actually built on, and it was the one path never exercised.
   */
  it('answers null rather than guessing when that scope has none', () => {
    expect(commandIn('scene', 'jamaisDeclare')).toBeNull()
  })

  /**
   * Half of the trap `SCOPE_BY_WORKSPACE` describes — the half that lives here. A workspace
   * pointed at a scope declaring only one of the two leaves the other row greyed for good, and
   * nothing else says so. The other half, a store holding a history with no scope at all, is a
   * fact of `renderer/` that this file cannot see.
   */
  it('gives every workspace that edits an undo AND a redo', () => {
    const halved = WORKSPACE_IDS.map(workspace => scopeOfWorkspace(workspace))
      .filter(scope => scope !== null)
      .filter(scope => !commandIn(scope, 'undo') || !commandIn(scope, 'redo'))

    expect(halved).toEqual([])
  })
})

/**
 * Sixteen commands once shipped bound to `'P'` where `'KeyP'` was meant. `Signature` is a string,
 * so the typecheck was green, the lint was green, and every unit test was green — the binding
 * simply never fired, because a code is a position and a letter is not one. Only a test driving
 * a real keyboard caught it.
 */
describe('the keys the registry binds', () => {
  it('spells every default binding as a signature the studio can produce', () => {
    const malformed = COMMAND_REGISTRY.filter(
      descriptor => descriptor.defaultBinding !== null && !isSignature(descriptor.defaultBinding),
    )

    expect(malformed.map(descriptor => `${descriptor.id}: ${descriptor.defaultBinding}`)).toEqual(
      [],
    )
  })

  /** A guard that passed everything would pass this list too, and say nothing about it. */
  it('would refuse a letter written in place of a code', () => {
    expect(isSignature('KeyP')).toBe(true)
    expect(isSignature('P')).toBe(false)
  })

  /**
   * ⌘Q, ⌘M: the desktop answers these before any window does, on all three systems. A
   * command holding one is unreachable AND takes a gesture nothing else can make — which is
   * exactly what ⌘Q did on a French keyboard, where the window read it as the canvas's ⌘A.
   * ⌘W is the tab, so it is not on that list.
   */
  it('leaves the chords the desktop answers to the desktop', () => {
    for (const isMac of [true, false]) {
      const taken = COMMAND_REGISTRY.filter(descriptor =>
        reservedByPlatform(bindingOf(descriptor.id, platformDefaults(isMac))),
      )

      expect(taken.map(descriptor => descriptor.id)).toEqual([])
    }
  })
})

describe('what a system other than macOS ships', () => {
  it('gives full screen the key its desktops actually use', () => {
    expect(bindingOf('window.fullScreen', platformDefaults(false))).toBe('F11')
    expect(bindingOf('window.fullScreen', platformDefaults(true))).toBe('Ctrl+Meta+KeyF')
  })

  it('lets a remap win over what the system ships', () => {
    const remapped = { ...platformDefaults(false), 'window.fullScreen': 'Meta+KeyJ' }

    expect(bindingOf('window.fullScreen', remapped)).toBe('Meta+KeyJ')
  })

  it('spells every one of them as a signature the studio can produce', () => {
    const written = Object.values(platformDefaults(false))

    expect(written.filter(signature => !isSignature(signature))).toEqual([])
    expect(written.length).toBeGreaterThan(0)
  })

  /** Two commands of one scope sharing a key is a clash wherever it happens. */
  it('clashes with nothing it ships alongside', () => {
    expect(conflicts(platformDefaults(false))).toEqual([])
  })
})

/**
 * One space now opens two kinds, so ⌘Z has to follow the DOCUMENT. What the native menu offers
 * is built from this answer alone, in the main process, from a surface and a kind.
 */
describe('the scope a document edits through', () => {
  it('answers the kind before the space, where the two disagree', () => {
    expect(scopeOfWorkspace('3d', 'scene')).toBe('scene')
    expect(scopeOfWorkspace('3d', 'gui')).toBe('gui')
  })

  it('answers the space where the kind names no scope of its own', () => {
    expect(scopeOfWorkspace('image', 'image')).toBe('canvas')
    expect(scopeOfWorkspace('3d', null)).toBe('scene')
  })

  /**
   * 🛑 The home edits nothing, and `activeId` is NOT cleared on the way there — so the last
   * interface opened would otherwise arm ⌘Z over a screen holding no editor at all, and the
   * Edit menu would show an enabled Undo doing nothing.
   */
  it('answers nothing over the home, whatever tab was left active behind it', () => {
    expect(scopeOfWorkspace(HOME_SURFACE, 'gui')).toBeNull()
    expect(scopeOfWorkspace(null, 'gui')).toBeNull()
  })
})

describe('the commands that raise a dialogue only a person can fill', () => {
  /**
   * 🛑 A LIST, and it is an opt-in flag on 132 entries: written out so a seventh shows up here as
   * a name rather than as a count nobody can act on. **Blind spot**: nothing detects a command
   * that starts raising one later — this list is held by reading, not by the machine.
   *
   * `app.new` is the one that is NOT a native picker: it opens a window of the studio's own that
   * asks what to make. Same refusal, same reason — nothing here can fill it or read it back.
   */
  it('names every dialog command, so another is a deliberate change', () => {
    const raising = COMMAND_REGISTRY.filter(one => one.raisesDialog).map(one => one.id)

    expect([...raising].sort()).toEqual([
      'app.new',
      'canvas.export',
      'canvas.exportLayered',
      'montage.import',
      'project.new',
      'project.open',
      'scene.exportGame',
      'scene.optimizeSelection',
      'scene.worldPerformance',
    ])
  })
})
