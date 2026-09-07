import { describe, expect, it } from 'vitest'
import { isOraSurfacePath, ORA_MERGED_PATH } from './openRaster'

/**
 * The one field of the document contract that crosses a security boundary: the renderer names
 * these, the main process writes them as ZIP entries, and whoever unpacks the container writes
 * them back out.
 */
describe('isOraSurfacePath', () => {
  it('accepts the entry a layer’s pixels are written under', () => {
    expect(isOraSurfacePath('data/p_a1b2c3.png')).toBe(true)
    expect(isOraSurfacePath('data/m_layer_1-mask.png')).toBe(true)
    // A container another application wrote names its own surfaces its own way.
    expect(isOraSurfacePath('data/003.png')).toBe(true)
  })

  /** The spec puts it at the root, and every other application looks for it there. */
  it('accepts the flatten’s reserved name, which is not under data/', () => {
    expect(isOraSurfacePath(ORA_MERGED_PATH)).toBe(true)
  })

  it('refuses anything that could climb out of the container', () => {
    expect(isOraSurfacePath('data/../../secrets.png')).toBe(false)
    expect(isOraSurfacePath('../secrets.png')).toBe(false)
    expect(isOraSurfacePath('..')).toBe(false)
    expect(isOraSurfacePath('/etc/passwd')).toBe(false)
    expect(isOraSurfacePath('data/sub/dir.png')).toBe(false)
    expect(isOraSurfacePath('data\\a\\b.png')).toBe(false)
  })

  it('refuses an entry that is not a surface of the container', () => {
    expect(isOraSurfacePath('')).toBe(false)
    expect(isOraSurfacePath('data/nodot')).toBe(false)
    expect(isOraSurfacePath('data/a b.png')).toBe(false)
    // The studio's own entries are not surfaces, and one standing in for a layer would be
    // overwritten by the pixels of that layer.
    expect(isOraSurfacePath('stack.xml')).toBe(false)
    expect(isOraSurfacePath('aidesktopstudio/document.json')).toBe(false)
    expect(isOraSurfacePath('scenario/envelope.json')).toBe(false)
    expect(isOraSurfacePath('mimetype')).toBe(false)
  })
})
