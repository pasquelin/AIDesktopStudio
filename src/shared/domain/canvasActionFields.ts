import type { ActionField } from './assistantAction'

export const COUNT = (key: string): ActionField => ({
  key,
  kind: 'integer',
  labelKey: `assistant.fields.${key}`,
  required: false,
  min: 1,
})
export const CELL_AT = (key: string): ActionField => ({
  key,
  kind: 'integer',
  labelKey: `assistant.fields.${key}`,
  required: false,
  min: 0,
})
export const LAYER: ActionField = {
  key: 'layerId',
  kind: 'text',
  labelKey: 'assistant.fields.layerId',
  required: true,
}
export const SIDES = { min: 3, max: 12 }
export const GUIDE_AXES: readonly string[] = ['x', 'y']
export const GUIDE: ActionField = {
  key: 'guideId',
  kind: 'text',
  labelKey: 'assistant.fields.guideId',
  required: true,
}
