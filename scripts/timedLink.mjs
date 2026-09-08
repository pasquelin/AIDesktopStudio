/**
 * Running one link of the gate and saying what it cost. Shared by `gate.mjs` and
 * `gate-baseline.mjs`, which had the same twenty lines twice — and the copy had already lost the
 * branch that reports a missing binary.
 */
import { spawn } from 'node:child_process'

/**
 * Split on spaces: every link is a bare command with bare arguments, and one needing a quoted
 * argument would have to say so in `gateLinks.ts` rather than hide it in a string.
 */
export function timedLink(command, cwd) {
  const started = Date.now()
  const [binary, ...args] = command.split(' ')

  return new Promise(resolve => {
    const child = spawn(binary, args, { cwd, stdio: 'inherit' })
    const done = code => resolve({ code, seconds: (Date.now() - started) / 1000 })

    child.on('error', failure => {
      process.stderr.write(`${failure.message}\n`)
      done(1)
    })
    child.on('close', done)
  })
}
