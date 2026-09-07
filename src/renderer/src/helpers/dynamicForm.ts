import type { FieldDescriptor, FieldKind } from '@shared/domain/model'
import { isGenerationCanvasSource } from '@shared/domain/generationComment'

export type FormValues = Record<string, unknown>

const NUMERIC: readonly FieldKind[] = ['number', 'integer', 'seed']

/**
 * Read by both the schema and the registration. Split in two, the seed field registered as a
 * string and was then validated against a number — a filled seed never passed.
 */
export function isNumeric(kind: FieldKind): boolean {
  return NUMERIC.includes(kind)
}

/** An emptied input is an absent value, not a zero and not an empty string. */
export function blankToUndefined(value: unknown): unknown {
  if (value === '' || value === null) return undefined
  if (typeof value === 'number' && Number.isNaN(value)) return undefined
  return value
}

/** A field whose dependency is unmet is not rendered, and does not take part in the body. */
export function isVisible(field: FieldDescriptor, values: FormValues): boolean {
  if (!field.dependsOn) return true
  return values[field.dependsOn.key] === field.dependsOn.value
}

/** The only keys whose value can change what is on screen. */
export function dependencyKeys(fields: readonly FieldDescriptor[]): string[] {
  return [...new Set(fields.flatMap(field => (field.dependsOn ? [field.dependsOn.key] : [])))]
}

export function visibleFields(
  fields: readonly FieldDescriptor[],
  values: FormValues,
): FieldDescriptor[] {
  return fields.filter(field => isVisible(field, values))
}

/**
 * 🛑 Whether the NEW descriptor can hold a value the old one wrote. Two models sharing a key
 * share nothing else: a scheduler the next one does not list renders a `<select>` on no option
 * at all, and a knob past its bounds fails validation on a field nobody ever touched.
 */
function fits(field: FieldDescriptor, value: unknown): boolean {
  if (field.options?.length) return field.options.some(one => one.value === value)

  if (typeof value === 'number') {
    if (field.min !== undefined && value < field.min) return false
    if (field.max !== undefined && value > field.max) return false
  }
  return true
}

/**
 * What a form opens on, in the order that decides it: a preset first, then what the person had
 * already typed, then the descriptor's own default.
 *
 * `carried` is the § 22 of the brief. Switching model used to reset the form, so a prompt written
 * over several minutes went with it — and the source, and the mask. Only the fields the NEW model
 * declares are filled, so nothing reaches a form that never had it.
 *
 * 🛑 `sourced` is what tells the person's typing from what the WORKSPACE put there — the sources
 * of the last reset, and them alone. Without it, a source withdrawn from the panel above came
 * back as if it had been typed, straight into the request it had just left. With the whole preset
 * instead of the sources, it took § 22 down with it: a prompt prefilled by « regenerate with these
 * parameters » was blanked the moment picking an image changed the operation.
 */
export function defaultValues(
  fields: readonly FieldDescriptor[],
  preset?: FormValues,
  carried?: FormValues,
  sourced?: FormValues,
): FormValues {
  const values: FormValues = {}
  for (const field of fields) {
    // Through `blankToUndefined`, and NaN is why: a numeric control the new descriptor has just
    // registered reads back as one before the reset lands, which is not a value to carry.
    const held = blankToUndefined(carried?.[field.key])
    const put = blankToUndefined(sourced?.[field.key])

    if (preset && field.key in preset) values[field.key] = preset[field.key]
    // Blank is not a value: a field the previous model left empty must take the new one's
    // default rather than emptying a knob the person never touched.
    else if (held !== undefined && held !== put && fits(field, held)) values[field.key] = held
    else if (field.default !== undefined) values[field.key] = field.default
    else if (field.kind === 'boolean') values[field.key] = false
    // A list opens EMPTY, never blank: `''` is not what its control writes back, nor what its
    // schema accepts.
    else if (field.repeated) values[field.key] = []
    else values[field.key] = ''
  }
  return values
}

/**
 * Reduces the form state to the generation body. Hidden and empty fields are dropped rather
 * than sent: the API validates against the model's own schema, and an unexpected `""` on an
 * optional enum is answered with a 400.
 */
export function buildBody(fields: readonly FieldDescriptor[], values: FormValues): FormValues {
  const body: FormValues = {}

  for (const field of visibleFields(fields, values)) {
    const value = blankToUndefined(values[field.key])
    if (value !== undefined) body[field.key] = value
  }

  return body
}

/** Seeds are 32-bit on the API side; anything wider comes back as a different image. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32)
}

/** Groups keep the order the model published them in — it is the order it documents. */
export function groupFields(fields: readonly FieldDescriptor[]): [string, FieldDescriptor[]][] {
  const groups = new Map<string, FieldDescriptor[]>()

  for (const field of fields) {
    const key = field.group ?? ''
    const existing = groups.get(key)
    if (existing) existing.push(field)
    else groups.set(key, [field])
  }

  return [...groups.entries()]
}

/**
 * The reference pictures a filled form carries, in the order the model declared them.
 *
 * Values are handed over as they stand — a local asset id or a data URL — because the field
 * cannot say which one the user gave it. A local id is not one the API has ever heard of: the
 * main process rewrites it on the way out, through the same translator a generation goes
 * through (`main/provider/assetInputs.ts`), sending the file if it has never gone up.
 */
export function referencePictures(
  fields: readonly FieldDescriptor[],
  values: FormValues,
): string[] {
  const pictures: string[] = []

  for (const field of fields) {
    if (field.kind !== 'image') continue

    // A repeated field holds several of them, and prompt assistance saw none of a multiview.
    const value = values[field.key]
    for (const one of Array.isArray(value) ? value : [value]) {
      if (typeof one === 'string' && one.trim() !== '' && !isGenerationCanvasSource(one)) {
        pictures.push(one)
      }
    }
  }

  return pictures
}
