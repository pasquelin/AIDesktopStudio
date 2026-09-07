import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { newComponent } from '@shared/domain/componentRegistry'
import { meshNode } from '@/engines/scene/scene-fixtures'
import { SceneNodeRow } from './SceneNodeRow'

const shown = (components?: ReturnType<typeof newComponent>[]): void => {
  render(
    <SceneNodeRow documentId="doc-1" node={{ ...meshNode('a'), name: 'Capsule', components }} />,
  )
}

describe('a scene node as a line', () => {
  it('says WHICH script drives it, by file name, beside the node name', () => {
    shown([{ ...newComponent('Script'), script: 'script:Scripts/player.ts' }])

    expect(screen.getByText('Capsule')).toBeInTheDocument()
    expect(screen.getByText('player.ts')).toBeInTheDocument()
  })

  /** 🛑 A reference, not a path: slicing on the last `/` showed `script:Walk.ts` whole. */
  it('names a script filed at the ROOT of the project by its file name too', () => {
    shown([{ ...newComponent('Script'), script: 'script:Walk.ts' }])

    expect(screen.getByText('Walk.ts')).toBeInTheDocument()
  })

  it('says nothing beside a node that runs none, nor beside one naming no file', () => {
    shown()
    shown([newComponent('Script')])

    expect(screen.queryByText(/\.ts/)).toBeNull()
  })
})
