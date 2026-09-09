/**
 * The links of `pnpm validate`, in the order it runs them, and what each one reads.
 *
 * This array is the gate. It used to be the `&&` chain of the `validate` script, split on `&&`;
 * `scripts/gate.mjs` runs it from here instead, so that a link can be skipped when nothing it
 * reads has moved. `ci-runs-the-gate.test.ts` still reads the link names from this same place.
 */
export type GateLink = {
  /** Exactly what the chain used to spell, so a red link is named the way the reader runs it. */
  readonly command: string
  /**
   * Everything the link reads, as repository-relative paths, a file or a folder.
   *
   * 🛑 A SUPERSET is safe and a gap is not: reading too much reruns a link that would have been
   * green, reading too little skips one that would have been red. Widen when unsure. `.` is the
   * honest answer for the suite — its 140 wide guards sweep docs, workflows and the site too.
   */
  readonly reads: readonly string[]
  /**
   * Trees git ignores that the link reads all the same — the wide guards walk the agent contract.
   * Named by the link rather than held in a constant elsewhere, so `reads` stays the whole answer.
   */
  readonly readsIgnored?: readonly string[]
  /** A file the link leaves behind. Missing on disk, the link runs whatever its inputs say. */
  readonly produces?: string
}

/**
 * The sources outside `src/`, `scripts/` and `config/`. Three links read them and none named them:
 * `check-as-const` scans exactly this list, `tsconfig.node.json` includes both, and knip treats
 * them as entries — so an `as const` in `vitest.config.ts` was red cold and green cached.
 */
const ROOT_SOURCES = ['electron.vite.config.ts', 'vitest.config.ts']

/**
 * Order kept from the chain: the cheap verdicts first, so a red one does not wait behind the suite.
 *
 * 🛑 Every link is `pnpm <script>`, never a bare `node scripts/x.mjs`: knip finds a build script
 * through the package scripts, and the one link spelled that way here made `check-as-const.mjs`
 * read as an unused file the day the chain left `package.json`.
 */
export const GATE: readonly GateLink[] = [
  { command: 'pnpm site:check', reads: ['site', 'scripts', 'repo.config.json'] },
  {
    command: 'pnpm llms:check',
    reads: ['scripts', 'repo.config.json', 'llms.txt', 'llms-full.txt', 'docs', 'README.md'],
  },
  {
    command: 'pnpm licences:check',
    // `repo.config.json` holds `allowed`, `expected` and `bundled` — the rule set itself, which a
    // review found missing here while its two neighbours already named it.
    reads: ['scripts', 'src/shared', 'THIRD-PARTY-NOTICES.md', 'repo.config.json'],
  },
  // The whole tree: `maintainedFiles` asks git for every file and narrows by extension, so it
  // judges `site/assets/js/` and the root sources as well as the four folders once named here.
  { command: 'pnpm sizes:check', reads: ['.'] },
  { command: 'pnpm as-const:check', reads: ['scripts', 'src', 'config', ...ROOT_SOURCES] },
  {
    command: 'pnpm typecheck',
    reads: ['src', 'scripts', 'config', 'tsconfig.json', ...ROOT_SOURCES],
  },
  { command: 'pnpm lint', reads: ['src', 'scripts', 'config', 'oxlint.json'] },
  {
    command: 'pnpm format:check',
    reads: ['src', 'scripts', 'config', '.prettierrc', '.prettierignore'],
  },
  { command: 'pnpm test', reads: ['.'], readsIgnored: ['.agents', '.claude', '.grok'] },
  {
    command: 'pnpm unused:main',
    reads: ['src', 'scripts', 'site', 'config', 'knip.json', ...ROOT_SOURCES],
  },
  { command: 'pnpm engine:check', reads: ['engine', 'scripts'] },
  {
    command: 'pnpm build',
    reads: ['src', 'scripts', 'config', 'electron.vite.config.ts', 'tsconfig.json'],
    // The bundle a skipped build leaves behind: gone, the link runs however green its inputs are.
    produces: 'out/main/index.js',
  },
]
