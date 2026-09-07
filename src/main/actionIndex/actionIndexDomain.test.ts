import { expect, it, onTestFinished } from 'vitest'
import { assistantAction } from '@shared/domain/assistant'
import { openMemoryDatabase } from '@main/project/sqliteMemory'
import { actionCorpus } from './actionCorpus'
import { createActionIndex } from './actionIndex'

function search(query: string, document: 'scene' | 'sequence'): readonly string[] {
  const database = openMemoryDatabase()
  onTestFinished(() => database.close())
  const index = createActionIndex(database)
  index.rebuild(actionCorpus())
  return index
    .search({ query, limit: 12, scope: { document, documentAuthority: 'explicit' } })
    .map(hit => hit.action.name)
}

/**
 * 🛑 `assets.searchProjectCatalogue` was asserted beside `clip.add` here and is GONE, measured
 * 2026-09-07 with the declared intents. It answers 0.50 lexically and −0.50 on intent — a
 * `search` against a `create` query — and only reached the twelve because a dozen actions scored
 * a neutral 0 for having no intent at all. `git.commit` is what took its place: 2.00 lexically,
 * and now +2 for being a `create`. Pairing a consuming action with the discovery that feeds it is
 * a rule the index does not have, and giving it one is its own lot.
 */
it('offers the operation that consumes a project asset', () => {
  expect(
    search('Ajoute ma première vidéo sur la piste V1 au début de la timeline.', 'sequence'),
  ).toContain('clip.add')
  expect(assistantAction('clip.add')?.inputs).toBeUndefined()
})

it('derives localized component semantics from the component registry', () => {
  expect(search('Monte la santé maximum de cet objet à 250.', 'scene')).toContain(
    'component.setProperties',
  )
})

it('derives localized command semantics from the command registry', () => {
  expect(
    search("Suis la sélection pour qu'elle reste visible pendant son mouvement.", 'scene'),
  ).toContain('command.runStudioCommand')
})

it('derives localized post-processing semantics from the effect registry', () => {
  expect(search("Augmente l'intensité du flou lumineux.", 'scene')).toContain('post.set')
  expect(search("Éteins l'effet de halo sans le supprimer.", 'scene')).toContain(
    'post.setEffectEnabled',
  )
})
