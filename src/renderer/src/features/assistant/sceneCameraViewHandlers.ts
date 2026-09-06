import {
  bindRailToShot,
  editCameraShot,
  lensToCommand,
  railForShot,
  reorderCameraShots,
} from '@/engines/scene/animationCommands'
import { lensAt } from '@/engines/scene/animationEval'
import { shotsWithCameraMoved } from '@/engines/scene/cameraShots'
import { multi, setCamera, setLight } from '@/engines/scene/commands'
import { ENVIRONMENT_PRESETS, presetPatch } from '@/engines/scene/environmentPresets'
import { CAMERA_SPECS, LIGHT_SPECS, withField } from '@/engines/scene/propertyFields'
import { nodeById, type SceneNode } from '@/engines/scene/sceneState'
import { captureSceneView } from '@/helpers/captureSceneView'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { sceneEngineOf } from '@/stores/sceneEngines'
import { useScenes } from '@/stores/scenes'
import { MAIN_SCENE_PANE, useSceneViews } from '@/stores/sceneViews'
import { EASINGS, POINT_TARGET } from '@shared/domain/animation'
import { refused } from '@shared/domain/assistant'
import { readColor } from '@shared/domain/color'
import { DISPLAY_MODES, VIEW_DIRECTIONS } from '@shared/domain/scene'
import { CAPTURE_QUALITIES, DEFAULT_CAPTURE_QUALITY } from '@shared/domain/sceneCapture'
import { type ActionHandlers } from './actionHandler'
import { boolOf, composedNumber, namedOf, numberOf, oneOf, textOf } from './actionInputs'

import {
  editNode,
  mounted,
  mountedScene,
  namedFields,
  NO_SCENE,
  numbersFor,
  TARGET_AXES,
  type Specs,
  vectorOf,
  withinSpec,
} from './sceneHandlerCore'
import { editShot, openShot } from './sceneNodeActions'
import { editWorld } from './sceneWorldHandlers'

function lightCommand(input: Record<string, unknown>, node: SceneNode, aimsTarget: boolean) {
  if (node.type !== 'light') return null

  const specs: Specs = LIGHT_SPECS[node.light.kind]
  const relative = boolOf(input, 'relative')
  let light = node.light
  for (const name of namedFields(input)) {
    if (TARGET_AXES.includes(name)) {
      if (!('target' in node.light)) return null
      continue
    }
    if (!(name in node.light)) return null

    const value = numberOf(input, name)
    if (value === null) {
      light = withField(light, name, readColor(input, name, ''))
      continue
    }
    const held = light[name as keyof typeof light]
    const wanted =
      typeof held === 'number' ? composedNumber(held, value, relative, 'multiply') : value
    if (!withinSpec(specs[name], wanted)) return null
    light = withField(light, name, wanted)
  }
  if ('target' in node.light && aimsTarget)
    light = withField(light, 'target', vectorOf(input, 'target', node.light.target, relative))
  return light === node.light ? null : setLight(node.id, light)
}

export const SCENE_CAMERA_VIEW_HANDLERS: ActionHandlers = {
  'node.setCameraLens': input =>
    editNode(
      input,
      (node, documentId) => {
        if (node.type !== 'camera') return null

        const written = numbersFor(input, node.camera, CAMERA_SPECS)
        if (!written || Object.keys(written).length === 0) return null

        // The two distances are never keyed, so they travel as a plain descriptor — and the lens
        // handed to `lensToCommand` keeps the fov it ALREADY holds: that value is what its key is
        // measured against, and a new one there would move the rest pose under every other key.
        const camera = { ...node.camera, ...written, fov: node.camera.fov }
        const fov = numberOf(input, 'fov')
        if (fov === null) return setCamera(node.id, camera)

        const keying = sceneKeyingAt(documentId)
        return multi(`camera:${node.id}`, [
          // Written first and then again by the lens where nothing records it: the keyed branch
          // writes no descriptor at all, and the two distances would be lost with it.
          setCamera(node.id, camera),
          lensToCommand(
            keying.state.animation,
            [{ ...node, camera }],
            'fov',
            fov,
            keying.at,
            keying.recording,
          ),
        ])
      },
      // The lens as the viewport READS it: a recorded fov lands as a key, and the descriptor keeps
      // the rest value the key is measured against.
      (node, documentId) => {
        if (node.type !== 'camera') return {}
        const keying = sceneKeyingAt(documentId)
        return namedOf(input, lensAt(node.camera, keying.state.animation, node.id, keying.at))
      },
    ),

  // Seconds here, microseconds in the timeline: a client counting a shot in `Us` would be one
  // unit away from a film six orders of magnitude too long, with nothing on screen to say so.
  'camera.addShot': input => openShot(input),

  // Through the very command the inspector's own select goes through, so a rail bound from here
  // takes the whole of itself forwards exactly as one bound on screen does.
  'camera.bindPathToShot': input =>
    editShot(
      input,
      (shot, state) => {
        const pathId = textOf(input, 'pathId') ?? ''
        if (pathId === '') return bindRailToShot(shot, '')
        if (nodeById(state, pathId)?.type !== 'path') return null

        const from = numberOf(input, 'from')
        const to = numberOf(input, 'to')
        const easing = EASINGS.find(candidate => candidate === textOf(input, 'easing'))

        return bindRailToShot(shot, pathId, {
          ...(from === null ? {} : { from }),
          ...(to === null ? {} : { to }),
          ...(easing === undefined ? {} : { easing }),
        })
      },
      '"pathId" must name a rail of this scene — scene.state answers "nodes", and a rail is one of type "path"; send "" to unbind the one in place',
    ),

  // Through the panel's own command, which lays the rail AND binds it in one entry: a rail added
  // without its shot would be a line nothing runs on.
  'camera.createAndBindPath': input =>
    editShot(
      input,
      (shot, state) => {
        const camera = nodeById(state, shot.cameraId)
        return camera?.type === 'camera' ? railForShot(camera, shot) : null
      },
      'the camera this shot was opened for is gone from the scene — scene.state answers "nodes" and "shots"',
    ),

  'camera.reorder': input => {
    const open = mountedScene()
    if ('ok' in open) return open

    const nodeId = textOf(input, 'nodeId') ?? ''
    // `shotsWithCameraMoved` answers `null` for a camera with no line on the band, and reports
    // the steps it could actually take — a line already at the top moves by none.
    const moved = shotsWithCameraMoved(
      open.state.animation.shots,
      nodeId,
      numberOf(input, 'by') ?? 0,
    )
    if (!moved || moved.steps === 0)
      return refused(
        'badInput',
        `"${nodeId}" has no shot on the band, or "by" would move it past the end — scene.state answers "shots" and the camera each one holds`,
      )

    useScenes.getState().runCommand(open.documentId, reorderCameraShots(nodeId, moved.shots))
    return { ok: true, data: { steps: moved.steps } }
  },

  'camera.aimShotAt': input =>
    editShot(
      input,
      (shot, state) => {
        const targetId = textOf(input, 'targetId') ?? ''
        if (targetId !== '') {
          // A camera cannot watch itself: `aimCamera` drops that shot silently, and a refusal here
          // is what says so.
          if (targetId === shot.cameraId || !nodeById(state, targetId)) return null
          return editCameraShot(shot.id, { target: { kind: 'node', nodeId: targetId } })
        }

        // Naming no node and giving no point is FREE — the camera keeps its own rotation.
        const aimed =
          numberOf(input, 'atX') !== null ||
          numberOf(input, 'atY') !== null ||
          numberOf(input, 'atZ') !== null
        return editCameraShot(shot.id, {
          target: aimed
            ? { kind: POINT_TARGET.kind, at: vectorOf(input, 'at', POINT_TARGET.at) }
            : undefined,
        })
      },
      '"targetId" must name a node of this scene other than the shot\'s own camera — scene.state answers "nodes"; leave it out and give atX, atY, atZ to aim at a point instead',
    ),

  // A field the shape has no room for is refused rather than filed: `withField` writes by
  // computed key without checking, and a light given a `penumbra` it never had is a document
  // that no longer describes anything.
  'node.setLightSettings': input => {
    const aimsTarget = TARGET_AXES.some(axis => input[axis] !== undefined)

    return editNode(
      input,
      node => lightCommand(input, node, aimsTarget),
      node =>
        node.type !== 'light'
          ? {}
          : {
              ...namedOf(input, node.light),
              ...('target' in node.light && aimsTarget ? { target: node.light.target } : {}),
            },
    )
  },

  /**
   * The main pane, as the menu and the bar's own flyout both do: a quad layout gives each of its
   * four views one, and neither surface has four ways of saying it.
   */
  'view.direction': input => {
    const open = mounted()
    const direction = oneOf(input, 'direction', VIEW_DIRECTIONS)
    if (!open) return refused('wrongSurface', NO_SCENE)
    if (!direction)
      return refused('badInput', `"direction" wants one of: ${VIEW_DIRECTIONS.join(', ')}`)

    // A side to look from is a MOVE, not a state — see `PaneView` — so it goes to the engine.
    const engine = sceneEngineOf(open.documentId)
    if (!engine)
      return refused(
        'wrongSurface',
        'the scene in front has no viewport mounted to look through — panel.open the scene view, then send this again',
      )

    engine.viewFrom(direction)
    return { ok: true }
  },

  // The same function the menu row and the keyboard go through, which answers whether the still
  // landed: a viewport that is not mounted is a silence the row can live with and a client cannot.
  'scene.capture': async input => {
    const open = mounted()
    const quality = oneOf(input, 'quality', CAPTURE_QUALITIES) ?? DEFAULT_CAPTURE_QUALITY
    if (!open) return refused('wrongSurface', NO_SCENE)

    return (await captureSceneView(open.documentId, quality))
      ? { ok: true }
      : refused(
          'failed',
          'the scene viewport gave back no still — it is not mounted, or it rendered nothing',
        )
  },

  'world.applyPreset': input => {
    const preset = oneOf(input, 'preset', ENVIRONMENT_PRESETS)
    return preset === null
      ? refused('badInput', `"preset" wants one of: ${ENVIRONMENT_PRESETS.join(', ')}`)
      : editWorld(() => presetPatch(preset), `the preset "${preset}" writes nothing on this world`)
  },

  'view.setDisplayMode': input => {
    const open = mounted()
    const mode = oneOf(input, 'mode', DISPLAY_MODES)
    if (!open) return refused('wrongSurface', NO_SCENE)
    if (!mode) return refused('badInput', `"mode" wants one of: ${DISPLAY_MODES.join(', ')}`)

    useSceneViews.getState().setDisplay(open.documentId, MAIN_SCENE_PANE, mode)
    return { ok: true }
  },
}
