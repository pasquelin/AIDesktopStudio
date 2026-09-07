import { describe, expect, it } from 'vitest'
import { hashPayload, hashRoute } from './hashPayload'

describe('the payload after a window route', () => {
  it('reads a fragment with or without the leading hash', () => {
    expect(hashPayload('file-info/Notes/a.txt', 'file-info')).toBe('Notes/a.txt')
    expect(hashPayload('#file-info/Notes/a.txt', 'file-info')).toBe('Notes/a.txt')
  })

  it('is the inverse of the route one window loads', () => {
    expect(hashPayload(hashRoute('character', 'asset 1/é'), 'character')).toBe('asset 1/é')
  })

  it('decodes what the route encoded, spaces and accents included', () => {
    const path = 'Images/façade nº2.jpg'
    expect(hashPayload(`file-info/${encodeURIComponent(path)}`, 'file-info')).toBe(path)
  })

  it('answers nothing for an empty payload, a malformed escape, or another window', () => {
    expect(hashPayload('#character/', 'character')).toBeNull()
    expect(hashPayload('character/%E0%A4%A', 'character')).toBeNull()
    expect(hashPayload('#settings', 'character')).toBeNull()
  })
})
