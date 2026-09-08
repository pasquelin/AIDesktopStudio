import { TRANSLATIONS, LANGUAGES } from '@shared/i18n'
import { setWindowLanguage } from '@main/window/language'
import { describe, expect, it } from 'vitest'
import { animationGraphPreset } from '@shared/domain/animationPresets'
import { EXPORTED_GAME_FILE, type ExportedGame } from '@shared/domain/gameExport'
import type { GameExportRequest } from '@shared/domain/gameExport'
import { gunzipSync, strFromU8 } from 'fflate'
import { writeExportedGame, type GameExportPorts } from './gameExport'
import { compactGlbGeometry } from './glbGeometry'

const SCENE = (id: string, assetIds: readonly string[] = []): string =>
  JSON.stringify({ nodes: assetIds.map(assetId => ({ id, material: { map: { assetId } } })) })

const ASKED: GameExportRequest = {
  title: 'Demo',
  entryScene: 'doc-1',
  scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE('a', ['tex-1']) }],
  scripts: [{ script: 'script:levels/Walk.ts', code: 'export {}' }],
  inputMaps: [{ version: 1, id: 'character', priority: 0, defaultActive: true, actions: [] }],
}

function writing(over: Partial<GameExportPorts> = {}) {
  const written = new Map<string, string | Uint8Array>()
  const ports: GameExportPorts = {
    bundledClip: () => Promise.resolve(null),
    assetFiles: ids =>
      Promise.resolve(
        new Map(
          ids
            .filter(id => id === 'tex-1')
            .map(id => [id, { name: 'checker.png', bytes: new Uint8Array([1]) }]),
        ),
      ),
    runtime: () =>
      Promise.resolve([
        { name: 'runtime.js', body: new Uint8Array([2]) },
        { name: 'jolt-abc.js', body: new Uint8Array([3]) },
      ]),
    write: (relative, body) => {
      written.set(relative, body)
      return Promise.resolve()
    },
    ...over,
  }
  return { ports, written }
}

/** A model whose uint32 index buffer fits in uint16, so the SAFE compaction has something to do. */
function modelWithIndices(count: number): Uint8Array {
  let seed = 1
  const indices = Array.from({ length: count }, () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
    return seed % 65_536
  })
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: count * 4 }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: count * 4, target: 34963 }],
      accessors: [{ bufferView: 0, componentType: 5125, count, type: 'SCALAR' }],
    }),
  )
  const jsonLength = Math.ceil(json.byteLength / 4) * 4
  const file = new Uint8Array(12 + 8 + jsonLength + 8 + count * 4)
  const data = new DataView(file.buffer)
  data.setUint32(0, 0x46546c67, true)
  data.setUint32(4, 2, true)
  data.setUint32(8, file.byteLength, true)
  data.setUint32(12, jsonLength, true)
  data.setUint32(16, 0x4e4f534a, true)
  file.fill(0x20, 20, 20 + jsonLength)
  file.set(json, 20)
  data.setUint32(20 + jsonLength, count * 4, true)
  data.setUint32(24 + jsonLength, 0x004e4942, true)
  indices.forEach((value, at) => data.setUint32(28 + jsonLength + at * 4, value, true))
  return file
}

const manifestOf = (written: Map<string, string | Uint8Array>): ExportedGame =>
  JSON.parse(String(written.get(EXPORTED_GAME_FILE) ?? '{}'))

describe('a game written to run with no studio', () => {
  it('keeps the project input maps in the runtime manifest', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, ASKED)

    expect(manifestOf(written).inputMaps).toEqual(ASKED.inputMaps)
  })

  it('copies the shipped clips a graph names and rewrites it onto those copies', async () => {
    const clip = new Uint8Array([7, 8, 9])
    const { ports, written } = writing({
      bundledClip: () => Promise.resolve(clip),
    })

    await writeExportedGame(ports, {
      ...ASKED,
      animationGraphs: [{ path: '', graph: animationGraphPreset('character') }],
    })

    const manifest = manifestOf(written)
    const idle = manifest.animationGraphs?.[0]?.graph.layers[0]?.states.find(
      state => state.id === 'idle',
    )
    expect(idle?.source).toMatchObject({ kind: 'asset', assetId: 'clip:Idle' })
    expect(manifest.assets['clip:Idle']).toMatch(/^assets\/Idle\.glb/)
  })

  it('writes the page, the bundle, the manifest, the scenes and the scripts', async () => {
    const { ports, written } = writing()

    const report = await writeExportedGame(ports, ASKED)

    // 🛑 The chunks too: `runtime.js` imports the physics and the sandbox by name, and a page shipped
    // with the entry alone loads nothing at all.
    expect([...written.keys()].sort()).toEqual([
      'assets/checker.png',
      'game.json',
      'index.html',
      'jolt-abc.js',
      'runtime.js',
      'scenes/doc-1.gltf',
      'scripts/Walk.js',
    ])
    expect(report).toMatchObject({ scenes: 1, scripts: 1, assets: 1, missing: [] })
    expect(written.get('scenes/doc-1.gltf')).toBe(ASKED.scenes[0]?.content)
    expect(written.get('scripts/Walk.js')).toBe(ASKED.scripts[0]?.code)
  })

  it('losslessly reduces repetitive scene and script storage', async () => {
    const content = JSON.stringify({
      nodes: Array.from({ length: 1_000 }, () => ({ type: 'mesh' })),
    })
    const code = 'runtime.step()\n'.repeat(1_000)
    const { ports, written } = writing()

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: [{ id: 'doc-1', title: 'Menu', content }],
      scripts: [{ script: 'script:levels/Walk.ts', code }],
    })

    const scene = written.get('scenes/doc-1.gltf.gz')
    const script = written.get('scripts/Walk.js.gz')
    if (!(scene instanceof Uint8Array) || !(script instanceof Uint8Array)) {
      throw new Error('expected compressed export bytes')
    }
    expect(scene.byteLength).toBeLessThan(new TextEncoder().encode(content).byteLength)
    expect(script.byteLength).toBeLessThan(new TextEncoder().encode(code).byteLength)
    expect(manifestOf(written).scenes[0]?.compression).toBe('gzip')
    expect(manifestOf(written).scripts[0]?.compression).toBe('gzip')
    expect(strFromU8(gunzipSync(scene))).toBe(content)
    expect(strFromU8(gunzipSync(script))).toBe(code)
  })

  it('compresses a resource only when gzip makes its exact bytes smaller', async () => {
    const pixels = new Uint8Array(8_192)
    const { ports, written } = writing({
      assetFiles: () => Promise.resolve(new Map([['tex-1', { name: 'raw.rgba', bytes: pixels }]])),
    })

    await writeExportedGame(ports, ASKED)

    expect(manifestOf(written).assets).toEqual({ 'tex-1': 'assets/raw.rgba.gz' })
    expect(manifestOf(written).compressedAssets).toEqual(['tex-1'])
    const stored = written.get('assets/raw.rgba.gz')
    if (!(stored instanceof Uint8Array)) throw new Error('expected compressed asset bytes')
    expect(gunzipSync(stored)).toEqual(pixels)
  })

  it('does not mark an incompressible source whose name already ends in gzip', async () => {
    const bytes = Uint8Array.of(1)
    const { ports, written } = writing({
      assetFiles: () =>
        Promise.resolve(
          new Map([
            ['first', { name: 'noise.gz', bytes }],
            ['second', { name: 'copy.gz', bytes }],
          ]),
        ),
    })

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE('a', ['first', 'second']) }],
    })

    expect(manifestOf(written).assets).toEqual({
      first: 'assets/noise.gz',
      second: 'assets/noise.gz',
    })
    expect(manifestOf(written).compressedAssets).toBeUndefined()
  })

  /** 🛑 § 19.3: only what is reached is copied, and what is missed is LISTED. */
  it('copies only the assets a scene names, and lists the ones nothing holds', async () => {
    const { ports, written } = writing()

    const report = await writeExportedGame(ports, {
      ...ASKED,
      scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE('a', ['tex-1', 'gone']) }],
    })

    expect(report.missing).toEqual(['gone'])
    expect(manifestOf(written).assets).toEqual({ 'tex-1': 'assets/checker.png' })
  })

  it('trusts typed runtime reachability instead of shipping an unused scene reference', async () => {
    const asked: string[][] = []
    const { ports, written } = writing({
      assetFiles: ids => {
        asked.push([...ids])
        return Promise.resolve(new Map())
      },
    })

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: [
        {
          id: 'doc-1',
          title: 'Menu',
          content: SCENE('a', ['unused-sky']),
          assetIds: [],
        },
      ],
    })

    expect(asked).toEqual([[]])
    expect(manifestOf(written).assets).toEqual({})
  })

  it('names the same asset once, however many scenes reach it', async () => {
    const { ports } = writing()

    const report = await writeExportedGame(ports, {
      ...ASKED,
      entryScene: 'a',
      scenes: [
        { id: 'a', title: 'A', content: SCENE('a', ['tex-1']) },
        { id: 'b', title: 'B', content: SCENE('b', ['tex-1']) },
      ],
    })

    expect(report.assets).toBe(1)
  })

  it('files byte-identical asset ids once while preserving both logical references', async () => {
    const { ports, written } = writing({
      assetFiles: () =>
        Promise.resolve(
          new Map([
            ['first', { name: 'first.png', bytes: new Uint8Array([1, 2]) }],
            ['second', { name: 'second.png', bytes: new Uint8Array([1, 2]) }],
          ]),
        ),
    })

    const report = await writeExportedGame(ports, {
      ...ASKED,
      scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE('a', ['first', 'second']) }],
    })

    expect(manifestOf(written).assets).toEqual({
      first: 'assets/first.png',
      second: 'assets/first.png',
    })
    expect([...written.keys()].filter(name => name.startsWith('assets/'))).toEqual([
      'assets/first.png',
    ])
    expect(report.assets).toBe(2)
  })

  it('keeps different bytes apart even when their recorded fingerprints collide', async () => {
    const { ports, written } = writing({
      assetFiles: () =>
        Promise.resolve(
          new Map([
            ['first', { name: 'first.png', bytes: new Uint8Array([1]), hash: 'same' }],
            ['second', { name: 'second.png', bytes: new Uint8Array([2]), hash: 'same' }],
          ]),
        ),
    })

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: [{ id: 'doc-1', title: 'Menu', content: SCENE('a', ['first', 'second']) }],
    })

    expect(new Set(Object.values(manifestOf(written).assets)).size).toBe(2)
  })

  /**
   * 🛑 A document id comes from the WINDOW over IPC, and every path here is composed from one.
   * Written raw, `scenes/../../x.gltf` lands wherever it points.
   */
  it('writes a scene whose id would climb out of the folder inside it all the same', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, {
      ...ASKED,
      entryScene: '../../evil',
      scenes: [{ id: '../../evil', title: 'Menu', content: SCENE('a') }],
    })

    expect([...written.keys()].every(path => !path.includes('..'))).toBe(true)
    expect([...written.keys()]).toContain('scenes/evil.gltf')
  })

  /** 🛑 Two ids that clean to one name would otherwise overwrite each other, in silence. */
  it('gives two scenes that clean to one name a file each', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: [
        { id: '../a', title: 'A', content: SCENE('a') },
        { id: '..\\a', title: 'B', content: SCENE('b') },
      ],
    })

    expect([...written.keys()].filter(path => path.startsWith('scenes/')).sort()).toEqual([
      'scenes/a-2.gltf',
      'scenes/a.gltf',
    ])
  })

  /** The page is markup and a title is a person's words: one may close a tag inside the other. */
  it('escapes a title that would close the tag it sits in', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, { ...ASKED, title: '</title><script>x' })

    expect(String(written.get('index.html'))).toContain('&lt;/title&gt;&lt;script&gt;x')
  })

  it('says which scene the game opens on, and where each one sits', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, ASKED)

    expect(manifestOf(written)).toMatchObject({
      entryScene: 'doc-1',
      scenes: [
        {
          id: 'doc-1',
          title: 'Menu',
          file: 'scenes/doc-1.gltf',
        },
      ],
      scripts: [
        {
          script: 'script:levels/Walk.ts',
          file: 'scripts/Walk.js',
        },
      ],
    })
  })

  it('writes byte-equivalent packages twice from the same request', async () => {
    const first = writing()
    const second = writing()
    const repetitive = {
      ...ASKED,
      scenes: [
        {
          id: 'doc-1',
          title: 'Menu',
          content: JSON.stringify({ nodes: Array.from({ length: 1_000 }, () => ({ id: 'tree' })) }),
        },
      ],
      scripts: [{ script: 'script:levels/Walk.ts', code: 'runtime.step()\n'.repeat(1_000) }],
    }

    await writeExportedGame(first.ports, repetitive)
    await writeExportedGame(second.ports, repetitive)

    expect(manifestOf(first.written).scenes[0]?.compression).toBe('gzip')
    expect([...first.written.entries()].sort()).toEqual([...second.written.entries()].sort())
  })

  it('keeps original asset bytes when the renderer supplied no transformed copy', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, ASKED)

    expect(written.get('assets/checker.png')).toEqual(new Uint8Array([1]))
  })

  it('files a model compacted, and stores the gzip of the very bytes it chose', async () => {
    const bytes = modelWithIndices(600)
    const { ports, written } = writing({
      assetFiles: () => Promise.resolve(new Map([['tex-1', { name: 'model.glb', bytes }]])),
    })

    await writeExportedGame(ports, ASKED)

    expect(manifestOf(written).assets).toEqual({ 'tex-1': 'assets/model.glb.gz' })
    const stored = written.get('assets/model.glb.gz')
    if (!(stored instanceof Uint8Array)) throw new Error('expected compressed model bytes')
    expect(gunzipSync(stored)).toEqual(compactGlbGeometry(bytes))
  })

  /**
   * What one image costs travels with the game: the page draws under the author's own policy
   * rather than under whatever a runtime happens to default to — the two used to differ, the
   * editor drawing every shadow and the game none.
   */
  it('writes the render policy it was handed', async () => {
    const { ports, written } = writing()
    const render = {
      shadows: true,
      shadowQuality: 'soft',
      shadowMapSize: 1024,
      quality: 'performance',
      fieldOfView: 50,
      gridSize: 30,
    } satisfies NonNullable<GameExportRequest['render']>

    await writeExportedGame(ports, { ...ASKED, render })

    expect(manifestOf(written).render).toEqual(render)
  })

  it('leaves the policy out when nobody named one, so an older page keeps its default', async () => {
    const { ports, written } = writing()

    await writeExportedGame(ports, ASKED)

    expect(manifestOf(written).render).toBeUndefined()
  })

  it('writes the explicit LOSSY choices and packages the transformed image', async () => {
    const { ports, written } = writing()
    const lossyOptimization = {
      generateLods: true,
      geometrySimplification: 'balanced',
      textureReduction: 'half',
      textureCompression: 'conservative',
    } satisfies NonNullable<GameExportRequest['lossyOptimization']>

    const optimization = {
      nodes: [
        {
          nodeId: 'tree',
          geometry: { kind: 'sphere', radius: 1, widthSegments: 8, heightSegments: 4 },
        },
      ],
    } satisfies NonNullable<GameExportRequest['scenes'][number]['optimization']>

    await writeExportedGame(ports, {
      ...ASKED,
      scenes: ASKED.scenes.map(scene => ({ ...scene, optimization })),
      lossyOptimization,
      assetOverrides: [{ id: 'tex-1', extension: 'jpg', bytes: new Uint8Array([7, 8]) }],
      modelAssets: { tree: [] },
    })

    expect(manifestOf(written).lossyOptimization).toEqual(lossyOptimization)
    expect(manifestOf(written).scenes[0]?.optimization).toEqual(optimization)
    expect(manifestOf(written).assets).toEqual({ 'tex-1': 'assets/checker.jpg' })
    expect(manifestOf(written).modelAssets).toEqual({ tree: [] })
    expect(written.get('assets/checker.jpg')).toEqual(new Uint8Array([7, 8]))
  })
})

it('exports a page with a startup failure in the selected language', async () => {
  try {
    for (const { code } of LANGUAGES) {
      setWindowLanguage(code)
      const { ports, written } = writing()
      await writeExportedGame(ports, ASKED)
      const page = written.get('index.html')
      expect(page).toContain(`<html lang="${code}">`)
      expect(page).toContain(JSON.stringify(TRANSLATIONS[code].diagnostics.gameStartFailed))
      expect(page).not.toContain('said.textContent = String(error)')
    }
  } finally {
    setWindowLanguage('fr')
  }
})
