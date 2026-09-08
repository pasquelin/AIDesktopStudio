/**
 * `pnpm merge` — the merge into the integration branch, refused unless the gate is green on the
 * exact content being merged.
 *
 * Why it exists, dated: on 2026-09-08 three commits reached `develop` red — one formatting, two
 * guards — and every other session inherited them at its next rebase. Nothing was watching. CI
 * reads the branch AFTER the push, which is the wrong side of the door, and no gate runs at merge
 * time at all.
 *
 * It costs a hash, not a run: `scripts/gate.mjs` already records the fingerprint each link was
 * green on, so this asks the cache whether those verdicts still describe the tree. A tree edited
 * since the last `pnpm validate` has no green verdict, and the merge is refused naming the links.
 */
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { alreadyGreen, fingerprinterFor } from '../src/main/gateCache.ts'
import { GATE } from '../src/main/gateLinks.ts'
import { reasonsToRefuse, staleLinks } from '../src/main/mergeGuard.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INTO = 'develop'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** Where `develop` is checked out: a worktree cannot merge into a branch another one holds. */
const MAIN = dirname(git(ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'))

const branch = git(ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')
const reasons = reasonsToRefuse(
  {
    branch,
    dirty: git(ROOT, 'status', '--porcelain').split('\n').filter(Boolean),
    hostDirty: git(MAIN, 'status', '--porcelain').split('\n').filter(Boolean),
    rebased: git(ROOT, 'merge-base', 'HEAD', INTO) === git(MAIN, 'rev-parse', INTO),
    stale: () => {
      const fingerprintOf = fingerprinterFor(ROOT, process.version, GATE)
      return staleLinks(GATE, link => alreadyGreen(ROOT, link, fingerprintOf(link)))
    },
  },
  INTO,
)

if (reasons.length > 0) {
  process.stderr.write(`\nRefusing to merge ${branch} into ${INTO}:\n\n`)
  for (const reason of reasons) process.stderr.write(`  • ${reason}\n\n`)
  process.exit(1)
}

process.stdout.write(git(MAIN, 'merge', '--no-ff', branch, '-m', mergeMessage()) + '\n')
process.stdout.write(
  `\n${branch} is in ${INTO}, the gate green on the merged content.\n` +
    'A merged worktree is never left on disk — from the main checkout:\n\n' +
    `  git worktree remove ${git(ROOT, 'rev-parse', '--show-toplevel')}\n` +
    `  git branch -d ${branch}\n\n`,
)

/** The subject the reader gives, or the branch's last one — the shape `git log` already shows. */
function mergeMessage() {
  const asked = process.argv[2]
  const subject = asked ?? git(ROOT, 'log', '-1', '--format=%s')
  return `Fusionne ${branch} : ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`
}
