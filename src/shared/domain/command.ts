import type { DocumentKind } from './document'
import { reservedByPlatform, type Signature } from './shortcut'
import { HOME_SURFACE, type ToolSurface } from './tool'
import type { WorkspaceId } from './workspace'
import type { CommandDescriptor, CommandId, CommandScope } from './commandTypes'
import { GENERAL_COMMANDS } from './commandGeneralRegistry'
import { SCENE_COMMANDS } from './commandSceneRegistry'
import { SEQUENCE_COMMANDS } from './commandSequenceRegistry'
import { CANVAS_COMMANDS } from './commandCanvasRegistry'
import { OTHER_COMMANDS } from './commandOtherRegistry'

export type {
  CommandDescriptor,
  CommandId,
  CommandScope,
  MenuAbility,
  MenuCheck,
} from './commandTypes'
export { SIDE_VIEW_COMMAND, VIEW_SIDE_OF } from './commandTypes'

export const COMMAND_REGISTRY: readonly CommandDescriptor[] = [
  ...GENERAL_COMMANDS,
  ...SCENE_COMMANDS,
  ...SEQUENCE_COMMANDS,
  ...CANVAS_COMMANDS,
  ...OTHER_COMMANDS,
]

export const COMMAND_SCOPES: readonly CommandScope[] = [
  'global',
  'spaces',
  'explorer',
  'scene',
  'character',
  'sequence',
  'canvas',
  'skybox',
  'audio',
  'material',
  'gui',
]

/**
 * What each workspace edits, or `null` where it edits nothing undoable.
 *
 * Declared rather than derived: the menu is built in the main process from a workspace id, and
 * it has to name the exact command the surface in front is listening for.
 *
 * **Total, not partial, and that is the guard.** A workspace whose store holds a history and is
 * missing here reaches nothing: the native role keeps the accelerator, ⌘Z never reaches the
 * window, and the failure is silent. It cost Skyboxes once, Audio until its bar
 * was asked to stop drawing the only undo it had, and Materials for as long as the manual
 * promised a key nothing answered. Written as a full `Record`, the next workspace added does
 * not COMPILE until someone answers the question for it — `Partial` let all four slip through.
 *
 * Which of them holds a history is a fact of `renderer/`, invisible from here, so the other half
 * of the guard sits there: `renderer/src/stores/history-scopes.test.ts` walks the document
 * stores and fails on the next one that grows a history while its workspace answers `null`.
 */
const SCOPE_BY_WORKSPACE: Record<WorkspaceId, CommandScope | null> = {
  image: 'canvas',
  '3d': 'scene',
  video: 'sequence',
  skyboxes: 'skybox',
  audio: 'audio',
  materials: 'material',
  // Monaco holds its own undo stack, and it is the one a cursor in a script expects: routing ⌘Z
  // through the studio's history would give back a whole file where a keystroke was undone.
  code: null,
}

/**
 * 🛑 The scope a KIND edits through, read before the space. `null` inherits the space's, which is
 * right for every kind a space opens alone — the 3D space opens both a scene and the interfaces
 * shown over it, and ⌘Z on an interface would otherwise pop the scene's history.
 *
 * Total, not partial, and that is the guard: the next kind added does not COMPILE until someone
 * answers for it, the way `SCOPE_BY_WORKSPACE` above is total for the same reason.
 */
const SCOPE_BY_KIND: Record<DocumentKind, CommandScope | null> = {
  image: null,
  scene: null,
  sequence: null,
  audio: null,
  skybox: null,
  material: null,
  script: null,
  gui: 'gui',
  // Its own history, on the FILE of a model: the scene scope beside it would undo the workshop
  // instead of the skeleton.
  character: 'character',
}

/**
 * Whether a scope LOOKS AT a scene: the scene itself, and the model tab whose workshop is one.
 * Read by the native menu's View and Export rows and by the bench — one rule, not four copies.
 */
export function viewsScene(scope: CommandScope | null): boolean {
  return scope === 'scene' || scope === 'character'
}

/**
 * The surface a workspace edits through, or `null` where nothing is undoable — which the home
 * is: it covers the spaces rather than editing one, so it holds no history of its own.
 */

export function scopeOfWorkspace(
  surface: ToolSurface | null,
  kind?: DocumentKind | null,
): CommandScope | null {
  // The surface FIRST: the home covers the spaces and edits nothing, and `activeId` is not
  // cleared on the way there — so the last interface opened would otherwise arm ⌘Z over a
  // screen holding no editor at all.
  if (!surface || surface === HOME_SURFACE) return null

  return (kind && SCOPE_BY_KIND[kind]) ?? SCOPE_BY_WORKSPACE[surface]
}

/** The command of that scope, when it declares one. Every editing scope declares undo and redo. */
export function commandIn(scope: CommandScope, suffix: string): CommandId | null {
  return commandsIn(scope).find(descriptor => descriptor.id.endsWith(`.${suffix}`))?.id ?? null
}

/**
 * The descriptor of a command, or `null` for anything the registry does not declare.
 *
 * Takes a `string` rather than a `CommandId`, the way `assistantAction` does next door, and for
 * the same reason: what asks is often something that has only a name — a language model's answer,
 * an MCP client's call. Narrowing before the call meant two identical casts in two files, each
 * with four lines explaining why it was safe. The check IS this function; there is no gap for a
 * cast to close.
 */
export function commandDescriptor(id: string): CommandDescriptor | null {
  return COMMAND_REGISTRY.find(descriptor => descriptor.id === id) ?? null
}

export function commandsIn(scope: CommandScope): readonly CommandDescriptor[] {
  return COMMAND_REGISTRY.filter(descriptor => descriptor.scope === scope)
}

/** What the user remapped. Only the commands they actually changed appear here. */
export type BindingOverrides = Partial<Record<CommandId, Signature>>

/**
 * What ships away from macOS, where the desktop's own convention differs. Read UNDER the user's
 * remaps, so remapping one still wins and resetting it lands back on the platform's key.
 *
 * Merged at the two places bindings are read — `stores/bindings.ts` and `buildMenu` — rather
 * than passed to `bindingOf`, which a dozen callers ask without knowing which system they are on.
 */
const AWAY_FROM_MAC: BindingOverrides = {
  // F11 on Windows and on every Linux desktop; ⌃⌘F belongs to macOS alone.
  'window.fullScreen': 'F11',
  // Ctrl+PageUp/PageDown steps between tabs on Windows and Linux, where macOS uses ⌘⌥←/→.
  'spaces.moveLeft': 'Meta+PageUp',
  'spaces.moveRight': 'Meta+PageDown',
}

const ON_MAC: BindingOverrides = {}

/** The bindings this system ships, before anything the user remapped. Never a fresh object. */
export function platformDefaults(isMac: boolean): BindingOverrides {
  return isMac ? ON_MAC : AWAY_FROM_MAC
}

/**
 * The key a command answers to. Resolved on demand rather than kept as a full table: a command
 * added by a new version arrives with its own default and needs no migration, and a remap of a
 * command since removed is ignored instead of lingering.
 */
export function bindingOf(id: CommandId, overrides: BindingOverrides): Signature | null {
  return overrides[id] ?? commandDescriptor(id)?.defaultBinding ?? null
}

/**
 * The one key that answers to two names.
 *
 * A Mac's main keyboard carries a single key marked « delete », and it reports `Backspace`. The
 * key that reports `Delete` is a full keyboard's forward-delete, or `fn` held down with the
 * other. A command bound to `Delete` was therefore out of reach on the keyboard most of this
 * studio is used on: pressing the key labelled delete did nothing whatsoever, in every space
 * that binds it — the montage, the scene, the canvas.
 *
 * One way round only: whatever genuinely binds `Backspace` keeps it to itself.
 */
const KEY_ALIASES: Partial<Record<Signature, Signature>> = { Backspace: 'Delete' }

/**
 * The command a signature fires on one surface. Scoped, because the same key means different
 * things on the timeline and in the scene, and only one of the two is ever listening.
 *
 * `global` is deliberately excluded: those are the native menu's accelerators, and Electron
 * fires them itself — matching them here too would run the command twice.
 */
export function commandFor(
  signature: Signature,
  scope: CommandScope,
  overrides: BindingOverrides,
): CommandId | null {
  const bound = (wanted: Signature): CommandId | null =>
    COMMAND_REGISTRY.find(
      descriptor =>
        descriptor.scope === scope &&
        !descriptor.held &&
        bindingOf(descriptor.id, overrides) === wanted,
    )?.id ?? null

  // The alias is tried second, so a scope that binds the pressed key outright still wins.
  const alias = KEY_ALIASES[signature]
  return bound(signature) ?? (alias ? bound(alias) : null)
}

/**
 * The held command a signature answers to, on any surface. Held commands are matched across
 * scopes rather than within one: they are heard by the window itself, which is what a release
 * requires, and the menu never claims their key.
 */
export function heldCommandFor(
  signature: Signature,
  overrides: BindingOverrides,
): CommandId | null {
  const found = COMMAND_REGISTRY.find(
    descriptor => descriptor.held && bindingOf(descriptor.id, overrides) === signature,
  )
  return found?.id ?? null
}

/**
 * Commands sharing a signature with another one they could both answer to — what the shortcuts
 * screen shows in red. Across two surfaces a shared key is the design, not a clash; against a
 * `global` one it always is, because the menu fires those wherever the focus sits.
 */
export function conflicts(overrides: BindingOverrides): readonly CommandId[] {
  // Grouped by signature in one pass rather than compared pairwise: the shortcuts screen
  // recomputes this on every keystroke of a capture, and the pairwise form resolved each
  // binding twice per pair.
  const bySignature = new Map<Signature, CommandDescriptor[]>()

  for (const descriptor of COMMAND_REGISTRY) {
    const signature = bindingOf(descriptor.id, overrides)
    // A command bound to nothing cannot clash with anything.
    if (signature === null) continue
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), descriptor])
  }

  // Reported alongside the clashes between two commands: bound to one of these, a command is
  // just as unreachable, and the screen has one place to say so.
  const clashing: CommandId[] = COMMAND_REGISTRY.filter(descriptor =>
    reservedByPlatform(bindingOf(descriptor.id, overrides)),
  ).map(descriptor => descriptor.id)

  for (const sharing of bySignature.values()) {
    if (sharing.length < 2) continue

    for (const descriptor of sharing) {
      const contested = sharing.some(
        other =>
          other.id !== descriptor.id &&
          (other.scope === descriptor.scope ||
            other.scope === 'global' ||
            descriptor.scope === 'global'),
      )
      if (contested) clashing.push(descriptor.id)
    }
  }

  return clashing
}
