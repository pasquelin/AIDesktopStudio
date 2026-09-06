import type { Scenario } from './run'
import * as read from './oracle'
import { refusedWith, workshopView } from './oracleWorkshop'
import { characterTab } from './setups'

/**
 * Section 71: what a model tab answers to the scene actions — its VIEW, and a refusal for any
 * edit of a workshop nothing saves. The knight is opened on its own tab by the decor.
 */
export const CHARACTER_SCENARIOS: readonly Scenario[] = [
  {
    name: '71.1 describes what the model tab holds',
    said: ["Que contient l'onglet modèle ?"],
    setup: characterTab,
    passed: run => read.idle(run) && read.answeredWith(run, 'scene.state'),
  },
  {
    name: '71.2 draws the model as a wireframe',
    said: ['Passe le modèle en filaire.'],
    setup: characterTab,
    passed: run => workshopView(run)?.displays.includes('wireframe') === true,
  },
  {
    name: '71.3 hides the skeleton of the model',
    said: ['Masque le squelette du modèle.'],
    setup: characterTab,
    passed: run => workshopView(run)?.skeletons === false,
  },
  {
    name: '71.4 captures the view of the model',
    said: ['Capture la vue du modèle.'],
    setup: characterTab,
    passed: run => read.answeredWith(run, 'scene.capture'),
  },
  // The one request of the section that MUST be refused: the workshop is drawn, never saved.
  {
    name: '71.5 refuses to add a shape beside the model, and says where one can go',
    said: ['Ajoute un cube à côté du modèle.'],
    setup: characterTab,
    passed: run => refusedWith(run, 'node.add'),
  },
]
