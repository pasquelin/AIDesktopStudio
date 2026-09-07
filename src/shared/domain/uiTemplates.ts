import {
  DEFAULT_INTERACTION,
  DEFAULT_PLACEMENT,
  DEFAULT_STACK,
  DEFAULT_STYLE,
  DEFAULT_TEXT,
  SCREEN_PLACEMENT,
  type UiDocument,
  type UiElement,
} from './ui'
import { newUiDocument, newUiElement } from './uiDocument'

/**
 * What a new interface opens on. CODE and never a file to fetch, exactly as a scene template is:
 * a studio with no network makes every one of them.
 *
 * Shared rather than kept in the window, because two sides answer with one: the naming window
 * picks an id, and the assistant will name one on a `ui.create` without a window anywhere.
 */
export type UiTemplateId =
  'empty' | 'hud' | 'mainMenu' | 'pause' | 'mainMenuControls' | 'pauseControls'

export const UI_TEMPLATE_IDS: readonly UiTemplateId[] = [
  'empty',
  'hud',
  'mainMenu',
  'pause',
  'mainMenuControls',
  'pauseControls',
]

/**
 * What a new interface takes when nobody picks. `empty` and not the HUD: an interface is one of
 * four very different things, and opening every document on a health bar would have most authors
 * delete two elements before starting.
 */
export const DEFAULT_UI_TEMPLATE: UiTemplateId = 'empty'

export function isUiTemplateId(value: unknown): value is UiTemplateId {
  return UI_TEMPLATE_IDS.some(id => id === value)
}

/** A `Record`, so a fifth template does not compile until it has said what it lays down. */
const BUILDERS: Record<
  UiTemplateId,
  (newId: () => string, controls: string) => readonly UiElement[]
> = {
  empty: () => [],
  hud: hudElements,
  mainMenu: menuElements,
  pause: pauseElements,
  mainMenuControls: menuControlsElements,
  pauseControls: pauseControlsElements,
}

/** Through `newUiDocument` and `newUiElement`: what an element IS is described once, by the
 * reader a file goes through. A second table here would gain a field on read and lose it here. */
export function uiFromTemplate(
  id: UiTemplateId,
  newId: () => string,
  controls: string,
): UiDocument {
  const document = newUiDocument(newId)

  return { ...document, root: { ...document.root, children: BUILDERS[id](newId, controls) } }
}

const named = <T extends UiElement['type']>(type: T, newId: () => string, name: string) => ({
  ...newUiElement(type, newId),
  name,
})

const MARGIN = 32

/** A score at the top left and a health bar at the bottom left — the two every HUD starts with. */
function hudElements(newId: () => string): readonly UiElement[] {
  return [
    {
      ...named('text', newId, 'Score'),
      place: { ...DEFAULT_PLACEMENT, offset: { x: MARGIN, y: MARGIN } },
      text: { ...DEFAULT_TEXT, value: 'Score', size: 32 },
    },
    {
      ...named('progress', newId, 'Health'),
      place: {
        ...DEFAULT_PLACEMENT,
        anchor: 'bottomLeft',
        pivot: 'bottomLeft',
        offset: { x: MARGIN, y: MARGIN },
        size: {
          width: { mode: 'fixed', length: { unit: 'px', value: 320 } },
          height: { mode: 'fixed', length: { unit: 'px', value: 16 } },
        },
      },
    },
  ]
}

function menuElements(newId: () => string): readonly UiElement[] {
  return [centredStack(newId, 'Menu', [title(newId, 'Game'), ...buttons(newId, ['Play', 'Quit'])])]
}

function menuControlsElements(newId: () => string, controls: string): readonly UiElement[] {
  return [
    centredStack(newId, 'Menu', [
      title(newId, 'Game'),
      button(newId, 'Play', 'play'),
      button(newId, controls, 'controls'),
      button(newId, 'Quit', 'quit'),
    ]),
  ]
}

/**
 * A veil over whatever is behind it, and the choices on top. The veil is a `panel` stretched
 * across the screen rather than a property of the interface: what a pause LOOKS like is the
 * author's, and a built-in dimming would be one they could not turn off.
 */
function pauseElements(newId: () => string): readonly UiElement[] {
  return [
    veil(newId),
    centredStack(newId, 'Pause', [title(newId, 'Paused'), ...buttons(newId, ['Resume', 'Quit'])]),
  ]
}

function pauseControlsElements(newId: () => string, controls: string): readonly UiElement[] {
  return [
    veil(newId),
    centredStack(newId, 'Pause', [
      title(newId, 'Paused'),
      button(newId, 'Resume', 'resume'),
      button(newId, controls, 'controls'),
      button(newId, 'Quit', 'quit'),
    ]),
  ]
}

const veil = (newId: () => string): UiElement => ({
  ...named('panel', newId, 'Veil'),
  place: SCREEN_PLACEMENT,
  style: { ...DEFAULT_STYLE, background: { kind: 'color', color: '#000000' }, opacity: 0.6 },
  children: [],
})

function centredStack(
  newId: () => string,
  name: string,
  children: readonly UiElement[],
): UiElement {
  return {
    ...named('stack', newId, name),
    place: { ...DEFAULT_PLACEMENT, anchor: 'center', pivot: 'center' },
    stack: { ...DEFAULT_STACK, gap: 16, align: 'center' },
    children,
  }
}

const title = (newId: () => string, value: string): UiElement => ({
  ...named('text', newId, value),
  text: { ...DEFAULT_TEXT, value, size: 64, align: 'center' },
})

/** The `action` is what a script answers in `onUiAction`, so a template names one per button. */
const buttons = (newId: () => string, labels: readonly string[]): readonly UiElement[] =>
  labels.map(label => button(newId, label, label.toLowerCase()))

const button = (newId: () => string, label: string, action: string): UiElement => ({
  ...named('button', newId, label),
  interaction: { ...DEFAULT_INTERACTION, action, cursor: 'pointer' },
  style: {
    ...DEFAULT_STYLE,
    background: { kind: 'color', color: '#2a2a2a' },
    border: { width: 1, color: '#4a4a4a', radius: 4 },
    padding: { top: 12, right: 32, bottom: 12, left: 32 },
  },
  text: { ...DEFAULT_TEXT, value: label, size: 24, align: 'center' },
  children: [],
})
