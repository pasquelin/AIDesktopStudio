/**
 * One choice of the field: what the select shows, and the picture the thumbnail previews.
 *
 * Its own module for the reason `linkPress` is one — both halves of the row need it, and a type
 * the parent declared and the child re-imported is what `import-cycles.test.ts` catches.
 */
export type LinkOption = {
  id: string
  name: string
  url?: string
}
