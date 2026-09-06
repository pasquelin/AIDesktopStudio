import { render } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SceneRenderer } from '@/engines/scene/SceneRenderer'
import { useAssets } from '@/stores/assets'
import { useSceneRendererResources } from './useSceneRendererResources'

function Host({ engine, models }: { engine: SceneRenderer; models?: boolean }) {
  useSceneRendererResources({ current: engine }, models === undefined ? {} : { models })
  return null
}

function engineOf() {
  const engine = new SceneRenderer({ onSelect: vi.fn(), onTransform: vi.fn() })
  return { engine, refreshModels: vi.spyOn(engine, 'refreshModels') }
}

describe('useSceneRendererResources', () => {
  // The id a model node points at does not move when ⌘S rewrites its file: the shelf is the
  // only thing that can tell a scene to read it again.
  it('tells the engine to read its models again whenever the catalogue is re-read', () => {
    const { engine, refreshModels } = engineOf()
    render(<Host engine={engine} />)

    act(() => useAssets.setState({ items: [] }))

    expect(refreshModels).toHaveBeenCalledTimes(1)
    engine.dispose()
  })

  // The model tab wrote the very file the shelf now announces: reading it back would lose the
  // pose in hand and the picked bone.
  it('leaves the models alone for a document that asked not to', () => {
    const { engine, refreshModels } = engineOf()
    render(<Host engine={engine} models={false} />)

    act(() => useAssets.setState({ items: [] }))

    expect(refreshModels).not.toHaveBeenCalled()
    engine.dispose()
  })
})
