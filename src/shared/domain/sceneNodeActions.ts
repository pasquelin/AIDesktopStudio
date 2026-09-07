import { action, NODE_ID as NODE, RELATIVE_FIELD, type AssistantAction } from './assistantAction'
import { CSG_OPERATIONS } from './csg'
import { FONT_SOURCES } from './font'
import { TILES_PER_METRE } from './scene'
import {
  GEOMETRY_FIELDS,
  NODE_KINDS,
  POINT_INDEX,
  SMALLEST,
  TEXTURES,
  count,
  dial,
  vector,
} from './sceneActionFields'

export const SCENE_NODE_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'scene.state',
    titleKey: 'assistant.actions.sceneState.title',
    descriptionKey: 'assistant.actions.sceneState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'node.add',
    titleKey: 'assistant.actions.nodeAdd.title',
    descriptionKey: 'assistant.actions.nodeAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'kind',
        kind: 'choice',
        labelKey: 'assistant.fields.nodeKind',
        required: true,
        options: NODE_KINDS,
      },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: false },
      vector('x', 'position'),
      vector('y', 'position'),
      vector('z', 'position'),
    ],
  }),
  action({
    /**
     * A model of the library, placed in the scene — which is how a generated mesh gets in. It is
     * not on the Add menu for the same reason: what to place comes from the project's assets,
     * not from a list of shapes.
     */
    name: 'node.addModel',
    titleKey: 'assistant.actions.nodeAddModel.title',
    descriptionKey: 'assistant.actions.nodeAddModel.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'assetId', kind: 'text', labelKey: 'assistant.fields.assetId', required: true },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: false },
    ],
  }),
  action({
    /**
     * Marks shapes as tools for the next fold, or takes the mark off — Roblox's Negate, and the
     * one explicit way to say which way a cut runs through either door.
     */
    name: 'node.markAsCuttingTool',
    titleKey: 'assistant.actions.nodeMarkAsCuttingTool.title',
    descriptionKey: 'assistant.actions.nodeMarkAsCuttingTool.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'nodeIds',
        kind: 'text',
        labelKey: 'assistant.fields.nodeIds',
        required: true,
        repeated: true,
      },
      { key: 'negative', kind: 'boolean', labelKey: 'assistant.fields.negative', required: false },
    ],
  }),
  action({
    /**
     * Folds shapes into one solid. The ORDER OF THE IDS says nothing — `carvePlan` elects the
     * matter, and `matterId` is what names one outright.
     */
    name: 'node.combineIntoSolid',
    titleKey: 'assistant.actions.nodeCombineIntoSolid.title',
    descriptionKey: 'assistant.actions.nodeCombineIntoSolid.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'nodeIds',
        kind: 'text',
        labelKey: 'assistant.fields.nodeIds',
        required: true,
        repeated: true,
      },
      {
        key: 'operation',
        kind: 'choice',
        labelKey: 'assistant.fields.csgOperation',
        required: true,
        options: CSG_OPERATIONS,
      },
      { key: 'matterId', kind: 'text', labelKey: 'assistant.fields.matterId', required: false },
    ],
  }),
  action({
    /**
     * The same fold run the other way — one call to repair a cut that came out inverted, where
     * the alternative is an undo and a rule to explain.
     */
    name: 'node.swapSolidMatterAndTool',
    titleKey: 'assistant.actions.nodeSwapSolidMatterAndTool.title',
    descriptionKey: 'assistant.actions.nodeSwapSolidMatterAndTool.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE],
  }),
  action({
    /** Undoes a fold: the brushes the graph kept come back as meshes, where they stood. */
    name: 'node.separate',
    titleKey: 'assistant.actions.nodeSeparate.title',
    descriptionKey: 'assistant.actions.nodeSeparate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE],
  }),
  action({
    name: 'node.remove',
    titleKey: 'assistant.actions.nodeRemove.title',
    descriptionKey: 'assistant.actions.nodeRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE],
  }),
  action({
    name: 'node.attach',
    titleKey: 'assistant.actions.nodeAttach.title',
    descriptionKey: 'assistant.actions.nodeAttach.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      // Empty takes it back off: a point refines the parent, and dropping it leaves the node
      // hanging from the character itself.
      { key: 'socket', kind: 'text', labelKey: 'assistant.fields.socket', required: false },
    ],
  }),
  action({
    name: 'node.rename',
    titleKey: 'assistant.actions.nodeRename.title',
    descriptionKey: 'assistant.actions.nodeRename.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    name: 'node.transform',
    titleKey: 'assistant.actions.nodeTransform.title',
    descriptionKey: 'assistant.actions.nodeTransform.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      vector('x', 'position'),
      vector('y', 'position'),
      vector('z', 'position'),
      vector('x', 'rotation'),
      vector('y', 'rotation'),
      vector('z', 'rotation'),
      vector('x', 'scale'),
      vector('y', 'scale'),
      vector('z', 'scale'),
      RELATIVE_FIELD,
    ],
  }),
  action({
    name: 'node.setVisible',
    titleKey: 'assistant.actions.nodeSetVisible.title',
    descriptionKey: 'assistant.actions.nodeSetVisible.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'visible', kind: 'boolean', labelKey: 'assistant.fields.visible', required: true },
    ],
  }),
  action({
    /**
     * A mesh's material, and a text's — one section of the inspector serves both, and they wear
     * the same descriptor. `tilesPerMetre` is the exception: a text's outline is not a primitive,
     * so its UVs never go through the tiling, and naming it on one is refused rather than filed.
     */
    name: 'node.setMeshMaterial',
    titleKey: 'assistant.actions.nodeSetMeshMaterial.title',
    descriptionKey: 'assistant.actions.nodeSetMeshMaterial.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      dial('roughness', { min: 0, max: 1 }),
      dial('metalness', { min: 0, max: 1 }),
      dial('tilesPerMetre', { min: TILES_PER_METRE.min, max: TILES_PER_METRE.max }),
      TEXTURES,
    ],
  }),
  action({
    name: 'node.setPrimitiveParameters',
    titleKey: 'assistant.actions.nodeSetPrimitiveParameters.title',
    descriptionKey: 'assistant.actions.nodeSetPrimitiveParameters.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE, ...GEOMETRY_FIELDS],
  }),
  action({
    /**
     * What a node does with light that is not its own. A light catches nothing and a sprite does
     * neither, so the field the node cannot hold is refused — which is the same row the inspector
     * hides rather than draws inert.
     */
    name: 'node.setShadowCastAndReceive',
    titleKey: 'assistant.actions.nodeSetShadowCastAndReceive.title',
    descriptionKey: 'assistant.actions.nodeSetShadowCastAndReceive.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      {
        key: 'castShadow',
        kind: 'boolean',
        labelKey: 'assistant.fields.castShadow',
        required: false,
      },
      {
        key: 'receiveShadow',
        kind: 'boolean',
        labelKey: 'assistant.fields.receiveShadow',
        required: false,
      },
    ],
  }),
  action({
    name: 'node.setSpriteSettings',
    titleKey: 'assistant.actions.nodeSetSpriteSettings.title',
    descriptionKey: 'assistant.actions.nodeSetSpriteSettings.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      dial('opacity', { min: 0, max: 1 }),
      // An empty id takes the picture off, exactly as the material's slots do.
      { key: 'map', kind: 'text', labelKey: 'assistant.fields.map', required: false },
    ],
  }),
  action({
    /**
     * What a text says, in what face, at what size. Its material is `node.setMeshMaterial`'s — the same
     * bargain the inspector strikes, where one section lights both a mesh and a text.
     */
    name: 'node.setTextSettings',
    titleKey: 'assistant.actions.nodeSetTextSettings.title',
    descriptionKey: 'assistant.actions.nodeSetTextSettings.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { key: 'value', kind: 'text', labelKey: 'assistant.fields.value', required: false },
      { key: 'fontFamily', kind: 'text', labelKey: 'assistant.fields.fontFamily', required: false },
      {
        key: 'fontSource',
        kind: 'choice',
        labelKey: 'assistant.fields.fontSource',
        required: false,
        options: FONT_SOURCES,
      },
      dial('textSize', { min: SMALLEST }),
      dial('textDepth', { min: 0 }),
      count('curveSegments', 1, 32),
    ],
  }),
  action({
    /** The shape of a rail. Its points are `path.addPoint` and its two neighbours. */
    name: 'node.setPathShape',
    titleKey: 'assistant.actions.nodeSetPathShape.title',
    descriptionKey: 'assistant.actions.nodeSetPathShape.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      dial('tension', { min: 0, max: 1 }),
      { key: 'closed', kind: 'boolean', labelKey: 'assistant.fields.closed', required: false },
    ],
  }),
  action({
    /**
     * A control point added after the one named, halfway to its neighbour — the panel's own
     * button, which names none and lands at the end. A point of its own is what a client that
     * knows where the camera should pass gives instead.
     */
    name: 'path.addPoint',
    titleKey: 'assistant.actions.pathAddPoint.title',
    descriptionKey: 'assistant.actions.pathAddPoint.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      NODE,
      { ...POINT_INDEX, required: false },
      vector('x', 'point'),
      vector('y', 'point'),
      vector('z', 'point'),
    ],
  }),
  action({
    name: 'path.movePoint',
    titleKey: 'assistant.actions.pathMovePoint.title',
    descriptionKey: 'assistant.actions.pathMovePoint.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE, POINT_INDEX, vector('x', 'point'), vector('y', 'point'), vector('z', 'point')],
  }),
  action({
    // Two points is the floor `withoutPoint` holds: one point is not a line.
    name: 'path.removePoint',
    titleKey: 'assistant.actions.pathRemovePoint.title',
    descriptionKey: 'assistant.actions.pathRemovePoint.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [NODE, POINT_INDEX],
  }),
]
