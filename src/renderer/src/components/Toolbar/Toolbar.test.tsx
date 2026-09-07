import { mdiCursorDefaultOutline, mdiPencil } from '@mdi/js'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Toolbar } from './Toolbar'
import type { ToolbarItem } from './tools'

// The expected labels below are French because they come from the i18n bundle: they are
// user-facing text, not identifiers.
const TOOLS: ToolbarItem[] = [
  { id: 'select', labelKey: 'actions.close', icon: mdiCursorDefaultOutline, shortcut: 'V' },
  { id: 'brush', labelKey: 'actions.generate', icon: mdiPencil, shortcut: 'B' },
]

const UNAVAILABLE: ToolbarItem[] = [TOOLS[0]!, { ...TOOLS[1]!, unavailable: true }]

describe('Toolbar', () => {
  it('renders one button per tool and flags the active one', () => {
    render(<Toolbar tools={TOOLS} activeTool="brush" onTool={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Générer (B)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Fermer (V)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('leaves out a tool nothing can receive', () => {
    render(<Toolbar tools={UNAVAILABLE} onTool={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Fermer (V)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Générer (B)' })).not.toBeInTheDocument()
  })

  // A bar that ANSWERS a state — the crop frame's Apply and Cancel — is in no menu: dropped, it
  // leaves nothing on screen to say what the studio is waiting for.
  it('greys a tool that is merely disabled', () => {
    const tools: ToolbarItem[] = [TOOLS[0]!, { ...TOOLS[1]!, disabled: true }]
    render(<Toolbar tools={tools} onTool={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Générer (B)' })).toBeDisabled()
  })

  // A group that vanished entirely would otherwise fuse the two around it into one run of icons.
  it('hands the separator of a dropped tool to the next one shown', () => {
    const tools: ToolbarItem[] = [
      TOOLS[0]!,
      { ...TOOLS[1]!, id: 'gone', separatorBefore: true, unavailable: true },
      { ...TOOLS[1]!, id: 'after' },
    ]
    const { container } = render(<Toolbar tools={tools} onTool={vi.fn()} />)

    expect(container.querySelectorAll('span[aria-hidden="true"].bg-border')).toHaveLength(1)
  })

  // A toggle and an armed tool are two questions, drawn the same way: snapping being on says
  // nothing about which tool is armed.
  it('draws a pressed toggle without anything being armed', () => {
    const toggles: ToolbarItem[] = [{ ...TOOLS[0]!, pressed: true }, TOOLS[1]!]
    render(<Toolbar tools={toggles} onTool={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Fermer (V)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('leaves the armed tool pressed even when another one reports itself off', () => {
    const toggles: ToolbarItem[] = [TOOLS[0]!, { ...TOOLS[1]!, pressed: false }]
    render(<Toolbar tools={toggles} activeTool="brush" onTool={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Générer (B)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('reports the chosen tool', async () => {
    const onTool = vi.fn()
    render(<Toolbar tools={TOOLS} onTool={onTool} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fermer (V)' }))
    expect(onTool).toHaveBeenCalledWith('select')
  })

  // The Edit menu is the one place history lives; a bar that drew its own pair said the studio
  // had two of them.
  it('draws no history of its own', () => {
    render(<Toolbar tools={TOOLS} onTool={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Annuler/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Rétablir/ })).not.toBeInTheDocument()
  })

  it('declares its orientation', () => {
    render(<Toolbar tools={TOOLS} onTool={vi.fn()} orientation="horizontal" />)
    expect(screen.getByRole('toolbar')).toHaveAttribute('aria-orientation', 'horizontal')
  })

  it('tips to the side when vertical, so a tooltip never covers the button above', () => {
    render(<Toolbar tools={TOOLS} onTool={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Générer (B)' })).toHaveAttribute(
      'data-tooltip-place',
      'right',
    )
  })

  it('tips above when horizontal', () => {
    render(<Toolbar tools={TOOLS} onTool={vi.fn()} orientation="horizontal" />)
    expect(screen.getByRole('button', { name: 'Générer (B)' })).toHaveAttribute(
      'data-tooltip-place',
      'top',
    )
  })

  it('tips a tool’s description while keeping its name terse', () => {
    const described: ToolbarItem[] = [
      {
        id: 'brush',
        labelKey: 'actions.generate',
        descriptionKey: 'actions.close',
        icon: mdiPencil,
      },
    ]
    render(<Toolbar tools={described} onTool={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'Générer' })
    expect(button).toHaveAttribute('data-tooltip-content', 'Fermer')
  })

  /** A tooltip that has to name what the click will act ON — the shape a boolean will carve. */
  it('fills the holes of a description with what the caller gave it', () => {
    const named: ToolbarItem[] = [
      {
        id: 'carve',
        labelKey: 'actions.generate',
        descriptionKey: 'sceneTools.carveOnHint',
        descriptionValues: { name: 'Mur' },
        icon: mdiPencil,
      },
    ]
    render(<Toolbar tools={named} onTool={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Générer' })).toHaveAttribute(
      'data-tooltip-content',
      'Creuser les autres formes dans « Mur »',
    )
  })
})

const WITH_MODES: ToolbarItem[] = [
  {
    id: 'eraser',
    labelKey: 'actions.close',
    icon: mdiPencil,
    modes: [
      {
        id: 'point',
        labelKey: 'actions.close',
        descriptionKey: 'actions.generateHint',
        icon: mdiPencil,
      },
      {
        id: 'selection',
        labelKey: 'actions.generate',
        descriptionKey: 'actions.generateHint',
        icon: mdiPencil,
      },
    ],
  },
]

const SINGLE_MODE: ToolbarItem[] = [
  {
    id: 'eraser',
    labelKey: 'actions.close',
    icon: mdiPencil,
    modes: [
      {
        id: 'point',
        labelKey: 'actions.close',
        descriptionKey: 'actions.generateHint',
        icon: mdiPencil,
      },
    ],
  },
]

describe('Toolbar modes', () => {
  it('opens the modes of a tool on hover', async () => {
    render(<Toolbar tools={WITH_MODES} onTool={vi.fn()} onMode={vi.fn()} />)
    await userEvent.hover(screen.getByRole('button', { name: 'Fermer' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('reports the chosen mode', async () => {
    const onMode = vi.fn()
    render(<Toolbar tools={WITH_MODES} onTool={vi.fn()} onMode={onMode} />)

    await userEvent.hover(screen.getByRole('button', { name: 'Fermer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Générer' }))
    expect(onMode).toHaveBeenCalledWith('eraser', 'selection')
  })

  // The bar's own buttons are icons and need a name; its rows show one, so they take the
  // sentence alone — an `aria-label` there would replace the visible label (WCAG 2.5.3).
  it('explains a mode row without giving it a name of its own', async () => {
    render(<Toolbar tools={WITH_MODES} onTool={vi.fn()} onMode={vi.fn()} />)

    await userEvent.hover(screen.getByRole('button', { name: 'Fermer' }))

    const row = await screen.findByRole('menuitem', { name: 'Générer' })
    expect(row).toHaveAttribute('data-tooltip-place', 'right')
    expect(row.getAttribute('data-tooltip-content')).not.toBe('Générer')
    expect(row).not.toHaveAttribute('aria-label')
  })

  it('opens no menu for a tool with a single mode', async () => {
    // One mode is nothing to choose: the button acts directly, as map3D's bar does.
    render(<Toolbar tools={SINGLE_MODE} onTool={vi.fn()} onMode={vi.fn()} />)
    await userEvent.hover(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  /**
   * Rows and no armed mode is a menu of ACTIONS — Add a cube, Regenerate. Its click opens what
   * hovering would have and arms nothing: `onTool` there lit a button for a tool the space had
   * never heard of, and every caller filtered the id back out by hand.
   */
  it('arms nothing on click when the group carries no armed mode', async () => {
    const onTool = vi.fn()
    render(<Toolbar tools={WITH_MODES} onTool={onTool} onMode={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(onTool).not.toHaveBeenCalled()
    expect(await screen.findByRole('menuitem', { name: 'Générer' })).toBeInTheDocument()
  })

  /** A group that DOES arm still acts on click: the menu only offers to switch mode. */
  it('acts on click when the group is armed on one of its modes', async () => {
    const onTool = vi.fn()
    const armed = WITH_MODES.map(tool => ({ ...tool, activeMode: 'point' }))
    render(<Toolbar tools={armed} onTool={onTool} onMode={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(onTool).toHaveBeenCalledWith('eraser')
  })

  /**
   * A button that acts announces no pressed state — the montage bar already puts its two action
   * buttons in `extras` rather than say "toggle, not pressed" for ever.
   */
  it('gives a menu of actions no pressed state', () => {
    render(<Toolbar tools={WITH_MODES} onTool={vi.fn()} onMode={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Fermer' })).not.toHaveAttribute('aria-pressed')
  })

  it('closes the menu once a mode is chosen', async () => {
    render(<Toolbar tools={WITH_MODES} onTool={vi.fn()} onMode={vi.fn()} />)

    await userEvent.hover(screen.getByRole('button', { name: 'Fermer' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Générer' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
