/**
 * The whole token layer as text, for the guards that read it as data.
 *
 * Globbed rather than listed: `index.css` was ONE file until the size split cut it in three, and a
 * hand-written list of the pieces would leave a fourth one invisible to every design guard at once
 * — tokens, text scale, gauges, focus ring — with all of them still green.
 *
 * Sorted by path so the text is the same on every machine. What it does NOT check is that
 * `index.css` imports what it found — `main/window/theme.test.ts` holds that half.
 */
const sheets = import.meta.glob<string>('./index-*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const stylesheet = Object.keys(sheets)
  .sort()
  .map(path => sheets[path])
  .join('\n')
