import { action, RELATIVE_FIELD, type AssistantAction } from './assistantAction'
import { BLEND_MODES } from './canvasBlend'
import { GENERATION_COMMENT_TEXT_MAX } from './generationComment'

/**
 * The image workspace, driven by value rather than by gesture.
 *
 * The 48 canvas COMMANDS are gestures with no arguments — "brush tool", "zoom in", "undo" — so a
 * client could arm a tool and never say what to do with it. These take the values: which layer,
 * what opacity, where, how big.
 *
 * None of them names a document. They act on the image tab in front, which is the same rule
 * `command.runStudioCommand` follows, and `studio.state` says which one that is. A client changes it with
 * `document.activate` rather than by naming it here — one way of saying "the document I mean",
 * not two.
 *
 * What is NOT here yet, said plainly: painting. `engines/canvas/commands.ts` has no path onto a
 * GPU surface, so an action that paints goes through `CanvasHost.paintCells` — published, and
 * with no caller until one is written.
 */

import { CANVAS_ACTIONS_MORE } from './canvasActionsMore'
import { LAYER, SIDES } from './canvasActionFields'

const CANVAS_ACTIONS_FIRST: readonly AssistantAction[] = [
  action({
    name: 'canvas.state',
    titleKey: 'assistant.actions.canvasState.title',
    descriptionKey: 'assistant.actions.canvasState.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [],
  }),
  action({
    name: 'canvas.setDocumentProperties',
    titleKey: 'assistant.actions.canvasSetDocumentProperties.title',
    descriptionKey: 'assistant.actions.canvasSetDocumentProperties.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'dpi', kind: 'number', labelKey: 'assistant.fields.dpi', required: false, min: 1 },
      {
        key: 'colorMode',
        kind: 'choice',
        labelKey: 'assistant.fields.colorMode',
        required: false,
        options: ['rgb', 'grayscale'],
      },
      {
        key: 'bitDepth',
        kind: 'choice',
        labelKey: 'assistant.fields.bitDepth',
        required: false,
        options: [8, 16, 32],
      },
    ],
  }),
  action({
    name: 'layer.add',
    titleKey: 'assistant.actions.layerAdd.title',
    descriptionKey: 'assistant.actions.layerAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'kind',
        kind: 'choice',
        labelKey: 'assistant.fields.layerKind',
        required: true,
        options: ['pixel', 'text', 'adjustment', 'shape'],
      },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
      { key: 'text', kind: 'longText', labelKey: 'assistant.fields.text', required: false },
      {
        key: 'shape',
        kind: 'choice',
        labelKey: 'assistant.fields.shape',
        required: false,
        options: ['rectangle', 'line', 'arrow', 'ellipse', 'polygon', 'star'],
      },
      { key: 'width', kind: 'number', labelKey: 'assistant.fields.width', required: false },
      { key: 'height', kind: 'number', labelKey: 'assistant.fields.height', required: false },
      {
        key: 'sides',
        kind: 'integer',
        labelKey: 'assistant.fields.sides',
        required: false,
        ...SIDES,
      },
      // `#rrggbb`, as every other colour of the registry — and as `layer.editShapeLayer`, which repaints
      // what this one draws: two spellings of one concept had a client refused on its own value.
      { key: 'fill', kind: 'color', labelKey: 'assistant.fields.shapeFill', required: false },
      {
        key: 'adjustment',
        kind: 'choice',
        labelKey: 'assistant.fields.adjustment',
        required: false,
        options: ['exposure', 'contrast', 'saturation', 'temperature'],
      },
      { key: 'x', kind: 'number', labelKey: 'assistant.fields.x', required: false },
      { key: 'y', kind: 'number', labelKey: 'assistant.fields.y', required: false },
    ],
  }),
  action({
    name: 'layer.remove',
    titleKey: 'assistant.actions.layerRemove.title',
    descriptionKey: 'assistant.actions.layerRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [LAYER],
  }),
  action({
    name: 'layer.select',
    titleKey: 'assistant.actions.layerSelect.title',
    descriptionKey: 'assistant.actions.layerSelect.description',
    commitment: 'none',
    repeatable: false,
    reach: 'mcp',
    fields: [LAYER],
  }),
  action({
    name: 'layer.rename',
    titleKey: 'assistant.actions.layerRename.title',
    descriptionKey: 'assistant.actions.layerRename.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    /**
     * Every dial of a layer at once, and each one optional: a client that wants to change the
     * opacity alone must not have to restate the blend mode it did not read.
     */
    name: 'layer.setOpacityBlendAndVisibility',
    titleKey: 'assistant.actions.layerSetOpacityBlendAndVisibility.title',
    descriptionKey: 'assistant.actions.layerSetOpacityBlendAndVisibility.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      {
        key: 'opacity',
        kind: 'number',
        labelKey: 'assistant.fields.opacity',
        required: false,
        min: 0,
        max: 1,
      },
      {
        key: 'fillOpacity',
        kind: 'number',
        labelKey: 'assistant.fields.fillOpacity',
        required: false,
        min: 0,
        max: 1,
      },
      {
        key: 'blend',
        kind: 'choice',
        labelKey: 'assistant.fields.blend',
        required: false,
        options: BLEND_MODES,
      },
      { key: 'visible', kind: 'boolean', labelKey: 'assistant.fields.visible', required: false },
      { key: 'clipped', kind: 'boolean', labelKey: 'assistant.fields.clipped', required: false },
    ],
  }),
  action({
    name: 'layer.transform',
    titleKey: 'assistant.actions.layerTransform.title',
    descriptionKey: 'assistant.actions.layerTransform.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    capabilities: {
      intents: ['mutate'],
      targets: ['layer'],
      documentKinds: ['image'],
      documentAffinity: 'required',
    },
    fields: [
      LAYER,
      { key: 'x', kind: 'number', labelKey: 'assistant.fields.x', required: false },
      { key: 'y', kind: 'number', labelKey: 'assistant.fields.y', required: false },
      { key: 'scaleX', kind: 'number', labelKey: 'assistant.fields.scaleX', required: false },
      { key: 'scaleY', kind: 'number', labelKey: 'assistant.fields.scaleY', required: false },
      // Degrees, not radians: the state stores radians, and a client writing 90 for a quarter
      // turn is right more often than one writing 1.5707963.
      { key: 'rotation', kind: 'number', labelKey: 'assistant.fields.rotation', required: false },
      RELATIVE_FIELD,
    ],
  }),
  action({
    name: 'layer.editTextLayer',
    titleKey: 'assistant.actions.layerEditTextLayer.title',
    descriptionKey: 'assistant.actions.layerEditTextLayer.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'text', kind: 'longText', labelKey: 'assistant.fields.text', required: false },
      {
        key: 'size',
        kind: 'number',
        labelKey: 'assistant.fields.fontSize',
        required: false,
        min: 1,
      },
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      {
        key: 'align',
        kind: 'choice',
        labelKey: 'assistant.fields.align',
        required: false,
        options: ['left', 'center', 'right', 'justify'],
      },
      { key: 'width', kind: 'number', labelKey: 'assistant.fields.width', required: false, min: 1 },
      {
        key: 'height',
        kind: 'number',
        labelKey: 'assistant.fields.height',
        required: false,
        min: 1,
      },
      {
        key: 'lineHeight',
        kind: 'number',
        labelKey: 'assistant.fields.lineHeight',
        required: false,
      },
      { key: 'tracking', kind: 'number', labelKey: 'assistant.fields.tracking', required: false },
      /**
       * The typeface, which `fonts.list` names and nothing could set — the one action of
       * discovery this registry published with no way to act on what it found.
       */
      {
        key: 'fontFamily',
        kind: 'text',
        labelKey: 'assistant.fields.fontFamily',
        required: false,
      },
      // Told apart rather than guessed: a machine that has Lato installed offers it under the
      // same name as the face the studio ships, and the two are not the same file.
      {
        key: 'fontSource',
        kind: 'choice',
        labelKey: 'assistant.fields.fontSource',
        required: false,
        options: ['embedded', 'system'],
      },
    ],
  }),
  action({
    name: 'layer.reorderInStack',
    titleKey: 'assistant.actions.layerReorderInStack.title',
    descriptionKey: 'assistant.actions.layerReorderInStack.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'index', kind: 'integer', labelKey: 'assistant.fields.index', required: true, min: 0 },
      { key: 'parentId', kind: 'text', labelKey: 'assistant.fields.parentId', required: false },
    ],
  }),
  action({
    name: 'layer.duplicate',
    titleKey: 'assistant.actions.layerDuplicate.title',
    descriptionKey: 'assistant.actions.layerDuplicate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: false },
    ],
  }),
  action({
    name: 'layer.group',
    titleKey: 'assistant.actions.layerGroup.title',
    descriptionKey: 'assistant.actions.layerGroup.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'layerIds',
        kind: 'text',
        labelKey: 'assistant.fields.layerIds',
        required: true,
        repeated: true,
      },
      { key: 'name', kind: 'text', labelKey: 'assistant.fields.name', required: true },
    ],
  }),
  action({
    name: 'layer.ungroup',
    titleKey: 'assistant.actions.layerUngroup.title',
    descriptionKey: 'assistant.actions.layerUngroup.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [LAYER],
  }),
  action({
    name: 'layer.mergeDown',
    titleKey: 'assistant.actions.layerMergeDown.title',
    descriptionKey: 'assistant.actions.layerMergeDown.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [LAYER],
  }),
  action({
    name: 'canvas.resize',
    titleKey: 'assistant.actions.canvasResize.title',
    descriptionKey: 'assistant.actions.canvasResize.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'width', kind: 'integer', labelKey: 'assistant.fields.width', required: true, min: 1 },
      {
        key: 'height',
        kind: 'integer',
        labelKey: 'assistant.fields.height',
        required: true,
        min: 1,
      },
      // The difference between Image size and Canvas size, which every editor keeps apart: one
      // rescales the pixels, the other changes the frame around them.
      {
        key: 'scalePixels',
        kind: 'boolean',
        labelKey: 'assistant.fields.scalePixels',
        required: false,
      },
    ],
  }),
]

const CANVAS_COMMENT_ACTIONS: readonly AssistantAction[] = [
  action({
    name: 'img.pin',
    titleKey: 'assistant.actions.canvasGenerationComment.title',
    descriptionKey: 'assistant.actions.canvasGenerationComment.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'action',
        kind: 'choice',
        labelKey: 'assistant.fields.commentAction',
        required: true,
        options: ['add', 'update', 'remove'],
      },
      { key: 'x', kind: 'number', labelKey: 'assistant.fields.x', required: false },
      { key: 'y', kind: 'number', labelKey: 'assistant.fields.y', required: false },
      {
        key: 'text',
        kind: 'longText',
        labelKey: 'assistant.fields.generationInstruction',
        required: false,
        max: GENERATION_COMMENT_TEXT_MAX,
      },
      { ...LAYER, required: false },
      {
        key: 'outline',
        kind: 'raw',
        labelKey: 'assistant.fields.commentOutline',
        required: false,
      },
      {
        key: 'commentId',
        kind: 'text',
        labelKey: 'assistant.fields.commentId',
        required: false,
      },
    ],
  }),
]

export const CANVAS_ACTIONS: readonly AssistantAction[] = [
  ...CANVAS_ACTIONS_FIRST,
  ...CANVAS_ACTIONS_MORE,
  ...CANVAS_COMMENT_ACTIONS,
]
