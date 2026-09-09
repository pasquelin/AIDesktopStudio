/**
 * Running one command and saying what it cost. Shared by every script of the gate: three copies of
 * this spawn existed, and one of them had already lost the branch that reports a missing binary.
 *
 * The child comes back at once, beside the promise: a caller that must kill it on a signal cannot
 * wait for it to have finished to learn what to kill.
 */
import { spawn } from 'node:child_process'

export function timedRun([binary, ...args], cwd) {
  const started = Date.now()
  const child = spawn(binary, args, { cwd, stdio: 'inherit' })

  const finished = new Promise(resolve => {
    const done = code => resolve({ code, seconds: (Date.now() - started) / 1000 })

    child.on('error', failure => {
      process.stderr.write(`${failure.message}\n`)
      done(1)
    })
    child.on('close', done)
  })
  return { child, finished }
}
