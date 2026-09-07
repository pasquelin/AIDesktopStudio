import { useGenerationComments } from '@/stores/generationComments'
import { useDocuments } from '@/stores/documents'
import type { Scenario } from './run'
import type { Studio } from './studioContract'
import * as read from './oracle'
import { boatImage } from './setups'

async function withComment(studio: Studio): Promise<void> {
  await boatImage(studio)
  const documentId = useDocuments.getState().activeId
  if (!documentId) throw new Error('the image setup opened no document')
  useGenerationComments.getState().add(documentId, {
    id: 'comment-1',
    at: { x: 120, y: 160 },
    text: 'Ancienne instruction',
  })
}

export const COMMENT_SCENARIOS: readonly Scenario[] = [
  {
    name: '70.1 adds a global generation comment to the image',
    said: ["Ajoute une note pour la prochaine génération : rends l'arrière-plan nocturne."],
    setup: boatImage,
    passed: run =>
      read
        .generationComments(run)
        .some(comment => comment.text.includes("l'arrière-plan nocturne")),
  },
  {
    name: '70.2 attaches a generation comment to the named layer',
    said: ['Sur le calque Bateau, note pour la génération : garde exactement cette coque.'],
    setup: boatImage,
    passed: run => {
      const comment = read.generationComments(run)[0]
      return comment?.layerId === read.layerNamed(run, 'Bateau')?.id
    },
  },
  {
    name: '70.3 updates a pending generation comment',
    said: ["Remplace la note de génération par : éclaire seulement l'arrière-plan."],
    setup: withComment,
    passed: run => read.generationComments(run)[0]?.text.includes('éclaire seulement') === true,
  },
  {
    name: '70.4 removes a pending generation comment',
    said: ['Retire la note de génération en attente.'],
    setup: withComment,
    passed: run => read.generationComments(run).length === 0,
  },
]
