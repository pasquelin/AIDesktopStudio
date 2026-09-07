import { z } from 'zod'
import { FONT_SOURCES } from '@shared/domain/font'
import {
  UI_ALIGNS,
  UI_ANCHORS,
  UI_CURSORS,
  UI_FITS,
  UI_JUSTIFIES,
  UI_MODES,
  UI_SCROLL_AXES,
  UI_TEXT_ALIGNS,
  UI_SCHEMA_URL,
  UI_VERSION,
  type UiDocument,
  type UiElement,
  type UiElementType,
} from '@shared/domain/ui'

/**
 * The whole of what a `.ui.json` may hold, PUBLISHED. Deep where `uiValidation.ts` is shallow —
 * that one runs on the file layer, where a parse per document at listing time is a freeze, and
 * this one never runs in the studio at all.
 */
const size = z.object({ width: z.number(), height: z.number() }).meta({ id: 'UiSize' })

const point = z.object({ x: z.number(), y: z.number() }).meta({ id: 'UiPoint' })

const edges = z
  .object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  })
  .meta({ id: 'UiEdges' })

const length = z.object({ unit: z.enum(['px', 'percent']), value: z.number() })

const sizing = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('fixed'), length }),
  z.object({ mode: z.literal('auto') }),
  z.object({ mode: z.literal('stretch') }),
])

const anchor = z.enum(UI_ANCHORS)

const placement = z
  .object({
    anchor,
    pivot: anchor,
    offset: point,
    size: z.object({ width: sizing, height: sizing }),
    min: size,
    max: size,
    aspect: z.number(),
    margin: edges,
    grow: z.number(),
  })
  .meta({ id: 'UiPlacement' })

const fit = z.enum(UI_FITS)

const fill = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('color'), color: z.string() }),
  z.object({ kind: z.literal('image'), assetId: z.string(), fit }),
])

const style = z
  .object({
    background: fill,
    border: z.object({ width: z.number(), color: z.string(), radius: z.number() }),
    opacity: z.number(),
    padding: edges,
  })
  .meta({ id: 'UiStyle' })

const text = z
  .object({
    value: z.string(),
    font: z.object({ source: z.enum(FONT_SOURCES), family: z.string() }),
    size: z.number(),
    weight: z.number(),
    align: z.enum(UI_TEXT_ALIGNS),
    color: z.string(),
    wrap: z.boolean(),
  })
  .meta({ id: 'UiText' })

const interaction = z
  .object({
    action: z.string(),
    focusable: z.boolean(),
    cursor: z.enum(UI_CURSORS),
  })
  .meta({ id: 'UiInteraction' })

const shared = {
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  enabled: z.boolean(),
  locked: z.boolean(),
  place: placement,
  style,
  interaction,
}

/**
 * Every variant, by the type that discriminates it.
 *
 * 🛑 A `Record` over the closed list and not a bare array: `ZodType<Output>` is COVARIANT, so an
 * annotated union of thirteen is assignable to one of fourteen — a type added to `UiElement`
 * would compile here and vanish from the published schema in silence. The table is the same
 * device `HOLDS_CHILDREN` and `INTRINSIC_SIZES` use, and it is what makes the omission a
 * compile error.
 */
const VARIANTS = {
  screen: z.object({
    ...shared,
    type: z.literal('screen'),
    get children() {
      return z.array(element)
    },
  }),
  panel: z.object({
    ...shared,
    type: z.literal('panel'),
    get children() {
      return z.array(element)
    },
  }),
  stack: z.object({
    ...shared,
    type: z.literal('stack'),
    stack: z.object({
      direction: z.enum(['row', 'column']),
      gap: z.number(),
      align: z.enum(UI_ALIGNS),
      justify: z.enum(UI_JUSTIFIES),
      wrap: z.boolean(),
    }),
    get children() {
      return z.array(element)
    },
  }),
  grid: z.object({
    ...shared,
    type: z.literal('grid'),
    grid: z.object({ columns: z.number(), gap: z.number(), align: z.enum(UI_ALIGNS) }),
    get children() {
      return z.array(element)
    },
  }),
  scroll: z.object({
    ...shared,
    type: z.literal('scroll'),
    scroll: z.object({ axis: z.enum(UI_SCROLL_AXES) }),
    get children() {
      return z.array(element)
    },
  }),
  spacer: z.object({ ...shared, type: z.literal('spacer') }),
  text: z.object({ ...shared, type: z.literal('text'), text }),
  image: z.object({
    ...shared,
    type: z.literal('image'),
    image: z.object({ assetId: z.string(), fit, tint: z.string() }),
  }),
  button: z.object({
    ...shared,
    type: z.literal('button'),
    text,
    get children() {
      return z.array(element)
    },
  }),
  progress: z.object({
    ...shared,
    type: z.literal('progress'),
    progress: z.object({
      value: z.number(),
      min: z.number(),
      max: z.number(),
      fill: z.string(),
      track: z.string(),
    }),
  }),
  slider: z.object({
    ...shared,
    type: z.literal('slider'),
    slider: z.object({ value: z.number(), min: z.number(), max: z.number(), step: z.number() }),
  }),
  input: z.object({
    ...shared,
    type: z.literal('input'),
    input: z.object({
      value: z.string(),
      placeholder: z.string(),
      maxLength: z.number(),
      secret: z.boolean(),
    }),
  }),
  checkbox: z.object({
    ...shared,
    type: z.literal('checkbox'),
    checkbox: z.object({ checked: z.boolean() }),
  }),
  // `satisfies` and not an annotation: it holds the coverage while leaving each variant its own
  // inferred shape, which the union needs to discriminate on.
} satisfies Record<UiElementType, z.ZodType>

/**
 * The tree is recursive, so every container reads its children through this one lazy hole.
 *
 * The members are named one by one: `Object.values` widens to an array where the union asks for
 * a non-empty tuple. What holds the coverage is the `satisfies` above plus
 * `uiSchema.test.ts`, which parses one element of EVERY type — a fourteenth left out of either
 * place turns that red rather than quietly narrowing what the published schema accepts.
 */
const element: z.ZodType<UiElement> = z
  .lazy(() =>
    z.discriminatedUnion('type', [
      VARIANTS.screen,
      VARIANTS.panel,
      VARIANTS.stack,
      VARIANTS.grid,
      VARIANTS.scroll,
      VARIANTS.spacer,
      VARIANTS.text,
      VARIANTS.image,
      VARIANTS.button,
      VARIANTS.progress,
      VARIANTS.slider,
      VARIANTS.input,
      VARIANTS.checkbox,
    ]),
  )
  .meta({ id: 'UiElement' })

const binding = z.object({
  element: z.string(),
  property: z.string(),
  source: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('component'),
      entity: z.string(),
      component: z.string(),
      field: z.string(),
    }),
    z.object({ kind: z.literal('game'), path: z.string() }),
  ]),
  fallback: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

/**
 * 🛑 `satisfies`, and it is what makes a third description of the format safe: a field gained by
 * `UiDocument` and not written here stops compiling. It cannot see the other direction — a field
 * here that the type dropped — which the round-trip suites cover instead.
 */
export const uiDocumentSchema = z.object({
  version: z.number().int().min(1).max(UI_VERSION),
  mode: z.enum(UI_MODES),
  design: size,
  root: VARIANTS.screen,
  bindings: z.array(binding),
}) satisfies z.ZodType<UiDocument>

/** Where the published file lives. The URL it is served at is `UI_SCHEMA_URL`, in the format. */
export const UI_SCHEMA_FILE = `docs/schema/ui-${UI_VERSION}.schema.json`

/** The published document, recomputed. `main/project/uiSchema.test.ts` holds the file to it. */
export function uiJsonSchema(): Record<string, unknown> {
  return {
    $id: UI_SCHEMA_URL,
    title: 'AI Desktop Studio interface',
    ...z.toJSONSchema(uiDocumentSchema, { io: 'input' }),
  }
}
