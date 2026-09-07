import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The physics engine the studio ships is one WE compile, not the one npm publishes: the published
 * single-threaded flavours carry no SIMD, and measured 2026-09-01 that is 2,7 times slower — the
 * whole difference between passing the switch gate and failing it.
 *
 * 🛑 A binary in the tree is a binary nobody reads. This is what makes it readable: the manifest
 * says which revision, which compiler and which flags produced it, and the checksum says the bytes
 * beside it are those and not something someone dropped in.
 */
const VENDOR = join(process.cwd(), 'vendor', 'jolt-physics')
const MANIFEST = join(VENDOR, 'artefact.json')
const ARTEFACT = join(VENDOR, 'dist', 'jolt-physics.wasm-compat.js')

type Artefact = {
  source: string
  version: string
  commit: string
  compiler: string
  flags: readonly string[]
  sha256: string
  bytes: number
  controlSha256: string
}

const manifest = (): Artefact => JSON.parse(readFileSync(MANIFEST, 'utf8')) as Artefact

describe('the Jolt engine the studio compiles for itself', () => {
  it('carries the bytes its manifest names', () => {
    expect(existsSync(ARTEFACT)).toBe(true)
    const bytes = readFileSync(ARTEFACT)

    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest().sha256)
    expect(bytes.length).toBe(manifest().bytes)
  })

  /** A tag can be moved and a `latest` image is not a version. Both are inputs, so both are pinned. */
  it('names a revision and a compiler nothing can move under it', () => {
    expect(manifest().commit).toMatch(/^[0-9a-f]{40}$/)
    expect(manifest().compiler).toMatch(/@sha256:[0-9a-f]{64}$/)
  })

  /**
   * 🛑 The two flags are the whole reason this package exists rather than the npm one — SIMD for
   * the speed, memory growth because a hard abort at 128 Mo is a crash in an editor.
   */
  it('was compiled with the two flags the published package does not pass', () => {
    expect(manifest().flags).toContain('-DENABLE_SIMD=ON')
    expect(manifest().flags).toContain('-DALLOW_MEMORY_GROWTH=ON')
  })

  /**
   * 🛑 The guard the enquiry paid for. Two configurations wrote the same output path, cmake judged
   * the second up to date, and the two builds came out byte-identical — which would have read as
   * « SIMD changes nothing » and closed the enquiry on a false measure.
   */
  it('differs from the control built without those flags', () => {
    expect(manifest().controlSha256).not.toBe(manifest().sha256)
  })
})
