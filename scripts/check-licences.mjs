/**
 * Échoue si la licence d'une dépendance n'est pas de celles que ce projet peut
 * distribuer, ou si quelque chose d'embarqué dans le paquet publié n'a pas sa mention
 * dans THIRD-PARTY-NOTICES.md.
 *
 * Écrit parce que ce fichier est une affirmation juridique, et qu'une affirmation que
 * personne ne revérifie dérive à la première montée de version.
 *
 * CE FICHIER EST PARTAGÉ À L'IDENTIQUE par map3D, panels et AI Desktop Studio. La liste blanche,
 * les paquets embarqués et la nature du dépôt vivent dans `repo.config.json`.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const config = JSON.parse(readFileSync(resolve(root, 'repo.config.json'), 'utf8'))
const regles = config.licences

/** MIT et ses équivalents. Autre chose est une décision, pas un détail — d'où l'échec. */
const AUTORISEES = new Set(regles.allowed)

/** Embarqués dans `dist/`, donc leurs mentions doivent figurer dans THIRD-PARTY-NOTICES.md. */
const EMBARQUES = regles.bundled ?? []

const propre = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
// Le fichier de mentions n'existe que là où quelque chose est réellement embarqué : l'exiger
// partout produirait un fichier vide entretenu pour rien.
const mentions = existsSync(resolve(root, 'THIRD-PARTY-NOTICES.md'))
  ? readFileSync(resolve(root, 'THIRD-PARTY-NOTICES.md'), 'utf8')
  : null

const problemes = []

if (propre.license !== regles.expected) {
  problemes.push(`package.json déclare « ${propre.license} » ; la licence du dépôt est « ${regles.expected} ».`)
}

// Vrai des seules bibliothèques qui se veulent sans dépendance : ce qui est embarqué doit
// rester en devDependencies, ce qui est vraiment requis en peerDependencies. Une
// bibliothèque qui assume ses dépendances, ou une application, ne pose pas la règle.
if (regles.noRuntimeDeps && Object.keys(propre.dependencies ?? {}).length > 0) {
  problemes.push(
    `dépendances runtime déclarées : ${Object.keys(propre.dependencies).join(', ')}. ` +
      "Le code embarqué relève de devDependencies ; ce qui est vraiment requis relève de peerDependencies.",
  )
}

if (EMBARQUES.length > 0 && mentions === null) {
  problemes.push('des paquets sont déclarés embarqués mais THIRD-PARTY-NOTICES.md est absent.')
}
for (const nom of EMBARQUES) {
  if (mentions !== null && !mentions.includes(nom)) problemes.push(`${nom} est embarqué mais n'a aucune mention.`)
  if (!propre.devDependencies?.[nom]) problemes.push(`${nom} est déclaré embarqué mais n'est pas installé.`)
}

/** La licence qu'un paquet déclare, lue dans l'arbre installé. */
function licenceDe(nom) {
  try {
    const trouves = execFileSync('find', [
      'node_modules/.pnpm',
      '-maxdepth',
      '4',
      '-path',
      `*/node_modules/${nom}/package.json`,
    ])
      .toString()
      .split('\n')
      .filter(Boolean)

    if (trouves.length === 0) return null
    return JSON.parse(readFileSync(trouves[0], 'utf8')).license ?? null
  } catch {
    return null
  }
}

const declarees = [
  ...Object.keys(propre.dependencies ?? {}),
  ...Object.keys(propre.devDependencies ?? {}),
  ...Object.keys(propre.peerDependencies ?? {}),
]

for (const nom of declarees) {
  const licence = licenceDe(nom)
  if (licence === null) continue // pas installé ici ; rien à juger
  if (!AUTORISEES.has(licence)) problemes.push(`${nom} est en ${licence}, absent de la liste blanche.`)
}

if (problemes.length > 0) {
  console.error('Contrôle des licences en échec :\n')
  for (const probleme of problemes) console.error(`  · ${probleme}`)
  process.exit(1)
}

console.log(`Licences contrôlées — ${declarees.length} paquets, tous permissifs, mentions présentes.`)
