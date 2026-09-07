import { isRecord } from '@shared/guards'
import type { Run, Scenario } from './run'
import { SCENE_ASSET_SCENARIOS } from './scenariosSceneAssets'
import * as read from './oracle'
import {
  cameraScene,
  cubeScene,
  cubeSceneWith,
  litScene,
  named,
  opened,
  scene,
  twoSpheres,
  wallAndCube,
  withSphere,
} from './setups'

/**
 * Sections 6 to 14: a 3D scene edited by the sentence. The relative ones (section 7) are the
 * point of the whole batterie — the model has to READ a value before it writes the new one.
 */

const at = (run: Run, name: string, axis: 'x' | 'y' | 'z', wanted: number): boolean => {
  const node = read.nodeNamed(run, name)
  return node !== undefined && read.near(node.transform.position[axis], wanted, 0.01)
}

export const SCENE_SCENARIOS: readonly Scenario[] = [
  // ——— 6. Manipulation simple d'une scène 3D ———
  {
    name: '6.1 adds a cube at the centre',
    said: ['Ajoute un cube au centre de la scène.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'box').length === 1,
  },
  {
    name: '6.2 renames the cube Cube Test',
    said: ['Renomme le cube Cube Test.'],
    setup: async studio => {
      await scene()(studio)
      await studio.run('node.add', { kind: 'box', name: 'Cube' })
    },
    passed: run => read.nodeNamed(run, 'Cube Test') !== undefined,
  },
  {
    name: '6.3 places Cube Test at X 2, Y 1, Z -3',
    said: ['Place Cube Test à X 2, Y 1, Z -3.'],
    setup: cubeScene,
    passed: run =>
      at(run, 'Cube Test', 'x', 2) && at(run, 'Cube Test', 'y', 1) && at(run, 'Cube Test', 'z', -3),
  },
  {
    name: '6.4 doubles its size',
    said: ['Double sa taille.'],
    setup: cubeScene,
    passed: run => read.near(read.nodeNamed(run, 'Cube Test')?.transform.scale.x ?? 0, 2, 0.01),
  },
  {
    name: '6.5 turns it 45 degrees on Y',
    said: ['Fais-le pivoter de 45 degrés sur l’axe Y.'],
    setup: cubeScene,
    passed: run =>
      read.near(
        read.nodeNamed(run, 'Cube Test')?.transform.rotation.y ?? 0,
        read.radians(45),
        0.01,
      ),
  },
  {
    name: '6.6 adds a sphere to the right of the cube',
    said: ['Ajoute une sphère à droite du cube.'],
    setup: cubeScene,
    passed: run => (read.nodesOfKind(run, 'sphere')[0]?.transform.position.x ?? 0) > 0,
  },
  {
    name: '6.7 places the sphere exactly 2 metres right of the cube',
    said: ['Place la sphère exactement 2 mètres à droite du cube.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.transform', { nodeId: named(studio, 'Cube Test'), positionX: 1 })
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere' })
    },
    // The cube stands at X = 1, so « exactly two metres right » is X = 3 and nothing else.
    passed: run => at(run, 'Sphere', 'x', 3),
  },
  {
    name: '6.8 duplicates the sphere and puts the copy left of the cube',
    said: ['Duplique la sphère et place la copie à gauche du cube.'],
    setup: withSphere,
    passed: run => {
      const spheres = read.nodesOfKind(run, 'sphere')
      return spheres.length === 2 && spheres.some(one => one.transform.position.x < 0)
    },
  },
  {
    name: '6.9 renames the two spheres',
    said: ['Renomme les deux sphères Sphere Droite et Sphere Gauche.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere 1' })
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere 2' })
    },
    passed: run =>
      read.nodeNamed(run, 'Sphere Droite') !== undefined &&
      read.nodeNamed(run, 'Sphere Gauche') !== undefined,
  },
  {
    name: '6.10 cuts a window in the wall with the cube',
    said: ['Perce une fenêtre dans le mur avec le cube.'],
    setup: wallAndCube,
    passed: run => read.carvedBy(run, 'subtract'),
  },
  {
    name: '6.11 joins the wall and the cube into one shape',
    said: ['Fusionne le mur et le cube en une seule forme.'],
    setup: wallAndCube,
    passed: run => read.carvedBy(run, 'unite'),
  },
  {
    name: '6.12 keeps only what the wall and the cube share',
    said: ['Ne garde que la partie où le mur et le cube se chevauchent.'],
    setup: wallAndCube,
    passed: run => read.carvedBy(run, 'intersect'),
  },
  {
    // The shapes come back BY NAME, which is what tells a separate from a plain delete: the
    // graph kept them, so the wall and the cube are the very two that went in.
    name: '6.13 separates the solid and gives the shapes back',
    said: ["Sépare ce solide et rends-moi les formes d'origine."],
    setup: async studio => {
      await wallAndCube(studio)
      await studio.run('node.combineIntoSolid', {
        nodeIds: [named(studio, 'Mur'), named(studio, 'Cube')],
        operation: 'subtract',
      })
    },
    passed: run =>
      read.nodesOfKind(run, 'carved').length === 0 &&
      read.nodeNamed(run, 'Mur') !== undefined &&
      read.nodeNamed(run, 'Cube') !== undefined,
  },
  {
    /**
     * Roblox's gesture, and the whole of why the mark exists: a UNION holding a marked shape is a
     * PIERCING. Scored on the verb the SOLID carries, which no fusion could leave behind unless
     * the mark reached the document first.
     */
    name: '6.14 marks the cube as a tool, so joining it pierces the wall',
    said: ['Marque le cube comme outil, puis fusionne-le avec le mur.'],
    setup: wallAndCube,
    passed: run => read.carvedBy(run, 'subtract'),
  },
  {
    name: '6.15 takes the tool mark off the cube',
    said: ["Retire au cube sa marque d'outil."],
    setup: async studio => {
      await wallAndCube(studio)
      await studio.run('node.markAsCuttingTool', { nodeIds: [named(studio, 'Cube')] })
    },
    passed: run => read.isNegative(read.nodeNamed(run, 'Cube')) === false,
  },
  {
    /**
     * The repair, in one call: the solid keeps the CUBE's name where the wall's was, which is
     * what says the roles swapped rather than the fold merely being undone.
     */
    name: '6.16 folds a solid the other way round',
    said: ["Ce pli est parti à l'envers, refais-le dans l'autre sens."],
    setup: async studio => {
      await wallAndCube(studio)
      await studio.run('node.combineIntoSolid', {
        nodeIds: [named(studio, 'Mur'), named(studio, 'Cube')],
        operation: 'subtract',
      })
    },
    passed: run =>
      read.carvedBy(run, 'subtract') && read.nodesOfKind(run, 'carved')[0]?.name === 'Cube',
  },

  // ——— 7. Manipulation relative ———
  {
    name: '7.1 moves Cube Test one metre up',
    said: ["Déplace Cube Test d'un mètre vers le haut."],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.transform', { nodeId: named(studio, 'Cube Test'), positionY: 2 })
    },
    passed: run => at(run, 'Cube Test', 'y', 3),
  },
  {
    name: '7.2 moves Sphere Droite 50 cm right',
    said: ['Déplace Sphere Droite de 50 cm vers la droite.'],
    setup: async studio => {
      await withSphere(studio)
      await studio.run('node.transform', { nodeId: named(studio, 'Sphere Droite'), positionX: 2 })
    },
    passed: run => at(run, 'Sphere Droite', 'x', 2.5),
  },
  {
    name: '7.3 turns Cube Test 20 degrees further on Y',
    said: ['Fais tourner Cube Test de 20 degrés supplémentaires sur Y.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.transform', {
        nodeId: named(studio, 'Cube Test'),
        rotationY: read.radians(45),
      })
    },
    passed: run =>
      read.near(
        read.nodeNamed(run, 'Cube Test')?.transform.rotation.y ?? 0,
        read.radians(65),
        0.01,
      ),
  },
  {
    name: '7.4 halves Sphere Gauche',
    said: ['Réduis Sphere Gauche de moitié.'],
    setup: async studio => {
      await twoSpheres(studio)
      await studio.run('node.transform', {
        nodeId: named(studio, 'Sphere Gauche'),
        scaleX: 2,
        scaleY: 2,
        scaleZ: 2,
      })
    },
    passed: run => read.near(read.nodeNamed(run, 'Sphere Gauche')?.transform.scale.x ?? 0, 1, 0.01),
  },
  {
    name: '7.5 puts Sphere Gauche exactly above Cube Test',
    said: ['Place Sphere Gauche exactement au-dessus de Cube Test.'],
    setup: async studio => {
      await twoSpheres(studio)
      await studio.run('node.transform', {
        nodeId: named(studio, 'Cube Test'),
        positionX: 2,
        positionZ: -1,
      })
    },
    // Above means the cube's own X and Z, and a Y above it — anything else is not « exactly ».
    passed: run => {
      const sphere = read.nodeNamed(run, 'Sphere Gauche')
      const cube = read.nodeNamed(run, 'Cube Test')
      return (
        sphere !== undefined &&
        cube !== undefined &&
        read.near(sphere.transform.position.x, cube.transform.position.x, 0.01) &&
        read.near(sphere.transform.position.z, cube.transform.position.z, 0.01) &&
        sphere.transform.position.y > cube.transform.position.y
      )
    },
  },

  // ——— 8. Lumières ———
  {
    name: '8.1 adds a directional light',
    said: ['Ajoute une lumière directionnelle à la scène.'],
    setup: cubeScene,
    // TWO: a new scene is lit — ambient, directional and hemisphere — so « ajoute-en une » adds
    // to what is already there rather than making the first.
    passed: run => read.nodesOfKind(run, 'directional').length === 2,
  },
  {
    name: '8.2 renames it Soleil Test',
    said: ['Renomme-la Soleil Test.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'directional', name: 'Lumière' })
    },
    passed: run => read.kindNamed(run, 'Soleil Test') === 'directional',
  },
  {
    name: '8.3 raises its intensity by 25 percent',
    said: ['Augmente son intensité de 25 %.'],
    setup: async studio => {
      await litScene(studio)
      await studio.run('node.setLightSettings', {
        nodeId: named(studio, 'Soleil Test'),
        intensity: 2,
      })
    },
    passed: run =>
      read.near(read.lightOf(read.nodeNamed(run, 'Soleil Test'))?.intensity ?? 0, 2.5, 0.01),
  },
  {
    name: '8.4 adds a point light above the cube',
    said: ['Ajoute une lumière ponctuelle au-dessus du cube.'],
    setup: litScene,
    passed: run => read.nodesOfKind(run, 'point').length === 1,
  },
  {
    name: '8.5 halves its intensity',
    said: ['Réduis son intensité de moitié.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'point', name: 'Ponctuelle' })
      await studio.run('node.setLightSettings', {
        nodeId: named(studio, 'Ponctuelle'),
        intensity: 4,
      })
    },
    passed: run =>
      read.near(read.lightOf(read.nodeNamed(run, 'Ponctuelle'))?.intensity ?? 0, 2, 0.01),
  },
  {
    name: '8.6 switches Soleil Test off',
    said: ['Désactive Soleil Test.'],
    setup: litScene,
    passed: run => read.nodeNamed(run, 'Soleil Test')?.visible === false,
  },
  {
    name: '8.7 switches Soleil Test back on',
    said: ['Réactive Soleil Test.'],
    setup: async studio => {
      await litScene(studio)
      await studio.run('node.setVisible', { nodeId: named(studio, 'Soleil Test'), visible: false })
    },
    passed: run => read.nodeNamed(run, 'Soleil Test')?.visible === true,
  },

  // ——— 9. Caméras ———
  {
    name: '9.1 adds a camera called Camera Test',
    said: ['Ajoute une nouvelle caméra appelée Camera Test.'],
    setup: cubeScene,
    passed: run => read.kindNamed(run, 'Camera Test') === 'camera',
  },
  {
    name: '9.2 places Camera Test facing the cube',
    said: ['Place Camera Test face au cube.'],
    setup: cameraScene,
    passed: run => read.moved(run, 'Camera Test'),
  },
  {
    name: '9.3 aims Camera Test at Cube Test',
    said: ["Oriente Camera Test pour qu'elle regarde Cube Test."],
    setup: cameraScene,
    // A target is set on a SHOT, so the plan is `camera.addShot` then `camera.aimShotAt` — the model
    // has to find that out, which is the whole of what this scenario measures.
    passed: run => {
      const cube = read.nodeNamed(run, 'Cube Test')
      return cube !== undefined && read.aimsAt(run, cube.id)
    },
  },
  {
    name: '9.4 pulls Camera Test back two metres without losing its target',
    said: ["Éloigne Camera Test de 2 mètres sans changer la cible qu'elle regarde."],
    setup: async studio => {
      await cameraScene(studio)
      const camera = named(studio, 'Camera Test')
      await studio.run('node.transform', { nodeId: camera, positionZ: 5 })
      const shot = await studio.run('camera.addShot', { nodeId: camera })
      await studio.run('camera.aimShotAt', {
        shotId: shot.ok && isRecord(shot.data) ? String(shot.data['shotId']) : '',
        targetId: named(studio, 'Cube Test'),
      })
    },
    passed: run => {
      const camera = read.nodeNamed(run, 'Camera Test')
      return (
        camera !== undefined && read.near(camera.transform.position.z, 7, 0.01) && read.aimsAt(run)
      )
    },
  },
  {
    name: '9.5 makes Camera Test the active camera',
    said: ['Fais de Camera Test la caméra active.'],
    setup: cameraScene,
    // The camera stands there already: what is measured is the call that arms it, not its being.
    passed: run =>
      read.answeredWith(run, 'node.setCameraLens') || read.answeredWith(run, 'camera.addShot'),
  },
  {
    name: '9.6 gives its position and rotation back',
    said: ['Donne-moi maintenant sa position et sa rotation.'],
    setup: cameraScene,
    passed: run => read.spoke(run) && read.answeredWith(run, 'scene.state'),
  },

  // ——— 10. Environnement 3D ———
  {
    name: '10.1 turns the scene grid on',
    said: ['Active la grille de la scène.'],
    // Off first: the studio draws it by default, and a model that read the settings answered
    // « already on » with no call — which was true (2026-09-06).
    setup: cubeSceneWith({ showGrid: false }),
    // No action of its own: the grid is a three setting, so `settings.write` is the road.
    passed: run => read.wrote(run, 'three', 'grid'),
  },
  {
    name: '10.2 uses the first skybox as the environment',
    said: ['Change l’environnement pour utiliser ma première skybox.'],
    setup: cubeScene,
    passed: run => read.world(run)?.environment.kind === 'skybox',
  },
  {
    name: '10.3 lowers the environment intensity to 0.7',
    said: ["Réduis l'intensité de l'environnement à 0,7."],
    setup: cubeScene,
    passed: run => read.near(read.world(run)?.envIntensity ?? 0, 0.7, 0.01),
  },
  {
    name: '10.4 turns the shadows on',
    said: ['Active les ombres.'],
    setup: cubeScene,
    // Per node (`node.setShadowCastAndReceive`) or on the ground, and as a three setting — never a world switch.
    // Not `castShadow`: a fresh mesh and a fresh sun both throw one already.
    passed: run =>
      read.wrote(run, 'three', 'shadow') || read.answeredWith(run, 'node.setShadowCastAndReceive'),
  },
  {
    name: '10.5 puts the shadow quality at its highest',
    said: ['Mets la qualité des ombres au niveau le plus élevé disponible.'],
    // Lowered first: `soft` is both the default and the top of the scale, so the request meant
    // nothing to a model that had read the settings (2026-09-06).
    setup: cubeSceneWith({ shadowQuality: 'hard' }),
    passed: run => read.wrote(run, 'three', 'shadow'),
  },
  {
    name: '10.6 changes the backdrop without touching the lighting',
    said: ["Change l'arrière-plan sans changer l'éclairage de la scène."],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('world.setSceneLighting', {
        kind: 'skybox',
        assetId: 'asset-1',
        intensity: 1,
      })
    },
    passed: run => {
      const world = read.world(run)
      // The backdrop is CHOSEN — a colour or nothing at all, rather than the environment a new
      // scene draws — and the lighting is the one the decor armed, untouched.
      return (
        world !== null &&
        world.background.kind !== 'environment' &&
        world.environment.kind === 'skybox' &&
        world.environment.assetId === 'asset-1'
      )
    },
  },
  {
    name: '10.7 follows a sky DOCUMENT rather than its picture',
    said: ['Éclaire ma scène avec mon ciel Ciel Test.'],
    setup: async studio => {
      // The sky first, so the scene is the document in front when the request lands.
      await opened('skyboxes', 'Ciel Test')(studio)
      await cubeScene(studio)
    },
    // The DOCUMENT and not an asset: a scene naming the picture would read `skybox`, and editing
    // that sky would reach no scene at all — which is what this whole batch is about.
    passed: run => read.world(run)?.environment.kind === 'sky',
  },
  {
    name: '10.8 drives the viewport like Blender',
    said: ['Passe la navigation 3D en schéma Blender.'],
    setup: cubeScene,
    // No action of its own either: the scheme is a `three` setting, so `settings.write` is the
    // road — the same one the grid takes above.
    passed: run => read.wrote(run, 'three', 'navigationPreset'),
  },
  {
    name: '10.9 keeps the selection framed while it moves',
    said: ['Cadre le cube et garde-le dans la vue même s’il bouge.'],
    setup: cubeScene,
    // No action of its own: a follow is a menu COMMAND, so the road is `command.runStudioCommand`
    // — and the oracle reads WHICH command, « any call » passing on a model that framed once.
    passed: run => read.ranStudioCommand(run, 'scene.frameFollow'),
  },

  ...SCENE_ASSET_SCENARIOS,
]
