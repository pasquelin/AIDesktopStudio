import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { COMMAND_REGISTRY } from '@shared/domain/command'
import { DISPLAY_MODES } from '@shared/domain/scene'
import { ADD_ENTRIES } from '@/engines/scene/nodeKinds'
import { ADD_TOOLS, SCENE_TOOLS, addedKind } from './sceneTools'

const display = SCENE_TOOLS.find(tool => tool.id === 'display')

describe('scene tools', () => {
  it('binds every command it declares to a known one', () => {
    for (const tool of SCENE_TOOLS) {
      expect(COMMAND_REGISTRY.map(descriptor => descriptor.id)).toContain(tool.command)
    }
  })

  /**
   * Either namespace, and the second is not a loophole: the three verbs of a selection wear the
   * COMMANDS' own titles, so a word translated for the Édition menu is never translated twice.
   */
  it('names every tool through i18n rather than a literal', () => {
    for (const tool of SCENE_TOOLS) expect(tool.labelKey).toMatch(/^(sceneTools|commands)\./)
  })

  it('gives every tool an icon', () => {
    for (const tool of SCENE_TOOLS) expect(tool.icon).toBeTruthy()
  })

  /**
   * `sceneTools.*Hint` and no `commands.*.help`: a command's help is written for a MENU and runs
   * to two sentences — `sceneDuplicate` is 174 characters, against 43 for `frameHint`. A floating
   * tip on a bar button is one line, so the four verbs got a bar sentence of their own.
   */
  it('explains every tool, so no tooltip merely repeats the button’s own name', () => {
    for (const tool of SCENE_TOOLS) expect(tool.descriptionKey).toMatch(/^sceneTools\..+Hint$/)
  })

  // A key with no string behind it renders as the key itself: the bar would tip `sceneTools.x`.
  it('has a translation behind every key it declares, flyout rows included', () => {
    for (const tool of SCENE_TOOLS) {
      expect(i18next.exists(tool.labelKey)).toBe(true)
      expect(i18next.exists(tool.descriptionKey ?? '')).toBe(true)
      for (const mode of tool.modes ?? []) expect(i18next.exists(mode.labelKey)).toBe(true)
    }
  })

  // A missing string renders as `sceneViews.top` in the flyout, and nothing else would catch it.
  it('has a translation behind every row label', () => {
    for (const tool of SCENE_TOOLS) {
      for (const mode of tool.modes ?? []) expect(i18next.exists(mode.labelKey)).toBe(true)
    }
  })

  it('gives every flyout row an icon', () => {
    for (const mode of display?.modes ?? []) expect(mode.icon).toBeTruthy()
  })
})

describe('SCENE_TOOLS', () => {
  /**
   * The list, never a count — a cardinal written above it goes stale the next time one arrives.
   * What settled the bar was not the number: the ones that left were SETTINGS (ways of drawing,
   * sides, projection), and the ones that came back are VERBS a hand reaches for by the minute.
   */
  it('holds what a hand reaches for while manipulating, and nothing else', () => {
    expect(SCENE_TOOLS.map(tool => tool.id)).toEqual([
      'select',
      'navigate',
      'translate',
      'rotate',
      'scale',
      'snap',
      'space',
      'duplicate',
      'group',
      'delete',
      'negate',
      'carve',
      'weld',
      'intersect',
      'separate',
      'display',
      'quad',
      'frame',
      'isolate',
      'hide',
      'showAll',
    ])
  })

  it('offers every way of drawing under the one flyout it kept', () => {
    expect(display?.modes).toHaveLength(DISPLAY_MODES.length)
  })

  it('keeps the three transform modes as three reachable buttons', () => {
    const ids = SCENE_TOOLS.map(tool => tool.id)

    expect(ids).toContain('translate')
    expect(ids).toContain('rotate')
    expect(ids).toContain('scale')
  })

  // Switched several times a minute: a flyout would cost a hover before every change.
  it('gives none of the three transform buttons a flyout', () => {
    const transforms = SCENE_TOOLS.filter(tool =>
      ['translate', 'rotate', 'scale'].includes(tool.id),
    )

    expect(transforms.every(tool => tool.modes === undefined)).toBe(true)
  })

  it('arms selection first, so a click never grabs a handle by surprise', () => {
    expect(SCENE_TOOLS[0]?.id).toBe('select')
  })

  /** `select` opens the rule under what a scene GAINS, which stands above it — see `ADD_TOOLS`. */
  it('reads as groups rather than a run of icons', () => {
    expect(SCENE_TOOLS.filter(tool => tool.separatorBefore).map(tool => tool.id)).toEqual([
      'select',
      'snap',
      'duplicate',
      'negate',
      'display',
      'frame',
    ])
  })

  /**
   * Copy, cut and paste stay OFF the bar while duplicate, group and delete are on it, and the
   * asymmetry is deliberate: the clipboard three keep their native menu roles so a text field
   * goes on copying, and a row in their place would act on the scene with the caret in a field.
   * A BUTTON carries no such risk — nobody clicks a toolbar by mistake while typing.
   */
  it('draws the three verbs of a selection, and none of the clipboard', () => {
    const ids = SCENE_TOOLS.map(tool => tool.id)

    expect(ids).toContain('duplicate')
    expect(ids).toContain('group')
    expect(ids).toContain('delete')
    expect(ids).not.toContain('copy')
    expect(ids).not.toContain('paste')
  })

  // They qualify the armed tool rather than replacing it, so they follow it in their own group.
  it('puts the two toggles next to the transform modes they qualify', () => {
    const ids = SCENE_TOOLS.map(tool => tool.id)

    expect(ids.indexOf('snap')).toBe(ids.indexOf('scale') + 1)
    expect(ids.indexOf('space')).toBe(ids.indexOf('snap') + 1)
  })

  /**
   * Every button carries a command now — the two that acted through their rows alone, Add and
   * the six sides, are menu rows. Display keeps its flyout AND its command: the click cycles
   * what it draws rather than sitting dead under an open flyout.
   */
  it('gives every button a command of its own', () => {
    expect(SCENE_TOOLS.filter(tool => tool.command === undefined)).toEqual([])
  })
})

/**
 * What a scene GAINS. Adding was left to the native Add menu, three levels deep, and a camera,
 * a sprite, a caption and a rail had no other way in at all — no panel, no key, and a right-click
 * that only answers over a node.
 */
describe('ADD_TOOLS', () => {
  it('offers one button per family a scene grows by', () => {
    expect(ADD_TOOLS.map(tool => tool.id)).toEqual([
      'add:meshes',
      'add:lights',
      'add:figures',
      'add:objects',
    ])
  })

  /** Three flat lists rather than one of twenty-four: a flyout has no submenu to fold them into. */
  it('offers every kind each family declares', () => {
    expect(ADD_TOOLS.flatMap(tool => tool.modes ?? [])).toHaveLength(ADD_ENTRIES.length)
  })

  /** The objects are the reason this exists: none of them has a panel to be added from. */
  it('is the only place an object can be added from', () => {
    const objects = ADD_TOOLS.find(tool => tool.id === 'add:objects')

    expect(objects?.modes?.map(mode => mode.id)).toEqual([
      'sprite',
      'text',
      'camera',
      'path',
      'player',
    ])
  })

  /** Arms nothing, so it must carry no armed mode — that is what opens the menu on a click. */
  it('names no armed mode, being a menu of actions', () => {
    expect(ADD_TOOLS.filter(tool => tool.activeMode !== undefined)).toEqual([])
  })

  it('has a translation behind every key it declares', () => {
    for (const tool of ADD_TOOLS) {
      expect(i18next.exists(tool.labelKey)).toBe(true)
      expect(i18next.exists(tool.descriptionKey ?? '')).toBe(true)

      for (const mode of tool.modes ?? []) {
        expect(i18next.exists(mode.labelKey)).toBe(true)
        expect(i18next.exists(mode.descriptionKey)).toBe(true)
        expect(mode.icon).toBeTruthy()
      }
    }
  })

  it('reads a row back as the kind it adds, and nothing else as one', () => {
    expect(addedKind('add:objects', 'camera')).toBe('camera')
    expect(addedKind('add:meshes', 'box')).toBe('box')
    // A kind of another family: the row exists, but not under that button.
    expect(addedKind('add:lights', 'box')).toBeNull()
    expect(addedKind('display', 'shaded')).toBeNull()
  })
})
