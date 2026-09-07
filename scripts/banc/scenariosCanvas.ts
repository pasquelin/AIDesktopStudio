import type { Scenario } from './run'
import * as read from './oracle'
import { boatImage, cutMontage, laid, overlay, soundBed, trackAt } from './setups'

/**
 * Sections 39 and 40: what an image document and a montage answer to beyond the stack and the
 * cut — the canvas itself, what is pointed at, the lock, and the rows a montage is built on.
 */

export const CANVAS_SCENARIOS: readonly Scenario[] = [
  {
    name: '39.1 gives the size of the document and how many layers it holds',
    said: ['Quelle est la taille de ce document et combien de calques porte-t-il ?'],
    setup: overlay,
    passed: run => read.spoke(run) && read.answeredWith(run, 'canvas.state'),
  },
  {
    name: '39.2 puts the document at 1080 by 1080',
    said: ['Passe ce document en 1080 sur 1080.'],
    setup: boatImage,
    // Not cropped: « passe en 1080 sur 1080 » resizes the document, it does not cut it — and a
    // crop to the same rectangle leaves the state indistinguishable, so the CALL is what says so.
    passed: run => {
      const image = read.canvas(run)
      return image?.width === 1080 && image.height === 1080 && !read.tried(run, 'canvas.crop')
    },
  },
  {
    name: '39.3 selects the Bateau layer',
    said: ['Sélectionne le calque Bateau.'],
    setup: overlay,
    // The KIND too: `target.select` also fills the list, and « sélectionne le calque » is not
    // « pointe quelque chose ».
    // The NAMED one: a picture always has an active layer, so « which » is the whole request.
    passed: run => read.aimed(run).ids[0] === read.layerNamed(run, 'Bateau')?.id,
  },
  {
    name: '39.4 duplicates the Bateau layer',
    said: ['Duplique le calque Bateau.'],
    setup: boatImage,
    passed: run => read.layers(run).length === 2,
  },
  {
    name: '39.5 locks the Bateau layer',
    said: ['Verrouille le calque Bateau pour ne plus y toucher.'],
    setup: boatImage,
    passed: run => read.layerNamed(run, 'Bateau')?.locked.pixels === true,
  },
  {
    name: '39.6 adds a text layer reading Bonjour',
    said: ['Ajoute un calque de texte qui dit Bonjour.'],
    setup: boatImage,
    passed: run => read.layers(run).some(one => read.captionOf(one) === 'Bonjour'),
  },
  {
    name: '39.7 sets the image document for grayscale print',
    said: ['Prépare ce document pour une impression en niveaux de gris à 300 ppp et 16 bits.'],
    setup: boatImage,
    passed: run => {
      const image = read.canvas(run)
      return image?.dpi === 300 && image.colorMode === 'grayscale' && image.bitDepth === 16
    },
  },

  {
    name: '40.1 puts the playhead at 3 seconds',
    said: ['Place la tête de lecture à 3 secondes.'],
    setup: cutMontage,
    passed: run => read.lasts(read.montage(run)?.playhead ?? 0, 3),
  },
  {
    name: '40.2 cuts the first shot in two at 3 seconds',
    said: ['Coupe le premier plan en deux à 3 secondes.'],
    setup: cutMontage,
    passed: run => read.clips(run).length === 3,
  },
  {
    name: '40.3 removes the second shot',
    said: ['Supprime le deuxième plan du montage.'],
    setup: cutMontage,
    passed: run => read.clips(run).length === 1,
  },
  {
    name: '40.4 selects the first shot',
    said: ['Sélectionne le premier plan.'],
    setup: cutMontage,
    // The FIRST one: laying a clip arms it, so « sélectionne le premier » is about which.
    passed: run => read.aimed(run).ids[0] === read.clips(run)[0]?.id,
  },
  {
    name: '40.5 renames the sound row Ambiance',
    said: ['Renomme la piste audio Ambiance.'],
    setup: soundBed,
    passed: run => read.audioRow(run)?.name === 'Ambiance',
  },
  {
    name: '40.6 mutes the sound row',
    said: ['Coupe le son de la piste audio.'],
    setup: soundBed,
    passed: run => read.audioRow(run)?.muted === true,
  },
  {
    name: '40.7 removes the sound row and what it carries',
    said: ["Supprime la piste audio et tout ce qu'elle porte."],
    // Two sounds on it, so the removal shows on the clips as well as on the rows.
    setup: async studio => {
      await soundBed(studio)
      await laid(studio, trackAt(studio, 1), 'waves on a wooden hull.wav', 6 * read.SECOND)
    },
    /**
     * 🛑 THE row that carried the sounds, not every audio row: the decor lays A1 with two sounds
     * and leaves A2 empty, so « plus aucune piste audio » asked for the empty one to go as well —
     * which the sentence never says. One audio row left, and the two video clips alone.
     */
    passed: run =>
      read.tracks(run).filter(one => one.kind === 'audio').length === 1 &&
      read.clips(run).length === 2,
  },
]
