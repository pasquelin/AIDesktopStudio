import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three'
import { expect, it, vi } from 'vitest'
import { createRetargetModelSource } from './retargetModelSource'

it('keeps the previous model until loaded, adopts only the latest source, and frees late results', async () => {
  const pending = new Map<string, (value: Group) => void>()
  const load = vi.fn((url: string) => new Promise<Group>(resolve => pending.set(url, resolve)))
  const swap = vi.fn()
  const disposed = vi.fn()
  const source = createRetargetModelSource(
    { loadAnimation: load, dispose: disposed },
    swap,
    vi.fn(),
  )
  const first = source.select('first')
  expect(swap).not.toHaveBeenCalled()
  const second = source.select('second')
  const latest = new Group()
  pending.get('second')?.(latest)
  await second
  expect(swap).toHaveBeenCalledOnce()
  expect(await source.load('ignored')).toBe(latest)
  const late = new Group()
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  const free = vi.spyOn(mesh.geometry, 'dispose')
  late.add(mesh)
  pending.get('first')?.(late)
  await first
  expect(free).toHaveBeenCalledOnce()
  expect(swap).toHaveBeenCalledOnce()
  const third = source.select('third')
  source.dispose()
  const abandoned = new Group()
  const abandonedMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
  const freeAbandoned = vi.spyOn(abandonedMesh.geometry, 'dispose')
  abandoned.add(abandonedMesh)
  pending.get('third')?.(abandoned)
  await third
  expect(freeAbandoned).toHaveBeenCalledOnce()
  expect(disposed).toHaveBeenCalledOnce()
})
