import { describe, expect, it } from 'vitest'
import { keepsWrittenFormat } from './writtenFormat'

/**
 * The question standing between a save and the one writer that renames a file and deletes what
 * it replaced. Only the answers a refusal turns on are cases here.
 */
describe('keepsWrittenFormat', () => {
  it('reads the two spellings of one encoding as one format', () => {
    expect(keepsWrittenFormat('Images/hero.JPEG', '.jpg')).toBe(true)
  })

  it('refuses an extension naming another format', () => {
    expect(keepsWrittenFormat('Images/hero.jpg', '.png')).toBe(false)
  })

  it('lets a row the project holds no file for be written', () => {
    expect(keepsWrittenFormat(undefined, '.png')).toBe(true)
  })
})
