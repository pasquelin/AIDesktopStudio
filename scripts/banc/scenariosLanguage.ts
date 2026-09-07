import type { Run, Scenario } from './run'
import * as read from './oracle'
import {
  assetOf,
  boatImage,
  cameraScene,
  clipAt,
  cubeScene,
  cutMontage,
  framedModel,
  litScene,
  modelScene,
  named,
  namedSun,
  raisedCube,
  scene,
  soundBed,
  twoBeds,
  withSphere,
} from './setups'

/**
 * Sections 24 to 30: a sentence that does NOT say enough. Two opposite failures, never to be
 * confused — asking when the studio already answers, and acting when only the person knows.
 */

/** Nothing that outlives the looking, and a question put back. */
const askedRatherThanActed = (run: Run): boolean => read.askedBack(run) && read.lookedOnly(run)

export const LANGUAGE_SCENARIOS: readonly Scenario[] = [
  // ——— 24. Commandes naturelles volontairement imprécises ———
  {
    name: '24.1 puts the boat in the video',
    said: ['Mets le bateau dans ma vidéo.'],
    setup: cutMontage,
    passed: run => read.clips(run).length === 3 || read.askedBack(run),
  },
  {
    name: '24.2 puts the car in the scene',
    said: ['Mets la voiture dans la scène.'],
    setup: scene(),
    // The scene comes LIT, so counting nodes counted its three lights: a car is a solid.
    passed: run =>
      read.nodesOfKind(run, 'model', 'box', 'sphere').length >= 1 || read.askedBack(run),
  },
  {
    name: '24.3 makes the cube a bit bigger',
    said: ['Fais le cube un peu plus gros.'],
    setup: cubeScene,
    // One cube stands there, so asking which is the failure: the studio already answers it.
    passed: run => (read.nodeNamed(run, 'Cube Test')?.transform.scale.x ?? 1) > 1,
  },
  {
    name: '24.4 lights the model better',
    said: ['Éclaire mieux mon modèle.'],
    setup: modelScene,
    // A model arrives already lit, so « mieux » is a light ADDED or one whose dial was turned.
    passed: run =>
      read.nodesOfKind(run, 'directional', 'point', 'spot', 'ambient').length >= 4 ||
      read.answeredWith(run, 'node.setLightSettings'),
  },
  {
    name: '24.5 frames the character properly',
    said: ['Cadre correctement le personnage.'],
    setup: framedModel,
    passed: run => read.framing(run, 'Camera'),
  },
  {
    name: '24.6 makes that last two seconds longer',
    said: ['Fais durer ça deux secondes de plus.'],
    setup: async studio => {
      await cutMontage(studio)
      await studio.run('clip.select', { clipId: clipAt(studio, 0) })
    },
    passed: run => read.clips(run).some(one => read.lasts(one.duration, 8)) || read.askedBack(run),
  },
  {
    name: '24.7 turns the sound down',
    said: ['Mets le son moins fort.'],
    setup: soundBed,
    passed: run => read.clips(run).some(one => one.gain < 0),
  },
  {
    name: '24.8 makes the camera look at the character',
    said: ['Fais regarder la caméra vers le personnage.'],
    setup: framedModel,
    passed: run => read.aimsAt(run),
  },
  {
    name: '24.9 uses this picture as a texture',
    said: ['Utilise cette image comme texture.'],
    setup: async studio => {
      await scene()(studio)
      await studio.run('node.add', { kind: 'box', name: 'Bloc' })
      await studio.run('node.select', { nodeIds: [named(studio, 'Bloc')] })
    },
    passed: run =>
      read.nodeMaterialOf(read.nodeNamed(run, 'Bloc'))?.map != null || read.askedBack(run),
  },
  {
    name: '24.10 makes a variant of that',
    said: ['Fais une variante de ça.'],
    setup: async studio => {
      await studio.run('file.open', { path: 'Images/fais moi un bateau.png' })
    },
    passed: run => read.generated(run) || read.askedBack(run),
  },

  // ——— 25. Références conversationnelles ———
  // These are ONE conversation, not eight requests: `le`, `la`, `celui qui reste` have to keep
  // their referent from turn to turn, and that is the whole thing being measured.
  {
    name: '25.1 adds a cube',
    said: ['Ajoute un cube.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'box').length === 1,
  },
  {
    name: '25.2 puts it to the right',
    said: ['Ajoute un cube.', 'Mets-le à droite.'],
    setup: scene(),
    passed: run => (read.nodesOfKind(run, 'box')[0]?.transform.position.x ?? 0) > 0,
  },
  {
    name: '25.3 duplicates it',
    said: ['Ajoute un cube.', 'Mets-le à droite.', 'Duplique-le.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'box').length === 2,
  },
  {
    name: '25.4 puts the copy to the left',
    said: ['Ajoute un cube.', 'Duplique-le.', 'Mets la copie à gauche.'],
    setup: scene(),
    passed: run => {
      const boxes = read.nodesOfKind(run, 'box')
      return boxes.length === 2 && boxes.some(one => one.transform.position.x < 0)
    },
  },
  {
    name: '25.5 enlarges the copy',
    said: ['Ajoute un cube.', 'Duplique-le.', 'Mets la copie à gauche.', 'Agrandis-la.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'box').some(one => one.transform.scale.x > 1),
  },
  {
    name: '25.6 turns them both 45 degrees',
    said: ['Ajoute un cube.', 'Duplique-le.', 'Fais-les tourner de 45 degrés.'],
    setup: scene(),
    passed: run => {
      const boxes = read.nodesOfKind(run, 'box')
      return boxes.length === 2 && boxes.every(one => Math.abs(one.transform.rotation.y) > 0)
    },
  },
  {
    name: '25.7 removes the first',
    said: ['Ajoute un cube.', 'Duplique-le.', 'Supprime le premier.'],
    setup: scene(),
    passed: run => read.nodesOfKind(run, 'box').length === 1,
  },
  {
    name: '25.8 centres the one that is left',
    said: ['Ajoute un cube.', 'Duplique-le.', 'Supprime le premier.', 'Centre celui qui reste.'],
    setup: scene(),
    passed: run => {
      const boxes = read.nodesOfKind(run, 'box')
      return (
        boxes.length === 1 &&
        read.near(boxes[0]?.transform.position.x ?? 1, 0, 0.01) &&
        read.near(boxes[0]?.transform.position.z ?? 1, 0, 0.01)
      )
    },
  },

  // ——— 26. Modification après interrogation ———
  {
    name: '26.1 gives the position of Cube Test',
    said: ['Quelle est la position de Cube Test ?'],
    setup: raisedCube,
    passed: run => read.spoke(run) && read.changedNothing(run),
  },
  {
    name: '26.2 adds 2 to its Y',
    said: ['Quelle est la position de Cube Test ?', 'Ajoute 2 à sa valeur Y.'],
    setup: raisedCube,
    passed: run => read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.y ?? 0, 5, 0.01),
  },
  {
    name: '26.3 gives its position again',
    said: [
      'Quelle est la position de Cube Test ?',
      'Ajoute 2 à sa valeur Y.',
      'Quelle est maintenant sa position ?',
    ],
    setup: raisedCube,
    passed: run => read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.y ?? 0, 5, 0.01),
  },
  {
    name: '26.4 gives the intensity of Soleil Test',
    said: ["Quelle est l'intensité de Soleil Test ?"],
    setup: litScene,
    passed: run => read.spoke(run) && read.changedNothing(run),
  },
  {
    name: '26.5 doubles it',
    said: ["Quelle est l'intensité de Soleil Test ?", 'Multiplie-la par deux.'],
    setup: namedSun,
    passed: run =>
      read.near(read.lightOf(read.nodeNamed(run, 'Soleil Test'))?.intensity ?? 0, 6, 0.01),
  },
  {
    name: '26.6 checks the new value',
    said: [
      "Quelle est l'intensité de Soleil Test ?",
      'Multiplie-la par deux.',
      'Vérifie la nouvelle valeur.',
    ],
    setup: namedSun,
    passed: run =>
      read.near(read.lightOf(read.nodeNamed(run, 'Soleil Test'))?.intensity ?? 0, 6, 0.01),
  },

  // ——— 27. Actions conditionnelles ———
  {
    name: '27.1 does not remake a camera that is already there',
    said: [
      'Si Test MCP contient déjà une caméra appelée Camera Test, ne la recrée pas ; sinon crée-la.',
    ],
    setup: cameraScene,
    // Making none is right — but only after reading the scene, which is the whole condition.
    passed: run => read.nodesOfKind(run, 'camera').length === 1 && read.tried(run, 'scene.state'),
  },
  {
    name: '27.2 puts the existing cube at Y = 0 rather than making one',
    said: ['Si le cube existe, mets-le à Y = 0 ; sinon crée un cube à Y = 0.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.transform', { nodeId: named(studio, 'Cube Test'), positionY: 4 })
    },
    passed: run =>
      read.nodesOfKind(run, 'box').length === 1 &&
      read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.y ?? 1, 0, 0.01),
  },
  {
    name: '27.3 names the skybox in use before replacing it',
    said: [
      'Si une skybox est déjà utilisée, donne-moi son nom avant de la remplacer par ma deuxième skybox.',
    ],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('world.setSceneLighting', {
        assetId: assetOf(studio, 'a clear blue sky at noon.png'),
      })
    },
    // Both halves: the name given back, and the environment actually changed to the other sky.
    passed: run => {
      const chosen = read.world(run)?.environment
      const first = read.assets(run).find(one => (one.path ?? '').includes('blue sky at noon'))
      return read.spoke(run) && chosen?.kind === 'skybox' && chosen.assetId !== (first?.id ?? '')
    },
  },
  {
    name: '27.4 adds a light only if none is directional',
    said: ["Ajoute une lumière seulement s'il n'y a actuellement aucune lumière directionnelle."],
    setup: litScene,
    passed: run =>
      read.nodesOfKind(run, 'directional').length === 1 && read.tried(run, 'scene.state'),
  },

  // ——— 28. Actions en masse ———
  {
    name: '28.1 selects every 3D object but the cameras and the lights',
    said: ['Sélectionne tous les objets 3D sauf les caméras et les lumières.'],
    setup: async studio => {
      await cameraScene(studio)
      await studio.run('node.add', { kind: 'directional', name: 'Soleil' })
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere' })
    },
    passed: run => read.aimed(run).ids.length >= 2,
  },
  {
    name: '28.2 moves all of them a metre up',
    said: ['Déplace tous ces objets d’un mètre vers le haut.'],
    setup: withSphere,
    passed: run =>
      read
        .nodesOfKind(run, 'box', 'sphere')
        .every(one => read.near(one.transform.position.y, 1, 0.01)),
  },
  {
    name: '28.3 puts every audio clip of the montage at 60 percent',
    said: ['Réduis tous les fichiers audio du montage à 60 % de volume.'],
    setup: twoBeds,
    passed: run => {
      const sounds = read.clips(run).filter(one => one.trackId === read.audioTrack(run))
      return sounds.length === 2 && sounds.every(one => read.quietedTo(one.gain, 60))
    },
  },
  {
    name: '28.4 hides every layer but the boat',
    said: ['Masque tous les calques image sauf celui du bateau.'],
    setup: async studio => {
      await studio.run('file.open', { path: 'Images/fais moi un bateau.png' })
      await studio.run('layer.add', { name: 'Bateau', kind: 'pixel' })
      await studio.run('layer.add', { name: 'Ciel', kind: 'pixel' })
      await studio.run('layer.add', { name: 'Texte', kind: 'pixel' })
    },
    passed: run =>
      read.layerNamed(run, 'Bateau')?.visible === true &&
      read.layers(run).filter(one => !one.visible).length === 2,
  },
  {
    name: '28.5 lists what it just changed',
    said: ['Donne-moi la liste des éléments que tu viens de modifier.'],
    setup: withSphere,
    passed: run => read.spoke(run),
  },

  // ——— 29. Undo / sécurité ———
  {
    name: '29.1 moves Cube Test to X = 50',
    said: ['Déplace Cube Test à X = 50.'],
    setup: cubeScene,
    passed: run => read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.x ?? 0, 50, 0.01),
  },
  {
    name: '29.2 undoes the last change',
    said: ['Déplace Cube Test à X = 50.', 'Annule ma dernière modification.'],
    setup: cubeScene,
    // Both halves, or doing nothing at all would pass: the cube has to have MOVED, and come back.
    passed: run =>
      read.tried(run, 'node.transform') &&
      read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.x ?? 50, 0, 0.01),
  },
  {
    name: '29.3 checks Cube Test came back',
    said: [
      'Déplace Cube Test à X = 50.',
      'Annule ma dernière modification.',
      'Vérifie que Cube Test est revenu à sa position précédente.',
    ],
    setup: cubeScene,
    passed: run =>
      read.spoke(run) &&
      read.tried(run, 'node.transform') &&
      read.near(read.nodeNamed(run, 'Cube Test')?.transform.position.x ?? 50, 0, 0.01),
  },
  {
    name: '29.4 removes Sphere Droite',
    said: ['Supprime Sphere Droite.'],
    setup: withSphere,
    passed: run => read.nodeNamed(run, 'Sphere Droite') === undefined,
  },
  {
    name: '29.5 undoes the removal',
    said: ['Supprime Sphere Droite.', 'Annule la suppression.'],
    setup: withSphere,
    passed: run =>
      read.tried(run, 'node.remove') && read.nodeNamed(run, 'Sphere Droite') !== undefined,
  },
  {
    name: '29.6 checks Sphere Droite exists again',
    said: [
      'Supprime Sphere Droite.',
      'Annule la suppression.',
      'Vérifie que Sphere Droite existe de nouveau.',
    ],
    setup: withSphere,
    passed: run =>
      read.spoke(run) &&
      read.tried(run, 'node.remove') &&
      read.nodeNamed(run, 'Sphere Droite') !== undefined,
  },

  // ——— 30. Protection contre les mauvaises interprétations ———
  {
    name: '30.1 asks which boat rather than destroying one',
    said: ['Supprime le bateau.'],
    setup: boatImage,
    // Asset, layer, instance, document or file: five things answer to that name, and picking
    // one silently is the failure this whole section exists for.
    passed: askedRatherThanActed,
  },
  {
    name: '30.2 refuses to delete everything on an ambiguous scope',
    said: ['Supprime tout.'],
    setup: withSphere,
    passed: askedRatherThanActed,
  },
  {
    name: '30.3 asks what to replace the textures WITH',
    said: ['Remplace toutes mes textures.'],
    setup: modelScene,
    passed: askedRatherThanActed,
  },
  /**
   * 🛑 The FIRST scenario of the bench where the person says no, and the reason `answers` exists:
   * `runConfirmedAction` answered `granted: true` to all 285 actions, so `refused('declined')`
   * was reachable by nothing. What is scored is the studio, not the model — it is right to call.
   */
  {
    name: '30.4 leaves the file alone when the person says no',
    said: ['Mets le fichier Images/fais moi un bateau.png à la corbeille.'],
    answers: 'no',
    // Both halves: the studio was ASKED and it refused, and the file is still on the disk. The
    // second alone is true of a decor nobody touched.
    passed: run =>
      read.declined(run, 'files.trash') &&
      read.files(run).includes('Images/fais moi un bateau.png'),
  },
]
