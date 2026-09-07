import type { Studio } from './studio'
import type { Scenario } from './run'
import { REST_ANIMATION_SCENARIOS } from './scenariosRestAnimation'
import { EXPORT_FORMATS } from '@shared/domain/scene'
import * as read from './oracle'
import {
  cubeScene,
  generating,
  indexing,
  madeCar,
  named,
  overlay,
  scene,
  shelved,
  testFolders,
} from './setups'
import { WHEN } from './project'

/** Sections 41 to 57 — the studio around the documents, and the machine around the studio. */

/** A scene with a path node in it — every `path.*` call refuses on anything else. */
const pathScene = async (studio: Studio): Promise<void> => {
  await cubeScene(studio)
  await studio.run('node.add', { kind: 'path', name: 'Chemin' })
}

/** Two projects on the shelf and none open — the decor the forget/trash pair is scored on. */
const twoShelved = async (studio: Studio): Promise<void> => {
  await studio.run('project.close', {})
  shelved([
    { path: '/projets/Voilier', openedAt: WHEN, createdAt: WHEN },
    { path: '/projets/Démo', openedAt: WHEN, createdAt: WHEN },
  ])
}

/** The row named by both sentences is off the shelf, and the other one is still on it. */
const rowGone = (): boolean =>
  !read.shelvedPaths().includes('/projets/Voilier') && read.shelvedPaths().includes('/projets/Démo')

export const REST_SCENARIOS: readonly Scenario[] = [
  {
    name: '41.1 opens the Scène 1 document of the documents folder',
    said: ['Ouvre le document Scène 1 qui est dans mon dossier documents.'],
    passed: run => read.openedFile(run, 'Scène 1.gltf'),
  },
  {
    name: '41.2 renames the open document Scène Finale',
    said: ['Renomme ce document Scène Finale.'],
    setup: scene('Scène 1'),
    passed: run => read.titled(run, 'Scène Finale') !== undefined,
  },
  {
    name: '41.3 saves the open document',
    said: ['Enregistre le document ouvert.'],
    // 🛑 Read on the CALL and not on `modified`: `settle()` clears that flag before the person
    // speaks, so a model doing nothing at all would have passed.
    setup: cubeScene,
    passed: run => read.answeredWith(run, 'document.save'),
  },
  {
    name: '41.4 closes Scène Finale and deletes its file',
    said: ['Ferme Scène Finale et supprime son fichier du projet.'],
    setup: async studio => {
      await studio.run('file.open', { path: 'Modelling/Scenes/Scène 1.gltf' })
      await studio.run('document.rename', {
        documentId: studio.front()?.id ?? '',
        title: 'Scène Finale',
      })
    },
    passed: run =>
      read.titled(run, 'Scène Finale') === undefined &&
      !read.holds(run, 'Modelling/Scenes/Scène 1.gltf'),
  },
  {
    name: '41.5 exports the open scene into the documents folder',
    said: ['Exporte la scène ouverte dans mon dossier documents.'],
    setup: scene('Export Test'),
    /**
     * 🛑 Anywhere but the scenes folder: `Modelling/Scenes/Export Test.gltf` is what a SAVE
     * writes, and an oracle reading that scores a save as an export. Every format of
     * `EXPORT_FORMATS`, since the sentence names none.
     */
    passed: run =>
      read
        .files(run)
        .some(
          one =>
            !one.startsWith('Modelling/Scenes/') &&
            EXPORT_FORMATS.some(format => one.endsWith(`Export Test.${format}`)),
        ),
  },
  {
    name: '41.6 makes a project called Démo Assistant',
    said: ['Crée un nouveau projet appelé Démo Assistant.'],
    passed: run => run.studio.projectName().includes('Démo Assistant'),
  },
  {
    name: '41.7 reopens the Démo project',
    said: ['Rouvre mon projet Démo.'],
    // Renamed away first, or « rouvre Démo » lands on the project already open and doing
    // nothing passes.
    setup: async studio => {
      await studio.run('project.open', { path: '/projets/Autre' })
    },
    passed: run => run.studio.projectName() === 'Démo',
  },
  {
    name: '41.8 renames the project Démo Assistant',
    said: ['Renomme mon projet Démo Assistant.'],
    passed: run => run.studio.projectName().includes('Démo Assistant'),
  },
  {
    name: '41.9 closes the open project',
    said: ['Ferme le projet ouvert.'],
    // The decor holds one open, so the empty name is the model's doing and not the bench's.
    passed: run => run.studio.projectName() === '',
  },
  {
    // 🛑 The gesture the `ask` key was built for, end to end: no name until the person gives one,
    // so the model must STOP, ask, and build on the answer.
    name: '41.10 asks what to call the project it was told to create',
    said: ['Crée un nouveau projet.'],
    // Closed first, so the name read below is one the MODEL obtained — and never the answer the
    // stand-in gave, which is `choices[0]` for a model that asked with buttons.
    setup: async studio => {
      await studio.run('project.close', {})
    },
    passed: run => read.asked(run) && run.studio.projectName() !== '',
  },
  {
    // 🛑 The gesture that had NO answer at all before `projects.list`: the path is nowhere in the
    // sentence, so the model must LIST to learn one — see `fileActions.ts` for the measure.
    name: '41.11 opens a recent project it had to list first',
    said: ['Ouvre un projet récent.'],
    // Sown after the close, so the shelf holds one row and one only — the close writes the
    // settings on its way out, and the bench's port now merges it as the main process does.
    setup: async studio => {
      await studio.run('project.close', {})
      shelved([{ path: '/projets/Voilier', openedAt: WHEN, createdAt: WHEN }])
    },
    passed: run =>
      read.answeredWith(run, 'projects.list') && run.studio.projectName() === 'Voilier',
  },

  {
    // 🛑 The gesture the model INVENTED a reason for: with no `project.forget` to reach, it
    // answered that Voilier was not on the shelf — it was, on screen.
    name: '41.12 drops a project from the recent ones without touching its folder',
    said: ['Retire le projet Voilier de mes projets récents.'],
    setup: twoShelved,
    passed: run => rowGone() && read.trashedProjects(run).length === 0,
  },
  {
    // The same decor, scored on the FOLDER: a model that merely forgot the row would pass a case
    // that only read the shelf, and the pair exists to tell those two apart.
    name: '41.13 puts a project folder in the trash',
    said: ['Mets le projet Voilier à la corbeille.'],
    setup: twoShelved,
    passed: run => rowGone() && read.trashedProjects(run).includes('/projets/Voilier'),
  },

  {
    name: '42.1 copies the boat picture into Materials without moving it',
    said: ["Copie l'image du bateau dans mon dossier Materials sans la déplacer."],
    passed: run =>
      read.holds(run, 'Materials/fais moi un bateau.png') &&
      read.holds(run, 'Images/fais moi un bateau.png'),
  },
  {
    name: '42.2 gives the history of the last file operations',
    said: ['Montre-moi l’historique de mes dernières opérations sur les fichiers.'],
    setup: testFolders,
    passed: run => read.spoke(run) && read.answeredWith(run, 'files.canUndoRedo'),
  },
  {
    name: '42.3 says what was opened recently',
    said: ["Qu'est-ce que j'ai ouvert récemment dans ce projet ?"],
    passed: run => read.idle(run) && read.answeredWith(run, 'activity.recent'),
  },
  {
    name: '42.4 redoes what was just undone',
    said: ["Refais l'opération que je viens d'annuler."],
    /**
     * 🛑 A MOVE, never a creation: taking a `folder.new` back sends the folder to the trash, and
     * `inverseOf` answers `null` for a trash — « undo deliberately stops at the trash », says
     * `filePlan.ts`. Redoing one is a thing the studio does not do, so no model could win it.
     */
    setup: async studio => {
      await studio.run('files.move', {
        paths: ['Images/fais moi un bateau.png'],
        folder: 'Materials',
      })
      await studio.run('files.undoFileOperation', {})
    },
    passed: run => read.holds(run, 'Materials/fais moi un bateau.png'),
  },

  {
    name: '42.5 shows the boat picture in the Finder',
    said: ["Montre-moi l'image du bateau dans le Finder."],
    passed: run => run.studio.shell.revealed().some(one => one.includes('bateau')),
  },
  {
    name: '42.6 opens the information card of the boat picture',
    said: ["Ouvre la fiche d'informations de l'image du bateau."],
    passed: run => run.studio.shell.described().some(one => one.includes('bateau')),
  },

  {
    name: '43.1 gives what it holds on the boat picture',
    said: ["Donne-moi les informations que tu as sur l'image du bateau."],
    passed: run => read.idle(run) && read.answeredWith(run, 'asset.get'),
  },
  {
    name: '43.2 removes the generated picture from the library',
    said: ["Supprime de ma bibliothèque l'image que tu viens de générer."],
    setup: madeCar,
    passed: run => read.assets(run).every(one => one.jobId === undefined),
  },
  {
    name: '43.3 says whether any asset lost its file',
    said: ['Y a-t-il des assets de ma bibliothèque dont le fichier a disparu ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'assets.listMissing'),
  },
  {
    name: '43.4 describes the boat picture and files it under keywords',
    said: ["Décris-moi ce que représente l'image du bateau et range-la avec des mots-clés."],
    passed: run => read.assets(run).some(one => one.tags.length > 0),
  },
  {
    name: '43.5 shows that asset file on the disk',
    said: ["Montre-moi le fichier de l'image du bateau sur mon disque."],
    passed: run => run.studio.shell.revealed().length > 0,
  },
  {
    name: '43.6 says whether the account is connected',
    said: ['Suis-je connecté à mon compte Scenario ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'auth.state'),
  },
  {
    name: '43.7 says how many credits are left',
    said: ['Combien de crédits me reste-t-il ce mois-ci ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'usage.report'),
  },

  {
    name: '43.8 names the accounts on record',
    said: ['Quels comptes ai-je enregistrés ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'accounts.list'),
  },
  {
    name: '43.9 switches to the second account',
    said: ['Bascule sur mon deuxième compte.'],
    passed: run => run.studio.shell.accounts()[1]?.active === true,
  },
  {
    name: '43.10 renames that account Studio Perso',
    said: ['Renomme ce compte Studio Perso.'],
    passed: run => run.studio.shell.accounts().some(one => one.name === 'Studio Perso'),
  },
  {
    name: '43.11 reads local AI models before choosing one',
    said: ['Quels modèles IA locaux sont installés et lequel peut servir l’assistant ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'ai.localState'),
  },
  {
    name: '43.12 checks what the local AI engine needs',
    said: ['Vérifie si le moteur local de mouvement est prêt et ce qui lui manque.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'ai.manageLocalRuntime'),
  },

  {
    name: '44.1 says where the generations stand',
    said: ['Où en sont mes générations ?'],
    setup: madeCar,
    passed: run => read.idle(run) && read.answeredWith(run, 'jobs.list'),
  },
  {
    name: '44.2 gives the result of the last generation',
    said: ['Donne-moi le résultat de ma dernière génération.'],
    setup: madeCar,
    passed: run => read.idle(run) && read.answeredWith(run, 'job.readCloudGeneration'),
  },
  {
    name: '44.3 cancels the generation under way',
    said: ['Annule la génération en cours.'],
    setup: generating,
    passed: run => read.jobs(run).some(one => one.status === 'cancelled'),
  },
  {
    name: '44.4 stops the indexing task that is running',
    said: ["Arrête la tâche d'indexation qui tourne."],
    setup: indexing,
    passed: run => read.answeredWith(run, 'task.cancelLocalTask'),
  },
  {
    name: '44.5 names the settings the armed image model accepts',
    said: ["Quels réglages accepte le modèle image que j'ai armé ?"],
    passed: run => read.idle(run) && read.answeredWith(run, 'models.readGenerationModelFields'),
  },
  {
    name: '44.6 estimates what a generation would cost before it runs',
    said: ['Combien me coûterait cette génération avant que je la lance ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'cost.estimate'),
  },

  {
    name: '45.1 opens the preferences through the menu command',
    said: ['Ouvre les préférences par le menu, comme si je cliquais dessus.'],
    passed: run =>
      read.answeredWith(run, 'command.runStudioCommand') || run.studio.shell.settingsOpen(),
  },
  {
    name: '45.2 says what it can do about layers',
    said: ['De quoi es-tu capable au sujet des calques ?'],
    passed: run => read.spoke(run) && read.answeredWith(run, 'actions.find'),
  },
  {
    name: '45.3 closes the chat window',
    said: ['Ferme la fenêtre de discussion.'],
    passed: run => read.answeredWith(run, 'chat.close'),
  },
  {
    name: '45.4 takes the Bateau layer as the target of what follows',
    said: ['Prends le calque Bateau comme cible de mes prochaines demandes.'],
    setup: overlay,
    // The named one, for the reason 39.3 gives: a picture always has an active layer.
    passed: run => read.aimed(run).ids[0] === read.layerNamed(run, 'Bateau')?.id,
  },

  {
    name: '45.5 suggests three prompts for a harbour at sunset',
    said: ['Propose-moi trois prompts pour générer un port au coucher du soleil.'],
    passed: run => read.spoke(run) && read.answeredWith(run, 'prompt.suggest'),
  },
  {
    name: '45.6 translates the prompt before it runs',
    said: [
      'Traduis ce prompt en anglais avant de le lancer : un bateau en bois sur une mer calme.',
    ],
    passed: run => read.spoke(run) && read.answeredWith(run, 'prompt.translate'),
  },
  {
    name: '45.7 describes the style of the boat picture as a reusable prompt',
    said: ['Décris-moi le style de mon image du bateau, en une phrase réutilisable comme prompt.'],
    passed: run => read.spoke(run) && read.answeredWith(run, 'prompt.describeStyle'),
  },
  {
    // 🛑 The QUESTION, and that NOTHING ran beside it: written into a `say`, the studio carried
    // on regardless — see `41.10`, which measures the same rule on a request with no name.
    name: '45.8 asks which space to work in, offering the three',
    said: ['Demande-moi dans quel espace travailler, en me proposant Image, Vidéo ou Audio.'],
    passed: run => read.asked(run) && read.changedNothing(run),
  },

  {
    name: '46.1 turns the cube into a cylinder',
    said: ['Change le cube en cylindre.'],
    setup: cubeScene,
    /**
     * 🛑 A cylinder WHERE the cube was, under any name: nothing in the studio changes the shape of
     * an object — the inspector edits a geometry's measurements and never its kind — so the
     * gesture is a removal and an addition, and what replaces it is not called « Cube Test ».
     */
    passed: run =>
      read.nodesOfKind(run, 'cylinder').length === 1 && read.nodesOfKind(run, 'box').length === 0,
  },
  {
    name: '46.2 adds a billboard carrying the boat picture',
    said: [
      'Ajoute un panneau plat qui porte l’image du bateau et qui fait toujours face à la caméra.',
    ],
    setup: cubeScene,
    // Two calls, and the second is the point: adding the sprite, then giving it its picture.
    passed: run => read.nodesOfKind(run, 'sprite').some(one => read.spriteOf(one)?.map != null),
  },
  {
    name: '46.3 adds a 3D text reading Studio above the cube',
    said: ['Ajoute un texte 3D qui dit Studio au-dessus du cube.'],
    setup: cubeScene,
    passed: run => read.nodes(run).some(one => read.wordsOf(one)?.value === 'Studio'),
  },
  {
    name: '46.4 traces a closed path from the cube to the right',
    said: ['Trace un chemin fermé qui part du cube et va vers la droite.'],
    setup: cubeScene,
    // Closed, and not merely there: adding the node is `node.add`'s doing, and the request says
    // « fermé », which is the only part `node.setPathShape` answers.
    passed: run => read.nodesOfKind(run, 'path').some(one => read.pathOf(one)?.closed === true),
  },
  {
    name: '46.5 adds a point two metres further along that path',
    said: ['Ajoute un point à ce chemin, deux mètres plus loin.'],
    setup: pathScene,
    passed: run =>
      // A fresh rail is born with two points, so a third is what « ajoute un point » leaves.
      (read.pathOf(read.nodeNamed(run, 'Chemin'))?.points.length ?? 0) >= 3,
  },
  {
    name: '46.6 moves the second point of the path a metre up',
    said: ['Déplace le deuxième point du chemin d’un mètre vers le haut.'],
    setup: async studio => {
      await pathScene(studio)
      await studio.run('path.addPoint', {
        nodeId: named(studio, 'Chemin'),
        pointX: 0,
        pointY: 0,
        pointZ: 0,
      })
      await studio.run('path.addPoint', {
        nodeId: named(studio, 'Chemin'),
        pointX: 2,
        pointY: 0,
        pointZ: 0,
      })
    },
    passed: run => (read.pathOf(read.nodeNamed(run, 'Chemin'))?.points[1]?.y ?? 0) !== 0,
  },
  {
    name: '46.7 removes the last point of the path',
    said: ['Supprime le dernier point du chemin.'],
    setup: async studio => {
      await pathScene(studio)
      await studio.run('path.addPoint', {
        nodeId: named(studio, 'Chemin'),
        pointX: 0,
        pointY: 0,
        pointZ: 0,
      })
      await studio.run('path.addPoint', {
        nodeId: named(studio, 'Chemin'),
        pointX: 2,
        pointY: 0,
        pointZ: 0,
      })
    },
    // Three of four: a fresh rail is born with two points and the decor adds two more.
    passed: run => read.pathOf(read.nodeNamed(run, 'Chemin'))?.points.length === 3,
  },
  {
    name: '46.8 files the sphere under the cube',
    said: ["Range la sphère sous le cube, pour qu'elle le suive quand je le déplace."],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere' })
    },
    passed: run => {
      const cube = read.nodeNamed(run, 'Cube Test')
      return cube !== undefined && read.nodeNamed(run, 'Sphere')?.parentId === cube.id
    },
  },
  {
    // The other half of the same action: where a node sits among its own level, which the
    // outliner reads off the order of the scene and nothing else says.
    name: '46.9 puts the sphere first in the scene list',
    said: ['Mets la sphère tout en haut de la liste de la scène.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.add', { kind: 'sphere', name: 'Sphere' })
    },
    // The top level IN ORDER: nothing else says where a node sits among its own.
    passed: run => read.nodes(run).filter(one => one.parentId === null)[0]?.name === 'Sphere',
  },

  ...REST_ANIMATION_SCENARIOS,
]
