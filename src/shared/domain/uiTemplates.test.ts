import { describe, expect, it } from 'vitest'
import { UI_VERSION } from './ui'
import { uiFromPayload } from './uiDocument'
import {
  DEFAULT_UI_TEMPLATE,
  UI_TEMPLATE_IDS,
  isUiTemplateId,
  uiFromTemplate,
  type UiTemplateId,
} from './uiTemplates'

let counter = 0
const newId = (): string => `made-${(counter += 1)}`

describe('what a new interface opens on', () => {
  /** 🛑 A template writing a file the studio then refuses is a document nobody can save. */
  it.each(UI_TEMPLATE_IDS)('makes a document that reads back whole: %s', id => {
    const made = uiFromTemplate(id, newId, 'Controls')
    const read = uiFromPayload(JSON.parse(JSON.stringify(made)), newId)

    expect(read.trouble).toBeNull()
    expect(read.document).toEqual(made)
    expect(made.version).toBe(UI_VERSION)
  })

  /** Two elements under one id would give the layout and the picking two answers. */
  it.each(UI_TEMPLATE_IDS)('gives every element an id of its own: %s', id => {
    const ids = flattenElements(uiFromTemplate(id, newId, 'Controls').root).map(one => one.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('opens on nothing by default, and lays something down for the other three', () => {
    expect(uiFromTemplate(DEFAULT_UI_TEMPLATE, newId, 'Controls').root.children).toEqual([])
    for (const id of UI_TEMPLATE_IDS.filter(one => one !== 'empty')) {
      expect(uiFromTemplate(id, newId, 'Controls').root.children.length).toBeGreaterThan(0)
    }
  })

  /** A button a script cannot answer is a button nobody can wire: every one names its action. */
  it('names an action on every button it lays down', () => {
    for (const id of UI_TEMPLATE_IDS) {
      const buttons = flattenElements(uiFromTemplate(id, newId, 'Controls').root).filter(
        one => one.type === 'button',
      )
      expect(buttons.every(one => one.interaction.action !== '')).toBe(true)
    }
  })

  it('turns away an id read back from somewhere else', () => {
    expect(isUiTemplateId('hud')).toBe(true)
    expect(isUiTemplateId('inventory')).toBe(false)
  })

  const controlsTemplates: readonly UiTemplateId[] = ['mainMenuControls', 'pauseControls']
  it.each(controlsTemplates)('%s includes a controls action', id => {
    const actions = flattenElements(uiFromTemplate(id, newId, 'Contrôles').root).map(
      one => one.interaction.action,
    )

    expect(actions).toContain('controls')
  })

  it.each(controlsTemplates)('%s uses the translated controls label', id => {
    const labels = flattenElements(uiFromTemplate(id, newId, 'Contrôles').root)
      .filter(one => one.type === 'button')
      .map(one => ('text' in one ? one.text : null))

    expect(JSON.stringify(labels)).toContain('Contrôles')
  })
})

type Walked = {
  id: string
  type: string
  interaction: { action: string }
  children?: readonly Walked[]
}

const flattenElements = (element: Walked): Walked[] => [
  element,
  ...(element.children ?? []).flatMap(flattenElements),
]
