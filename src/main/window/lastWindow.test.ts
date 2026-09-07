import { describe, expect, it } from 'vitest'
import { quitsOnLastWindow } from './lastWindow'

describe('quitsOnLastWindow', () => {
  it('keeps the process on macOS so the Dock can reopen a window', () => {
    expect(quitsOnLastWindow('darwin')).toBe(false)
  })

  it('quits on Windows and Linux, where closing the last window ends the app', () => {
    expect(quitsOnLastWindow('win32')).toBe(true)
    expect(quitsOnLastWindow('linux')).toBe(true)
  })
})
