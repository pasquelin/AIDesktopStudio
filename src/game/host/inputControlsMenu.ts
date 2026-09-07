// SPDX-License-Identifier: MIT

import type { InputActionKind, InputBinding, GamepadControl } from '@shared/domain/inputMap'
import type { InputControls } from '../runtime/inputControls'

type InputControlsMenuLabels = {
  title: string
  add: string
  close: string
  reset: string
  change: string
  capture: string
  keyboard: string
  gamepad: string
  mouse: string
}

export type InputControlsMenu = {
  open: () => void
  close: () => void
  toggle: () => void
  isOpen: () => boolean
  bindings: InputControls['bindings']
  rebind: InputControls['rebind']
  reset: InputControls['reset']
  dispose: () => void
}

type Capture = {
  context: string
  action: string
  index: number
  kind: InputActionKind
  previous?: InputBinding
}

type InputControlsMenuOptions = {
  owner: Document
  controls: InputControls
  labels: InputControlsMenuLabels
}

export function createInputControlsMenu(options: InputControlsMenuOptions): InputControlsMenu {
  const { owner, controls, labels } = options
  const root = owner.createElement('div')
  root.dataset.inputControlsMenu = ''
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', labels.title)
  root.tabIndex = -1
  root.hidden = true
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#111d;color:#fff;font:16px system-ui;padding:clamp(24px,8vw,96px)'
  owner.body.appendChild(root)
  let capture: Capture | null = null
  let gamepadTimer: number | null = null
  let open = false
  let previousFocus: HTMLElement | null = null

  const stopCapture = (): void => {
    capture = null
    if (gamepadTimer !== null) owner.defaultView?.clearInterval(gamepadTimer)
    gamepadTimer = null
  }

  const redraw = (): void => {
    const restoreFocus = root.contains(owner.activeElement)
    root.replaceChildren()
    const panel = owner.createElement('section')
    panel.style.cssText =
      'max-width:760px;margin:auto;background:#20242c;border-radius:12px;padding:24px;box-shadow:0 24px 80px #000a'
    panel.append(heading(owner, labels.title))

    for (const map of controls.maps()) {
      const context = owner.createElement('section')
      context.append(heading(owner, map.id, 2))
      for (const action of map.actions) {
        const row = owner.createElement('div')
        row.style.cssText =
          'display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,2fr);gap:12px;align-items:center;margin:8px 0'
        const name = owner.createElement('span')
        name.textContent = action.id
        row.appendChild(name)
        const bindings = owner.createElement('div')
        bindings.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px'
        action.bindings.forEach((binding, index) => {
          const button = owner.createElement('button')
          button.type = 'button'
          button.dataset.inputBinding = ''
          button.textContent = bindingName(binding, labels)
          button.setAttribute('aria-label', `${labels.change} ${button.textContent}`)
          button.style.cssText = controlCss()
          button.addEventListener('click', () => {
            capture = {
              context: map.id,
              action: action.id,
              index,
              kind: action.kind,
              previous: binding,
            }
            button.textContent = labels.capture
            startGamepadCapture()
          })
          bindings.appendChild(button)
        })
        const add = owner.createElement('button')
        add.type = 'button'
        add.dataset.inputAdd = ''
        add.textContent = labels.add
        add.style.cssText = controlCss()
        add.addEventListener('click', () => {
          capture = {
            context: map.id,
            action: action.id,
            index: action.bindings.length,
            kind: action.kind,
          }
          add.textContent = labels.capture
          startGamepadCapture()
        })
        bindings.appendChild(add)
        row.appendChild(bindings)
        context.appendChild(row)
      }
      panel.appendChild(context)
    }

    const actions = owner.createElement('div')
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:24px'
    actions.appendChild(actionButton(owner, labels.reset, 'inputReset', resetControls))
    actions.appendChild(actionButton(owner, labels.close, 'inputClose', closeMenu))
    panel.appendChild(actions)
    root.appendChild(panel)
    if (restoreFocus) root.querySelector<HTMLElement>('button')?.focus()
  }

  const finishCapture = (binding: InputBinding): void => {
    const wanted = capture
    if (!wanted) return
    if (controls.rebind(wanted.context, wanted.action, wanted.index, binding)) {
      stopCapture()
      redraw()
    }
  }

  const rebind = (...parameters: Parameters<InputControls['rebind']>): boolean => {
    const changed = controls.rebind(...parameters)
    if (changed && open) redraw()
    return changed
  }

  const resetControls = (...parameters: Parameters<InputControls['reset']>): void => {
    controls.reset(...parameters)
    if (open) redraw()
  }

  const startGamepadCapture = (): void => {
    if (gamepadTimer !== null || !owner.defaultView) return
    let held = gamepadSignals(owner.defaultView.navigator)
    gamepadTimer = owner.defaultView.setInterval(() => {
      const wanted = capture
      if (!wanted) return
      const signals = gamepadSignals(owner.defaultView?.navigator)
      const fresh = signals.find(signal => !held.includes(signal))
      held = signals
      if (!fresh) return
      const binding = gamepadBinding(fresh, wanted)
      if (binding) finishCapture(binding)
    }, 50)
  }

  function openMenu(): void {
    if (open) return
    previousFocus = owner.activeElement instanceof HTMLElement ? owner.activeElement : null
    open = true
    root.hidden = false
    redraw()
    root.querySelector<HTMLElement>('button')?.focus()
  }

  function closeMenu(): void {
    stopCapture()
    open = false
    root.hidden = true
    previousFocus?.focus()
    previousFocus = null
  }

  const onKey = (event: KeyboardEvent): void => {
    if (capture) {
      event.preventDefault()
      finishCapture(keyboardBinding(event.code, capture))
      return
    }
    if (open && event.key === 'Tab') {
      keepFocusInside(root, event)
      return
    }
    if (event.code !== 'Escape') return
    event.preventDefault()
    if (open) closeMenu()
    else openMenu()
  }
  owner.addEventListener('keydown', onKey)

  const api: InputControlsMenu = {
    open: openMenu,
    close: closeMenu,
    toggle: () => (open ? closeMenu() : openMenu()),
    isOpen: () => open,
    bindings: controls.bindings,
    rebind,
    reset: resetControls,
    dispose: () => {
      stopCapture()
      owner.removeEventListener('keydown', onKey)
      if (open) closeMenu()
      root.remove()
      if (owner.defaultView && Reflect.get(owner.defaultView, 'iaStudioControls') === api) {
        Reflect.deleteProperty(owner.defaultView, 'iaStudioControls')
      }
    },
  }
  if (owner.defaultView) {
    Object.defineProperty(owner.defaultView, 'iaStudioControls', {
      configurable: true,
      value: api,
    })
  }
  return api
}

function heading(owner: Document, text: string, level = 1): HTMLHeadingElement {
  const node = owner.createElement(level === 1 ? 'h1' : 'h2')
  node.textContent = text
  node.style.cssText =
    level === 1 ? 'font-size:1.5rem;margin:0 0 20px' : 'font-size:1rem;margin:20px 0 8px'
  return node
}

function actionButton(
  owner: Document,
  label: string,
  data: 'inputReset' | 'inputClose',
  run: () => void,
): HTMLButtonElement {
  const button = owner.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.dataset[data] = ''
  button.style.cssText = controlCss()
  button.addEventListener('click', () => {
    run()
  })
  return button
}

function controlCss(): string {
  return 'appearance:none;border:1px solid #ffffff40;border-radius:6px;background:#ffffff12;color:inherit;padding:8px 12px;cursor:pointer'
}

function keyboardBinding(code: string, capture: Capture): InputBinding {
  const axis =
    capture.kind === 'axis2'
      ? {
          axis: capture.previous?.device === 'keyboard' ? (capture.previous.axis ?? 'x') : 'x',
        }
      : {}
  const scale =
    capture.previous?.device === 'keyboard' && capture.previous.scale !== undefined
      ? { scale: capture.previous.scale }
      : {}
  return { device: 'keyboard', code, ...axis, ...scale }
}

function keepFocusInside(root: HTMLElement, event: KeyboardEvent): void {
  const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex]')]
  if (controls.length === 0) return
  const active = root.ownerDocument.activeElement
  const current = active instanceof HTMLElement ? controls.indexOf(active) : -1
  const offset = event.shiftKey ? -1 : 1
  const next = current < 0 ? 0 : (current + offset + controls.length) % controls.length
  event.preventDefault()
  controls[next]?.focus()
}

function bindingName(binding: InputBinding, labels: InputControlsMenuLabels): string {
  if (binding.device === 'keyboard') return `${labels.keyboard} ${binding.code}`
  if (binding.device === 'gamepad') return `${labels.gamepad} ${binding.control}`
  return `${labels.mouse} ${binding.control}`
}

function gamepadSignals(navigator: Navigator | undefined): string[] {
  if (!navigator?.getGamepads) return []
  const signals: string[] = []
  for (const gamepad of navigator.getGamepads()) {
    if (!gamepad || gamepad.mapping !== 'standard') continue
    gamepad.buttons.forEach((button, index) => {
      if (button.pressed) signals.push(`button:${index}`)
    })
    gamepad.axes.forEach((axis, index) => {
      if (Math.abs(axis) > 0.75) signals.push(`axis:${index}`)
    })
  }
  return signals
}

const BUTTON_CONTROLS: readonly GamepadControl[] = [
  'south',
  'east',
  'west',
  'north',
  'leftShoulder',
  'rightShoulder',
  'leftTrigger',
  'rightTrigger',
  'select',
  'start',
  'leftStickButton',
  'rightStickButton',
  'dpadUp',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'home',
]

/**
 * 🛑 The WAY a half-axis pushes, carried over from what it replaces: `throttle` and `yaw` are two
 * buttons scaled apart, and a capture that dropped the scale made the pair add up instead of
 * cancelling — both halves reading +1, the lever pinned open.
 */
function shapeOf(previous: InputBinding | undefined): { scale?: number; invert?: boolean } {
  if (previous?.device !== 'gamepad') return {}
  return {
    ...(previous.scale === undefined ? {} : { scale: previous.scale }),
    ...(previous.invert === undefined ? {} : { invert: previous.invert }),
  }
}

function gamepadBinding(signal: string, capture: Capture): InputBinding | null {
  const [source, rawIndex] = signal.split(':')
  const index = Number(rawIndex)
  const shape = shapeOf(capture.previous)
  // A BUTTON serves a half-axis too: a trigger drives `accelerate` and a shoulder `yaw` in the
  // shipped contexts, and refusing one left those four slots stuck on « capturing… » for ever.
  if (source === 'button' && (capture.kind === 'button' || capture.kind === 'axis1')) {
    const control = BUTTON_CONTROLS[index]
    if (!control) return null
    return capture.kind === 'button'
      ? { device: 'gamepad', control }
      : { device: 'gamepad', control, ...shape }
  }
  if (source !== 'axis' || index < 0 || index > 3) return null
  if (capture.kind === 'axis2')
    return { device: 'gamepad', control: index < 2 ? 'leftStick' : 'rightStick' }
  if (capture.kind !== 'axis1') return null
  const controls: readonly GamepadControl[] = [
    'leftStickX',
    'leftStickY',
    'rightStickX',
    'rightStickY',
  ]
  const control = controls[index]
  return control ? { device: 'gamepad', control, ...shape } : null
}
