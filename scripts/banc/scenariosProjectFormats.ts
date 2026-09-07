import { ANIMATION_GRAPH_EXTENSION, ANIMATION_GRAPH_VERSION } from '@shared/domain/animationGraph'
import { INPUT_MAP_EXTENSION } from '@shared/domain/inputMap'
import { inputMapPreset } from '@shared/domain/inputPresets'
import type { Scenario } from './run'
import { modelScene } from './setups'
import type { Studio } from './studio'
import * as read from './oracle'

const MAP_PATH = `Controls/character${INPUT_MAP_EXTENSION}`
const GRAPH_PATH = `Animation/character${ANIMATION_GRAPH_EXTENSION}`

/**
 * 🛑 A project that already HOLDS the two files, laid through the studio's own writers: without
 * them the read requests answer `notFound`, and the four ranks below scored zero against every
 * model while COVERAGE called them measured.
 */
const laidInputMap = async (studio: Studio): Promise<void> => {
  await studio.run('inputMap.write', { path: MAP_PATH, map: inputMapPreset('character') })
}

const laidAnimationGraph = async (studio: Studio): Promise<void> => {
  await studio.run('animationGraph.write', {
    path: GRAPH_PATH,
    graph: {
      version: ANIMATION_GRAPH_VERSION,
      id: 'character',
      parameters: [],
      layers: [
        {
          id: 'base',
          initial: 'idle',
          states: [{ id: 'idle', source: { kind: 'bundled', name: 'Idle' } }],
          transitions: [],
        },
      ],
    },
  })
}

export const PROJECT_FORMAT_SCENARIOS: readonly Scenario[] = [
  {
    name: '72.1 lists project input maps',
    said: ['Liste les cartes de contrôles du projet, avec les commandes clavier et manette.'],
    setup: laidInputMap,
    passed: run => read.idle(run) && read.answeredWith(run, 'inputMaps.list'),
  },
  {
    name: '72.2 reads one input map',
    said: ['Lis la carte de contrôles Controls/character.input.json.'],
    setup: laidInputMap,
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
    setup: laidAnimationGraph,
    passed: run => read.idle(run) && read.answeredWith(run, 'animationGraphs.list'),
  },
  {
    name: '72.5 reads one animation graph',
    said: ['Lis le graphe d’animation Animation/character.anim.json.'],
    setup: laidAnimationGraph,
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
    setup: modelScene,
    passed: run => read.idle(run) && read.answeredWith(run, 'animation.retargetStatus'),
  },
]
