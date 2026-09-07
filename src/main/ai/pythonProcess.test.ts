import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { openPythonProcess, type PythonPort } from './pythonProcess'
import { PROTOCOL_VERSION, type EngineFrame } from './pythonProtocol'

/**
 * A stand-in engine in Node: the socket, the framing and the death of a process. A file rather
 * than `node -e`: node parses `--socket` as one of ITS options and exits 9 before the code runs.
 */
const STAND_IN = `
const net = require('node:net')
const socket = net.connect(process.argv[process.argv.indexOf('--socket') + 1], () => {
  if (process.env.NOISE) socket.write(process.env.NOISE + '\\n')
  socket.write(JSON.stringify({
    v: ${PROTOCOL_VERSION}, evt: 'engine.hello',
    engine: '0.0.0', protocol: ${PROTOCOL_VERSION}, python: '3.12.0', platform: 'test',
  }) + '\\n')
})
let pending = ''
socket.on('data', chunk => {
  pending += chunk
  for (let cut = pending.indexOf('\\n'); cut >= 0; cut = pending.indexOf('\\n')) {
    const line = pending.slice(0, cut)
    pending = pending.slice(cut + 1)
    if (line) {
      const asked = JSON.parse(line)
      socket.write(JSON.stringify({ v: ${PROTOCOL_VERSION}, id: asked.id, ok: asked.op }) + '\\n')
    }
  }
})
`

let folder = ''
const scriptAt = (name: string): string => join(folder, name)

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'ias-engine-test-'))
  writeFileSync(scriptAt('standIn.js'), STAND_IN)
  writeFileSync(scriptAt('leaves.js'), 'process.exit(0)')
  // Says where its package was put, through the socket — which is the channel that exists.
  writeFileSync(
    scriptAt('saysSources.js'),
    `const net = require('node:net')
     const socket = net.connect(process.argv[process.argv.indexOf('--socket') + 1], () => {
       socket.write(JSON.stringify({
         v: ${PROTOCOL_VERSION}, evt: 'engine.hello', engine: '0.0.0',
         protocol: ${PROTOCOL_VERSION}, python: process.env.PYTHONPATH ?? '', platform: 'test',
       }) + '\\n')
     })`,
  )
  writeFileSync(
    scriptAt('holdsChild.js'),
    `const { spawn } = require('node:child_process')
     const { writeFileSync } = require('node:fs')
     const net = require('node:net')
     const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
       stdio: 'ignore',
     })
     writeFileSync(process.env.CHILD_PID_FILE, String(kid.pid))
     const socket = net.connect(process.argv[process.argv.indexOf('--socket') + 1], () => {
       socket.write(JSON.stringify({
         v: ${PROTOCOL_VERSION}, evt: 'engine.hello',
         engine: '0.0.0', protocol: ${PROTOCOL_VERSION}, python: '3.12.0', platform: 'test',
       }) + '\\n')
     })`,
  )
})

afterAll(() => rmSync(folder, { recursive: true, force: true }))
afterEach(() => vi.unstubAllEnvs())

function watch(port: PythonPort) {
  const frames: EngineFrame[] = []
  const deaths: Error[] = []
  port.onMessage(frame => frames.push(frame))
  port.onFailure(error => deaths.push(error))
  return { frames, deaths }
}

const open = (script: string, onExit?: () => void): PythonPort =>
  openPythonProcess({
    command: process.execPath,
    args: [scriptAt(script)],
    sources: folder,
    processName: 'the stand-in engine',
    onExit,
  })

describe('the socket the engine answers on', () => {
  it('delivers what the engine writes, one frame per line', async () => {
    const port = open('standIn.js')
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.frames).toHaveLength(1), 5_000)
    expect(seen.frames[0]).toMatchObject({ evt: 'engine.hello', platform: 'test' })
    port.kill()
  })

  /** The socket exists before the process does, so a caller may post before anyone is listening. */
  it('holds what was posted before the engine connected', async () => {
    const port = open('standIn.js')
    const seen = watch(port)
    port.postMessage({ v: PROTOCOL_VERSION, id: 1, op: 'hardware.info', params: {} })

    await vi.waitFor(() => expect(seen.frames).toHaveLength(2), 5_000)
    expect(seen.frames[1]).toMatchObject({ id: 1, ok: 'hardware.info' })
    port.kill()
  })

  /** A Python library writing to the socket is not a reason to take the engine down. */
  it('drops a line it cannot read rather than the connection', async () => {
    vi.stubEnv('NOISE', 'FutureWarning: torch is deprecated')
    const port = open('standIn.js')
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.frames).toHaveLength(1), 5_000)
    expect(seen.frames[0]).toMatchObject({ evt: 'engine.hello' })
    port.kill()
  })
})

describe('the death of the engine', () => {
  /** No `exit` follows an ENOENT, so the holder hears about it here or nowhere. */
  it('reports a process that could never be started, and says it is gone', async () => {
    let left = false
    const port = openPythonProcess({
      command: 'ai-desktop-studio-no-such-interpreter',
      args: [],
      sources: folder,
      processName: 'the stand-in engine',
      onExit: () => (left = true),
    })
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.deaths).toHaveLength(1), 5_000)
    expect(left).toBe(true)
    port.kill()
  })

  /** A restart budget must not spend an attempt on a death the studio itself asked for. */
  it('says nothing of an exit that was asked for', async () => {
    let left = false
    const port = open('standIn.js', () => (left = true))
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.frames).toHaveLength(1), 5_000)
    port.kill()
    await vi.waitFor(() => expect(left).toBe(true), 5_000)

    expect(seen.deaths).toEqual([])
  })

  /** Whatever the code: a clean exit leaves the same callers waiting as a crash. */
  it('reports an exit that was not an error as a failure all the same', async () => {
    const port = open('leaves.js')
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.deaths).toHaveLength(1), 5_000)
    expect(seen.deaths[0]?.message).toContain('the stand-in engine exited with code 0')
    port.kill()
  })

  it('kills the door processes the engine started, not only the engine', async () => {
    const pidFile = join(folder, 'child.pid')
    vi.stubEnv('CHILD_PID_FILE', pidFile)
    const port = openPythonProcess({
      command: process.execPath,
      args: [scriptAt('holdsChild.js')],
      sources: folder,
      processName: 'the stand-in engine',
      shutdownGraceMs: 50,
    })
    const seen = watch(port)
    await vi.waitFor(() => expect(seen.frames).toHaveLength(1), 5_000)
    const childPid = Number(readFileSync(pidFile, 'utf8'))
    expect(childPid).toBeGreaterThan(0)

    port.kill()
    await vi.waitFor(() => {
      expect(() => process.kill(childPid, 0)).toThrow()
    }, 2_000)
  })
})

describe('where the engine finds its own package', () => {
  /**
   * `-m` puts the CWD on `sys.path`, and a packaged application's CWD is `/` or the home folder.
   * Without `PYTHONPATH` the interpreter answers `ModuleNotFoundError` and leaves before saying a
   * word — and an end-to-end harness that exports the variable itself hides exactly this.
   */
  it('is carried to the process rather than left to the working directory', async () => {
    const port = openPythonProcess({
      command: process.execPath,
      args: [scriptAt('saysSources.js')],
      sources: '/somewhere/engine/src',
      processName: 'the stand-in engine',
    })
    const seen = watch(port)

    await vi.waitFor(() => expect(seen.frames).toHaveLength(1), 5_000)
    expect(seen.frames[0]).toMatchObject({ python: '/somewhere/engine/src' })
    port.kill()
  })
})
