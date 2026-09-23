import { Buffer } from 'node:buffer'
import { mkdirSync, writeFileSync } from 'node:fs'
import { evaluate, harness } from './cdp.mjs'

// Le harnais vit dans le renderer : les deux moteurs ont besoin d'un vrai périphérique, et une
// comparaison faite sous node parlerait du chargement des modules, pas d'une image.
const result = await harness('/src/engines/render/engineParity.browser.ts', {
  handle: '__iaCompareRenderEngines',
  timeout: 300_000,
})

console.log(JSON.stringify(result, null, 2))

if (!Array.isArray(result) || result.length === 0) {
  throw new Error('la parité n’a comparé aucun cas')
}

// Le moteur Avancé peut être indisponible — c'est un résultat, pas un échec. Ce qui serait une
// panne, c'est un cas où l'un des deux côtés n'a rien dessiné du tout.
const blank = result.flatMap(entry =>
  entry.failed
    ? []
    : ['gl', 'gpu']
        .filter(engine => !entry.drew?.[engine])
        .map(engine => `${entry.case} : le côté ${engine} n’a dessiné qu’une couleur`),
)

const fellBack = result.filter(entry => entry.drawnWith?.gpu === 'gl')
if (fellBack.length > 0) {
  console.log(
    `\nRepli : l'Avancé a été dessiné en Compatible sur ${fellBack.map(one => one.case).join(', ')}` +
      ` — sur cette machine la comparaison ne compare rien.`,
  )
}

// Les deux images de chaque cas, parce qu'un taux n'est pas un diagnostic : un côté qui n'a rien
// dessiné, une image retournée et une image simplement plus sombre donnent le même nombre. La
// capture d'export que le critère d'acceptation demande est l'une d'elles, `still-gpu.png`.
const frames = process.env.PARITY_FRAMES_DIR
if (frames) {
  const held = await evaluate(`Reflect.get(window, '__iaEngineParityFrames') ?? null`)
  if (!held) throw new Error('aucune image n’a été retenue')
  mkdirSync(frames, { recursive: true })
  for (const [name, sides] of Object.entries(held)) {
    for (const [engine, bytes] of Object.entries(sides)) {
      writeFileSync(`${frames}/${name}-${engine}.png`, Buffer.from(bytes))
    }
  }
  console.log(`\nImages écrites dans ${frames}`)
}

if (blank.length > 0) throw new Error(`un côté n’a rien dessiné —\n${blank.join('\n')}`)

/**
 * Ce qu'un cas a le droit de faire bouger. Ce sont des MARGES posées au-dessus des mesures du
 * 11 septembre 2026 sur cette machine, et non ces mesures arrondies : elles gardent contre une
 * image noire ou plate, pas contre une dérive de quelques pour cent — resserrer demanderait
 * plusieurs exécutions sur plusieurs machines, et aucune n'a été faite. Le cas `material` n'a pas
 * de plafond : l'écart y est CONNU et attendu (la cavité tombe sur la couleur diffuse côté
 * nœuds, donc un métal diffère), il est rapporté et jamais transformé en réussite ou en échec.
 */
// `temporal` est haut, et c'est délibéré : cette ligne garde l'absence de la COULEUR PLATE qu'un
// nœud temporel donne sur une image unique — un retour en arrière la porterait à 100 %. Les 13,6 %
// mesurés sont un écart de TON entre le rendu droit du composeur et celui du viewport sans
// composeur, antérieur à ce lot et écrit dans le rapport.
const CEILINGS = { scene: 0.01, occlusion: 0.06, still: 0.02, film: 0.02, temporal: 0.2 }

const drifted = result.flatMap(entry => {
  if (entry.failed) return []
  const ceiling = CEILINGS[entry.case]
  if (ceiling === undefined) return []
  return entry.changedPixelRatio <= ceiling
    ? []
    : [
        `${entry.case} : ${(entry.changedPixelRatio * 100).toFixed(2)} % des pixels diffèrent,` +
          ` plafond ${(ceiling * 100).toFixed(2)} %`,
      ]
})

const failed = result.filter(entry => entry.failed)
if (failed.length > 0) {
  throw new Error(
    `des cas n’ont pas pu être comparés —\n${failed.map(one => `${one.case} : ${one.failed}`).join('\n')}`,
  )
}

// Après les images : un écart se regarde avant de se discuter, et le répertoire est déjà écrit.
if (drifted.length > 0) {
  throw new Error(`les deux moteurs ne dessinent plus la même chose —\n${drifted.join('\n')}`)
}
