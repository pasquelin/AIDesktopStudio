import {
  action,
  MUTE_SOLO_LOCK,
  NODE_ID as NODE,
  type ActionField,
  type AssistantAction,
} from './assistantAction'
import { DIRECT_PROPERTIES } from './animation'
import { BODY_PARTS, HUMANOID_ROLES } from './humanoid'
import { CLIP_SOURCES, CLIP_SPEED, MAX_CLIP_FADE, ROOT_MOTIONS } from './scene'

/**
 * Making a character move — its skeleton, the handles a joint reaches for, and the blocks laid
 * on its band.
 *
 * One family rather than two: the inspector and the band are two panels of the same job, and a
 * client that can weigh a mesh but not lay a clip on it has been handed half a workflow. Every
 * one of these runs the very command the panel runs, so a batch lands in the scene's own history
 * and ⌘Z takes it back.
 *
 * 🛑 TWO subjects, and the split is the whole point: the skeleton is a property of a FILE, so
 * `rig.*`, `bone.*` and `ik.*` act on the character the skeleton window holds and name no node.
 * What plays WHEN is a property of a scene, so the band's own actions still name one.
 */
const BONE: ActionField = {
  key: 'bone',
  kind: 'text',
  labelKey: 'assistant.fields.boneName',
  required: true,
}

/** The channel a key is laid on, named by the id `scene.state` hands over. */
const TRACK: ActionField = {
  key: 'trackId',
  kind: 'text',
  labelKey: 'assistant.fields.channelId',
  required: true,
}

/** A subject of the band: a node, or one bone of the model it holds. */
const SUBJECT: readonly ActionField[] = [
  NODE,
  { key: 'bone', kind: 'text', labelKey: 'assistant.fields.boneName', required: false },
]

export const RIG_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'rig.state',
    titleKey: 'assistant.actions.rigState.title',
    descriptionKey: 'assistant.actions.rigState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    /**
     * The skeleton the studio fits to the mesh it has measured — what « make animatable » does.
     * Refused while the engine has not read the model, which is a wait rather than a fault.
     */
    name: 'rig.fit',
    titleKey: 'assistant.actions.rigFit.title',
    descriptionKey: 'assistant.actions.rigFit.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'rig.clear',
    titleKey: 'assistant.actions.rigClear.title',
    descriptionKey: 'assistant.actions.rigClear.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'rig.configureHands',
    titleKey: 'assistant.actions.rigConfigureHands.title',
    descriptionKey: 'assistant.actions.rigConfigureHands.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    // The name is composed from the parent's, as the panel's own button does — a bone named from
    // a word would read differently in a document opened in another language.
    name: 'bone.add',
    titleKey: 'assistant.actions.boneAdd.title',
    descriptionKey: 'assistant.actions.boneAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ ...BONE, key: 'parent', labelKey: 'assistant.fields.parentBone' }],
  }),
  action({
    name: 'bone.remove',
    titleKey: 'assistant.actions.boneRemove.title',
    descriptionKey: 'assistant.actions.boneRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [BONE],
  }),
  action({
    name: 'bone.rename',
    titleKey: 'assistant.actions.boneRename.title',
    descriptionKey: 'assistant.actions.boneRename.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      BONE,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    name: 'socket.add',
    titleKey: 'assistant.actions.socketAdd.title',
    descriptionKey: 'assistant.actions.socketAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      BONE,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    name: 'socket.remove',
    titleKey: 'assistant.actions.socketRemove.title',
    descriptionKey: 'assistant.actions.socketRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [{ key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true }],
  }),
  action({
    // The roles keep the standard's own spelling, untranslated: they are the identifiers of the
    // Mixamo set. An absent role says the bone fills none.
    name: 'bone.setRole',
    titleKey: 'assistant.actions.boneSetRole.title',
    descriptionKey: 'assistant.actions.boneSetRole.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      BONE,
      {
        key: 'role',
        kind: 'choice',
        labelKey: 'assistant.fields.boneRole',
        required: false,
        options: HUMANOID_ROLES,
      },
    ],
  }),
  action({
    name: 'ik.add',
    titleKey: 'assistant.actions.ikAdd.title',
    descriptionKey: 'assistant.actions.ikAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [BONE],
  }),
  action({
    name: 'ik.remove',
    titleKey: 'assistant.actions.ikRemove.title',
    descriptionKey: 'assistant.actions.ikRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'chainId', kind: 'text', labelKey: 'assistant.fields.chainId', required: true },
    ],
  }),
  action({
    /**
     * The three places a motion can come from, in one list — the picker's own library tab. A
     * client that could only lay an asset would be blind to what the model's own file carries.
     */
    name: 'animations.list',
    titleKey: 'assistant.actions.animationsList.title',
    descriptionKey: 'assistant.actions.animationsList.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE],
  }),
  action({
    name: 'animation.reopenMotion',
    titleKey: 'assistant.actions.animationReopenMotion.title',
    descriptionKey: 'assistant.actions.animationReopenMotion.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: true },
    ],
  }),
  action({
    /**
     * A block laid on the band, from any of the three sources. `assetId` names a clip of the
     * library and `clipName` one of the two others, so exactly one of them belongs to a call.
     */
    name: 'animation.addBlock',
    titleKey: 'assistant.actions.animationAddBlock.title',
    descriptionKey: 'assistant.actions.animationAddBlock.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      {
        key: 'source',
        kind: 'choice',
        labelKey: 'assistant.fields.clipSource',
        required: false,
        options: CLIP_SOURCES,
      },
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: false },
      { key: 'clipName', kind: 'text', labelKey: 'assistant.fields.clipName', required: false },
    ],
  }),
  action({
    name: 'animation.removeBlock',
    titleKey: 'assistant.actions.animationRemoveBlock.title',
    descriptionKey: 'assistant.actions.animationRemoveBlock.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'clipId', kind: 'text', labelKey: 'assistant.fields.clipId', required: true },
    ],
  }),
  action({
    /**
     * What one block of the band plays, and how it joins its neighbours — the inspector's own
     * section, whose every control writes the whole set of lanes back.
     *
     * Seconds across the boundary, microseconds inside: `offsetSeconds` is where playback starts
     * INSIDE the clip, `startSeconds` where the block sits on the band. The two are three's clock
     * and the band's, and they are never handed to one another.
     */
    name: 'animation.setBlockSettings',
    titleKey: 'assistant.actions.animationSetBlockSettings.title',
    descriptionKey: 'assistant.actions.animationSetBlockSettings.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'clipId', kind: 'text', labelKey: 'assistant.fields.clipId', required: true },
      {
        key: 'startSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.startSeconds',
        required: false,
        min: 0,
      },
      {
        key: 'offsetSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.offsetSeconds',
        required: false,
        min: 0,
      },
      {
        key: 'speed',
        kind: 'number',
        labelKey: 'assistant.fields.speed',
        required: false,
        min: CLIP_SPEED.min,
        max: CLIP_SPEED.max,
      },
      { key: 'loop', kind: 'boolean', labelKey: 'assistant.fields.clipLoop', required: false },
      // One value for both edges, as the slider writes it: what is being set is how this move
      // JOINS its neighbours, and a block whose two ends faded differently would have no such thing.
      {
        key: 'fadeSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.clipFade',
        required: false,
        min: 0,
        max: MAX_CLIP_FADE,
      },
      {
        key: 'rootMotion',
        kind: 'choice',
        labelKey: 'assistant.fields.rootMotion',
        required: false,
        options: ROOT_MOTIONS,
      },
      {
        key: 'part',
        kind: 'choice',
        labelKey: 'assistant.fields.bodyPart',
        required: false,
        options: BODY_PARTS,
      },
    ],
  }),
  action({
    name: 'animation.setBandLengthAndRate',
    titleKey: 'assistant.actions.animationSetBandLengthAndRate.title',
    descriptionKey: 'assistant.actions.animationSetBandLengthAndRate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'durationSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.durationSeconds',
        required: false,
        min: 0,
      },
      { key: 'fps', kind: 'integer', labelKey: 'assistant.fields.fps', required: false, min: 1 },
    ],
  }),
  action({
    // Session state, like every other way of looking at a scene: it decides whether moving a bone
    // writes a key, and nothing of it is saved with the document.
    name: 'animation.autoKey',
    titleKey: 'assistant.actions.animationAutoKey.title',
    descriptionKey: 'assistant.actions.animationAutoKey.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [{ key: 'on', kind: 'boolean', labelKey: 'assistant.fields.autoKey', required: true }],
  }),
  action({
    /**
     * One key on every channel of one subject, holding where it STANDS — the band's own diamond,
     * which Blender spells `LocRotScale`. It opens the channels the subject lacks, because
     * demanding one first would be asking for the thing already standing in the viewport.
     *
     * `property` narrows it to a single channel, which is what a client driving one axis wants.
     */
    name: 'key.writePoseKeys',
    titleKey: 'assistant.actions.keyWritePoseKeys.title',
    descriptionKey: 'assistant.actions.keyWritePoseKeys.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { intents: ['create', 'mutate'], targets: ['node'] },
    fields: [
      ...SUBJECT,
      {
        key: 'timeSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.timeSeconds',
        required: false,
        min: 0,
      },
      {
        key: 'property',
        kind: 'choice',
        labelKey: 'assistant.fields.trackProperty',
        required: false,
        options: DIRECT_PROPERTIES,
      },
    ],
  }),
  action({
    // The counterpart, and it has to exist: a pose one cannot undo is a pose one is stuck with.
    name: 'key.removeSubjectKeys',
    titleKey: 'assistant.actions.keyRemoveSubjectKeys.title',
    descriptionKey: 'assistant.actions.keyRemoveSubjectKeys.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      ...SUBJECT,
      {
        key: 'timeSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.timeSeconds',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    // The band's toolbar button: every channel of every subject at once, on the channels that
    // already exist. It opens none — that is `key.writePoseKeys`'s errand, one subject at a time.
    name: 'key.writeKeysOnOpenChannels',
    titleKey: 'assistant.actions.keyWriteKeysOnOpenChannels.title',
    descriptionKey: 'assistant.actions.keyWriteKeysOnOpenChannels.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'timeSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.timeSeconds',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    name: 'key.move',
    titleKey: 'assistant.actions.keyMove.title',
    descriptionKey: 'assistant.actions.keyMove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: { intents: ['mutate'], targets: ['node', 'track'] },
    fields: [
      TRACK,
      {
        key: 'fromSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.fromSeconds',
        required: true,
        min: 0,
      },
      {
        key: 'toSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.toSeconds',
        required: true,
        min: 0,
      },
    ],
  }),
  action({
    // The channel row's own bin. No twin that ADDS one: a channel is opened by keying a subject,
    // and the panel offers no other way either.
    name: 'channel.remove',
    titleKey: 'assistant.actions.channelRemove.title',
    descriptionKey: 'assistant.actions.channelRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [TRACK],
  }),
  action({
    /**
     * How one WORKS on a channel rather than what one made — muted, solo, locked — so it goes
     * through the store without an entry in the history, exactly as a montage's flags do.
     */
    name: 'channel.setMuteSoloLock',
    titleKey: 'assistant.actions.channelSetMuteSoloLock.title',
    descriptionKey: 'assistant.actions.channelSetMuteSoloLock.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [TRACK, ...MUTE_SOLO_LOCK],
  }),
]
