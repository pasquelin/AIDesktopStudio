import { evaluate } from './cdp.mjs'

const result = await evaluate(
  `(async () => {
    await import('/src/engines/scene/worldSafeValidation.browser.ts')
    const validate = Reflect.get(window, '__iaValidateWorldBenchmarks')
    if (typeof validate !== 'function') throw new Error('le harnais SAFE WebGL est absent')
    return await validate()
  })()`,
  { timeout: 180_000 },
)

console.log(JSON.stringify(result, null, 2))

// Aucune liste de scènes ici : chaque entrée porte ses propres attentes, tirées de ce que le décor
// DÉCLARE (`worldBenchmarkScenes.fixture`), et `worldBenchmarkScenes.test.ts` tient le recensement.
if (!Array.isArray(result) || result.length === 0) {
  throw new Error('la validation SAFE n’a mesuré aucune scène')
}

const failures = result.flatMap(entry => {
  const missing = (entry.expects ?? []).filter(measure => !(entry[measure] > 0))
  return [
    ...(entry.equivalent === true ? [] : [`${entry.id} : une différence détectée`]),
    ...(entry.nonUniformFrames === entry.renderedFrames
      ? []
      : [`${entry.id} : ${entry.nonUniformFrames}/${entry.renderedFrames} images non uniformes`]),
    ...(entry.observedPickSamples > 0 ? [] : [`${entry.id} : aucun pick observé`]),
    ...(entry.scriptFaults === 0 ? [] : [`${entry.id} : ${entry.scriptFaults} fautes de script`]),
    ...missing.map(measure => `${entry.id} : ${measure} attendu non nul`),
  ]
})

if (failures.length > 0) throw new Error(`la validation SAFE a échoué —\n${failures.join('\n')}`)
