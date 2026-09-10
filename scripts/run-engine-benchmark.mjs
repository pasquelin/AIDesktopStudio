import { evaluate } from './cdp.mjs'

// Le harnais vit dans le renderer : les deux moteurs ont besoin d'un vrai périphérique, et une
// mesure prise sous node parlerait du chargement des modules, pas d'une image.
const result = await evaluate(
  `(async () => {
    await import('/src/engines/render/engineBenchmark.browser.ts')
    const bench = Reflect.get(window, '__iaBenchmarkRenderEngines')
    if (typeof bench !== 'function') throw new Error('le harnais de banc moteur est absent')
    return await bench()
  })()`,
  { timeout: 300_000 },
)

console.log(JSON.stringify(result, null, 2))

if (!Array.isArray(result) || result.length === 0) {
  throw new Error('le banc n’a mesuré aucun profil')
}

// Le moteur Avancé peut être indisponible — c'est un résultat, pas un échec. Ce qui serait une
// panne, c'est un profil dont AUCUNE colonne n'a de chiffre.
const silent = result.filter(entry => entry.measures.every(measure => measure.submitMs === null))
if (silent.length > 0) {
  throw new Error(`aucun moteur n’a dessiné : ${silent.map(entry => entry.profile).join(', ')}`)
}

const fellBack = result.flatMap(entry =>
  entry.measures
    .filter(measure => measure.engine !== measure.drawnWith)
    .map(measure => `${entry.profile} : ${measure.engine} a été dessiné en ${measure.drawnWith}`),
)
if (fellBack.length > 0) console.log(`\nReplis :\n${fellBack.join('\n')}`)
