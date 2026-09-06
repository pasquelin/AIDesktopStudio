import { setWorld } from '@/engines/scene/commands'
import { backgroundOfKind, fogOfKind } from '@/engines/scene/sceneWorld'
import { useScenes } from '@/stores/scenes'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { readColor } from '@shared/domain/color'
import { BACKGROUND_KINDS, FOG_KINDS, type SceneWorld } from '@shared/domain/scene'
import { type ActionHandlers } from './actionHandler'
import { boolOf, numberOf, oneOf } from './actionInputs'
import { environmentFromInput } from './environmentInput'

import { mountedScene } from './sceneHandlerCore'
export function editWorld(
  build: (world: SceneWorld) => Partial<SceneWorld>,
  /** What a caller does when the patch comes back empty — the fields differ from action to action. */
  nothing: string,
): ActionOutcome {
  const open = mountedScene()
  if ('ok' in open) return open

  const patch = build(open.state.world)
  if (Object.keys(patch).length === 0) return refused('badInput', nothing)

  useScenes.getState().runCommand(open.documentId, setWorld(patch))
  return { ok: true }
}

/** A scene takes intensity and rotation on their own, so no source named is not a refusal. */
function worldEnvironment(input: Record<string, unknown>): ActionOutcome | Promise<ActionOutcome> {
  const intensity = numberOf(input, 'intensity')
  const rotation = numberOf(input, 'rotation')

  return environmentFromInput(input, environment =>
    editWorld(
      () => ({
        ...(environment === null ? {} : { environment }),
        ...(intensity === null ? {} : { envIntensity: intensity }),
        // Radians, as every other angle a document stores — the panel is what shows degrees.
        ...(rotation === null ? {} : { envRotation: rotation }),
      }),
      'this call named no light: give assetId, sky or kind for the source, intensity or rotation for the dials',
    ),
  )
}

function worldBackground(input: Record<string, unknown>): ActionOutcome {
  const kind = oneOf(input, 'kind', BACKGROUND_KINDS)
  if (!kind) return refused('badInput', `"kind" wants one of: ${BACKGROUND_KINDS.join(', ')}`)
  // `blur` belongs to one shape only, and a key a client believes took must never get a silent
  // yes — the very rule `validatesInput` is written for, one level down.
  if (kind !== 'environment' && input.blur !== undefined)
    return refused(
      'badInput',
      `"blur" belongs to the "environment" background alone, and this call says kind "${kind}"`,
    )
  if (kind !== 'color' && input.color !== undefined)
    return refused(
      'badInput',
      `"color" belongs to the "color" background alone, and this call says kind "${kind}"`,
    )

  return editWorld(world => {
    // The switch the panel uses, and ONLY when the shape changes: it answers with the defaults of
    // the shape it opens, so re-asserting the shape in hand would take the blur back to zero.
    const background =
      world.background.kind === kind ? world.background : backgroundOfKind(kind, world.background)

    if (background.kind === 'color') {
      return { background: { ...background, color: readColor(input, 'color', background.color) } }
    }

    return background.kind === 'environment'
      ? { background: { ...background, blur: numberOf(input, 'blur') ?? background.blur } }
      : { background }
  }, `a "${kind}" background writes nothing from this call`)
}

function worldFog(input: Record<string, unknown>): ActionOutcome {
  const kind = oneOf(input, 'kind', FOG_KINDS)
  if (!kind) return refused('badInput', `"kind" wants one of: ${FOG_KINDS.join(', ')}`)
  const named = ['color', 'near', 'far', 'density'].filter(key => input[key] !== undefined)
  const belongs =
    kind === 'linear' ? ['color', 'near', 'far'] : kind === 'exp2' ? ['color', 'density'] : []
  const stray = named.filter(key => !belongs.includes(key))
  if (stray.length > 0)
    return refused(
      'badInput',
      `a "${kind}" fog takes ${belongs.length === 0 ? 'no field but kind' : belongs.join(', ')}, and this call names ${stray.join(', ')}`,
    )

  return editWorld(world => {
    // Switched only when the shape changes, for the reason `worldBackground` gives: `fogOfKind`
    // answers with the defaults of the shape it opens, distances included.
    const fog = world.fog.kind === kind ? world.fog : fogOfKind(kind, world.fog)
    if (fog.kind === 'none') return { fog }

    const painted = { ...fog, color: readColor(input, 'color', fog.color) }

    return {
      fog:
        painted.kind === 'linear'
          ? {
              ...painted,
              near: numberOf(input, 'near') ?? painted.near,
              far: numberOf(input, 'far') ?? painted.far,
            }
          : { ...painted, density: numberOf(input, 'density') ?? painted.density },
    }
  }, `a "${kind}" fog writes nothing from this call`)
}

function worldGround(input: Record<string, unknown>): ActionOutcome {
  const size = numberOf(input, 'size')
  const opacity = numberOf(input, 'opacity')

  return editWorld(world => {
    // `undefined` and not `false`: a call naming the size alone must not put the ground out.
    const written = {
      ...(input.visible === undefined ? {} : { visible: boolOf(input, 'visible') }),
      ...(input.color === undefined
        ? {}
        : { color: readColor(input, 'color', world.ground.color ?? '') }),
      ...(size === null ? {} : { size }),
      ...(opacity === null ? {} : { opacity }),
      ...(input.receiveShadow === undefined
        ? {}
        : { receiveShadow: boolOf(input, 'receiveShadow') }),
    }

    return Object.keys(written).length === 0 ? {} : { ground: { ...world.ground, ...written } }
  }, 'this call named nothing to write on the ground: visible, color, size, opacity or receiveShadow')
}

export const SCENE_WORLD_HANDLERS: ActionHandlers = {
  'world.setSceneLighting': worldEnvironment,
  'world.setBackground': worldBackground,
  'world.setFog': worldFog,
  'world.setGroundPlane': worldGround,
}
