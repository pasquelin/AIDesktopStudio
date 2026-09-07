/**
 * Assemble `llms-full.txt` à partir de la documentation qui existe déjà.
 *
 * Généré et non écrit : c'est le même texte que `docs/`, et une seconde copie tenue à
 * la main est une copie qui dérive. `pnpm validate` le régénère et échoue si le fichier
 * versionné est périmé — les deux ne peuvent donc pas se contredire.
 *
 * Anglais seulement. Les chapitres français disent la même chose, et doubler le fichier
 * dépenserait le contexte d'un lecteur en traduction plutôt qu'en sujet.
 *
 * CE FICHIER EST PARTAGÉ À L'IDENTIQUE par map3D, panels et AI Desktop Studio. La liste des
 * chapitres vit dans `repo.config.json`, jamais ici.
 *
 *   node scripts/make-llms.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'repo.config.json'), 'utf8')).llms
const read = (name) => readFileSync(resolve(root, name), 'utf8').trim()

/** Dans l'ordre de lecture : ce que c'est, comment s'en servir, comment ça marche dedans. */
const PARTS = config.parts

/** Les liens entre langues et les flèches « retour au sommaire » ne veulent rien dire à plat. */
function sansNavigation(texte) {
  return texte
    .split('\n')
    .filter((ligne) => !/^🇫🇷 \[|^🇬🇧 \[/.test(ligne.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const corps = PARTS.map(([fichier, titre]) => {
  const texte = sansNavigation(read(fichier))
  if (titre === null) return texte
  return `\n\n${'='.repeat(78)}\n${titre}\n${'='.repeat(78)}\n\n${texte}`
}).join('')

const attendu = `${corps}\n`
const cible = resolve(root, 'llms-full.txt')

if (process.argv.includes('--check')) {
  let tenu = ''
  try {
    tenu = readFileSync(cible, 'utf8')
  } catch {
    // Pas encore écrit ; l'écart ci-dessous le signale.
  }

  if (tenu !== attendu) {
    console.error('llms-full.txt est périmé. Lancer `pnpm llms` et versionner le résultat.')
    process.exit(1)
  }

  console.log('llms-full.txt est à jour.')
} else {
  writeFileSync(cible, attendu)
  console.log(`llms-full.txt écrit — ${attendu.split('\n').length} lignes depuis ${PARTS.length} fichiers.`)
}
