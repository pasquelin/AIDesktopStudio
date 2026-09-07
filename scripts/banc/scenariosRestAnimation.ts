import type { Studio } from './studio'
import type { Scenario } from './run'
import { ENVIRONMENT_PRESETS, matchesPreset } from '@/engines/scene/environmentPresets'
import * as read from './oracle'
import { cameraScene, cubeScene, named } from './setups'

const shotScene = async (studio: Studio): Promise<void> => {
  await cameraScene(studio)
  await studio.run('camera.addShot', { nodeId: named(studio, 'Camera Test') })
}

const keyedCube = async (studio: Studio): Promise<void> => {
  await cubeScene(studio)
  await studio.run('key.writePoseKeys', { nodeId: named(studio, 'Cube Test'), timeSeconds: 0 })
  await studio.run('node.transform', { nodeId: named(studio, 'Cube Test'), positionY: 4 })
  await studio.run('key.writePoseKeys', { nodeId: named(studio, 'Cube Test'), timeSeconds: 5 })
}

export const REST_ANIMATION_SCENARIOS: readonly Scenario[] = [
  {
    name: '47.1 cuts a rail for the camera shot',
    said: ['Crée un rail de caméra qui part de la gauche et arrive à droite du cube.'],
    setup: shotScene,
    // A rail IS a path node — `railForShot` adds one and names it on the shot.
    passed: run => read.nodesOfKind(run, 'path').length === 1,
  },
  {
    name: '47.2 makes Camera Test follow that rail',
    said: ['Fais suivre ce rail à Camera Test.'],
    setup: shotScene,
    passed: run => read.shots(run).some(one => one.motion !== undefined),
  },
  {
    name: '47.3 puts Camera Test first in the camera list',
    said: ['Mets Camera Test en premier dans la liste des caméras.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'camera', name: 'Camera Test' })
    },
    passed: run => read.nodes(run)[0]?.name.includes('Camera Test') === true,
  },
  {
    name: '47.4 switches the view to a top view',
    said: ['Passe la vue en vue de dessus.'],
    setup: cubeScene,
    passed: run => read.answeredWith(run, 'view.direction'),
  },
  {
    name: '47.5 shows the scene as a wireframe',
    said: ['Affiche la scène en fil de fer.'],
    setup: cubeScene,
    passed: run => read.sceneView(run)?.displays.includes('wireframe') === true,
  },

  {
    name: '47.6 captures the current view into the pictures',
    said: ['Prends une capture de la vue actuelle et range-la dans mes images.'],
    setup: cubeScene,
    passed: run => read.answeredWith(run, 'scene.capture'),
  },

  {
    name: '48.1 applies a studio lighting preset to the scene',
    said: ["Applique un préréglage d'éclairage de studio à la scène."],
    setup: cubeScene,
    // `matchesPreset` is the studio's own reading: no preset NAME is stored, only what it wrote.
    passed: run => {
      const world = read.world(run)
      return world !== null && ENVIRONMENT_PRESETS.some(one => matchesPreset(world, one))
    },
  },
  {
    name: '48.2 adds a light fog',
    said: ['Ajoute un brouillard léger.'],
    setup: cubeScene,
    passed: run => read.world(run)?.fog.kind !== 'none',
  },
  {
    name: '48.3 puts a ground under the objects',
    said: ['Ajoute un sol sous mes objets.'],
    setup: cubeScene,
    passed: run => read.world(run)?.ground.visible === true,
  },
  {
    name: '48.4 puts the render at its highest quality',
    said: ['Passe le rendu en qualité maximale.'],
    setup: cubeScene,
    passed: run => read.world(run)?.toneMapping !== 'none',
  },
  {
    name: '48.5 adds a scatter layer to the world',
    said: ['Ajoute une couche de semis d’arbres à cette scène.'],
    setup: cubeScene,
    passed: run => read.world(run)?.layers.some(layer => layer.kind === 'scatter') === true,
  },

  {
    name: '49.1 names the animations the scene carries',
    said: ['Quelles animations porte cette scène ?'],
    setup: keyedCube,
    passed: run => read.spoke(run) && read.answeredWith(run, 'animations.list'),
  },
  {
    name: '49.2 cuts that animation into a block from 0 to 5 seconds',
    said: ['Découpe cette animation en un bloc de 0 à 5 secondes.'],
    setup: async studio => {
      await keyedCube(studio)
      await studio.run('key.writePoseKeys', { nodeId: named(studio, 'Cube Test'), timeSeconds: 9 })
    },
    passed: run => !read.keys(run).some(one => one.time > 5 * read.SECOND),
  },
  {
    name: '49.3 switches automatic keying on',
    said: ['Active la pose automatique de clés pendant que je travaille.'],
    setup: keyedCube,
    passed: run => read.animationView(run)?.autoKey === true,
  },
  {
    name: '49.4 clears the key sitting at 5 seconds',
    said: ['Efface la clé posée à 5 secondes.'],
    setup: keyedCube,
    // Three left of six: `key.writePoseKeys` writes position, rotation AND scale, so the decor lays two
    // keys on each of the three channels.
    passed: run => {
      const left = read.keys(run)
      return left.length === 3 && !left.some(one => read.lasts(one.time, 5))
    },
  },
  {
    name: '49.5 clears every key of Cube Test',
    said: ['Efface toutes les clés de Cube Test.'],
    setup: keyedCube,
    passed: run => read.keys(run).length === 0,
  },
  {
    name: '49.6 shifts every key of Cube Test two seconds later',
    said: ['Décale toutes les clés de Cube Test de 2 secondes vers la droite.'],
    setup: keyedCube,
    passed: run => read.keys(run).some(one => read.lasts(one.time, 7)),
  },
  {
    name: '49.7 loops the rotation channel of Cube Test',
    said: ['Boucle le canal de rotation de Cube Test.'],
    setup: keyedCube,
    passed: run => read.answeredWith(run, 'channel.setMuteSoloLock'),
  },
]
