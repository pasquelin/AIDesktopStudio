import i18next from 'i18next'
import { describe, expect, it } from 'vitest'
import { SMART_SELECTION_MODEL } from '@shared/domain/smartSelectionInference'
import { UNBUILT_TOOLS } from '@/engines/canvas/CanvasEngine'
import type { CanvasTool } from '@/engines/canvas/canvasTool'
import { AI_EDITS } from './aiActions'
import {
  AI_EDIT_TOOL,
  aiEditCommand,
  aiEditOf,
  IMAGE_TOOLS,
  TOOL_COMMANDS,
  canvasToolFor,
  cursorFor,
  toolById,
} from './imageTools'

/**
 * Every gesture the bar can arm, and whether it is reachable — the group's own button, plus one
 * row per mode. Read through `canvasToolFor`, which is what the component calls: a group whose
 * modes mean different tools is only crossed correctly through it.
 */
const armableRows = (): { id: string; tool: CanvasTool | null; reachable: boolean }[] =>
  IMAGE_TOOLS.flatMap(entry => [
    { id: entry.id, tool: canvasToolFor(entry.id), reachable: entry.disabled !== true },
    ...(entry.modes ?? []).map(mode => ({
      id: `${entry.id}/${mode.id}`,
      tool: canvasToolFor(entry.id, mode.id),
      reachable: entry.disabled !== true && mode.disabled !== true,
    })),
  ])

describe('image tools', () => {
  it('keeps every selection gesture in the one selection menu', () => {
    expect(toolById('region')?.modes?.map(mode => mode.id)).toEqual([
      'rectangle',
      'ellipse',
      'lasso',
      'smart',
    ])
    expect(toolById('smartSelect')).toBeNull()
  })

  it('arms one intelligent selection gesture from the selection menu', () => {
    expect(canvasToolFor('region', 'smart')).toBe('smartSelect')
    expect(
      TOOL_COMMANDS.filter(entry => entry.tool === 'region' && entry.mode === 'smart'),
    ).toEqual([{ command: 'canvas.toolSmartSelect', tool: 'region', mode: 'smart' }])
  })

  it('arms intelligent comments with the smart comment canvas tool', () => {
    expect(canvasToolFor('comment', 'smart')).toBe('smartComment')
  })

  it('uses a visible selection cursor for the intelligent gesture', () => {
    expect(cursorFor('region', 'smart')).toContain('data:image/svg+xml')
  })

  /**
   * 🛑 The blind spot of `ImageDocument`'s `runnable`: it answers ONE model and reads any other as
   * ready, so a second one declared here would grey nothing. This is what reddens instead.
   *
   * The MODEL and not the `background-removal/cutout` employment: `smartSelectionHost` loads this
   * one by name, so a cloud chosen for that employment serves the batch edit and never the gesture.
   */
  it('asks the two intelligent modes for the one model the gesture actually runs', () => {
    const asked = IMAGE_TOOLS.flatMap(tool => tool.modes ?? []).flatMap(mode =>
      mode.needsModel === undefined ? [] : [mode.needsModel],
    )

    expect(asked).toEqual([SMART_SELECTION_MODEL, SMART_SELECTION_MODEL])
  })

  it('names every tool through i18n rather than a literal', () => {
    for (const tool of IMAGE_TOOLS) expect(tool.labelKey).toMatch(/^imageTools\./)
  })

  it('gives every tool an icon', () => {
    for (const tool of IMAGE_TOOLS) expect(tool.icon).toBeTruthy()
  })

  /**
   * An armed mode REPLACES its tool's glyph in the bar, so two modes wearing the same one leave
   * the bar saying the same thing twice. Both promptable modes wore the plain wand: armed, the
   * comment stopped looking like a comment, and only its tooltip still said which it was.
   */
  it('gives each mode a glyph no other tool already wears armed', () => {
    const armed = IMAGE_TOOLS.flatMap(tool =>
      (tool.modes ?? []).map(mode => ({ at: `${tool.id}/${mode.id}`, icon: mode.icon })),
    )
    const shared = armed.filter(one =>
      armed.some(
        other => other.at.split('/')[0] !== one.at.split('/')[0] && other.icon === one.icon,
      ),
    )

    expect(shared.map(one => one.at)).toEqual([])
  })

  it('gives the pointer two modes, so it opens a flyout', () => {
    expect(toolById('pointer')?.modes).toHaveLength(2)
  })

  it('leaves a single-purpose tool without modes, so its button acts directly', () => {
    // Against a group that really exists: `brush` became a mode of `paint`, and asserting on
    // an id that no longer resolves passes while testing nothing.
    expect(toolById('fill')?.modes).toBeUndefined()
    expect(toolById('picker')?.modes).toBeUndefined()
    // The eraser lost its second mode with the gesture that never existed behind it.
    expect(toolById('eraser')?.modes).toBeUndefined()
  })

  it('names every mode through i18n too', () => {
    for (const tool of IMAGE_TOOLS) {
      for (const mode of tool.modes ?? []) expect(mode.labelKey).toMatch(/^imageTools\./)
    }
  })

  it('explains every tool, so no tooltip merely repeats the button’s own name', () => {
    for (const tool of IMAGE_TOOLS) expect(tool.descriptionKey).toMatch(/^imageTools\..+Hint$/)
  })

  it('explains every mode too', () => {
    for (const tool of IMAGE_TOOLS) {
      for (const mode of tool.modes ?? []) {
        expect(mode.descriptionKey).toMatch(/^imageTools\..+Hint$/)
      }
    }
  })

  it('has a translation behind every key it declares', () => {
    // A key with no string behind it renders as the key itself: the bar would tip `imageTools.x`.
    for (const tool of IMAGE_TOOLS) {
      expect(i18next.exists(tool.labelKey)).toBe(true)
      expect(i18next.exists(tool.descriptionKey ?? '')).toBe(true)

      for (const mode of tool.modes ?? []) {
        expect(i18next.exists(mode.labelKey)).toBe(true)
        expect(i18next.exists(mode.descriptionKey ?? '')).toBe(true)
      }
    }
  })

  it('finds nothing for an unknown id', () => {
    expect(toolById('nope')).toBeNull()
  })
})

/**
 * The five the Image menu was the only way to, with no default key on purpose — they spend
 * credit. A menu is where a rare gesture lives, and these are what this studio has that a pixel
 * editor does not.
 */
describe('the model edits, as a group of the bar', () => {
  /** Sorted on both sides: the menu reads in its own order, and a sixth edit must appear here. */
  it('offers every edit the canvas knows how to prepare', () => {
    expect(AI_EDIT_TOOL.modes?.map(mode => mode.id).sort()).toEqual(Object.keys(AI_EDITS).sort())
  })

  it('has a translation behind every key it declares', () => {
    expect(i18next.exists(AI_EDIT_TOOL.labelKey)).toBe(true)
    expect(i18next.exists(AI_EDIT_TOOL.descriptionKey ?? '')).toBe(true)

    for (const mode of AI_EDIT_TOOL.modes ?? []) {
      expect(i18next.exists(mode.labelKey)).toBe(true)
      expect(i18next.exists(mode.descriptionKey)).toBe(true)
    }
  })

  /** Arms nothing, so it must carry no armed mode — that is what opens the menu on a click. */
  it('names no armed mode, being a menu of actions', () => {
    expect(AI_EDIT_TOOL.activeMode).toBeUndefined()
  })

  /**
   * From what the SCREEN offers, not from the table the lookup reads: mapped over `AI_EDIT_ROWS`
   * the assertion would read itself back. A row the menu draws and no command answers is what
   * this is here to catch.
   */
  it('fires a command for every row it draws, and none for a row from nowhere', () => {
    const rows = AI_EDIT_TOOL.modes ?? []

    expect(rows.filter(row => aiEditCommand(row.id) === null)).toEqual([])
    expect(aiEditCommand('nope')).toBeNull()
  })

  /** The other way round, which is what the handler takes — one table, two lookups. */
  it('reads each command back as the edit it prepares', () => {
    const edits = (AI_EDIT_TOOL.modes ?? []).map(row => aiEditCommand(row.id))

    expect(edits.map(command => (command ? aiEditOf(command) : null))).toEqual(
      (AI_EDIT_TOOL.modes ?? []).map(row => row.id),
    )
    expect(aiEditOf('canvas.flatten')).toBeNull()
  })
})

describe('what the bar arms against what the engine implements', () => {
  /**
   * The bar and the engine hold two halves of the same truth, and nothing made them agree: the
   * frame group armed a tool `onPointerDown` ignores, then the comment button did the same. The
   * cursor changed, the button lit, and the pointer did nothing.
   */
  it('greys every row that would arm a tool the engine ignores', () => {
    const live = armableRows().filter(
      row => row.reachable && row.tool && UNBUILT_TOOLS.has(row.tool),
    )
    expect(live.map(row => row.id)).toEqual([])
  })

  it('greys nothing whose tool the engine implements', () => {
    // Groups only: a mode can be greyed for its own sake — `text/path` writes on a curve, which
    // is unbuilt without `text` being, and the two share one `CanvasTool`.
    const hidden = IMAGE_TOOLS.filter(entry => entry.disabled === true).filter(entry => {
      const tool = canvasToolFor(entry.id)
      return !tool || !UNBUILT_TOOLS.has(tool)
    })
    expect(hidden.map(entry => entry.id)).toEqual([])
  })

  /**
   * `MenuButton` hangs the hover wrapper on a div around the button, so a greyed group still
   * opens its menu: a live row inside one is a reachable way to arm what the group refuses.
   */
  it('leaves no live row inside a greyed group, which the flyout would still offer', () => {
    for (const entry of IMAGE_TOOLS) {
      if (entry.disabled !== true) continue
      for (const mode of entry.modes ?? []) expect(mode.disabled).toBe(true)
    }
  })
})

/**
 * The modes of a group do not always mean one tool. Two of them do not, and both were a defect
 * before they were a case: the pointer group holds dragging the content and dragging the view,
 * and the paint group holds a brush and a pencil that lay the same disc with a different edge.
 */
describe('the mode a group is armed on', () => {
  it('tells the pencil from the brush, which the engine reads as two tools', () => {
    expect(canvasToolFor('paint', 'brush')).toBe('brush')
    expect(canvasToolFor('paint', 'pencil')).toBe('pencil')
  })

  it('falls back to the brush for the group with no mode named', () => {
    expect(canvasToolFor('paint')).toBe('brush')
  })

  it('tells dragging the view from dragging the content', () => {
    expect(canvasToolFor('pointer', 'hand')).toBe('hand')
    expect(canvasToolFor('pointer', 'move')).toBe('move')
  })
})
