import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CORE_OPS,
  doorMemory,
  PROFILES,
  PROTOCOL_VERSION,
  readFrame,
  readHardware,
  readMemoryLedger,
} from './pythonProtocol'

const ROOT = join(import.meta.dirname, '..', '..', '..')

/**
 * The two halves of the protocol live in two languages, and nothing compiles them together. Until
 * the generator of § C.6 exists, this case is the whole of what keeps them from drifting — and a
 * drift is not a type error anywhere: it is an engine that greets and is killed for it.
 */
describe('the version both sides agree on', () => {
  it('is the same number in the engine as in the studio', () => {
    const source = readFileSync(join(ROOT, 'engine/src/aidesktopstudio_engine/__init__.py'), 'utf8')
    const declared = /^PROTOCOL_VERSION = (\d+)$/m.exec(source)

    expect(Number(declared?.[1])).toBe(PROTOCOL_VERSION)
  })

  /**
   * A misspelt op is not a type error anywhere: the engine greets, then answers `unknown-op` at
   * the first ask. `door.close` entered the vocabulary with no compiler between the two halves.
   */
  it('names ops the engine actually answers', () => {
    const supervisor = readFileSync(
      join(ROOT, 'engine/src/aidesktopstudio_engine/core/supervisor.py'),
      'utf8',
    )

    for (const op of CORE_OPS) expect(supervisor).toContain(`"${op}"`)
  })

  it('names the same requirement profiles as the engine accepts', () => {
    const requirements = readFileSync(
      join(ROOT, 'engine/src/aidesktopstudio_engine/core/requirements.py'),
      'utf8',
    )
    const supervisor = readFileSync(
      join(ROOT, 'engine/src/aidesktopstudio_engine/core/supervisor.py'),
      'utf8',
    )
    const fallback = /^DOOR_EXTRA = "([a-z]+)"$/m.exec(requirements)?.[1]
    const others = /profile not in \{DOOR_EXTRA, ([^}]*)\}/.exec(supervisor)?.[1] ?? ''

    const accepted = [fallback, ...others.split(',').map(one => one.trim().replace(/"/g, ''))]
    expect(accepted.filter(Boolean).sort()).toEqual([...PROFILES].sort())
  })
})

describe('reading a frame off the socket', () => {
  it('reads the greeting the engine opens with', () => {
    const frame = readFrame(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        evt: 'engine.hello',
        engine: '0.1.0',
        protocol: PROTOCOL_VERSION,
        python: '3.12.2',
        platform: 'darwin',
      }),
    )

    expect(frame).toMatchObject({ evt: 'engine.hello', python: '3.12.2' })
  })

  /** `ok` may legitimately be absent, so a refusal read as an answer would settle it with nothing. */
  it('tells a refusal from an answer', () => {
    const refusal = readFrame(
      JSON.stringify({ v: PROTOCOL_VERSION, id: 4, err: { code: 'memory', message: 'no room' } }),
    )
    const answer = readFrame(JSON.stringify({ v: PROTOCOL_VERSION, id: 4, ok: { cpuCount: 12 } }))

    expect(refusal).toMatchObject({ err: { code: 'memory' } })
    expect(answer).toMatchObject({ ok: { cpuCount: 12 } })
  })

  it('answers nothing for a line that is not a frame', () => {
    expect(readFrame('a PyTorch warning')).toBeNull()
    expect(readFrame(JSON.stringify({ v: PROTOCOL_VERSION, id: 'four' }))).toBeNull()
  })

  it('keeps the mask path returned by the selection worker', () => {
    const frame = readFrame(
      JSON.stringify({
        v: PROTOCOL_VERSION,
        evt: 'job.completed',
        job: 'selection-1',
        width: 2,
        height: 2,
        mask: '/tmp/mask.png',
      }),
    )

    expect(frame).toMatchObject({ mask: '/tmp/mask.png', width: 2, height: 2 })
  })
})

describe('the machine the engine measured', () => {
  const reading = {
    platform: 'darwin',
    machine: 'arm64',
    pythonVersion: '3.12.2',
    cpuCount: 12,
    totalBytes: 103_079_215_104,
  }

  it('reads what a core without a tensor library can answer', () => {
    expect(readHardware(reading)).toEqual(reading)
  })

  /** An unread total is written unread. A zero would budget a machine that has no memory at all. */
  it('keeps an unread total rather than defaulting it', () => {
    expect(readHardware({ ...reading, totalBytes: null }).totalBytes).toBeNull()
  })

  it('refuses a shape only a mismatched engine could send', () => {
    expect(() => readHardware({ ...reading, cpuCount: 'twelve' })).toThrow()
  })
})

/**
 * Nothing compiles the two halves of this frame together — the hole `PROTOCOL_VERSION` has above.
 * The schema asked for a `tensorBytes` no door composed, so `memory.ledger` threw on every call.
 * Blind spot, in clear: NAMES only — `held_bytes` turning float, or `int | None`, leaves it green.
 */
describe('what a door reports about its memory', () => {
  const sample = {
    door: 'engine/diffusion',
    heldBytes: 8_887_119_872,
    device: 'mps',
    backend: 'pytorch',
  }

  /** `MemoryLedger` has an `as_frame` of its own, and it composes `doors` rather than a door. */
  const source = readFileSync(
    join(ROOT, 'engine/src/aidesktopstudio_engine/core/memory.py'),
    'utf8',
  )
  const own = source.slice(source.indexOf('class DoorMemory'), source.indexOf('class MemoryLedger'))
  const emitted = [...own.matchAll(/^\s+"(\w+)":/gm)].map(found => found[1] ?? '')

  it('is read as the engine composes it, field for field', () => {
    // Against the SCHEMA and not against `sample`: a phantom field that is merely optional is
    // absent from the round trip below, and the schema is the only place it shows.
    expect(Object.keys(doorMemory.shape).sort()).toEqual([...emitted].sort())
    expect(readMemoryLedger({ doors: [sample] })).toEqual([sample])
  })
})
