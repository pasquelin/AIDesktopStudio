import { describe, expect, it } from 'vitest'
import { nearestEncodableFor } from './encodableFormat'

/**
 * §5.5 — the format offered is the CLOSEST that carries the work, never the richest. A flat
 * picture whose extension the studio cannot write used to be sent to a container of layers.
 */
describe('the format a document that no longer fits its file is offered', () => {
  it('offers a picture for a picture', () => {
    expect(nearestEncodableFor('picture', [])).toBe('png')
  })

  it('offers the container only for what a picture cannot hold', () => {
    expect(nearestEncodableFor('picture', ['layers'])).toBe('ora')
  })

  /** Something has to be offered: the richest the studio writes, with its losses to be said. */
  it('offers the richest of its domain when nothing carries it all', () => {
    expect(nearestEncodableFor('scene', ['cameraPath'])).toBe('gltf')
  })
})
