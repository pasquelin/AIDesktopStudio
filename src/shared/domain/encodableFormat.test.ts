import { describe, expect, it } from 'vitest'
import { destinationFormatsFor, nearestEncodableFor } from './encodableFormat'

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

/**
 * §5.5 again, read the other way: what a Save as… may OFFER. A format the studio writes and
 * cannot open is not a destination — a scene exports to OBJ, PLY and STL and opens none of them.
 */
describe('the formats a Save as offers', () => {
  it('offers the picture its two writers, flat first', () => {
    expect(destinationFormatsFor('image')).toEqual(['png', 'ora'])
  })

  it('offers a scene the one format it reads back, not the ones it only exports', () => {
    expect(destinationFormatsFor('scene')).toEqual(['gltf'])
  })

  /** Nothing to choose between: a script IS its text, and a character edits a model of the library. */
  it('offers nothing where the kind names one file', () => {
    expect(destinationFormatsFor('script')).toEqual([])
    expect(destinationFormatsFor('character')).toEqual([])
  })
})
