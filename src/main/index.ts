import { app, dialog } from 'electron'
import { APP_NAME } from '@shared/constants'
import { registerAssetScheme } from '@main/assets/protocol'
import { isDevelopment } from '@main/environment'
import { log, setLogVerbosity } from '@main/log'
import { checkoutOf, mcpEndpointPath, spawnedAsWayIn, stdioEndpointFrom } from '@main/mcp/endpoint'
import { runStdioBridge } from '@main/mcp/stdio'
import { captureExternalFiles, launchedPaths, offerExternalFiles } from '@main/externalFiles'

// Before anything reads `app.getPath('userData')`: that path derives from the name, and a
// late call would have electron-store read one folder while writing to another.
app.setName(APP_NAME)
captureExternalFiles(app, process.argv)
app.on('second-instance', (_event, argv) =>
  offerExternalFiles(launchedPaths(argv, app.getAppPath())),
)

/**
 * Spawned to be one client's way in: no window, no services, and no lock — a client connecting
 * while the studio is up would otherwise be the second instance and quit.
 *
 * 🛑 The log is silenced first: `log.info` prints to STDOUT, which here IS the client's JSON-RPC
 * stream. Trouble goes to stderr instead, which the client shows.
 */
async function carryOneClient(): Promise<void> {
  setLogVerbosity('silent')
  app.dock?.hide()

  try {
    await runStdioBridge({
      input: process.stdin,
      output: process.stdout,
      report: line => process.stderr.write(`${APP_NAME} mcp: ${line}\n`),
      // Named on the command line by whoever wrote it, since a run started with
      // `--user-data-dir` resolves a profile this one would work out differently.
      endpointPath:
        stdioEndpointFrom(process.argv) ??
        mcpEndpointPath(app.getPath('userData'), checkoutOf(app.getAppPath())),
    })
  } catch (error) {
    process.stderr.write(`${APP_NAME} mcp: ${String(error)}\n`)
  }

  /**
   * Drained before the exit: `app.exit` truncates a pending write to a PIPE, which is what every
   * answer here goes down — a client that closed its end after its last call would lose exactly
   * that answer. `stdio.test.ts` cannot see this: a `PassThrough` takes its writes at once.
   */
  await new Promise<void>(resolve => process.stdout.write('', () => resolve()))
  app.exit(0)
}

/**
 * 🛑 `registerAssetScheme` stays SYNCHRONOUS here, and the rest is behind the `import()`: an
 * import resolves on a later tick, which `ready` is free to beat, and
 * `registerSchemesAsPrivileged` THROWS once ready has fired.
 */
async function openTheStudio(): Promise<void> {
  registerAssetScheme()

  try {
    const { bootstrap } = await import('@main/bootstrap')
    bootstrap()
  } catch (error) {
    /**
     * 🛑 Said and then EXITED. A rejection here leaves a process with no window, no log file and
     * no `window-all-closed` — alive for ever, invisible, and every later launch quits on the
     * lock it still holds. The synchronous call this replaced raised Electron's own error box.
     */
    process.stderr.write(`${APP_NAME}: could not start: ${String(error)}\n`)
    dialog.showErrorBox(APP_NAME, String(error))
    app.exit(1)
  }
}

// One studio per machine: two would share one settings file and one WAL catalogue opened
// without a busy timeout. Must stay below `setName` — the lock file lives under `userData`.
//
// Development starts anyway, and that is what keeps hot reload alive: a rebuild of anything the
// main process bundles — `shared/` included, so a translation counts — makes electron-vite kill
// this process and start the next in the same breath. Electron takes seconds to die, so the new
// one finds the lock still held; exiting here would make electron-vite take the dev server down
// with us, and the window left on screen would point at a server that no longer answers.
//
// Said out loud rather than waved through: the overlap is usually the second or two an old
// process needs to die, but two `pnpm start` runs — one per worktree, which this repository
// invites — overlap for as long as both are up, and they then reopen the same project catalogue.
// SQLite takes one writer; the loser comes back with no project open, and `services` reduces
// that to a warning. Without this line nothing anywhere would say why.
if (spawnedAsWayIn(process.argv)) void carryOneClient()
else if (app.requestSingleInstanceLock()) void openTheStudio()
else if (isDevelopment) {
  log.warn('startup', 'another studio holds the single-instance lock: starting anyway (dev)')
  void openTheStudio()
} else app.quit()
