import { action, MUTE_SOLO_LOCK, type ActionField, type AssistantAction } from './assistantAction'

/**
 * The montage, driven by value rather than by gesture.
 *
 * The 13 sequence COMMANDS are gestures with no arguments — "split at the head", "zoom in" — so a
 * client could arm the montage and never say where. These take the values: which clip, on which
 * row, at which instant, how loud, how fast.
 *
 * Both workspaces at once, and that is not an accident: Video and Audio hold the same
 * `SequenceState` in the same store, so the family speaks to whichever montage is in front. None
 * of them names a document, exactly as the image and 3D families do not — `studio.state` says
 * which tab that is and `document.activate` changes it.
 *
 * Every instant is in MICROSECONDS, which is what the state holds. Seconds would have to be
 * converted back for every read of `sequence.state`, and a frame boundary would stop landing on
 * itself after the round trip.
 */

const CLIP: ActionField = {
  key: 'clipId',
  kind: 'text',
  labelKey: 'assistant.fields.clipId',
  required: true,
}

const TRACK: ActionField = {
  key: 'trackId',
  kind: 'text',
  labelKey: 'assistant.fields.trackId',
  required: true,
}

const EDGE: ActionField = {
  key: 'edge',
  kind: 'choice',
  labelKey: 'assistant.fields.clipEdge',
  required: true,
  options: ['in', 'out'],
}

/**
 * Written out rather than imported: `shared/` may not reach into `engines/`, where the montage
 * lives. `sequenceHandlers.test.ts` holds these three copies to their originals, on the side of
 * the boundary that can read both.
 */
const TRACK_KINDS: readonly string[] = ['video', 'audio']
const GAIN_MIN = -60
const GAIN_MAX = 12
const SPEED_MIN = 0.25
const SPEED_MAX = 4

export const SEQUENCE_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'sequence.state',
    titleKey: 'assistant.actions.sequenceState.title',
    descriptionKey: 'assistant.actions.sequenceState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'sequence.seek',
    titleKey: 'assistant.actions.sequenceSeek.title',
    descriptionKey: 'assistant.actions.sequenceSeek.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'time', kind: 'integer', labelKey: 'assistant.fields.time', required: true, min: 0 },
    ],
  }),
  action({
    /**
     * No duration: it comes from the media itself, which is the only thing that knows how long the
     * take runs. A client that wants less lays the clip down and trims it.
     */
    name: 'clip.add',
    titleKey: 'assistant.actions.clipAdd.title',
    descriptionKey: 'assistant.actions.clipAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['projectAssetCandidates'],
    fields: [
      {
        key: 'assetId',
        kind: 'text',
        labelKey: 'assistant.fields.assetId',
        required: true,
        reference: 'asset',
      },
      { ...TRACK, required: false },
      {
        key: 'start',
        kind: 'integer',
        labelKey: 'assistant.fields.start',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    name: 'clip.remove',
    titleKey: 'assistant.actions.clipRemove.title',
    descriptionKey: 'assistant.actions.clipRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [CLIP],
  }),
  action({
    name: 'clip.move',
    titleKey: 'assistant.actions.clipMove.title',
    descriptionKey: 'assistant.actions.clipMove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      TRACK,
      { key: 'start', kind: 'integer', labelKey: 'assistant.fields.start', required: true, min: 0 },
    ],
  }),
  action({
    name: 'clip.trim',
    titleKey: 'assistant.actions.clipTrim.title',
    descriptionKey: 'assistant.actions.clipTrim.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      EDGE,
      { key: 'at', kind: 'integer', labelKey: 'assistant.fields.at', required: true, min: 0 },
    ],
  }),
  action({
    name: 'clip.split',
    titleKey: 'assistant.actions.clipSplit.title',
    descriptionKey: 'assistant.actions.clipSplit.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      { key: 'at', kind: 'integer', labelKey: 'assistant.fields.at', required: true, min: 0 },
    ],
  }),
  action({
    name: 'clip.fade',
    titleKey: 'assistant.actions.clipFade.title',
    descriptionKey: 'assistant.actions.clipFade.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      EDGE,
      {
        key: 'length',
        kind: 'integer',
        labelKey: 'assistant.fields.fadeLength',
        required: true,
        min: 0,
      },
    ],
  }),
  action({
    name: 'clip.gain',
    titleKey: 'assistant.actions.clipGain.title',
    descriptionKey: 'assistant.actions.clipGain.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      {
        key: 'gain',
        kind: 'number',
        labelKey: 'assistant.fields.gain',
        required: true,
        min: GAIN_MIN,
        max: GAIN_MAX,
      },
    ],
  }),
  action({
    name: 'clip.speed',
    titleKey: 'assistant.actions.clipSpeed.title',
    descriptionKey: 'assistant.actions.clipSpeed.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      CLIP,
      {
        key: 'speed',
        kind: 'number',
        labelKey: 'assistant.fields.speed',
        required: true,
        min: SPEED_MIN,
        max: SPEED_MAX,
      },
    ],
  }),
  action({
    name: 'clip.unlink',
    titleKey: 'assistant.actions.clipUnlink.title',
    descriptionKey: 'assistant.actions.clipUnlink.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [CLIP],
  }),
  action({
    name: 'clip.select',
    titleKey: 'assistant.actions.clipSelect.title',
    descriptionKey: 'assistant.actions.clipSelect.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [CLIP],
  }),
  action({
    name: 'track.add',
    titleKey: 'assistant.actions.trackAdd.title',
    descriptionKey: 'assistant.actions.trackAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'kind',
        kind: 'choice',
        labelKey: 'assistant.fields.trackKind',
        required: true,
        options: TRACK_KINDS,
      },
    ],
  }),
  action({
    name: 'track.remove',
    titleKey: 'assistant.actions.trackRemove.title',
    descriptionKey: 'assistant.actions.trackRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [TRACK],
  }),
  action({
    name: 'track.reorderTracks',
    titleKey: 'assistant.actions.trackReorderTracks.title',
    descriptionKey: 'assistant.actions.trackReorderTracks.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      TRACK,
      { key: 'by', kind: 'integer', labelKey: 'assistant.fields.by', required: true },
    ],
  }),
  action({
    name: 'track.rename',
    titleKey: 'assistant.actions.trackRename.title',
    descriptionKey: 'assistant.actions.trackRename.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      TRACK,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    /**
     * Mute, solo, lock and height are how one WORKS, not what one made: they stay off the undo
     * stack, exactly as the header column writes them.
     */
    name: 'track.setMuteSoloLockHeight',
    titleKey: 'assistant.actions.trackSetMuteSoloLockHeight.title',
    descriptionKey: 'assistant.actions.trackSetMuteSoloLockHeight.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      TRACK,
      ...MUTE_SOLO_LOCK,
      { key: 'height', kind: 'integer', labelKey: 'assistant.fields.height', required: false },
    ],
  }),
]
