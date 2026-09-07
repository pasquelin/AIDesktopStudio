import type { Studio } from './studio'
import type { Run, Scenario } from './run'
import { toolIsShown } from '@/helpers/revealPanel'
import * as read from './oracle'
import {
  assetOf,
  boatImage,
  bonesOf,
  cutMontage,
  layerAt,
  madeCar,
  modelScene,
  opened,
  overlay,
} from './setups'

/**
 * Sections 53 to 57: the surfaces around the documents — styles, the online library, the window
 * and its panels, the machine, and what the assistant is told to remember about the project.
 */

const shellOf = (run: Run) => run.studio.shell

/** A style is a MATERIAL kept aside, so one is saved from a material document and nowhere else. */
const styled =
  (name = 'Marine') =>
  async (studio: Studio): Promise<void> => {
    await opened('materials', 'Matière Test')(studio)
    await studio.run('style.save', { name })
  }

/** The knight with a skeleton already fitted — nine of the ten rig requests start from one. */
const rigged = async (studio: Studio): Promise<void> => {
  await modelScene(studio)
  await studio.run('rig.fit', {})
}

/** The boat picture with its two layers filed under a group. */
const grouped = async (studio: Studio): Promise<void> => {
  await overlay(studio)
  await studio.run('layer.group', {
    layerIds: [layerAt(studio, 0), layerAt(studio, 1)],
    name: 'Fond',
  })
}

const guided = async (studio: Studio): Promise<void> => {
  await boatImage(studio)
  // 'x' and not 'vertical': `GUIDE_AXES` is ['x', 'y'], and the decor was refused in silence.
  await studio.run('guide.add', { axis: 'x', position: 960 })
}

/**
 * 🛑 The document is what makes the panel reachable: `panel.open` asks `availableToolIds`, and
 * the home offers four tools where Images offers eight.
 */
const withPanel = async (studio: Studio): Promise<void> => {
  await boatImage(studio)
  await studio.run('panel.open', { panel: 'layers' })
}

const remembered = async (studio: Studio): Promise<void> => {
  // No `cardId`: naming one the project does not hold is refused, which is the channel's contract.
  await studio.run('context.writeProjectCard', { title: 'Style', body: 'rendu photoréaliste' })
}

export const SHELL_SCENARIOS: readonly Scenario[] = [
  {
    name: '50.1 says whether the model already has a skeleton',
    said: ['Ce personnage a-t-il déjà un squelette ?'],
    setup: modelScene,
    passed: run => read.spoke(run) && read.answeredWith(run, 'rig.state'),
  },
  {
    name: '50.2 fits a skeleton to the model',
    said: ['Pose un squelette adapté à sa taille.'],
    setup: modelScene,
    passed: run => read.rig(run) !== null,
  },
  {
    name: '50.3 adds the hands to that skeleton',
    said: ['Ajoute les mains à ce squelette.'],
    setup: rigged,
    // FINGERS: a fitted skeleton already carries `LeftHand` and `RightHand` — what `rig.configureHands`
    // adds is the joints inside them.
    passed: run => (read.rig(run)?.bones.length ?? 0) > 22,
  },
  {
    name: '50.4 adds one more bone at the end of the right arm',
    said: ['Ajoute un os supplémentaire au bout de son bras droit.'],
    setup: rigged,
    passed: run => (read.rig(run)?.bones.length ?? 0) === 4,
  },
  {
    name: '50.5 renames that bone Main Droite',
    said: ['Renomme cet os Main Droite.'],
    setup: rigged,
    passed: run => read.rig(run)?.bones.some(one => one.name === 'Main Droite') === true,
  },
  {
    name: '50.6 says that bone is the right hand',
    said: ['Dis que cet os est la main droite du personnage.'],
    // The bone 50.4 and 50.5 left behind: the fit lays `RightHand` itself, so the role has to be
    // read on the bone the person is pointing at rather than anywhere on the skeleton.
    setup: async studio => {
      await rigged(studio)
      await studio.run('bone.add', { parent: 'RightLowerArm' })
      const added = bonesOf(studio).at(-1) ?? ''
      await studio.run('bone.rename', {
        bone: added,
        name: 'Main Droite',
      })
    },
    passed: run =>
      read.rig(run)?.bones.find(one => one.name === 'Main Droite')?.role === 'RightHand',
  },
  {
    name: '50.7 removes the bone just added',
    said: ["Supprime l'os que je viens d'ajouter."],
    // The added bone has to EXIST before the sentence, or « celui que je viens d'ajouter » points
    // at nothing and any removal would pass.
    setup: async studio => {
      await rigged(studio)
      await studio.run('bone.add', { parent: 'RightLowerArm' })
    },
    // Back to the three the fit laid: the one added by the decor is the one to go.
    passed: run => read.rig(run)?.bones.length === 3,
  },
  {
    name: '50.8 adds an IK constraint on the left leg',
    said: ['Ajoute une contrainte IK sur sa jambe gauche.'],
    setup: rigged,
    passed: run => (read.rig(run)?.ik ?? []).length === 1,
  },
  {
    name: '50.9 takes that IK constraint back off',
    said: ['Retire cette contrainte IK.'],
    setup: async studio => {
      await rigged(studio)
      await studio.run('ik.add', { bone: 'LeftFoot' })
    },
    passed: run => (read.rig(run)?.ik ?? []).length === 0,
  },
  {
    name: '50.10 clears the skeleton off the model',
    said: ['Enlève complètement le squelette de ce personnage.'],
    setup: rigged,
    passed: run => read.rig(run) === null,
  },

  // A point on a bone, then something hung on it: a sword in a hand is the whole reason a
  // character carries points at all, and neither half had a door a client could reach.
  {
    name: '50.11 lays an attachment point on the right hand',
    said: ["Pose un point d'attache sur sa main droite, appelé Main Droite."],
    setup: rigged,
    passed: run => read.sockets(run).some(one => one.name === 'Main Droite'),
  },
  {
    name: '50.12 hangs the cube on that point',
    said: ['Accroche le cube à Main Droite.'],
    setup: async studio => {
      await rigged(studio)
      await studio.run('socket.add', { bone: 'RightHand', name: 'Main Droite' })
      await studio.run('node.add', { kind: 'box', name: 'Cube' })
    },
    passed: run => read.nodeNamed(run, 'Cube')?.attach !== undefined,
  },
  {
    name: '50.13 takes that attachment point back off',
    said: ["Retire le point d'attache Main Droite."],
    setup: async studio => {
      await rigged(studio)
      await studio.run('socket.add', { bone: 'RightHand', name: 'Main Droite' })
    },
    passed: run => read.sockets(run).length === 0,
  },

  {
    name: '51.1 groups the two layers under Fond',
    said: ['Regroupe mes deux calques dans un groupe appelé Fond.'],
    setup: overlay,
    passed: run => read.layers(run).some(one => one.kind === 'group'),
  },
  {
    name: '51.2 ungroups Fond',
    said: ['Dégroupe le groupe Fond.'],
    setup: grouped,
    passed: run => read.layers(run).every(one => one.kind !== 'group'),
  },
  {
    name: '51.3 merges the top layer into the one below',
    said: ["Fusionne le calque du dessus avec celui d'en dessous."],
    setup: async studio => {
      await overlay(studio)
      await studio.run('layer.select', { layerId: layerAt(studio, 1) })
    },
    passed: run => read.layers(run).length === 1,
  },
  {
    name: '51.4 adds a red rectangle at the bottom of the picture',
    said: ["Ajoute un rectangle rouge en bas de l'image."],
    setup: boatImage,
    passed: run => read.layers(run).some(one => one.kind === 'shape'),
  },
  {
    name: '51.5 adds an adjustment layer raising the contrast',
    said: ['Ajoute un calque de réglage qui monte le contraste.'],
    setup: boatImage,
    passed: run => read.layers(run).some(one => one.kind === 'adjustment'),
  },
  {
    name: '51.6 adds a mask to the Bateau layer',
    said: ['Ajoute un masque au calque Bateau.'],
    setup: boatImage,
    passed: run => read.layerNamed(run, 'Bateau')?.mask?.enabled === true,
  },
  {
    name: '51.7 crops the picture to a centred square',
    said: ["Recadre l'image sur un carré centré."],
    setup: boatImage,
    // Square, and cut rather than squeezed — a resize would have said so through `canvas.resize`.
    passed: run =>
      read.canvas(run)?.width === read.canvas(run)?.height && read.tried(run, 'canvas.crop'),
  },
  {
    name: '51.8 turns the document 90 degrees clockwise',
    said: ['Fais pivoter le document de 90 degrés vers la droite.'],
    setup: boatImage,
    passed: run => read.answeredWith(run, 'canvas.flipOrRotate') && read.canvas(run)?.width === 768,
  },
  {
    name: '51.9 lays a vertical guide down the middle',
    said: ["Pose un repère vertical au milieu de l'image."],
    setup: boatImage,
    passed: run => (read.canvas(run)?.guides ?? []).length === 1,
  },
  {
    name: '51.10 moves that guide to a third of the width',
    said: ['Déplace ce repère au tiers de la largeur.'],
    setup: guided,
    passed: run => read.near(read.canvas(run)?.guides[0]?.position ?? 960, 341, 40),
  },
  {
    name: '51.11 removes that guide',
    said: ['Supprime ce repère.'],
    setup: guided,
    passed: run => (read.canvas(run)?.guides ?? []).length === 0,
  },

  {
    name: '52.1 unlinks the sound of the first video',
    said: ['Détache le son de ma première vidéo pour pouvoir le déplacer seul.'],
    setup: cutMontage,
    // 🛑 Nothing in the decor links a picture to a sound — `clip.add` lays one clip — so the
    // state cannot say a link was broken. The call the studio accepted is what is scored.
    passed: run => read.answeredWith(run, 'clip.unlink') || read.askedBack(run),
  },
  {
    name: '52.2 moves the sound row above the picture row',
    said: ['Fais passer la piste audio au-dessus de la piste vidéo.'],
    setup: async studio => {
      await cutMontage(studio)
    },
    passed: run => read.tracks(run)[0]?.kind === 'audio',
  },

  {
    name: '53.1 names the styles on record',
    said: ['Quels styles ai-je enregistrés ?'],
    setup: styled(),
    passed: run => read.idle(run) && read.answeredWith(run, 'styles.list'),
  },
  {
    name: '53.2 saves the boat picture style under the name Marine',
    said: ['Enregistre le style de mon image du bateau sous le nom Marine.'],
    setup: madeCar,
    passed: run =>
      shellOf(run)
        .styles()
        .some(one => one.name === 'Marine'),
  },
  {
    name: '53.3 renames that style Marine Nuit',
    said: ['Renomme ce style Marine Nuit.'],
    setup: styled(),
    passed: run =>
      shellOf(run)
        .styles()
        .some(one => one.name === 'Marine Nuit'),
  },
  {
    name: '53.4 removes the Marine Nuit style',
    said: ['Supprime le style Marine Nuit.'],
    setup: styled('Marine Nuit'),
    passed: run => shellOf(run).styles().length === 0,
  },

  {
    name: '54.1 shows what the online library holds',
    said: ['Montre-moi ce que contient ma bibliothèque en ligne.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'cloud.browseAccountLibrary'),
  },
  {
    name: '54.2 searches the online library for red cars',
    said: ['Cherche des voitures rouges dans ma bibliothèque en ligne.'],
    passed: run =>
      read.idle(run) &&
      (read.answeredWith(run, 'cloud.explorePublicFeed') ||
        read.answeredWith(run, 'cloud.browseAccountLibrary')),
  },
  {
    name: '54.3 finds online pictures close to the boat',
    said: ['Trouve-moi en ligne des images qui ressemblent à mon bateau.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'cloud.findSimilarPublished'),
  },
  {
    name: '54.4 says what a sync would bring, before running it',
    said: ['Dis-moi ce que téléchargerait une synchronisation, avant de la lancer.'],
    passed: run => read.idle(run) && read.answeredWith(run, 'cloud.previewSync'),
  },
  {
    name: '54.5 pulls the online pictures missing here',
    said: ['Télécharge dans mon projet les images en ligne qui manquent ici.'],
    passed: run => shellOf(run).pulled().length > 0,
  },
  {
    name: '54.6 sends the boat picture to the online library',
    said: ["Envoie l'image du bateau dans ma bibliothèque en ligne."],
    passed: run => shellOf(run).pushed().length > 0,
  },

  {
    name: '55.1 says what state the window is in',
    said: ['Dans quel état est ma fenêtre en ce moment ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'window.state'),
  },
  {
    name: '55.2 goes full screen',
    said: ['Passe en plein écran.'],
    passed: run => shellOf(run).fullScreen(),
  },
  {
    name: '55.3 opens the preferences',
    said: ['Ouvre les préférences.'],
    passed: run => shellOf(run).settingsOpen(),
  },
  {
    name: '55.4 names the panels that can be opened',
    said: ['Quels panneaux puis-je ouvrir ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'panels.list'),
  },
  {
    name: '55.5 opens the layers panel',
    said: ['Ouvre le panneau des calques.'],
    // The half is put on ANOTHER of its panels rather than closed: what an untouched right column
    // draws depends on whether the assistant is offered there, and a decor that leaves the oracle
    // already true measures nothing at all.
    setup: async studio => {
      await boatImage(studio)
      await studio.run('panel.open', { panel: 'text' })
    },
    passed: () => toolIsShown('layers'),
  },
  {
    name: '55.6 closes the layers panel',
    said: ['Ferme le panneau des calques.'],
    setup: withPanel,
    passed: () => !toolIsShown('layers'),
  },
  {
    name: '55.7 opens a mirror of the view on the second screen',
    said: ['Ouvre un miroir de la vue sur mon second écran.'],
    passed: run => shellOf(run).mirrored(),
  },
  {
    name: '55.8 opens the manual at the video montage chapter',
    said: ['Ouvre le manuel au chapitre du montage vidéo.'],
    passed: run => shellOf(run).helpAt() !== null,
  },
  {
    name: '55.9 names the favourites',
    said: ['Quels sont mes favoris ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'favorites.listPinnedRecipes'),
  },
  {
    name: '55.10 pins the boat picture as a favourite',
    said: ["Mets l'image du bateau en favori."],
    passed: run => shellOf(run).favorites().length === 1,
  },
  {
    name: '55.11 unpins the boat picture',
    said: ["Retire l'image du bateau de mes favoris."],
    setup: async studio => {
      await studio.run('favorite.pinAssetRecipe', {
        assetId: assetOf(studio, 'fais moi un bateau.png'),
      })
    },
    passed: run => shellOf(run).favorites().length === 0,
  },
  {
    // 🛑 A value of an option list, not an action — so the compiler asks nothing, and the journal
    // would have gone out on the MCP wire with no phrase reaching it.
    name: '55.12 opens the journal in its own window',
    said: ['Ouvre le journal du studio dans sa fenêtre.'],
    passed: run => shellOf(run).helpAt() === 'journal',
  },

  {
    name: '56.1 says whether an update is available',
    said: ['Une mise à jour est-elle disponible ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'updates.state'),
  },
  {
    name: '56.2 installs the update and restarts',
    said: ['Installe la mise à jour et redémarre.'],
    passed: run => shellOf(run).updateInstalled(),
  },
  {
    name: '56.3 says whether dictation is ready',
    said: ['La dictée est-elle prête à être utilisée ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'dictation.state'),
  },
  {
    name: '56.4 starts the dictation',
    said: ['Lance la dictée.'],
    // No microphone and no engine headless — `dictation.start` refuses `failed`, so the STATE
    // cannot say. The call the studio accepted is what is scored, as it is for 56.5.
    passed: run => read.tried(run, 'dictation.start'),
  },
  {
    name: '56.5 stops the dictation',
    said: ['Arrête la dictée.'],
    // No microphone and no engine headless, so the STATE cannot say: the call is what is scored.
    passed: run => read.answeredWith(run, 'dictation.stop'),
  },
  {
    name: '56.6 says whether the machine encodes video in hardware',
    said: ['Mon ordinateur peut-il encoder de la vidéo en accéléré matériel ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'media.capabilities'),
  },
  {
    name: '56.7 adopts the video just dropped on the window',
    said: ['Ajoute à mon projet la vidéo que je viens de déposer sur la fenêtre.'],
    passed: run => shellOf(run).adopted().length > 0,
  },
  {
    name: '56.8 names the fonts a text could use',
    said: ['Quelles polices puis-je utiliser pour un texte ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'fonts.list'),
  },

  {
    name: '57.1 gives the current 3D settings',
    said: ['Quels sont mes réglages 3D actuels ?'],
    passed: run => read.idle(run) && read.answeredWith(run, 'settings.read'),
  },
  {
    name: '57.2 puts the display settings back to their defaults',
    said: ["Remets les réglages d'affichage à leurs valeurs par défaut."],
    passed: run => read.tried(run, 'settings.triggerAction') || read.tried(run, 'settings.write'),
  },
  {
    name: '57.3 says what it has remembered about the project',
    said: ["Qu'as-tu retenu de ce projet jusqu'ici ?"],
    setup: remembered,
    passed: run => read.idle(run) && read.answeredWith(run, 'context.readProjectCards'),
  },
  {
    name: '57.4 remembers the project aims at photoreal marine work',
    said: ['Retiens que ce projet vise un rendu photoréaliste marine.'],
    passed: run => Object.keys(shellOf(run).context().cards).length === 1,
  },
  {
    name: '57.5 forgets what it had remembered about the style',
    said: ['Oublie ce que tu avais retenu sur le style de ce projet.'],
    setup: remembered,
    passed: run => Object.keys(shellOf(run).context().cards).length === 0,
  },
]
