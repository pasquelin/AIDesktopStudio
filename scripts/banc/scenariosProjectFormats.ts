import type { Scenario } from './run'
import * as read from './oracle'

export const PROJECT_FORMAT_SCENARIOS: readonly Scenario[] = [
  {
    name: '72.1 lists project input maps',
    said: ['Liste les cartes de contrôles du projet, avec les commandes clavier et manette.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'inputMaps.list'),
  },
  {
    name: '72.2 reads one input map',
    said: ['Lis la carte de contrôles Controls/character.input.json.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'inputMap.read'),
  },
  {
    name: '72.3 writes one input map',
    said: ['Écris cette carte de contrôles dans Controls/character.input.json.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'inputMap.write'),
  },
  {
    name: '72.4 lists animation graphs',
    said: ['Liste les graphes d’animation du projet.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'animationGraphs.list'),
  },
  {
    name: '72.5 reads one animation graph',
    said: ['Lis le graphe d’animation Animation/character.anim.json.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'animationGraph.read'),
  },
  {
    name: '72.6 writes one animation graph',
    said: ['Écris ce graphe d’animation dans Animation/character.anim.json.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'animationGraph.write'),
  },
  {
    name: '72.7 measures animation retargeting',
    said: ['Vérifie comment le mouvement bundled idle s’adapte au personnage sélectionné.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'animation.retargetStatus'),
  },
]
