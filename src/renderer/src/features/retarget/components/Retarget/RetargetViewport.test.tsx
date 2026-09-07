import { render, waitFor } from '@testing-library/react'
import { AnimationClip, Bone, Group, VectorKeyframeTrack } from 'three'
import { expect, it, vi } from 'vitest'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { RetargetViewport, type MotionView } from './RetargetViewport'

const loads = vi.hoisted(() => new Map<string, (value: Group) => void>())
vi.mock('@/engines/scene/gltfSource', () => ({
  createGltfSource: () => ({
    load: async () => new Group(),
    loadAnimation: (url: string) => new Promise<Group>(resolve => loads.set(url, resolve)),
    dispose: vi.fn(),
  }),
}))
function model(name: string): Group {
  const root = new Group()
  const hips = new Bone()
  hips.name = 'Hips'
  hips.position.y = 1
  root.add(hips)
  root.animations = [
    new AnimationClip(name, 1, [
      new VectorKeyframeTrack('Hips.position', [0, 1], [2, 1, 0, 3, 1, 0]),
    ]),
  ]
  return root
}

it('keeps its canvas, camera and old model while the replacement is loading', async () => {
  const mount = vi.spyOn(SceneRenderer.prototype, 'mount').mockImplementation(() => {})
  const dispose = vi.spyOn(SceneRenderer.prototype, 'dispose')
  const frame = vi.spyOn(SceneRenderer.prototype, 'frameContents')
  const ready: { current: MotionView | null } = { current: null }
  const onReady = (value: MotionView | null) => {
    if (value) {
      expect(value.engine.inspectMotion(value.nodeId)?.bones[0]?.position[0]).toBe(2)
      ready.current = value
    }
  }
  const props = { assetId: 'source', onReady, onFailure: vi.fn() }
  const view = render(<RetargetViewport {...props} sourceUrl="first" />)
  loads.get('first')?.(model('first'))
  await waitFor(() => expect(ready.current?.clips[0]?.name).toBe('first'))
  const engine = ready.current?.engine
  const nodeId = ready.current?.nodeId ?? ''
  view.rerender(<RetargetViewport {...props} sourceUrl="second" />)
  expect(engine?.inspectMotion(nodeId)?.clips[0]?.name).toBe('first')
  expect(dispose).not.toHaveBeenCalled()
  loads.get('second')?.(model('second'))
  await waitFor(() => expect(ready.current?.clips[0]?.name).toBe('second'))
  expect(ready.current?.engine).toBe(engine)
  expect(mount).toHaveBeenCalledOnce()
  expect(frame).toHaveBeenCalledOnce()
  view.unmount()
  expect(dispose).toHaveBeenCalledOnce()
})

it('keeps its canvas when only the owner revision changes', async () => {
  const mount = vi.spyOn(SceneRenderer.prototype, 'mount').mockImplementation(() => {})
  const dispose = vi.spyOn(SceneRenderer.prototype, 'dispose')
  const ready: { current: MotionView | null } = { current: null }
  const snapshot = {
    assetId: 'hero',
    name: 'Hero',
    revision: 1,
    incarnation: 'open',
    rig: null,
  }
  const props = {
    assetId: 'source',
    onReady: (value: MotionView | null) => {
      if (value) ready.current = value
    },
    onFailure: vi.fn(),
  }
  const view = render(<RetargetViewport {...props} sourceUrl="first" snapshot={snapshot} />)
  loads.get('first')?.(model('first'))
  await waitFor(() => expect(ready.current?.clips[0]?.name).toBe('first'))
  view.rerender(
    <RetargetViewport {...props} sourceUrl="first" snapshot={{ ...snapshot, revision: 2 }} />,
  )
  expect(dispose).not.toHaveBeenCalled()
  expect(mount).toHaveBeenCalledOnce()
  view.unmount()
})
