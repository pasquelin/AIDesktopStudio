import type { ActionField } from './assistantAction'

/**
 * A field and its label, which is its key: written out, twelve of them repeated
 * `labelKey: 'game.fields.<key>'` and each was a chance for the two to drift.
 */
export const numberField = (key: string, min: number, max?: number): ActionField => ({
  key,
  kind: 'number',
  labelKey: `game.fields.${key}`,
  required: true,
  min,
  ...(max === undefined ? {} : { max }),
})

export const choiceField = (key: string, options: readonly string[]): ActionField => ({
  key,
  kind: 'choice',
  labelKey: `game.fields.${key}`,
  required: true,
  options,
})

/** A name, a list of names, or a list of points — what no number and no closed list can say. */
export const textField = (key: string, picks?: ActionField['picks']): ActionField => ({
  key,
  kind: 'text',
  labelKey: `game.fields.${key}`,
  required: true,
  ...(picks === undefined ? {} : { picks }),
})

export const flagField = (key: string): ActionField => ({
  key,
  kind: 'boolean',
  labelKey: `game.fields.${key}`,
  required: true,
})
