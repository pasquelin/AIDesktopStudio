import { describe, expect, it } from 'vitest'
import {
  authoriseExternalFiles,
  claimExternalFiles,
  externalPathsFromArguments,
  launchedPaths,
} from './externalFiles'

describe('externalPathsFromArguments', () => {
  it('keeps absolute file arguments so a desktop launch can report accepted and refused files', () => {
    expect(
      externalPathsFromArguments([
        '/Applications/AI Desktop Studio',
        '/work/model.glb',
        '/work/image.png',
        '--inspect',
        'relative.glb',
      ]),
    ).toEqual(['/Applications/AI Desktop Studio', '/work/model.glb', '/work/image.png'])
  })

  it('keeps unsupported absolute arguments for a visible refusal', () => {
    expect(externalPathsFromArguments(['/work/scene.gltf', '/work/notes.txt'])).toEqual([
      '/work/scene.gltf',
      '/work/notes.txt',
    ])
  })

  it('excludes the executable and application folder from launch candidates', () => {
    expect(
      externalPathsFromArguments(
        ['/Applications/AI Desktop Studio', '/work/model.obj'],
        new Set(['/Applications/AI Desktop Studio']),
      ),
    ).toEqual(['/work/model.obj'])
  })
})

describe('launchedPaths', () => {
  it('cuts the binary whatever path invoked it, so no launch announces a refused executable', () => {
    expect(launchedPaths(['/usr/local/bin/ai-desktop-studio', '/work/model.obj'], '/repo/app')).toEqual([
      '/work/model.obj',
    ])
  })

  it('drops the application folder a development launch passes after the binary', () => {
    expect(launchedPaths([process.execPath, '/repo/app', '/work/image.png'], '/repo/app')).toEqual([
      '/work/image.png',
    ])
  })
})

describe('external file authorisations', () => {
  it('exchanges accepted paths through a one-use opaque request', async () => {
    const offer = await authoriseExternalFiles(['/work/model.obj', '/work/notes.txt'])

    expect(offer.refused).toEqual([{ name: 'notes.txt', extension: 'txt' }])
    expect(offer.request).not.toBeNull()
    if (!offer.request) return
    expect(claimExternalFiles(offer.request.id)).toEqual(['/work/model.obj'])
    expect(claimExternalFiles(offer.request.id)).toEqual([])
  })

  it('does not authorise an unsupported path and preserves its refusal', async () => {
    await expect(authoriseExternalFiles(['/work/notes.txt'])).resolves.toEqual({
      request: null,
      refused: [{ name: 'notes.txt', extension: 'txt' }],
    })
  })
})
