import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bundledEngine, bundledFfmpeg } from './resources'

describe('the shipped binary', () => {
  // The studio carries its own encoder on all three platforms: nothing to install, nothing to
  // look for, and no message about a codec to someone who only wanted to import a clip.
  it('sits under the resources of the running app', () => {
    expect(bundledFfmpeg('/Applications/Scenario.app/Contents/Resources', 'darwin')).toBe(
      '/Applications/Scenario.app/Contents/Resources/ffmpeg/ffmpeg',
    )
  })

  it('carries the extension Windows needs to run it', () => {
    expect(bundledFfmpeg('C:\\Program Files\\Scenario\\resources', 'win32')).toContain('ffmpeg.exe')
  })

  it('is named the same on Linux as on macOS', () => {
    expect(bundledFfmpeg('/opt/scenario/resources', 'linux')).toBe(
      '/opt/scenario/resources/ffmpeg/ffmpeg',
    )
  })
})

describe('the local AI engine', () => {
  it('keeps the interpreter and the sources as siblings under the same root', () => {
    expect(bundledEngine('/app/Resources', 'darwin')).toEqual({
      python: '/app/Resources/engine/python/bin/python3',
      sources: '/app/Resources/engine/src',
    })
  })

  it('names the Windows interpreter the way that platform runs it', () => {
    expect(bundledEngine('C:\\Program Files\\AI Desktop Studio\\resources', 'win32').python).toContain(
      'python.exe',
    )
  })

  it('is recopied onto that sibling before a dev run starts', () => {
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as {
        scripts: Record<string, string>
      }
    ).scripts

    expect(scripts.start).toContain('fetch-engine.mjs --sources-only')
    expect(scripts['start:debug']).toContain('fetch-engine.mjs --sources-only')
  })
})
