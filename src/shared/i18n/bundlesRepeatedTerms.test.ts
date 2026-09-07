import { describe, expect, it } from 'vitest'
import { isRecord } from '../guards'
import { SETTLED_WORDS } from './bundlesSettledWords.testFixtures'
import { TRANSLATIONS, type Language } from './index'
import modelTextFr from './model-text.fr.json'

function flatten(
  bundle: unknown,
  prefix = '',
  into = new Map<string, string>(),
): Map<string, string> {
  if (!isRecord(bundle)) return into

  for (const [name, value] of Object.entries(bundle)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (isRecord(value)) flatten(value, key, into)
    else into.set(key, String(value))
  }

  return into
}

function holes(text: string): readonly string[] {
  return [...text.matchAll(/\{\{[^}]+\}\}/g)].map(match => match[0]).sort()
}

// Written out rather than mapped over `LANGUAGES`: the Record makes a new language a compile
// error here, which is the one place that must not silently skip it.
const BUNDLES: Record<Language, Map<string, string>> = {
  fr: flatten(TRANSLATIONS.fr),
  en: flatten(TRANSLATIONS.en),
}

const REFERENCE = BUNDLES.fr

const PAVAGE_NOT_THE_OBJECT: ReadonlySet<string> = new Set([
  'smart low poly',
  'quad',
  'maximum face count. adaptive if unset. with smart low poly: 1,000-20,000 (500-10,000 if ' +
    'quad is also enabled). otherwise capped at 1,500,000 (standard geometry) or 2,000,000 ' +
    '(detailed geometry). quad alone caps face limit at 150,000',
  'enable quad mesh output (fbx format). when smart low poly is off, face limit is capped at ' +
    '150,000. when smart low poly is on and face limit is unset, defaults to 10,000',
])

/**
 * `texture` is not asked of this dictionary, and the reason is the same one twice over: these
 * are a MODEL's own parameters — `texture quality`, `texture seed` — where the word is the
 * trade's for what a mesh wears, and the studio neither chose the parameter nor can rename it
 * in a sentence that cites it by name.
 *
 * What the studio DID drop is the shelf: a texture is a picture in the catalogue now. The two
 * are not in conflict — a 3D model still wears textures, they are just filed as the pictures
 * they are.
 */
const TEXTURE_ON_A_MESH: ReadonlySet<string> = new Set([
  'texture quality',
  'texture alignment',
  'texture seed',
  'enable texturing. set to false for a model without textures',
  "texture quality level. 'detailed' gives hd quality textures",
  'determines the prioritization of texture alignment in the 3d model',
  'random seed for texture generation. using the same seed will produce identical textures',
  'generate segmented 3d model parts. incompatible with texture, pbr, and quad',
  'enable pbr generation. default value is true. if this option is set to true, texture ' +
    'parameters will be ignored',
])

describe('the repeated terms in the model dictionary', () => {
  it('says one thing one way in the dictionary of what a model wrote about itself', () => {
    const exempt = (source: string, kept: string): boolean =>
      kept === 'image' ? TEXTURE_ON_A_MESH.has(source) : PAVAGE_NOT_THE_OBJECT.has(source)

    const drifted = Object.entries(modelTextFr).flatMap(([source, french]) =>
      SETTLED_WORDS.fr
        .filter(({ dropped, kept }) => dropped.test(french) && !exempt(source, kept))
        .map(({ kept }) => `${source} — say "${kept}"`),
    )

    expect(drifted).toEqual([])
  })

  it('drops a dictionary exemption once its entry stops saying the word', () => {
    const stale = (exempted: ReadonlySet<string>, word: RegExp): string[] =>
      [...exempted].filter(source => {
        const french = Object.entries(modelTextFr).find(([key]) => key === source)?.[1]
        return french === undefined || !word.test(french)
      })

    expect(stale(PAVAGE_NOT_THE_OBJECT, /maillages?/i)).toEqual([])
    expect(stale(TEXTURE_ON_A_MESH, /textures?/i)).toEqual([])
  })
})

/**
 * One French label, one English word — the pendant of `SETTLED_WORDS`, across the pair rather
 * than inside a bundle. The generator panel read `Generate` while five other keys said
 * `Generation`, and the 3D snap command read `Snapping` beside a canvas one saying `Snap`.
 * Neither sentence was wrong on its own; what was wrong was reading them one after the other.
 *
 * Text with a hole and text ending on punctuation stay out: a sentence says one thing many
 * ways on purpose, while a label is what a reader recognises from one screen to the next, and
 * one written twice is a convention whether or not anyone wrote it down.
 *
 * A word count is NOT part of that filter, and the first draft had one. Measured on these
 * bundles, a ceiling of three, four, five, eight words and no ceiling at all return the SAME
 * nineteen splits — the ceiling only ever shrank the net, to 784 terms watched instead of
 * 1223. A number that changes no verdict is a number nobody rechecks the day it starts to.
 *
 * Case and a trailing ellipsis fold away: the native menu's `Show All`, whose wording macOS
 * owns, is the same word as the settings' `Show all`. `foldForSearch` is NOT the fold to reach
 * for — it drops diacritics, so `échec` would meet `echec` and every accented exemption below
 * would quietly stop matching the term it names.
 *
 * What this does NOT catch: a label used once — nothing to be inconsistent with — and a term
 * inside a sentence. The reverse direction, one English word for two French labels, was
 * dismissed here as harmless flexion until it was measured: `TWO_WAYS` guards it now, and a
 * legitimate flexion earns an entry there rather than a flattened French.
 */
const isComparable = (text: string): boolean =>
  text.length > 1 && holes(text).length === 0 && !/[.!?:]$/.test(text)

const asTerm = (text: string): string => text.replace(/…+$/, '').trim().toLocaleLowerCase('fr')

/**
 * French labels that name two things — each entry naming the readings it allows, and what
 * separates them. **An entry covers the forms it lists and nothing else**: a third English
 * word appearing under an exempted term is drift again, and the test says so.
 *
 * That is not a precaution, it is the hole the first draft had. `tout afficher` read THREE
 * ways — `show everything` on the activity filter, `show all` in the settings and the native
 * menu, `fit to view` on the sequence command. The entry named two of them, and the first two
 * are the same act on the same kind of surface: a real split that the exemption swallowed
 * whole. It was caught by eye, outside this file, which is exactly what a guard is for.
 *
 * A label earns its place here by naming a difference, never by being noisy — and it leaves
 * the day one of its readings stops being written, which the second test makes happen.
 */
const TWO_THINGS: Split = {
  annuler: { reads: ['cancel', 'undo'], separates: 'closes a dialog, and undoes an edit' },
  supprimer: { reads: ['delete', 'remove'], separates: 'destroys, and takes off a list' },
  repères: { reads: ['helpers', 'guides'], separates: "the 3D scene's, and the canvas'" },
  déplacement: {
    reads: ['move', 'displacement'],
    separates: "the tool, and a texture's displacement map",
  },
  image: {
    reads: ['image', 'picture'],
    separates: 'the asset, and the picture track of a sequence — as `Sound` is for audio',
  },
  nœud: { reads: ['node', 'knot'], separates: 'a graph node, and the torus knot shape' },
  teinte: { reads: ['tint', 'hue'], separates: 'a tint laid over, and the hue component' },
  début: { reads: ['start', 'home'], separates: 'a time, and the Home key' },
  tout: { reads: ['all', 'everything'], separates: 'a filter, and a log level' },
  recadrage: {
    reads: ['crop', 'reframe'],
    separates: 'the tool, and the Scenario action, which the API names reframe',
  },
  agrandissement: {
    reads: ['upscaling', 'upscale'],
    separates:
      'the model family, named as the other families are — `Background removal`, ' +
      '`Vectorisation` — and the billed action, named as the API names it, beside `Reframe`',
  },
  vectorisation: {
    reads: ['vectorisation', 'vectorization'],
    separates:
      'the model family and the menu command, spelled as this British bundle spells them, ' +
      'and the billed action, named as the API names it — the same split as `agrandissement`',
  },
  échec: { reads: ['failed', 'failure'], separates: 'a status value, and a log level' },
  édition: { reads: ['editing', 'edit'], separates: 'a model tag, and the native Edit menu' },
  'outils de développement': {
    reads: ['toggle developer tools', 'developer tools'],
    separates: 'the native menu, worded as Electron words it, and the setting',
  },
  couleur: {
    reads: ['colour', 'color'],
    separates: 'everywhere, and the blend modes, which carry the CSS mix-blend-mode names',
  },
  'tout afficher': {
    reads: ['show all', 'fit to view'],
    separates: 'lifting a filter, and fitting the view',
  },
  marche: {
    reads: ['walk', 'step'],
    separates: 'a movement Tripo retargets, and the step height a game character climbs',
  },
  blessure: {
    reads: ['hurt', 'damage'],
    separates: 'a movement Tripo retargets, and the post effect laid over the picture',
  },
}

type Split = Record<string, { reads: readonly string[]; separates: string }>

const formsOf = (read: Map<string, string>, against: Map<string, string>) => {
  const forms = new Map<string, Set<string>>()

  for (const [key, source] of read) {
    const target = against.get(key)
    if (target === undefined || !isComparable(source) || !isComparable(target)) continue
    const term = asTerm(source)
    forms.set(term, (forms.get(term) ?? new Set<string>()).add(asTerm(target)))
  }

  return forms
}

const driftedIn = (forms: Map<string, Set<string>>, exempt: Split) =>
  [...forms]
    .filter(([, written]) => written.size > 1)
    .filter(([term, written]) => {
      const allowed = exempt[term]?.reads
      return allowed === undefined || [...written].some(form => !allowed.includes(form))
    })
    .map(([term, written]) => `${term} — ${[...written].join(' / ')}`)

const staleIn = (forms: Map<string, Set<string>>, exempt: Split) =>
  Object.entries(exempt)
    .map(([term, allowed]) => {
      const written = forms.get(term) ?? new Set<string>()
      return { term, missing: allowed.reads.filter(form => !written.has(form)) }
    })
    .filter(({ missing }) => missing.length > 0)
    .map(({ term, missing }) => `${term} — nothing reads ${missing.join(', ')} any more`)

const ENGLISH_FORMS = formsOf(REFERENCE, BUNDLES.en)

describe('the repeated French terms in the translation bundles', () => {
  it('renders a repeated French label the same way in English', () => {
    expect(driftedIn(ENGLISH_FORMS, TWO_THINGS)).toEqual([])
  })

  /**
   * An exemption that stopped naming a real split is the one nobody would think to delete. It
   * names the reading that went missing rather than saying "stale": a form also leaves when its
   * key gains a `{{hole}}` or a full stop, and told apart from a split that closed, those two
   * ask for opposite fixes.
   */
  it('drops an exemption once the label stops reading both ways', () => {
    expect(staleIn(ENGLISH_FORMS, TWO_THINGS)).toEqual([])
  })
})

/**
 * The mirror of `TWO_THINGS`, and the blind spot the comment above dismissed as "usually
 * right, English being the poorer in flexions". Usually is not always: of the twenty-three
 * splits these bundles hold, twenty-one are that flexion and two were drift — `Asset kind`
 * read `Type d'asset` in the usage window against four sites writing `Nature`, and `Metalness`
 * reads two ways still, settled as a product call at `NAMED_TWICE.metalness` below — where the
 * three channels this table could never see are settled with it.
 *
 * The morphological shortcut that would spare most of this table was tried and dropped:
 * skipping a pair when one form starts the other swallows `métal` / `métallicité`, the very
 * split worth seeing. A split names what separates it here, or it is drift.
 */
const TWO_WAYS: Split = {
  added: { reads: ['ajouté le', 'ajouté'], separates: "a file's date field, and a git status" },
  back: { reads: ['de dos', 'précédent'], separates: 'a 3D view, and the explorer step back' },
  changed: { reads: ['modifiés', 'modifié'], separates: 'a count of files, and one file' },
  character: {
    reads: ['personnage', 'caractère'],
    separates: 'what a skeleton is laid on, and the half of a type panel that is not a paragraph',
  },
  crop: {
    reads: ['rogner', 'recadrage'],
    separates: 'the audio tool, which trims, and the image tool, which reframes',
  },
  delete: {
    reads: ['supprimer', 'suppr'],
    separates: 'the action, and the key cap, abbreviated as a keyboard prints it',
  },
  failed: {
    reads: ['échec', 'échouée'],
    separates: "an ingest status, and a job's, which agrees with `tâche`",
  },
  forget: {
    reads: ['retirer', 'oublier'],
    separates:
      'a post preset taken off the list, and a memory the assistant lets go of — which is ' +
      'written down rather than erased, so « retirer » would say the opposite of what happens',
  },
  free: {
    reads: ['libre', 'gratuit'],
    separates: 'a camera aiming at nothing, and what a generation costs',
  },
  group: { reads: ['grouper', 'groupe'], separates: 'the command, and the layer it makes' },
  home: { reads: ['début', 'accueil'], separates: 'the Home key, and the home screen' },
  light: { reads: ['lumière', 'clair'], separates: 'a scene light, and the light theme' },
  media: { reads: ['média', 'médias'], separates: "one file's section, and the setting for all" },
  metalness: {
    reads: ['métallicité', 'métal'],
    separates:
      'the 3D inspector writes the trade word beside `Rugosité`, the materials panel the short ' +
      'one that fits a tile — `docs/fr/manuel/12-espace-matieres.md` says so in as many words. ' +
      'Nothing conceptual separates them: a product call, not a translation one',
  },
  import: {
    reads: ['importer', 'import'],
    separates: 'the File menu, whose rows are verbs, and the journal filter, whose are nouns',
  },
  move: {
    reads: ['déplacer', 'déplacement'],
    separates: 'the scene command, and the canvas tool, whose palette names its tools as nouns',
  },
  'new project': {
    reads: ['créer un projet', 'nouveau projet'],
    separates: 'the button that does it, and the menu entry that names it',
  },
  none: { reads: ['aucune', 'aucun'], separates: 'agreement — a material, and a model' },
  normal: {
    reads: ['normal', 'normale'],
    separates: 'the blend mode, which carries the CSS name, and the normal map',
  },
  open: {
    reads: ['ouvrir', 'ouvert'],
    separates:
      'the action, and a state — nothing reads the KEY `shell.explorer.open`, measured 18/08, ' +
      'so what shows it is unknown rather than settled. Grepping `explorer.open` finds five ' +
      'sites and none of them is it: they are the `LogScope` of the same name',
  },
  new: {
    reads: ['nouveau', 'nouveaux'],
    separates:
      'making one thing — a project, a document — and the files git has never seen, which is a plural',
  },
  pause: {
    reads: ['mettre en pause', 'pause'],
    separates: "the inspector's action, and the transport button, which has room for a word",
  },
  run: {
    reads: ['course', 'jouer'],
    separates: 'a movement Tripo retargets, and starting the game',
  },
  scale: {
    reads: ['redimensionner', 'échelle'],
    separates: 'the scene command, and the property the canvas and the animation show',
  },
  size: {
    reads: ['taille', 'corps'],
    separates: "a dimension, and a font's body size, as the trade names it",
  },
  upscale: {
    reads: ['agrandir', 'agrandissement'],
    separates: 'the canvas command, and the billed action — the mirror of `agrandissement`',
  },
}

const FRENCH_FORMS = formsOf(BUNDLES.en, REFERENCE)

describe('the repeated English terms in the translation bundles', () => {
  it('renders a repeated English label the same way in French', () => {
    expect(driftedIn(FRENCH_FORMS, TWO_WAYS)).toEqual([])
  })

  it('drops a French exemption once the label stops reading both ways', () => {
    expect(staleIn(FRENCH_FORMS, TWO_WAYS)).toEqual([])
  })
})
