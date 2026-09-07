import { describe, expect, it } from 'vitest'
import { sceneRendererSource as source } from './sceneRendererSource.testHelper'

/**
 * Who gives a shape back to the cache that lent it.
 *
 * Read as text for the reason `sceneRendererRedraw` is: the engine cannot be built without a
 * WebGL context. What is guarded here is a reference NEVER returned, which leaks nothing a test
 * can see and everything the GPU holds — the shape stays pinned for the life of the engine.
 */
describe('SceneRenderer and the shapes it borrows', () => {
  const body = (name: string): string =>
    new RegExp(`protected ${name}\\([^)]*\\): void \\{[\\s\\S]*?\\n {2}\\}`).exec(source)?.[0] ?? ''
  const privateBody = (name: string): string =>
    new RegExp(`private ${name}\\([\\s\\S]*?\\): void \\{[\\s\\S]*?\\n {2}\\}`).exec(source)?.[0] ??
    ''

  it('gives back the reference it took when the mesh already wore that shape', () => {
    // The comparison that leads here is by REFERENCE, so a descriptor minted again with the same
    // content lands in this branch and `acquire` answers the very shape the mesh is wearing.
    expect(privateBody('syncMesh')).toContain('else this.shapes.release(object.geometry)')
  })

  it('frees a borrowed shape through the caches, never straight to `dispose`', () => {
    // Two of them lend the same class of buffers. Disposing one they still lend empties every
    // neighbour of that shape, and every gate stays green on it.
    const raw = source
      .replace(body('freeGeometry'), '')
      .split('\n')
      .map((line, at) => ({ line: line.trim(), at: at + 1 }))
      .filter(({ line }) => /^(object|mesh)\.geometry\.dispose\(\)$/.test(line))

    expect(raw).toEqual([])
    expect(body('freeGeometry')).toContain('this.shapes.owns(geometry)')
    expect(body('freeGeometry')).toContain('this.csg.owns(geometry)')
  })
})
