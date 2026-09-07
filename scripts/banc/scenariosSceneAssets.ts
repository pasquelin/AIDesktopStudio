import type { Run, Scenario } from './run'
import * as read from './oracle'
import {
  blockScene,
  cameraScene,
  cubeScene,
  modelScene,
  modelSceneWithMaterial,
  named,
  scene,
  withSphere,
} from './setups'

const at = (run: Run, name: string, axis: 'x' | 'y' | 'z', wanted: number): boolean => {
  const node = read.nodeNamed(run, name)
  return node !== undefined && read.near(node.transform.position[axis], wanted, 0.01)
}

export const SCENE_ASSET_SCENARIOS: readonly Scenario[] = [
  // ——— 11. Import d'assets dans une scène ———
  {
    name: '11.1 adds the first 3D model to Test MCP',
    said: ['Ajoute mon premier modèle 3D dans Test MCP.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'model').length === 1,
  },
  {
    name: '11.2 places it at the centre',
    said: ['Place-le au centre de la scène.'],
    setup: async studio => {
      await modelScene(studio)
      await studio.run('node.transform', { nodeId: named(studio, 'Knight'), positionX: 4 })
    },
    passed: run => at(run, 'Knight', 'x', 0),
  },
  {
    name: '11.3 scales it so it reads properly',
    said: ['Adapte automatiquement sa taille pour qu’il soit visible correctement.'],
    setup: modelScene,
    passed: run => (read.nodeNamed(run, 'Knight')?.transform.scale.x ?? 1) !== 1,
  },
  {
    name: '11.4 frames that model with Camera Test',
    said: ['Place Camera Test pour cadrer entièrement ce modèle.'],
    setup: async studio => {
      await modelScene(studio)
      await studio.run('node.add', { kind: 'camera', name: 'Camera Test' })
    },
    passed: run => read.framing(run, 'Camera Test'),
  },
  {
    name: '11.5 adds a second instance of the same model to its right',
    said: ['Ajoute une deuxième instance du même modèle à sa droite.'],
    setup: modelScene,
    passed: run => read.nodesOfKind(run, 'model').length === 2,
  },

  // ——— 12. Matières et matériaux d'un modèle ———
  {
    name: '12.1 selects the model just added and names its materials',
    said: ['Sélectionne le modèle 3D que nous venons d’ajouter et donne-moi ses matériaux.'],
    setup: modelScene,
    passed: run => read.spoke(run),
  },
  {
    name: '12.2 turns its first material red',
    said: ['Change la couleur de base de son premier matériau en rouge.'],
    setup: blockScene,
    passed: run => read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.color !== null,
  },
  {
    name: '12.3 puts its roughness at 0.25',
    said: ['Mets sa rugosité à 0,25.'],
    setup: blockScene,
    passed: run =>
      read.near(read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.roughness ?? 1, 0.25),
  },
  {
    name: '12.4 puts its metalness at 0.8',
    said: ['Mets son métal à 0,8.'],
    setup: blockScene,
    passed: run => read.near(read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.metalness ?? 0, 0.8),
  },
  {
    name: '12.5 assigns a project texture to its base colour',
    said: ['Assigne une texture de mon projet à sa couleur de base.'],
    setup: blockScene,
    passed: run => read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.map != null,
  },
  {
    name: '12.6 adds a normal map if a compatible texture exists',
    said: ['Ajoute une normal map si une texture compatible existe dans le projet.'],
    setup: blockScene,
    passed: run => read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.normalMap != null,
  },
  {
    name: '12.7 puts the material back as it was',
    said: ['Remets le matériau dans son état précédent.'],
    setup: async studio => {
      await blockScene(studio)
      await studio.run('node.setMeshMaterial', { nodeId: named(studio, 'Bloc'), color: '#ff0000' })
    },
    passed: run => read.spoke(run),
  },
  {
    /**
     * An imported model, NOT a primitive: it WEARS a material document rather than holding a
     * finish of its own, so editing that material reaches it — which is what the reference is
     * for. `node.setMeshMaterial` still refuses a model.
     */
    name: '12.8 dresses an imported model in a material of the project',
    said: ['Habille ce modèle importé avec la matière nommée Pierre.'],
    setup: modelSceneWithMaterial,
    passed: run => read.modelWears(run, 'Knight') !== null,
  },
  {
    /**
     * The SECOND slot, which is what a model with several materials needs — a car has a body, a
     * glass and a set of tyres. The first must stay empty, or the request was read as « dress it »
     * and the slot went unheard.
     */
    name: '12.9 dresses the second material slot of an imported model',
    said: ['Mets la matière Pierre sur son deuxième emplacement de matière.'],
    setup: modelSceneWithMaterial,
    passed: run =>
      read.modelWears(run, 'Knight', 1) !== null && read.modelWears(run, 'Knight') === null,
  },
  {
    /**
     * The simple mode, and its exclusivity: a model covered by a picture wears NO material, so a
     * pass that only checks the picture would score a model dressed both ways at once.
     */
    name: '12.10 covers an imported model with one picture instead of a material',
    said: ["Recouvre plutôt ce modèle de l'image de planches de chêne, sans matière."],
    setup: modelSceneWithMaterial,
    passed: run =>
      read.modelCoveredBy(run, 'Knight') !== null && read.modelWears(run, 'Knight') === null,
  },

  {
    /**
     * The arm both dressing tools share, and the one no phrase reached: an empty name takes the
     * WHOLE dress off rather than falling back on the other mode.
     */
    name: '12.11 takes the dress off an imported model',
    said: ["Finalement retire-lui son habillage : qu'il reprenne celui de son propre fichier."],
    setup: async studio => {
      await modelSceneWithMaterial(studio)
      await studio.run('model.setMaterialDocument', {
        nodeId: named(studio, 'Knight'),
        material: 'Pierre',
      })
    },
    passed: run =>
      read.modelWears(run, 'Knight') === null && read.modelCoveredBy(run, 'Knight') === null,
  },

  // ——— 13. Timeline 3D ———
  {
    name: '13.1 sets the scene duration to 10 seconds',
    said: ['Mets la durée de la scène à 10 secondes.'],
    setup: cubeScene,
    passed: run => read.lasts(read.sceneLasts(run), 10),
  },
  {
    name: '13.2 animates Cube Test five metres up between 0 and 5 seconds',
    said: [
      'Anime Cube Test pour qu’il parte de sa position actuelle à 0 seconde et arrive 5 mètres plus haut à 5 secondes.',
    ],
    setup: cubeScene,
    // A key holds the pose the node WEARS, so two keys at the same height are an animation of
    // nothing: the second one has to sit five metres above the first.
    passed: run => {
      const at = (when: number) => read.keys(run).find(one => read.near(one.time, when))
      const start = at(0)
      const end = at(5)
      return (
        start !== undefined && end !== undefined && read.near(end.value.y - start.value.y, 5, 0.01)
      )
    },
  },
  {
    name: '13.3 brings it back to its first position at 10 seconds',
    said: ['À 10 secondes, fais-le revenir à sa position initiale.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('key.writePoseKeys', { nodeId: named(studio, 'Cube Test'), timeSeconds: 0 })
    },
    passed: run => {
      const back = read.keys(run).find(one => read.lasts(one.time, 10))
      return back !== undefined && read.near(back.value.y, 0, 0.01)
    },
  },
  {
    name: '13.4 adds a full turn of the cube between 0 and 10 seconds',
    said: ['Ajoute une rotation complète du cube entre 0 et 10 secondes.'],
    setup: cubeScene,
    passed: run => read.keys(run).some(one => one.channel.endsWith('rotation')),
  },
  {
    name: '13.5 starts the Sphere Droite animation at 2 seconds',
    said: ["Fais commencer l'animation de Sphere Droite à 2 secondes."],
    setup: withSphere,
    passed: run => read.keys(run).some(one => read.near(one.time, 2)),
  },
  {
    name: '13.6 removes only the rotation animation of the cube',
    said: [
      "Supprime uniquement l'animation de rotation du cube sans supprimer son animation de position.",
    ],
    // The decor has to hold BOTH, or « uniquement la rotation » sorts nothing and doing
    // nothing passes.
    setup: async studio => {
      await cubeScene(studio)
      const cube = named(studio, 'Cube Test')
      await studio.run('key.writePoseKeys', { nodeId: cube, timeSeconds: 0, property: 'position' })
      await studio.run('node.transform', { nodeId: cube, positionY: 5 })
      await studio.run('key.writePoseKeys', { nodeId: cube, timeSeconds: 5, property: 'position' })
      await studio.run('node.transform', { nodeId: cube, rotationY: read.radians(360) })
      await studio.run('key.writePoseKeys', { nodeId: cube, timeSeconds: 5, property: 'rotation' })
    },
    passed: run =>
      read.keys(run).some(one => one.channel.endsWith('position')) &&
      !read.keys(run).some(one => one.channel.endsWith('rotation')),
  },

  // ——— 14. Animation de caméra ———
  {
    name: '14.1 moves Camera Test towards the cube between 0 and 5 seconds',
    said: [
      'Anime Camera Test pour qu’elle se rapproche progressivement du cube entre 0 et 5 secondes.',
    ],
    setup: cameraScene,
    passed: run => read.keys(run).some(one => read.lasts(one.time, 5)),
  },
  {
    name: '14.2 keeps the camera aimed at Cube Test while it moves',
    said: ['Pendant son déplacement, garde la caméra orientée vers Cube Test.'],
    setup: cameraScene,
    passed: run => read.aimsAt(run),
  },
  {
    name: '14.3 orbits the camera round the cube between 5 and 10 seconds',
    said: ['Entre 5 et 10 secondes, fais tourner la caméra autour du cube.'],
    setup: cameraScene,
    passed: run => read.keys(run).some(one => one.time >= 5 * read.SECOND),
  },
  {
    name: '14.4 checks the camera never loses Cube Test from view',
    said: ["Vérifie qu'à aucun moment la caméra ne perd Cube Test de vue."],
    setup: async studio => {
      await cameraScene(studio)
      const camera = named(studio, 'Camera Test')
      await studio.run('camera.addShot', { nodeId: camera })
    },
    passed: run => read.spoke(run) && read.answeredWith(run, 'scene.state'),
  },
]
