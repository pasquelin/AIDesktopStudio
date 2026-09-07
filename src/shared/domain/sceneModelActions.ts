import {
  action,
  NODE_ID as NODE,
  RELATIVE_FIELD,
  type ActionField,
  type AssistantAction,
} from './assistantAction'
import { EASINGS } from './animation'
import { MATERIAL_SLOTS } from './scene'
import { dial, vector } from './sceneActionFields'

/** The shot in front, which `camera.addShot` answers — a reference the runtime checks. */
const SHOT_ID: ActionField = {
  key: 'shotId',
  kind: 'text',
  labelKey: 'assistant.fields.shotId',
  required: true,
  reference: 'shot',
}

export const SCENE_MODEL_ACTIONS: readonly AssistantAction[] = [
  action({
    /**
     * The MATERIAL a model wears in ONE of its slots, named by the title of its document. An empty
     * title takes the whole dress off, and the model goes back to what its own file carries.
     *
     * A reference: what that material holds is resolved when the scene is read, so editing it
     * reaches every model wearing it. The slot is Blender's — a model carries one material per
     * primitive of its mesh, and a caller that names none means the first.
     */
    name: 'model.setMaterialDocument',
    titleKey: 'assistant.actions.modelSetMaterialDocument.title',
    descriptionKey: 'assistant.actions.modelSetMaterialDocument.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'material', kind: 'text', labelKey: 'assistant.fields.material', required: false },
      {
        key: 'slot',
        kind: 'integer',
        labelKey: 'assistant.fields.materialSlot',
        required: false,
        min: 0,
        // A mesh of more primitives than this is not a model anyone dresses by hand, and the list
        // GROWS to reach the slot named: unbounded, one call could ask for a million rows.
        max: MATERIAL_SLOTS - 1,
      },
    ],
  }),
  action({
    /**
     * The simple way to cover a model: ONE picture as its base colour, which is what Roblox's
     * `TextureID` is. No asset takes the dress off.
     *
     * EXCLUSIVE with `model.setMaterialDocument`: a model is covered one way or the other, never both,
     * so this drops whatever materials it wore. Nothing is derived from the picture — a normal
     * computed from the luminance of a photograph turns painted shadow into relief.
     */
    name: 'model.setBaseColorImage',
    titleKey: 'assistant.actions.modelSetBaseColorImage.title',
    descriptionKey: 'assistant.actions.modelSetBaseColorImage.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: false },
    ],
  }),
  action({
    /**
     * Everything a light of any kind carries, in one action — the whole of the section the
     * inspector derives from the descriptor. What differs from kind to kind is which fields are
     * ACCEPTED: an ambient light has no cone and a hemisphere has no single colour, so naming one
     * where it does not belong is refused rather than filed against a field that is not there.
     */
    name: 'node.setLightSettings',
    titleKey: 'assistant.actions.nodeSetLightSettings.title',
    descriptionKey: 'assistant.actions.nodeSetLightSettings.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      // A hemisphere has these two INSTEAD of `color`, which is the whole reason it needs them.
      { key: 'skyColor', kind: 'color', labelKey: 'assistant.fields.skyColour', required: false },
      {
        key: 'groundColor',
        kind: 'color',
        labelKey: 'assistant.fields.groundColour',
        required: false,
      },
      dial('intensity', { min: 0 }),
      RELATIVE_FIELD,
      // Zero means no falloff at all — three.js reads it as "reaches everywhere".
      dial('distance', { min: 0 }),
      dial('decay', { min: 0, max: 4 }),
      // Half-angle of the cone: a spot wider than a hemisphere lights nothing more.
      dial('angle', { min: 0.01, max: Math.PI / 2 }),
      dial('penumbra', { min: 0, max: 1 }),
      // Where the beam points, in the scene's own frame. Never a node: see `LightDescriptor`.
      vector('x', 'target'),
      vector('y', 'target'),
      vector('z', 'target'),
    ],
  }),
  action({
    // The lens, and nothing of where the camera stands: a camera is moved by `node.transform`
    // like anything else in the tree.
    name: 'node.setCameraLens',
    titleKey: 'assistant.actions.nodeSetCameraLens.title',
    descriptionKey: 'assistant.actions.nodeSetCameraLens.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      {
        key: 'fov',
        kind: 'number',
        labelKey: 'assistant.fields.fov',
        required: false,
        min: 1,
        max: 170,
      },
      { key: 'near', kind: 'number', labelKey: 'assistant.fields.near', required: false, min: 0 },
      { key: 'far', kind: 'number', labelKey: 'assistant.fields.far', required: false, min: 0 },
    ],
  }),
  action({
    /**
     * A shot opened for a camera, from an instant onwards. Where it lands in the stack is
     * `shotsWith`'s rule, the same one the band's button obeys — a client that could choose its
     * own layer would be a second law over what is on air.
     */
    name: 'camera.addShot',
    titleKey: 'assistant.actions.cameraAddShot.title',
    descriptionKey: 'assistant.actions.cameraAddShot.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    returns: ['cameraShots'],
    fields: [
      NODE,
      {
        key: 'startSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.startSeconds',
        required: false,
        min: 0,
      },
      {
        key: 'durationSeconds',
        kind: 'number',
        labelKey: 'assistant.fields.durationSeconds',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    /**
     * The rail a shot runs its camera along, and which stretch of it. An empty `pathId` unbinds:
     * the camera then stays wherever its transform and its keys put it.
     */
    name: 'camera.bindPathToShot',
    titleKey: 'assistant.actions.cameraBindPathToShot.title',
    descriptionKey: 'assistant.actions.cameraBindPathToShot.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['cameraShots'],
    fields: [
      SHOT_ID,
      { key: 'pathId', kind: 'text', labelKey: 'assistant.fields.pathId', required: false },
      // Not clamped to one another: `from` past `to` is what runs the rail backwards.
      { key: 'from', kind: 'number', labelKey: 'assistant.fields.railFrom', required: false },
      { key: 'to', kind: 'number', labelKey: 'assistant.fields.railTo', required: false },
      {
        key: 'easing',
        kind: 'choice',
        labelKey: 'assistant.fields.easing',
        required: false,
        options: EASINGS,
      },
    ],
  }),
  action({
    /**
     * A rail LAID where the camera stands, aimed down its line of sight, and bound to the shot in
     * one gesture — the inspector's own button. `camera.bindPathToShot` binds one that already exists; this
     * makes one, because a rail drives nothing without a shot to run it.
     */
    name: 'camera.createAndBindPath',
    titleKey: 'assistant.actions.cameraCreateAndBindPath.title',
    descriptionKey: 'assistant.actions.cameraCreateAndBindPath.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['cameraShots'],
    fields: [SHOT_ID],
  }),
  action({
    /**
     * A camera's line moved up or down the band, which is what settles what the film looks
     * through: the stack decides, so moving a line changes the cut.
     */
    name: 'camera.reorder',
    titleKey: 'assistant.actions.cameraReorder.title',
    descriptionKey: 'assistant.actions.cameraReorder.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE, { key: 'by', kind: 'integer', labelKey: 'assistant.fields.by', required: true }],
  }),
  action({
    /**
     * What a shot aims its camera at: a node it follows, a fixed point, or nothing at all —
     * which leaves the camera aimed by its own rotation.
     */
    name: 'camera.aimShotAt',
    titleKey: 'assistant.actions.cameraAimShotAt.title',
    descriptionKey: 'assistant.actions.cameraAimShotAt.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    uses: ['cameraShots'],
    fields: [
      SHOT_ID,
      { key: 'targetId', kind: 'text', labelKey: 'assistant.fields.targetId', required: false },
      { key: 'atX', kind: 'number', labelKey: 'assistant.fields.positionX', required: false },
      { key: 'atY', kind: 'number', labelKey: 'assistant.fields.positionY', required: false },
      { key: 'atZ', kind: 'number', labelKey: 'assistant.fields.positionZ', required: false },
    ],
  }),
  action({
    name: 'node.reparent',
    titleKey: 'assistant.actions.nodeReparent.title',
    descriptionKey: 'assistant.actions.nodeReparent.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'parentId', kind: 'text', labelKey: 'assistant.fields.parentId', required: false },
      // Absent, the node keeps the place it already has among its new siblings — which is what
      // hanging it somewhere means, and what dropping a row ONTO another does on screen.
      {
        key: 'index',
        kind: 'integer',
        labelKey: 'assistant.fields.nodeIndex',
        required: false,
        min: 0,
      },
    ],
  }),
  action({
    name: 'node.select',
    titleKey: 'assistant.actions.nodeSelect.title',
    descriptionKey: 'assistant.actions.nodeSelect.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [
      {
        key: 'nodeIds',
        kind: 'text',
        labelKey: 'assistant.fields.nodeIds',
        required: true,
        repeated: true,
      },
    ],
  }),
]
