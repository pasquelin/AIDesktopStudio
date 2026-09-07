import { isRecord, readBoolean, readNumber, readPositive, readString } from '@shared/guards'
import {
  DEFAULT_SETTINGS,
  DEFAULT_TRACK_HEIGHT,
  EMPTY_SEQUENCE,
  clampFades,
  clampTrackHeight,
  insertClip,
  makeClip,
  makeTrack,
  newClipId,
  trackById,
  trackOfClip,
  type Clip,
  type SequenceSelection,
  type SequenceSettings,
  type SequenceState,
  type Track,
} from './timelineState'

function readClip(raw: unknown): Clip | null {
  if (!isRecord(raw)) return null
  const id = readString(raw, 'id', '')
  const assetId = readString(raw, 'assetId', '')
  const sceneId = readString(raw, 'sceneId', '')
  const duration = readNumber(raw, 'duration', 0)
  if (!id || (!assetId && !sceneId) || duration <= 0) return null
  const linkId = readString(raw, 'linkId', '')
  return clampFades(
    makeClip({
      id,
      assetId,
      duration,
      ...(sceneId ? { sceneId } : {}),
      ...(linkId ? { linkId } : {}),
      start: readPositive(raw, 'start', 0),
      inPoint: readPositive(raw, 'inPoint', 0),
      speed: readNumber(raw, 'speed', 1) || 1,
      fadeIn: readPositive(raw, 'fadeIn', 0),
      fadeOut: readPositive(raw, 'fadeOut', 0),
      gain: readNumber(raw, 'gain', 0),
    }),
  )
}

function readTrack(raw: unknown, row: number): Track | null {
  if (!isRecord(raw)) return null
  const id = readString(raw, 'id', '')
  if (!id) return null
  const clips = Array.isArray(raw.clips) ? raw.clips.flatMap(entry => readClip(entry) ?? []) : []
  const track = makeTrack({
    id,
    kind: raw.kind === 'audio' ? 'audio' : 'video',
    index: readNumber(raw, 'index', row),
    name: readString(raw, 'name', id),
    height: clampTrackHeight(readNumber(raw, 'height', DEFAULT_TRACK_HEIGHT)),
    muted: readBoolean(raw, 'muted', false),
    solo: readBoolean(raw, 'solo', false),
    locked: readBoolean(raw, 'locked', false),
  })
  return clips.reduce((current, clip) => insertClip(current, clip, newClipId()), track)
}

function readSettings(raw: unknown): SequenceSettings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS
  const fps = readNumber(raw, 'fps', DEFAULT_SETTINGS.fps)
  const sampleRate = readNumber(raw, 'sampleRate', DEFAULT_SETTINGS.sampleRate)
  return {
    width: readNumber(raw, 'width', DEFAULT_SETTINGS.width),
    height: readNumber(raw, 'height', DEFAULT_SETTINGS.height),
    fps: fps > 0 ? fps : DEFAULT_SETTINGS.fps,
    sampleRate: sampleRate > 0 ? sampleRate : DEFAULT_SETTINGS.sampleRate,
  }
}

export function readSelection(
  raw: Record<string, unknown>,
  tracks: readonly Track[],
): SequenceSelection {
  const clipId = readString(raw, 'selectedId', '')
  const trackId = readString(raw, 'selectedTrackId', '')
  return {
    selectedId: trackOfClip({ tracks }, clipId) ? clipId : null,
    selectedTrackId: trackById({ tracks }, trackId) ? trackId : null,
  }
}

export function parseSequence(content: unknown): SequenceState {
  if (!isRecord(content) || !Array.isArray(content.tracks)) return EMPTY_SEQUENCE
  const tracks = content.tracks.flatMap((entry, row) => readTrack(entry, row) ?? [])
  if (tracks.length === 0) return EMPTY_SEQUENCE
  return {
    settings: readSettings(content.settings),
    tracks,
    ...readSelection(content, tracks),
    playhead: readPositive(content, 'playhead', 0),
  }
}
