import { DIRECT_PROPERTIES, type AnimationTrack } from '@shared/domain/animation'
import { refused, type ActionOutcome } from '@shared/domain/assistant'
import { secondsToUs, snapToFrame, type Us } from '@shared/domain/time'
import {
  keyNode,
  keySubject,
  moveAnimationKey,
  recordingTracksFor,
  removeAnimationTrack,
  setTimelineSettings,
  unkeySubject,
  unkeySubjectWholly,
} from '@/engines/scene/animationCommands'
import type { Command } from '@/engines/core/history'
import { nodeById, type SceneState } from '@/engines/scene/sceneState'
import { channelNames } from '@/helpers/channelNames'
import { newId } from '@/helpers/ids'
import { sceneKeyingAt } from '@/helpers/sceneKeyingAt'
import { speaksBundle } from '@/helpers/speaksBundle'
import { useAnimationViews } from '@/stores/animationView'
import { activeSceneId, useDocuments } from '@/stores/documents'
import { sceneOf, useScenes, writeAnimationTrack } from '@/stores/scenes'
import type { ActionHandlers } from './actionHandler'
import { boolOf, flagNamed, numberOf, oneOf, textOf } from './actionInputs'
import { NO_SCENE } from './sceneHandlers'

function frameAt(state: SceneState, seconds: number): Us {
  return snapToFrame(secondsToUs(seconds), state.animation.fps)
}

function editKeys(
  input: Record<string, unknown>,
  build: (open: { state: SceneState; at: Us; playhead: Us }) => Command<SceneState> | null,
  nothing: string,
): ActionOutcome {
  const documentId = activeSceneId(useDocuments.getState())
  if (documentId === null) return refused('wrongSurface', NO_SCENE)
  const keying = sceneKeyingAt(documentId)
  const seconds = numberOf(input, 'timeSeconds')
  const at = seconds === null ? keying.at : frameAt(keying.state, seconds)
  const command = build({ state: keying.state, at, playhead: keying.at })
  if (!command) return refused('badInput', nothing)
  useScenes.getState().runCommand(documentId, command)
  return { ok: true }
}

function editTrack(
  input: Record<string, unknown>,
  build: (track: AnimationTrack, documentId: string) => ActionOutcome,
): ActionOutcome {
  const documentId = activeSceneId(useDocuments.getState())
  if (documentId === null) return refused('wrongSurface', NO_SCENE)
  const trackId = textOf(input, 'trackId') ?? ''
  const track = sceneOf(useScenes.getState(), documentId).animation.tracks.find(
    held => held.id === trackId,
  )
  return track
    ? build(track, documentId)
    : refused(
        'notFound',
        `no channel "${trackId}" on the scene in front — scene.state answers "tracks" with their ids`,
      )
}

function subjectOf(input: Record<string, unknown>): { nodeId: string; bone?: string } {
  const bone = textOf(input, 'bone')
  const nodeId = textOf(input, 'nodeId') ?? ''
  return bone === null ? { nodeId } : { nodeId, bone }
}

function tracksOfSubject(state: SceneState, subject: { nodeId: string; bone?: string }): string[] {
  return recordingTracksFor(state.animation, subject.nodeId, subject.bone).map(track => track.id)
}

function keyPose(input: Record<string, unknown>): ActionOutcome {
  const only = oneOf(input, 'property', DIRECT_PROPERTIES) ?? undefined
  return editKeys(
    input,
    ({ state, at, playhead }) => {
      const subject = subjectOf(input)
      const node = nodeById(state, subject.nodeId)
      return node
        ? keyNode(
            state,
            subject,
            at,
            channelNames(speaksBundle(), subject.bone ?? node.name),
            () => `track_${newId()}`,
            only,
            playhead,
          )
        : null
    },
    '"nodeId" must name a node of the scene in front, and "bone" one of its rig — scene.state answers "nodes", rig.state answers "bones"',
  )
}

function timelineSettings(input: Record<string, unknown>): ActionOutcome {
  const documentId = activeSceneId(useDocuments.getState())
  if (documentId === null) return refused('wrongSurface', NO_SCENE)
  const seconds = numberOf(input, 'durationSeconds')
  const fps = numberOf(input, 'fps')
  if (seconds === null && fps === null)
    return refused(
      'badInput',
      'this call named neither "durationSeconds" nor "fps", and one of the two is what it writes',
    )
  useScenes.getState().runCommand(
    documentId,
    setTimelineSettings({
      ...(seconds === null ? {} : { duration: secondsToUs(seconds) }),
      ...(fps === null ? {} : { fps }),
    }),
  )
  return { ok: true }
}

export const RIG_KEY_HANDLERS: ActionHandlers = {
  'animation.setBandLengthAndRate': timelineSettings,
  'animation.autoKey': input => {
    const documentId = activeSceneId(useDocuments.getState())
    if (documentId === null) return refused('wrongSurface', NO_SCENE)
    useAnimationViews.getState().setAutoKey(documentId, boolOf(input, 'on'))
    return { ok: true }
  },
  'key.writePoseKeys': keyPose,
  'key.removeSubjectKeys': input =>
    editKeys(
      input,
      ({ state, at }) => {
        const tracks = tracksOfSubject(state, subjectOf(input))
        return numberOf(input, 'timeSeconds') === null
          ? unkeySubjectWholly(state, tracks)
          : unkeySubject(state, tracks, at)
      },
      'nothing is keyed for that subject, or nothing at that instant — scene.state answers "tracks" with the instants each channel holds',
    ),
  'key.writeKeysOnOpenChannels': input =>
    editKeys(
      input,
      ({ state, at }) =>
        keySubject(
          state,
          state.animation.tracks.map(track => track.id),
          at,
        ),
      'the scene in front holds no channel to key — key.writePoseKeys opens one on a node first',
    ),
  'key.move': input =>
    editTrack(input, (track, documentId) => {
      const state = sceneOf(useScenes.getState(), documentId)
      const from = frameAt(state, numberOf(input, 'fromSeconds') ?? 0)
      if (!track.keys.some(key => key.time === from))
        return refused(
          'badInput',
          'that channel holds no key at "fromSeconds" — scene.state answers "tracks" with the instants each one holds, in microseconds',
        )
      const to = frameAt(state, numberOf(input, 'toSeconds') ?? 0)
      useScenes.getState().runCommand(documentId, moveAnimationKey(track.id, from, to))
      return { ok: true }
    }),
  'channel.remove': input =>
    editTrack(input, (track, documentId) => {
      if (track.locked)
        return refused(
          'badInput',
          'that channel is locked — channel.setMuteSoloLock with locked false unlocks it, then send this again',
        )
      useScenes.getState().runCommand(documentId, removeAnimationTrack(track.id))
      return { ok: true }
    }),
  'channel.setMuteSoloLock': input =>
    editTrack(input, (track, documentId) => {
      const flags = {
        ...flagNamed(input, 'muted'),
        ...flagNamed(input, 'solo'),
        ...flagNamed(input, 'locked'),
      }
      if (Object.keys(flags).length === 0)
        return refused('badInput', 'this call named none of muted, solo, locked')
      writeAnimationTrack(documentId, track.id, held => ({ ...held, ...flags }))
      return { ok: true }
    }),
}
