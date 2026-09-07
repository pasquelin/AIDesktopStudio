/**
 * Uncompressed scanline OpenEXR, one Y float32 channel. A test fixture, not a production writer:
 * the studio already ships `EXRExporter` for skies, and a heightmap is not written here.
 */

const MAGIC = 20000630
const VERSION = 2
const FLOAT = 2
const NO_COMPRESSION = 0
const INCREASING_Y = 0

export function openExrFloatY(width: number, height: number, values: Float32Array): Uint8Array {
  if (values.length !== width * height) throw new Error('heightmap size does not match its samples')

  const header = headerOf(width, height)
  const scanlineBytes = width * 4
  const scanlineBlock = 8 + scanlineBytes
  const bodyAt = header.byteLength + height * 8
  const out = new Uint8Array(bodyAt + height * scanlineBlock)
  out.set(header)

  const view = new DataView(out.buffer)
  let cursor = header.byteLength
  for (let y = 0; y < height; y++) {
    view.setBigUint64(cursor, BigInt(bodyAt + y * scanlineBlock), true)
    cursor += 8
  }

  for (let y = 0; y < height; y++) {
    view.setInt32(cursor, y, true)
    cursor += 4
    view.setInt32(cursor, scanlineBytes, true)
    cursor += 4
    const row = values.subarray(y * width, (y + 1) * width)
    out.set(new Uint8Array(row.buffer, row.byteOffset, row.byteLength), cursor)
    cursor += scanlineBytes
  }

  return out
}

function headerOf(width: number, height: number): Uint8Array {
  const parts = [
    u32(MAGIC),
    u32(VERSION),
    attribute('channels', 'chlist', chlistY()),
    attribute('compression', 'compression', Uint8Array.of(NO_COMPRESSION)),
    attribute('dataWindow', 'box2i', box2i(0, 0, width - 1, height - 1)),
    attribute('displayWindow', 'box2i', box2i(0, 0, width - 1, height - 1)),
    attribute('lineOrder', 'lineOrder', Uint8Array.of(INCREASING_Y)),
    attribute('pixelAspectRatio', 'float', f32(1)),
    attribute('screenWindowCenter', 'v2f', concat(f32(0), f32(0))),
    attribute('screenWindowWidth', 'float', f32(1)),
    Uint8Array.of(0),
  ]
  return concat(...parts)
}

function chlistY(): Uint8Array {
  return concat(cstr('Y'), i32(FLOAT), Uint8Array.of(0, 0, 0, 0), i32(1), i32(1), Uint8Array.of(0))
}

function attribute(name: string, type: string, value: Uint8Array): Uint8Array {
  return concat(cstr(name), cstr(type), i32(value.byteLength), value)
}

function box2i(xMin: number, yMin: number, xMax: number, yMax: number): Uint8Array {
  return concat(i32(xMin), i32(yMin), i32(xMax), i32(yMax))
}

function cstr(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length + 1)
  for (let at = 0; at < text.length; at++) bytes[at] = text.charCodeAt(at)
  return bytes
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value, true)
  return out
}

function i32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setInt32(0, value, true)
  return out
}

function f32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setFloat32(0, value, true)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}
