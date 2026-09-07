import { describe, expect, it } from 'vitest'
import { glbChunksOf, glbFrom } from './glbContainer'

const JSON_BODY = new TextEncoder().encode('{"asset":{"version":"2.0"}}')
const BIN_BODY = new Uint8Array([1, 2, 3, 4, 5])

describe('the binary glTF container', () => {
  it('reads back what it writes, chunk for chunk', () => {
    const read = glbChunksOf(glbFrom({ json: JSON_BODY, bin: BIN_BODY }))

    expect(read && new TextDecoder().decode(read.json).trimEnd()).toBe(
      new TextDecoder().decode(JSON_BODY),
    )
    expect(read?.bin.subarray(0, BIN_BODY.byteLength)).toEqual(BIN_BODY)
  })

  // A reader offsetting into an unpadded buffer reads the wrong floats, so the specification
  // demands each chunk sit on four bytes.
  it('pads both chunks to four bytes, and says so in its lengths', () => {
    const file = glbFrom({ json: JSON_BODY, bin: BIN_BODY })

    expect(file.byteLength % 4).toBe(0)
    expect(new DataView(file.buffer).getUint32(8, true)).toBe(file.byteLength)
  })

  it('writes a file with no binary chunk at all when there are no buffers', () => {
    const read = glbChunksOf(glbFrom({ json: JSON_BODY, bin: new Uint8Array() }))

    expect(read?.bin.byteLength).toBe(0)
  })

  it('reads nothing out of bytes that are not a container', () => {
    expect(glbChunksOf(new Uint8Array([1, 2, 3, 4]))).toBeNull()
    expect(glbChunksOf(new Uint8Array(0))).toBeNull()
  })

  // A truncated download is not a chunk: handing back a window onto bytes that are not there
  // would fail much further away.
  it('stops at a chunk whose length overruns the file', () => {
    const file = glbFrom({ json: JSON_BODY, bin: BIN_BODY })
    new DataView(file.buffer).setUint32(12, file.byteLength * 2, true)

    expect(glbChunksOf(file)).toBeNull()
  })
})
