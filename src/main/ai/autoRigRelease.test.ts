import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { modelRefusalOf } from '@shared/domain/localModel'
import { describe, expect, it } from 'vitest'
import runtime from '../../../engine/embedded-runtime.json'
import { shippedModel } from './catalogue'

const ROOT = join(import.meta.dirname, '..', '..', '..')
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8')

describe('Auto Rig release runtime', () => {
  it('ships only the measured minimal Python dependency path', () => {
    expect(runtime.profiles).toEqual(['autorig', 'selection'])
    expect(runtime.distributions.map(distribution => distribution.name)).toEqual([
      'einops',
      'filelock',
      'flatbuffers',
      'fsspec',
      'jinja2',
      'markupsafe',
      'mpmath',
      'networkx',
      'numpy',
      'onnxruntime',
      'packaging',
      'pillow',
      'pip',
      'protobuf',
      'setuptools',
      'sympy',
      'torch',
      'typing-extensions',
    ])
    expect(runtime.distributions.every(distribution => distribution.licence.length > 0)).toBe(true)
    expect(
      runtime.distributions.every(distribution => distribution.wheelFilename.endsWith('.whl')),
    ).toBe(true)
    const project = read('engine/pyproject.toml')
    const autorig = /autorig\s*=\s*\[([\s\S]*?)\]/.exec(project)?.[1] ?? ''
    expect(autorig).not.toMatch(/torch-cluster|timm|torchvision|gradio|bpy/)
  })

  it('prepares every declared embedded runtime profile for each packaged build', () => {
    const prepare = read('scripts/prepare-engine-runtime.mjs')
    const beforePack = read('scripts/before-pack.mjs')
    const fetchEngine = read('scripts/fetch-engine.mjs')
    const builder = read('electron-builder.yml')
    const project = read('engine/pyproject.toml')

    expect(prepare).toContain("'--locked'")
    expect(prepare).toContain("'--only-binary'")
    expect(prepare).toContain('embedded-profiles')
    expect(prepare).toContain('embeddedProfiles().flatMap')
    expect(project).toContain('embedded-profiles = ["autorig", "selection"]')
    expect(beforePack).toContain('prepareEngineRuntime')
    expect(fetchEngine).not.toContain('readFileSync(stamp')
    expect(builder).not.toContain('Contents/Resources/engine/python/lib/**/*.dylib')
    expect(builder).not.toContain('Contents/Resources/engine/python/lib/**/*.so')
    expect(builder).not.toContain("'!src/ia_studio_engine/autorig/make_it_animatable.py'")
    expect(builder).not.toContain("'!src/ia_studio_engine/vendor/make_it_animatable/**'")
  })

  it('keeps an arm64-only macOS invocation from provisioning the Intel runtime', () => {
    const builder = read('electron-builder.yml')
    const release = read('.github/workflows/release.yml')

    expect(builder).not.toContain('arch: [arm64, x64]')
    expect(release).toContain(
      'pnpm exec electron-builder --${{ matrix.platform }} ${{ matrix.architectures }} --publish never',
    )
    expect(release).toContain('architectures: --arm64 --x64')
  })

  it('refuses a packaged application whose embedded selection door cannot start', () => {
    const builder = read('electron-builder.yml')
    const afterPack = read('scripts/after-pack.mjs')
    const checker = read('scripts/check-engine-runtime.mjs')
    const licences = read('scripts/collect-licences.mjs')

    expect(builder).toContain('afterPack: scripts/after-pack.mjs')
    expect(afterPack).toContain('checkEngineRuntime')
    expect(checker).toContain('import onnxruntime')
    expect(checker).toContain('import numpy')
    expect(checker).toContain('from PIL import Image')
    expect(checker).toContain('engine/selection')
    expect(licences).toContain('embedded-runtime.json')
  })

  it('keeps all checkpoint deserialisation behind digest verification and safe loading', () => {
    const model = shippedModel('make-it-animatable')
    const loader = read('engine/src/ia_studio_engine/vendor/make_it_animatable/model.py')

    expect(model?.licenceStatus).toBe('restricted')
    expect(model?.distribution).toBe('direct-download')
    expect(model?.distributionStatus).toBeUndefined()
    expect(model && modelRefusalOf(model)).toBeNull()
    expect(model?.files).toHaveLength(5)
    expect(model?.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
    expect(loader.match(/weights_only=True/g)).toHaveLength(2)
  })

  it('prevents Python imports from changing the signed application seal', () => {
    expect(read('src/main/ai/pythonProcess.ts')).toContain("PYTHONDONTWRITEBYTECODE: '1'")
  })
})
