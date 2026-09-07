import { describe, expect, it } from 'vitest'
import type { StudioSnapshot } from '@shared/domain/studioSnapshot'
import { actionSearchScope, availableActionTargets } from './actionSearchContext'

const SNAPSHOT: StudioSnapshot = {
  project: null,
  projectKnown: true,
  workspace: 'image',
  surface: 'image',
  commandScope: 'image',
  documents: [
    {
      id: 'image',
      title: 'Boat',
      kind: 'image',
      workspace: 'image',
      path: 'Images/Boat.ora',
      active: true,
      modified: false,
    },
    {
      id: 'scene',
      title: 'Harbour',
      kind: 'scene',
      workspace: '3d',
      path: 'Scenes/Harbour.gltf',
      active: false,
      modified: false,
    },
  ],
  activeDocumentState: {
    documentId: 'image',
    kind: 'image',
    incarnation: 'image-1',
    revision: 1,
    state: {},
  },
  selection: null,
  armedModels: {},
  play: 'edit',
  tasks: [],
  authenticated: false,
  authKnown: true,
}

describe('action search context', () => {
  it('gives a uniquely named open document authority over the active document', () => {
    expect(actionSearchScope(SNAPSHOT, 'Reviens sur la scène 3D.')).toEqual({
      target: 'document',
      document: 'scene',
      documentAuthority: 'explicit',
    })
  })

  it('keeps the active document contextual when no open document is named', () => {
    expect(actionSearchScope(SNAPSHOT, 'Change la qualité globale.')).toEqual({
      document: 'image',
      documentAuthority: 'active',
    })
  })

  it('keeps an explicitly named selection ahead of a mentioned document', () => {
    const snapshot: StudioSnapshot = {
      ...SNAPSHOT,
      selection: { kind: 'layer', items: [{ id: 'layer', name: 'Logo' }] },
    }

    expect(actionSearchScope(snapshot, 'Déplace Logo dans l’image Boat.')).toEqual({
      target: 'layer',
      document: 'image',
      documentAuthority: 'explicit',
    })
  })

  it('resolves an object pronoun to the current selection', () => {
    const snapshot: StudioSnapshot = {
      ...SNAPSHOT,
      selection: { kind: 'layer', items: [{ id: 'layer', name: 'Boat' }] },
    }

    expect(actionSearchScope(snapshot, 'Déplace-la de 100 pixels.')).toEqual({
      target: 'layer',
      document: 'image',
      documentAuthority: 'active',
    })
  })

  it('keeps an explicitly named domain ahead of an unrelated selection', () => {
    const snapshot: StudioSnapshot = {
      ...SNAPSHOT,
      selection: { kind: 'layer', items: [{ id: 'layer', name: 'Boat' }] },
    }

    expect(actionSearchScope(snapshot, 'Quels réglages porte un composant Santé ?')).toEqual({
      target: 'component',
      document: 'image',
      documentAuthority: 'active',
    })
  })

  it.each([
    ['Ajoute un brouillard léger', 'world'],
    ['Renomme la piste audio', 'track'],
    ['Quels sont mes favoris ?', 'favorite'],
    ['Jette ce stash Git', 'git'],
  ])('recognises the named business target in %s', (query, target) => {
    expect(actionSearchScope(null, query)).toMatchObject({ target })
  })

  it('gives a named business target authority over the current selection', () => {
    const snapshot: StudioSnapshot = {
      ...SNAPSHOT,
      selection: { kind: 'node', items: [{ id: 'bone', name: 'Arm' }] },
    }

    expect(actionSearchScope(snapshot, 'Supprime cet os')).toMatchObject({ target: 'bone' })
  })

  it('only exposes project context as a target when an active card matches the request', () => {
    const context = {
      cards: [{ id: 'style', title: 'Style', body: 'Photorealistic', active: true, pictures: [] }],
      trouble: null,
    }

    expect(availableActionTargets(context, 'Forget the project style')).toEqual(['projectContext'])
    expect(availableActionTargets(context, 'Delete the selected node')).toEqual([])
  })
})
