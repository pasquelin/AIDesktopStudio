import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import i18next from 'i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { IDENTITY_TRANSFORM, type Transform } from '@shared/domain/transform'
import type { Rig } from '@shared/domain/rig'
import type { SceneRendererOptions } from '@/engines/scene/SceneRenderer'
import { installFakeBridge } from '@/services/fakeBridge'
import { fakeMenu } from '@/helpers/menu-fixtures'
import { characterOf, seedCharacter, useCharacters } from '@/stores/character'
import { clearCharacters, installCharacterDocument } from '@/stores/character-fixtures'
import { characterViewOf, useCharacterView } from '@/stores/characterView'
import { useAnimationViews } from '@/stores/animationView'
import { publishCommand } from '@/services/commandBus'
import { useDocuments } from '@/stores/documents'
import { sceneViewOf, useSceneViews } from '@/stores/sceneViews'
import { workshopIdOf } from '@shared/domain/character'
import { useSettings } from '@/stores/settings'
import { CharacterDocument } from './CharacterDocument'

/** Every engine built, so a case can fire the callbacks the real one would. */
const built = vi.hoisted((): SceneRendererOptions[] => [])

/** Every bone the engine was asked to POSE, which is the gesture that writes nothing. */
const posed = vi.hoisted((): string[] => [])

/** Every set of held axes the engine was handed — what a joint may not leave while dragged. */
const holds = vi.hoisted((): string[][] => [])

/** What each export was asked to carry of the studio's own — the band, for a motion. */
const carried = vi.hoisted((): (Record<string, unknown> | null)[] => [])

/** Every set of directions the keyboard handed the camera. */
const flown = vi.hoisted((): string[][] => [])

/** Whether the persistent flight was armed, each time it was said. */
const navigated = vi.hoisted((): boolean[] => [])

/** Every viewport dressing handed to the engine, in order — the decor AND the navigation. */
const configured = vi.hoisted((): Record<string, unknown>[] => [])

/** Live engines, so a case can read skin/clear calls that the constructor planted on `this`. */
const engines = vi.hoisted(
  (): Array<{
    skinModel: ReturnType<typeof vi.fn>
    clearRig: ReturnType<typeof vi.fn>
    setSkeletons: ReturnType<typeof vi.fn>
    setDisplayModes: ReturnType<typeof vi.fn>
  }> => [],
)

vi.mock('@/engines/scene/SceneRenderer', () => ({
  SceneRenderer: class {
    constructor(options: unknown) {
      built.push(options as SceneRendererOptions)
      engines.push(this)
    }

    mount = vi.fn()
    dispose = vi.fn()
    apply = vi.fn()
    configure = (next: Record<string, unknown>) => {
      configured.push(next)
    }
    setSkeletons = vi.fn()
    setDisplayModes = vi.fn()
    setMorphInfluences = vi.fn()
    setPoseMode = vi.fn()
    setSculptMode = vi.fn()
    setArmedRelief = vi.fn()
    setSculptBrush = vi.fn()
    setSculptTool = vi.fn()
    setMode = vi.fn()
    setPickedBone = vi.fn()
    setRestEditing = vi.fn()
    setHeldBoneAxes = (axes: readonly string[]) => {
      holds.push([...axes])
    }
    poseBone = (_nodeId: string, bone: string) => {
      posed.push(bone)
    }
    skinModel = vi.fn()
    applyAutoRig = vi.fn()
    clearRig = vi.fn()
    frameContents = vi.fn()
    frameAll = vi.fn()
    meshSample = vi.fn()
    // A flight is under way, which is the one state a motion key is read in.
    flying = true
    setMotion = (held: Set<string>) => {
      flown.push([...held])
    }
    setNavigating = (on: boolean) => {
      navigated.push(on)
    }
    // What the clock pushes into the engine: the head, and what a block is being watched on.
    setPlayhead = vi.fn()
    setPreview = vi.fn()
    exportTo = (_format: string, _scope: string, extras?: Record<string, unknown>) => {
      carried.push(extras ?? null)
      return Promise.resolve(new Uint8Array([1, 2]))
    }
  },
}))

const ASSET = 'asset-hero'
const DOCUMENT = 'doc-hero'
const WORKSHOP = workshopIdOf(ASSET)

/** The tab, on the model it was opened from — what the dock and the shell both address it by. */
const showTab = (): void => {
  installCharacterDocument(DOCUMENT, ASSET)
  render(<CharacterDocument documentId={DOCUMENT} />)
}

const raised = (y: number): Transform => ({
  ...IDENTITY_TRANSFORM,
  position: { x: 0, y, z: 0 },
})

/** One bone, so a case can read back what a gesture wrote into the skeleton of the file. */
const RIG: Rig = {
  origin: 'local',
  bones: [{ name: 'Spine', parent: null, rest: IDENTITY_TRANSFORM }],
}

const restOfSpine = (): Transform | undefined =>
  characterOf(useCharacters.getState(), ASSET).rig?.bones[0]?.rest

beforeEach(() => {
  built.length = 0
  posed.length = 0
  flown.length = 0
  navigated.length = 0
  holds.length = 0
  carried.length = 0
  configured.length = 0
  engines.length = 0
  clearCharacters()
  // The whole view, never the one flag a case happens to read: a padlock left closed by the case
  // before was what made the next one pass, and the leak showed only when the bar moved.
  useCharacterView.setState({ views: {} })
  useAnimationViews.setState({ views: {} })
  // The workshop's own view is keyed on the asset: the bones a case put out would stay out.
  useSceneViews.setState({ views: {} })
  installFakeBridge()
})

afterEach(() => {
  vi.clearAllMocks()
})

/**
 * A rig is EDITED here, gizmo and selection and all, so how the view turns belongs to the person
 * — while the decor stays this window's own, which is bones on a grid and none of the studio's
 * helpers. The window used to freeze both halves on the defaults.
 */
it('follows the person on how the view turns, and nothing else of the studio', async () => {
  showTab()
  await waitFor(() => expect(configured.length).toBeGreaterThan(0))

  // Changed while the window is OPEN, which is how a preference is changed: the settings live in
  // another window, and this one must not have to be closed for the change to land.
  act(() =>
    useSettings.setState(state => ({
      settings: { ...state.settings, three: { ...state.settings.three, orbitUnderCursor: true } },
    })),
  )

  await waitFor(() => expect(configured.at(-1)?.orbitUnderCursor).toBe(true))
  // Its own decor all the same, untouched by what the studio happens to show.
  expect(configured.at(-1)?.showGrid).toBe(true)
  expect(configured.at(-1)?.lightHelpers).toBe('off')
})

// Asked for at the first sight of the window: a joint could be moved and never turned, and the
// only way to say which was to edit the source.
it('offers the ways of acting on a joint, opens on placing one, and offers no scale', async () => {
  showTab()

  const bar = screen.getByRole('toolbar', { name: 'Outils du squelette' })

  // The scene's six view tools, the bones, and the two states. No padlock on the lengths: posing
  // turns the bone arriving at a joint, and editing a skeleton is where one shortens a bone.
  expect(within(bar).getAllByRole('button')).toHaveLength(9)
  expect(within(bar).queryByRole('button', { name: /longueurs/i })).toBeNull()
  // A joint is a point and a length: there is nothing about one to enlarge.
  expect(within(bar).queryByRole('button', { name: /échelle/i })).toBeNull()
  // The armed verb, which is the one the gizmo obeys — the lock beside it is pressed too.
  expect(within(bar).getByRole('button', { name: /Déplacer/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await userEvent.click(within(bar).getByRole('button', { name: /Pivoter/ }))

  expect(characterViewOf(useCharacterView.getState(), ASSET).mode).toBe('rotate')
})

/**
 * 🛑 Exactly one lit, never two: drawn as a pair of free toggles they both took the accent and
 * read as two modes at once — « soit je place l'articulation, soit je joue avec le modèle ».
 */
it('lights one state at a time, and hands the held axes to the engine', async () => {
  showTab()
  const bar = screen.getByRole('toolbar', { name: 'Outils du squelette' })
  const pressedIn = () =>
    within(bar)
      .getAllByRole('button')
      .filter(one => one.getAttribute('aria-pressed') === 'true')
      .map(one => one.getAttribute('aria-label'))

  expect(pressedIn()).toEqual(['Déplacer', 'Afficher les os', 'Manipuler'])
  // 🛑 The engine, not just the store: a padlock applied on release alone lets a joint leave the
  // axis a hand meant to keep it on for the whole of a gesture.
  expect(holds.at(-1)).toEqual([])

  await userEvent.click(within(bar).getByRole('button', { name: /squelette/i }))

  expect(pressedIn()).toEqual(['Déplacer', 'Afficher les os', 'Modifier le squelette'])
  expect(characterViewOf(useCharacterView.getState(), ASSET).editingRest).toBe(true)
})

/**
 * The two gestures of this window, and the bar is the only thing that tells them apart: a bone
 * moved POSES the character — the mesh follows — until the bar says the rest is being edited.
 * Written on both, a joint pulled into the elbow it belongs in took the whole arm with it.
 */
it('poses the bone the gizmo moved, and writes the skeleton only once the bar asks', async () => {
  seedCharacter(ASSET, RIG, {})
  showTab()
  const move = { id: 'node-1', bone: 'Spine', transform: raised(0.2) }

  act(() => built[0]?.onTransform?.([move]))

  expect(posed).toEqual(['Spine'])
  expect(restOfSpine()?.position.y).toBe(0)

  await userEvent.click(
    within(screen.getByRole('toolbar', { name: 'Outils du squelette' })).getByRole('button', {
      name: /squelette/i,
    }),
  )
  // Emptied on purpose: turning the toggle on puts every bone back on its rest through the very
  // same door, and what this half is about is what the NEXT gesture does.
  posed.length = 0
  act(() => built[0]?.onTransform?.([move]))

  expect(posed).toEqual([])
  expect(restOfSpine()?.position.y).toBeCloseTo(0.2, 5)
})

it('drops the waiting note as soon as the model has landed', async () => {
  showTab()

  expect(screen.getByText('En attente du personnage…')).toBeInTheDocument()

  await act(async () => {
    built[0]?.onMaterials?.('node-1', 1, ['Material'], [], true, [0])
  })

  expect(screen.queryByText('En attente du personnage…')).not.toBeInTheDocument()
})

it('does not skin until the model has landed', async () => {
  seedCharacter(ASSET, RIG, {})
  showTab()
  await waitFor(() => expect(engines[0]).toBeDefined())

  expect(engines[0]?.skinModel).not.toHaveBeenCalled()

  await act(async () => {
    built[0]?.onMaterials?.('node-1', 1, ['Material'], [], true, [0])
  })

  await waitFor(() => expect(engines[0]?.skinModel).toHaveBeenCalled())
})

/**
 * 🛑 This window wired neither `onMotionChange` nor `isFlying`, so its keys reached no engine at
 * all: it orbited and nothing else, where every other 3D surface of the studio flies.
 */
it('flies the camera on the keys, like the viewport of the studio', async () => {
  showTab()

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }))
  })

  expect(flown.at(-1)).toEqual(['forward'])

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }))
  })

  expect(flown.at(-1)).toEqual([])
})

// 🛑 The studio's viewport arms a persistent flight on one key; this window declared two commands
// in all — undo and redo — so nothing here could ever hold the camera without a button pressed.
it('arms the persistent flight on its own key, and disarms it on the next press', async () => {
  showTab()

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }))
  })
  expect(navigated.at(-1)).toBe(true)

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }))
  })
  expect(navigated.at(-1)).toBe(false)
})

/**
 * 🛑 The engine leaves the flight on its own — Escape, a lost pointer capture. Unheard, the
 * window's state stayed armed and the next press of the key disarmed a mode already over: the
 * first press after an Escape did nothing at all.
 */
it('arms the flight again after the engine has left it on its own', async () => {
  showTab()

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }))
  })
  expect(navigated.at(-1)).toBe(true)

  await act(async () => {
    built.at(-1)?.onNavigatingChange?.(false)
  })

  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote', key: '`' }))
  })

  expect(navigated.at(-1)).toBe(true)
})

/**
 * Through the VIEW and not straight into the engine: written on the renderer alone, the bar had
 * nothing to read and no way to put the bones out.
 */
it('arms the bones on the workshop view when it mounts, and lets the bar put them out', async () => {
  showTab()
  await waitFor(() => expect(engines[0]?.setSkeletons).toHaveBeenLastCalledWith(true))
  expect(sceneViewOf(useSceneViews.getState(), WORKSHOP).skeletons).toBe(true)

  const bones = within(screen.getByRole('toolbar', { name: 'Outils du squelette' })).getByRole(
    'button',
    { name: 'Afficher les os' },
  )
  await userEvent.click(bones)

  expect(engines[0]?.setSkeletons).toHaveBeenLastCalledWith(false)
  expect(bones).toHaveAttribute('aria-pressed', 'false')
})

// The bones a previous visit left on: a view the store already holds has to reach a NEW engine.
it('hands a view the store already held to the engine that mounts after it', async () => {
  useSceneViews.getState().setSkeletons(WORKSHOP, true)
  useSceneViews.getState().setDisplay(WORKSHOP, 0, 'wireframe')
  showTab()

  await waitFor(() => expect(engines[0]?.setSkeletons).toHaveBeenLastCalledWith(true))
  expect(engines[0]?.setDisplayModes).toHaveBeenLastCalledWith(['wireframe'], false)
})

it('changes what the workshop draws from the flyout', async () => {
  showTab()

  await userEvent.hover(screen.getByRole('button', { name: /Rendu/ }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: /^Filaire/ }))

  expect(engines[0]?.setDisplayModes).toHaveBeenLastCalledWith(['wireframe'], false)
})

it('opens the workshop view menu from a right-click on the model', () => {
  const menu = fakeMenu()
  installFakeBridge({ menu: menu.bridge })
  showTab()

  act(() => built[0]?.onContextMenu?.('node-1'))

  expect(menu.labels()).toContain(i18next.t('commands.sceneFrame.title'))
})

// The scene's own commands reach this tab, from the menu or an MCP client — while it is in front.
it('takes a scene view command in front, and none in the background', async () => {
  showTab()

  expect(publishCommand('scene.skeletons')).toBe(true)
  expect(sceneViewOf(useSceneViews.getState(), WORKSHOP).skeletons).toBe(false)

  act(() => useDocuments.setState({ activeId: 'doc-other' }))

  expect(publishCommand('scene.skeletons')).toBe(false)
})

/**
 * ⌘Z reaches the character, and only it: the scene's undo answers that nothing here took it,
 * where `true` would have told a client its edit was undone.
 */
it('undoes the character on its own key, and leaves the scene undo unanswered', async () => {
  seedCharacter(ASSET, RIG, {})
  showTab()
  await userEvent.click(
    within(screen.getByRole('toolbar', { name: 'Outils du squelette' })).getByRole('button', {
      name: /Modifier le squelette/,
    }),
  )
  act(() => built[0]?.onTransform?.([{ id: 'node-1', bone: 'Spine', transform: raised(0.2) }]))
  expect(restOfSpine()?.position.y).toBeCloseTo(0.2, 5)

  expect(publishCommand('scene.undo')).toBe(false)
  expect(restOfSpine()?.position.y).toBeCloseTo(0.2, 5)

  expect(publishCommand('character.undo')).toBe(true)
  expect(restOfSpine()?.position.y).toBe(0)
})

/**
 * 🛑 The retarget window restores the STORED skeleton onto the model: opened on one that has
 * none, it showed a bare mesh, no joint drawn and no role to map a motion onto — a door onto a
 * screen that could not answer. The inspector beside it is where a skeleton is created.
 */
it('refuses to transfer an animation until the model has a skeleton', () => {
  seedCharacter(ASSET, null, {})
  showTab()

  expect(screen.getByRole('button', { name: 'Transférer une animation' })).toBeDisabled()

  act(() => seedCharacter(ASSET, RIG, {}))

  expect(screen.getByRole('button', { name: 'Transférer une animation' })).toBeEnabled()
})

/**
 * 🛑 An empty `rig` says nothing until the file has LANDED: refusing on it greyed the transfer
 * out on every character for as long as its tab took to read, and pointed at a skeleton nobody
 * had looked for.
 */
it('offers the transfer while the file is still being read', () => {
  showTab()

  expect(screen.getByRole('button', { name: 'Transférer une animation' })).toBeEnabled()
})

// A disabled button fires no pointer event, so the reason rides on the span around it.
it('says why it refuses, beside the button that cannot say it', () => {
  seedCharacter(ASSET, null, {})
  showTab()

  const refused = screen.getByRole('button', { name: 'Transférer une animation' }).parentElement
  expect(refused).toHaveAttribute('data-tooltip-content', expect.stringMatching(/squelette/))
})
