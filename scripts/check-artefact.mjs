/**
 * Refuses an artefact that carries the same bytes under two paths.
 *
 * Runs at the end of `pnpm build`, hence of `pnpm dist` and of `pnpm validate` — which is how the
 * integration job reaches it. The check has to sit where the artefact is, and a build is the only
 * moment it exists; `artefact.test.ts` asserts that chain.
 *
 * The rule itself is `src/main/artefact.ts`, where the suite can reach it — this file only points
 * it at `out/` and turns its answer into an exit code.
 */
import { join, relative } from 'node:path'
// A `.ts` from a `.mjs`: Node 24 strips the types on the way in, and the rule the tests check is
// then the one that runs.
import {
  filesUnder,
  isBuilt,
  LEAST_FILES,
  shippedTwice,
  wastedBytes,
} from '../src/main/artefact.ts'

const ROOT = join(import.meta.dirname, '..')
const ARTEFACT = join(ROOT, 'out')

const files = isBuilt(ARTEFACT) ? filesUnder(ARTEFACT) : []

if (files.length < LEAST_FILES) {
  console.error(
    `out/ holds ${files.length} files, fewer than the ${LEAST_FILES} a build produces — refusing to call this clean.`,
  )
  process.exit(1)
}

const copies = shippedTwice(ARTEFACT, files)

if (copies.length > 0) {
  console.error(
    `Shipped under more than one path — ${wastedBytes(copies)} bytes of the artefact are a copy:`,
  )
  for (const { paths } of copies) {
    console.error(`  ${paths.map(path => relative(ROOT, path)).join('\n  ')}\n`)
  }
  process.exit(1)
}

console.log(`${files.length} files in out/, none shipped twice.`)
