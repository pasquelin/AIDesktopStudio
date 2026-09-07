import type { Scenario } from './run'
import * as read from './oracle'
import { cubeScene, scene, twoSpheres } from './setups'

export const OPTIMIZATION_SCENARIOS: readonly Scenario[] = [
  {
    name: '69.1 analyzes the optimization opportunities without changing the scene',
    said: ['Analyse les possibilités d’optimisation de cette scène sans la modifier.'],
    setup: cubeScene,
    passed: run => read.tried(run, 'optimization.analyze'),
  },
  {
    name: '69.2 optimizes the selected objects without visual loss',
    said: ['Optimise les objets sélectionnés sans aucune perte visuelle.'],
    setup: cubeScene,
    passed: run => read.nodeNamed(run, 'Cube Test')?.optimization?.mode === 'auto',
  },
  {
    name: '69.3 prepares the whole scene for the game',
    said: ['Prépare toute cette scène pour le jeu avec les optimisations sûres.'],
    setup: twoSpheres,
    passed: run =>
      ['Cube Test', 'Sphere Droite', 'Sphere Gauche'].every(
        name => read.nodeNamed(run, name)?.optimization?.mode === 'auto',
      ),
  },
  {
    name: '69.4 reports what causes the most draw calls',
    said: ['Trouve ce qui provoque le plus de draw calls et donne-moi le rapport.'],
    setup: cubeScene,
    passed: run => read.tried(run, 'optimization.report'),
  },
  {
    name: '69.5 clears the disposable optimization cache',
    said: ['Vide le cache d’optimisation de cette scène.'],
    setup: scene(),
    passed: run => read.tried(run, 'optimization.clearCache'),
  },
  {
    name: '69.6 excludes one object from optimization',
    said: ['Optimise tout sauf Cube Test.'],
    setup: cubeScene,
    passed: run => read.nodeNamed(run, 'Cube Test')?.optimization?.mode === 'exclude',
  },
  {
    name: '69.7 forces repeated trees to use instances',
    said: ['Force les deux sphères à utiliser des instances.'],
    setup: twoSpheres,
    passed: run =>
      ['Sphere Droite', 'Sphere Gauche'].every(
        name => read.nodeNamed(run, name)?.optimization?.mode === 'instance',
      ),
  },
]
