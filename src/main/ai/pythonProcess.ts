import { spawn, type ChildProcess } from 'node:child_process'
import { unlink } from 'node:fs/promises'
import { createServer, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { log } from '@main/log'
import { readFrame, type EngineFrame, type EngineRequest } from './pythonProtocol'

/**
 * `child_process.spawn`, not `forkedWorker.ts` (`utilityProcess.fork` only launches Node). Socket
 * rather than stdio: both are under 0.05 ms, but **stdout is shared** — one Python warning, or a
 * PyTorch stack, corrupts it.
 */
export type PythonPort = {
  postMessage: (message: EngineRequest) => void
  onMessage: (listener: (frame: EngineFrame) => void) => void
  /** The process died. Whatever it was asked will never be answered. */
  onFailure: (listener: (error: Error) => void) => void
  kill: () => void
}

/**
 * The worker waits up to 10 s on its child; 5 s used to SIGKILL the engine first and orphan
 * that child, which kept the GPU until a manual kill.
 */
const SHUTDOWN_GRACE_MS = 15_000

/** What separates two frames on the socket. */
const NEWLINE = 0x0a

export type PythonProcessOptions = {
  /** The interpreter. Passed in rather than resolved here: packaging is not this file's business. */
  command: string
  args: readonly string[]
  /**
   * Names the process in the error every waiting caller is given when it exits. Never `label`:
   * `main/no-hardcoded-text.test.ts` reads that field as a native menu item's, and this word
   * reaches no screen.
   */
  processName: string
  /**
   * `PYTHONPATH` to the engine package. `-m` puts the CWD on `sys.path`, and a packaged app's
   * CWD is `/`. An end-to-end harness that exports the variable itself hides exactly this.
   */
  sources: string
  /** Told the process is gone, so whoever holds this port can drop it. */
  onExit?: () => void
  /** Tests pass a short grace so a tree-kill is observable without waiting the production 15 s. */
  shutdownGraceMs?: number
}

let opened = 0

/**
 * One endpoint per open, and the process id is in it: two studios, or one studio restarting its
 * engine, must never meet on the same socket. Kept short — a unix socket path is capped around
 * 104 bytes on macOS, and the temporary folder there already spends half of it.
 */
function endpointOf(): string {
  opened += 1
  const name = `ias-engine-${process.pid}-${opened}`
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`)
}

export function openPythonProcess({
  command,
  args,
  processName,
  sources,
  onExit = () => {},
  shutdownGraceMs = SHUTDOWN_GRACE_MS,
}: PythonProcessOptions): PythonPort {
  const endpoint = endpointOf()
  const frameListeners: ((frame: EngineFrame) => void)[] = []
  const failureListeners: ((error: Error) => void)[] = []
  /** Posted before the engine connected. The socket exists first, the process opens it second. */
  const waiting: EngineRequest[] = []

  let connection: Socket | null = null
  let child: ChildProcess | null = null
  let dead = false

  const fail = (error: Error): void => {
    // A crash reaches this twice — the socket ends and the process exits — and a caller told twice
    // that its engine died would count two failures against a restart budget that saw one.
    if (dead) return
    dead = true
    for (const listener of failureListeners) listener(error)
  }

  const server = createServer(socket => {
    // One engine per port: a second connection would replace the first, and the frames of a run
    // in flight would go to a socket nobody reads.
    if (connection) {
      socket.destroy()
      return
    }

    connection = socket
    // Answered one at a time: Nagle would hold each frame back.
    socket.setNoDelay(true)

    // 🛑 Chunks HELD, never a string rebuilt per event: a frame is not always small — a selection
    // mask crosses at one byte a pixel, and macOS delivers 4 MiB as ~512 packets of 8 KiB. Concat
    // then `split` rescanned the whole accumulation each time: 281 ms of main process per click,
    // against 3,1 held and cut once. The bytes are copied when a line COMPLETES, not before.
    const held: Buffer[] = []
    socket.on('data', (chunk: Buffer) => {
      held.push(chunk)
      if (!chunk.includes(NEWLINE)) return

      let buffer = Buffer.concat(held.splice(0))
      for (let cut = buffer.indexOf(NEWLINE); cut >= 0; cut = buffer.indexOf(NEWLINE)) {
        const line = buffer.subarray(0, cut).toString('utf8').trim()
        buffer = buffer.subarray(cut + 1)
        if (!line) continue
        const frame = readFrame(line)
        if (!frame) log.warn('engine', `dropped a frame it could not read: ${line.slice(0, 200)}`)
        else for (const listener of frameListeners) listener(frame)
      }
      if (buffer.length > 0) held.push(buffer)
    })
    socket.on('error', error => fail(error))

    for (const message of waiting.splice(0)) socket.write(`${JSON.stringify(message)}\n`)
  })

  server.on('error', error => fail(error))

  const close = (): void => {
    server.close()
    // The file outlives the process that bound it, and a studio restarting its engine would
    // otherwise leave one behind per attempt. Windows names a pipe rather than a file.
    if (process.platform !== 'win32') void unlink(endpoint).catch(() => {})
  }

  // Spawned once the socket is answering: the engine connects at start-up and has nothing to poll.
  server.listen(endpoint, () => {
    child = spawn(command, [...args, '--socket', endpoint], {
      stdio: ['ignore', 'pipe', 'pipe'],
      // Own group: SIGKILL of this pid then reaches the door processes, which inherit it.
      detached: process.platform !== 'win32',
      env: {
        ...process.env,
        PYTHONPATH: sources,
        // Otherwise a Python stack trace sits in a buffer while the studio wonders why nothing came.
        PYTHONUNBUFFERED: '1',
        // A packaged runtime is sealed by codesign; writing import caches invalidates that seal.
        PYTHONDONTWRITEBYTECODE: '1',
      },
    })

    const journal = (level: 'info' | 'error') => (chunk: Buffer) => {
      const line = chunk.toString('utf8').trimEnd()
      if (line) log[level]('engine', line)
    }
    child.stdout?.on('data', journal('info'))
    child.stderr?.on('data', journal('error'))

    child.on('error', error => {
      // No `exit` follows an ENOENT, so this is the only place the holder is told it is gone.
      close()
      fail(error)
      onExit()
    })

    child.on('exit', code => {
      close()
      // Whatever the code: a clean exit leaves the same callers waiting as a crash.
      fail(new Error(`${processName} exited with code ${code}`))
      onExit()
    })
  })

  return {
    postMessage: message => {
      if (connection) connection.write(`${JSON.stringify(message)}\n`)
      else waiting.push(message)
    },
    onMessage: listener => frameListeners.push(listener),
    onFailure: listener => failureListeners.push(listener),
    kill: () => {
      // Marked dead FIRST: a process killed on purpose still reports its exit, and a port that
      // announced it would spend a restart budget on a death the caller asked for.
      dead = true
      close()
      connection?.destroy()

      const leaving = child
      if (!leaving) return

      // SIGTERM, then a grace period, then SIGKILL. The engine catches the first and closes its
      // doors on the way out; the second is for the one that does not answer — a worker
      // mid-inference does not read a socket, and a device call does not interrupt.
      const pid = leaving.pid
      const signalTree = (signal: NodeJS.Signals): void => {
        if (pid === undefined) {
          leaving.kill(signal)
          return
        }
        if (process.platform === 'win32') {
          spawn('taskkill', ['/PID', String(pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], {
            stdio: 'ignore',
            windowsHide: true,
          })
          return
        }
        try {
          process.kill(-pid, signal)
        } catch {
          leaving.kill(signal)
        }
      }
      signalTree('SIGTERM')
      const forced = setTimeout(() => signalTree('SIGKILL'), shutdownGraceMs)
      // Otherwise the timer holds the event loop open past every quit.
      forced.unref()
      leaving.once('exit', () => clearTimeout(forced))
    },
  }
}
