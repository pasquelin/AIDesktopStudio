import type { Run, Scenario } from './run'
import * as read from './oracle'
import {
  boatImage,
  cameraScene,
  cubeScene,
  cutMontage,
  montage,
  named,
  namedCopy,
  scene,
  testFolders,
} from './setups'

/**
 * Sections 1 to 5: reading the project, searching it, tidying it, making documents in it. The
 * read-only ones are scored on the studio being UNTOUCHED as well as on a sentence being said.
 */

const asking = (name: string, said: string, passed: (run: Run) => boolean): Scenario => ({
  name,
  said: [said],
  passed,
})

export const PROJECT_SCENARIOS: readonly Scenario[] = [
  // ——— 1. Compréhension du projet — lecture seule ———
  {
    name: '1.1 names the open project and the open documents',
    said: ['Quel projet est actuellement ouvert et quels documents sont ouverts ?'],
    setup: scene('Scène 1'),
    passed: run => read.idle(run) && read.answeredWith(run, 'studio.state'),
  },
  asking(
    '1.2 lists the project files by type',
    'Liste-moi les fichiers présents dans mon projet, classés par type.',
    run =>
      read.idle(run) &&
      (read.answeredWith(run, 'files.list') || read.answeredWith(run, 'files.search')),
  ),
  asking(
    '1.3 counts the assets of each kind',
    "Combien ai-je d'images, de vidéos, de fichiers audio, de modèles 3D et de skyboxes ?",
    run =>
      read.idle(run) &&
      (read.answeredWith(run, 'assets.counts') ||
        read.answeredWith(run, 'assets.searchProjectCatalogue')),
  ),
  {
    name: '1.4 names the active document',
    said: ['Quel document est actuellement actif ?'],
    setup: scene('Scène 1'),
    passed: read.idle,
  },
  {
    name: '1.5 lists what the open 3D scene holds',
    said: ['Quels sont les éléments présents dans la scène 3D actuellement ouverte ?'],
    setup: cubeScene,
    passed: run => read.idle(run) && read.answeredWith(run, 'scene.state'),
  },
  {
    name: '1.6 names the cameras and the lights of the scene',
    said: ['Quelles caméras et quelles lumières sont présentes dans ma scène ?'],
    setup: async studio => {
      await cameraScene(studio)
      await studio.run('node.add', { kind: 'directional', name: 'Soleil Test' })
    },
    passed: run => read.idle(run) && read.answeredWith(run, 'scene.state'),
  },
  {
    name: "1.7 gives the scene camera's properties",
    said: ['Donne-moi les propriétés de la caméra de la scène.'],
    setup: cameraScene,
    passed: run => read.idle(run) && read.answeredWith(run, 'scene.state'),
  },
  {
    name: '1.8 gives the current timeline duration',
    said: ['Quelle est la durée actuelle de ma timeline ?'],
    setup: cutMontage,
    passed: run => read.idle(run) && read.answeredWith(run, 'sequence.state'),
  },
  {
    name: '1.9 names what is selected',
    said: ['Quels éléments sont actuellement sélectionnés ?'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('node.select', { nodeIds: [named(studio, 'Cube Test')] })
    },
    passed: read.idle,
  },

  // ——— 2. Navigation dans l'application ———
  asking('2.1 opens the boat picture', 'Ouvre mon image du bateau.', run =>
    read.openedFile(run, 'fais moi un bateau.png'),
  ),
  asking(
    '2.2 opens the first video',
    'Ouvre ma première vidéo.',
    run => read.inSpace(run, 'video').length === 1,
  ),
  asking(
    '2.3 opens the first audio file',
    'Ouvre mon premier fichier audio.',
    run => read.inSpace(run, 'audio').length === 1,
  ),
  asking(
    '2.4 opens the 3D scene',
    'Ouvre ma scène 3D.',
    run => read.inSpace(run, '3d').length >= 1,
  ),
  asking(
    '2.5 opens the texture the first model uses',
    'Ouvre la texture utilisée par mon premier modèle 3D.',
    // Without the extension: a texture EXTRACTED from the model is filed under its stem alone,
    // and opening that copy is as much an answer as opening the material picture itself.
    run => read.openedFile(run, 'planks, seamless') || read.askedBack(run),
  ),
  asking('2.6 opens the first skybox', 'Ouvre ma première skybox.', run =>
    read.documents(run).some(one => (one.path ?? '').startsWith('Skyboxes/')),
  ),
  {
    name: '2.7 comes back to the 3D scene',
    said: ['Reviens sur la scène 3D.'],
    setup: async studio => {
      await cubeScene(studio)
      await studio.run('file.open', { path: 'Images/fais moi un bateau.png' })
    },
    passed: run => read.front(run)?.workspace === '3d',
  },

  // ——— 3. Recherche intelligente d'assets ———
  asking(
    '3.1 finds the picture of a boat',
    "Trouve-moi l'image qui représente un bateau.",
    run => read.idle(run) && read.searched(run, 'bateau'),
  ),
  asking(
    '3.2 finds the 3D models of characters',
    'Trouve-moi tous les modèles 3D de personnages.',
    run => read.idle(run) && read.searched(run, ''),
  ),
  asking(
    '3.3 finds what could serve as an environment',
    'Trouve-moi les fichiers qui pourraient être utilisés comme environnement.',
    run => read.idle(run) && read.searched(run, ''),
  ),
  {
    name: '3.4 finds the textures of the current model',
    said: ['Trouve-moi toutes les textures associées à mon modèle 3D actuel.'],
    setup: async studio => {
      await studio.run('file.open', {
        path: 'Modelling/Models/a medieval stone castle with towers.glb',
      })
    },
    passed: run => read.spoke(run),
  },
  asking(
    '3.5 finds the audio usable in a montage',
    'Trouve-moi tous les fichiers audio utilisables dans un montage vidéo.',
    run => read.idle(run) && read.searched(run, ''),
  ),
  asking(
    '3.6 finds the AI-generated assets about a car',
    'Trouve-moi les assets générés par IA qui concernent une voiture.',
    run => read.idle(run) && read.searched(run, ''),
  ),

  // ——— 4. Gestion des fichiers et dossiers ———
  asking(
    '4.1 makes a Tests Assistant folder',
    'Crée un dossier Tests Assistant dans mon projet.',
    run => read.holds(run, 'Tests Assistant'),
  ),
  {
    name: '4.2 makes an Images subfolder inside it',
    said: ['Dans Tests Assistant, crée un sous-dossier Images.'],
    setup: async studio => {
      await studio.run('folder.new', { folder: '', name: 'Tests Assistant' })
    },
    passed: run => read.holds(run, 'Tests Assistant/Images'),
  },
  {
    name: '4.3 duplicates the boat picture into that folder',
    said: ["Duplique l'image du bateau dans ce dossier."],
    setup: async studio => {
      await studio.run('folder.new', { folder: '', name: 'Tests Assistant' })
    },
    // The project holds ONE file called « bateau » before the person speaks, so a copy makes two.
    // `> 2` asked for a third and no run could ever answer it.
    passed: run =>
      read.files(run).filter(one => one.startsWith('Tests Assistant/')).length === 1 ||
      read.files(run).filter(one => one.includes('bateau')).length >= 2,
  },
  {
    name: '4.4 renames that copy bateau-test.png',
    said: ['Renomme cette copie bateau-test.png.'],
    setup: async studio => {
      await studio.run('folder.new', { folder: '', name: 'Tests Assistant' })
      await studio.run('files.duplicate', { paths: ['Images/fais moi un bateau.png'] })
    },
    // The copy sits beside the original: renaming it is all the sentence asks for.
    passed: run => read.holds(run, 'Images/bateau-test.png'),
  },
  {
    name: '4.5 moves bateau-test.png into the Images subfolder',
    said: ['Déplace bateau-test.png dans le sous-dossier Images.'],
    setup: namedCopy,
    passed: run => read.holds(run, 'Tests Assistant/Images/bateau-test.png'),
  },
  {
    name: '4.6 checks the file is at its new place',
    said: ['Vérifie que le fichier existe bien à son nouvel emplacement.'],
    setup: async studio => {
      await namedCopy(studio)
      await studio.run('files.move', {
        paths: ['Tests Assistant/bateau-test.png'],
        folder: 'Tests Assistant/Images',
      })
    },
    passed: read.idle,
  },
  {
    name: '4.7 removes bateau-test.png',
    said: ['Supprime bateau-test.png.'],
    setup: namedCopy,
    passed: run => !read.holds(run, 'Tests Assistant/bateau-test.png'),
  },
  {
    name: '4.8 removes the test folders it just made',
    said: ['Supprime les dossiers de test que nous venons de créer.'],
    setup: testFolders,
    passed: run => !read.holds(run, 'Tests Assistant') && read.holds(run, 'Images'),
  },

  // ——— 5. Création de documents ———
  asking(
    '5.1 makes an empty 3D scene called Test MCP',
    'Crée une nouvelle scène 3D vide appelée Test MCP.',
    run => read.titled(run, 'Test MCP')?.workspace === '3d',
  ),
  asking(
    '5.2 makes a video montage called Test Video',
    'Crée un nouveau montage vidéo appelé Test Video.',
    run => read.titled(run, 'Test Video')?.workspace === 'video',
  ),
  asking(
    '5.3 makes an audio montage called Test Audio',
    'Crée un nouveau montage audio appelé Test Audio.',
    run => read.titled(run, 'Test Audio')?.workspace === 'audio',
  ),
  {
    name: '5.4 closes Test Audio without deleting the file',
    said: ['Ferme Test Audio sans supprimer le fichier.'],
    setup: montage('Test Audio', 'audio'),
    passed: run => read.titled(run, 'Test Audio') === undefined && read.files(run).length > 20,
  },
  {
    name: '5.5 reopens Test MCP',
    said: ['Rouvre Test MCP.'],
    // A second DOCUMENT, not merely another space: `showWorkspace` is silent when the section
    // has no tab open, so Test MCP was still in front before the person spoke.
    setup: async studio => {
      await scene('Test MCP')(studio)
      await boatImage(studio)
    },
    passed: run => read.front(run)?.title.includes('Test MCP') === true,
  },
]
