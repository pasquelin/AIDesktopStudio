import { action, type AssistantAction } from './assistantAction'
import { PIXEL_SHAPES } from './pixelShape'
import { CELL_AT, COUNT, GUIDE, GUIDE_AXES, LAYER, SIDES } from './canvasActionFields'

export const CANVAS_ACTIONS_MORE: readonly AssistantAction[] = [
  action({
    name: 'canvas.setPixelArt',
    titleKey: 'assistant.actions.canvasSetPixelArt.title',
    descriptionKey: 'assistant.actions.canvasSetPixelArt.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'enabled',
        kind: 'boolean',
        labelKey: 'assistant.fields.pixelArtEnabled',
        required: true,
      },
      // In CELLS, which is how a person says it — « a grid of 32 by 32 », never « 32 document
      // pixels with a cell of one ». The handler turns them into the document's own size.
      COUNT('columns'),
      COUNT('rows'),
      COUNT('cell'),
    ],
  }),
  action({
    name: 'canvas.drawPixels',
    titleKey: 'assistant.actions.canvasDrawPixels.title',
    descriptionKey: 'assistant.actions.canvasDrawPixels.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'shape',
        kind: 'choice',
        labelKey: 'assistant.fields.pixelShape',
        required: true,
        options: [...PIXEL_SHAPES],
      },
      // Repeated, and it is the field that matters: a sprite lands in ONE call rather than in
      // thirty. `readInput` folds a lone value into a list of one.
      {
        key: 'cells',
        kind: 'text',
        labelKey: 'assistant.fields.cells',
        required: false,
        repeated: true,
      },
      CELL_AT('x'),
      CELL_AT('y'),
      CELL_AT('toX'),
      CELL_AT('toY'),
      { key: 'filled', kind: 'boolean', labelKey: 'assistant.fields.filled', required: false },
      // `#rrggbb` at the SCHEMA, as the twelve other colours of the registry: as text, « rouge »
      // crossed `validatesInput` and came back refused from the handler, one round too late.
      { key: 'color', kind: 'color', labelKey: 'assistant.fields.colour', required: false },
      { key: 'erase', kind: 'boolean', labelKey: 'assistant.fields.erase', required: false },
      { ...LAYER, required: false },
    ],
  }),
  action({
    name: 'canvas.crop',
    titleKey: 'assistant.actions.canvasCrop.title',
    descriptionKey: 'assistant.actions.canvasCrop.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      { key: 'x', kind: 'number', labelKey: 'assistant.fields.x', required: true },
      { key: 'y', kind: 'number', labelKey: 'assistant.fields.y', required: true },
      { key: 'width', kind: 'number', labelKey: 'assistant.fields.width', required: true, min: 1 },
      {
        key: 'height',
        kind: 'number',
        labelKey: 'assistant.fields.height',
        required: true,
        min: 1,
      },
    ],
  }),
  action({
    /**
     * The three padlocks of a layer, which every other action of this family is held by: a locked
     * layer refuses the very edits published beside this one, and nothing else could unlock it.
     */
    name: 'layer.lock',
    titleKey: 'assistant.actions.layerLock.title',
    descriptionKey: 'assistant.actions.layerLock.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'pixels', kind: 'boolean', labelKey: 'assistant.fields.lockPixels', required: false },
      {
        key: 'position',
        kind: 'boolean',
        labelKey: 'assistant.fields.lockPosition',
        required: false,
      },
      { key: 'alpha', kind: 'boolean', labelKey: 'assistant.fields.lockAlpha', required: false },
    ],
  }),
  action({
    /**
     * A shape stays a shape after it is drawn, which is the whole point of keeping its two points
     * rather than its pixels — and until now only the drawing could say what it was painted with.
     */
    name: 'layer.editShapeLayer',
    titleKey: 'assistant.actions.layerEditShapeLayer.title',
    descriptionKey: 'assistant.actions.layerEditShapeLayer.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      { key: 'filled', kind: 'boolean', labelKey: 'assistant.fields.shapeFilled', required: false },
      { key: 'fill', kind: 'color', labelKey: 'assistant.fields.shapeFill', required: false },
      {
        key: 'stroked',
        kind: 'boolean',
        labelKey: 'assistant.fields.shapeStroked',
        required: false,
      },
      { key: 'stroke', kind: 'color', labelKey: 'assistant.fields.shapeStroke', required: false },
      {
        key: 'strokeWidth',
        kind: 'number',
        labelKey: 'assistant.fields.strokeWidth',
        required: false,
        min: 1,
      },
      {
        key: 'sides',
        kind: 'integer',
        labelKey: 'assistant.fields.sides',
        required: false,
        ...SIDES,
      },
    ],
  }),
  action({
    /**
     * One dial per layer, and the layer says which — `canvas.state` carries it. Four fields rather
     * than a bare number because each dial swings its own range, and a schema is where a client
     * should read that rather than by being refused.
     */
    name: 'layer.setAdjustmentAmount',
    titleKey: 'assistant.actions.layerSetAdjustmentAmount.title',
    descriptionKey: 'assistant.actions.layerSetAdjustmentAmount.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      {
        key: 'exposure',
        kind: 'number',
        labelKey: 'assistant.fields.exposure',
        required: false,
        min: -3,
        max: 3,
      },
      {
        key: 'contrast',
        kind: 'number',
        labelKey: 'assistant.fields.contrast',
        required: false,
        min: 0,
        max: 2,
      },
      {
        key: 'saturation',
        kind: 'number',
        labelKey: 'assistant.fields.saturation',
        required: false,
        min: 0,
        max: 2,
      },
      {
        key: 'temperature',
        kind: 'number',
        labelKey: 'assistant.fields.temperature',
        required: false,
        min: -1,
        max: 1,
      },
    ],
  }),
  action({
    name: 'canvas.flipOrRotate',
    titleKey: 'assistant.actions.canvasFlipOrRotate.title',
    descriptionKey: 'assistant.actions.canvasFlipOrRotate.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'turn',
        kind: 'choice',
        labelKey: 'assistant.fields.turn',
        required: true,
        options: ['flipHorizontal', 'flipVertical', 'rotateClockwise', 'rotateAnticlockwise'],
      },
    ],
  }),
  action({
    /**
     * What an existing mask DOES: whether it hides anything, and whether it travels with the layer.
     * Carving one is `canvas.maskFromSelection`, a command, because the pixels are the engine's —
     * so a layer wearing none is refused rather than given an empty one that hides everything.
     */
    name: 'layer.setMaskOptions',
    titleKey: 'assistant.actions.layerSetMaskOptions.title',
    descriptionKey: 'assistant.actions.layerSetMaskOptions.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      LAYER,
      {
        key: 'enabled',
        kind: 'boolean',
        labelKey: 'assistant.fields.maskEnabled',
        required: false,
      },
      { key: 'linked', kind: 'boolean', labelKey: 'assistant.fields.maskLinked', required: false },
      { key: 'remove', kind: 'boolean', labelKey: 'assistant.fields.maskRemove', required: false },
    ],
  }),
  action({
    // Pulled off a ruler on screen, and named by value here. It answers the id it was born with,
    // which is what the two beside it take.
    name: 'guide.add',
    titleKey: 'assistant.actions.guideAdd.title',
    descriptionKey: 'assistant.actions.guideAdd.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      {
        key: 'axis',
        kind: 'choice',
        labelKey: 'assistant.fields.guideAxis',
        required: true,
        options: GUIDE_AXES,
      },
      {
        key: 'position',
        kind: 'number',
        labelKey: 'assistant.fields.guidePosition',
        required: true,
      },
    ],
  }),
  action({
    name: 'guide.move',
    titleKey: 'assistant.actions.guideMove.title',
    descriptionKey: 'assistant.actions.guideMove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [
      GUIDE,
      {
        key: 'position',
        kind: 'number',
        labelKey: 'assistant.fields.guidePosition',
        required: true,
      },
    ],
  }),
  action({
    name: 'guide.remove',
    titleKey: 'assistant.actions.guideRemove.title',
    descriptionKey: 'assistant.actions.guideRemove.description',
    commitment: 'none',
    repeatable: true,
    reach: 'mcp',
    fields: [GUIDE],
  }),
]
