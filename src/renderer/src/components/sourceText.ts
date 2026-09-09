/**
 * The code with its prose taken out, for the guards that read raw text: a comment NAMING the
 * shape a rule refuses is not a copy of it. `Flyout` explains its placements by writing « the way
 * a `<select>` does », and four files talk about `btn` without ever wearing it.
 *
 * Its own module rather than `testHarness.ts`: that one globs every source of the renderer, and
 * three guards wanted the prose stripped without paying for the tree.
 *
 * The second pattern keeps the character before `//`, which is what tells a line comment from the
 * `://` of a URL.
 */
export const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
