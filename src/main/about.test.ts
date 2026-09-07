import { describe, expect, it } from 'vitest'
import { aboutInfo, type RuntimeVersions } from './about'

const versions: RuntimeVersions = {
  app: '0.1.0',
  commit: 'b61e8c0',
  electron: '43.3.0',
  chrome: '140.0.0',
  node: '22.9.0',
}

describe('aboutInfo', () => {
  it('shows the product name, not the binary name', () => {
    expect(aboutInfo('fr', versions).applicationName).toBe('AI Desktop Studio')
  })

  it('separates the release from the build, as the native panel expects', () => {
    const info = aboutInfo('fr', versions)
    expect(info.applicationVersion).toBe('0.1.0')
    expect(info.version).toBe('b61e8c0')
  })

  it('names the product without its plumbing', () => {
    // The runtime versions are collected but never shown: an About panel is not a bug report.
    expect(Object.values(aboutInfo('fr', versions)).join(' ')).not.toContain('43.3.0')
  })

  it('takes the copyright from the requested language', () => {
    expect(aboutInfo('fr', versions).copyright).toBe('© 2026 Alban Pasquelin')
    expect(aboutInfo('en', versions).copyright).toBe('© 2026 Alban Pasquelin')
  })
})
