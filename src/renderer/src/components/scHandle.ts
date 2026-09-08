/**
 * The name a script drives a control by, prefixed by what the thing IS — `section:transform`
 * folds, `field:transform.position.x` takes a value. `pilotable.test.ts` holds every handle of
 * the window to one of the two.
 */
export const fieldHandle = (id: string): string => `field:${id}`

/** Accepts both legacy full handles and the unprefixed ids preferred by reusable controls. */
export const windowFieldHandle = (id?: string): string | undefined =>
  id === undefined || id.startsWith('field:') ? id : fieldHandle(id)

export const sectionHandle = (id: string): string => `section:${id}`

/**
 * The handle prop of a control that DRESSES a native tag. Written on the tag by the component
 * rather than spread in with the rest: `pilotable.test.ts` reads the opening tag of every raw
 * control, and a handle arriving through `...rest` is a field a script cannot see the studio
 * drive. Both spellings are taken — a full `field:` handle, or the bare id a reusable control
 * prefers — since `windowFieldHandle` prefixes what needs it.
 */
export type ScHandle = { 'data-sc'?: string }
