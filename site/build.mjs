#!/usr/bin/env node
/*
 * Rend la vitrine, une fois par langue, depuis le gabarit unique `site/template.html`
 * et les dictionnaires de `site/i18n/`.
 *
 * Un seul gabarit et non un fichier HTML par langue : en markdown la duplication se
 * relit (c'est le choix de `docs/`), en HTML elle dérive — une balise corrigée d'un
 * côté et oubliée de l'autre ne se voit pas. Ici la structure est commune par
 * construction, et ajouter une langue = déposer un JSON.
 *
 * Sortie : la langue par défaut à la racine, les autres dans leur dossier ISO 639-1,
 * comme `docs/fr` <-> `docs/en`.
 *
 *   node site/build.mjs <dossier-de-sortie> [--site=https://hôte/chemin/]
 *
 * CE FICHIER EST PARTAGÉ À L'IDENTIQUE par map3D, panels et AI Desktop Studio. Ce qui change
 * d'un dépôt à l'autre vit dans `repo.config.json`, jamais ici : une correction faite
 * dans un dépôt doit pouvoir être recopiée telle quelle dans les deux autres.
 *
 * Node pur, zéro dépendance : cette page ne doit jamais avoir besoin d'un `install`.
 */
import { readFile, readdir, writeFile, mkdir, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/*
 * Tout ce qui distingue un dépôt d'un autre : nom, dépôt GitHub, URL publiée, langue
 * par défaut, fiche de données structurées, fichiers à copier tels quels. Le moteur
 * n'en sait rien d'autre. Même fichier pour les trois outils partagés — un dépôt n'a
 * qu'un seul endroit à relire quand quelque chose change.
 */
const repo = JSON.parse(await readFile(join(ROOT, 'repo.config.json'), 'utf8'))
const config = repo.site
const DEFAULT_LANG = config.defaultLang ?? 'en'

const [outArg, ...flags] = process.argv.slice(2)
const out = resolve(process.cwd(), outArg ?? '_site')
const site = flags.find((f) => f.startsWith('--site='))?.slice('--site='.length) ?? config.url

/** Échappe ce qui part dans un attribut HTML — les libellés y côtoient des guillemets. */
const attr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')

/** `a.b.c` -> valeur, ou `undefined` si le chemin ne mène nulle part. */
const lookup = (dict, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), dict)

const locales = []
for (const file of (await readdir(join(HERE, 'i18n'))).filter((f) => f.endsWith('.json')).sort()) {
  locales.push(JSON.parse(await readFile(join(HERE, 'i18n', file), 'utf8')))
}
if (!locales.some((l) => l.meta.lang === DEFAULT_LANG)) {
  throw new Error(`Aucun dictionnaire pour la langue par défaut « ${DEFAULT_LANG} »`)
}

/* Parité des dictionnaires : une clé traduite d'un seul côté est une régression, pas
   une variante. On échoue au build plutôt que de publier un `{{...}}` visible. */
const keysOf = (node, prefix = '') =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  )
const reference = locales.find((l) => l.meta.lang === DEFAULT_LANG)
// `meta` décrit la LANGUE (code, nom natif, sens de lecture) et non le contenu : une
// entrée `dir` présente sur le seul arabe n'est pas un désaccord de traduction.
const traduisible = (k) => !k.startsWith('meta.')
const referenceKeys = keysOf(reference).filter(traduisible)
for (const locale of locales) {
  const missing = referenceKeys.filter((k) => lookup(locale, k) === undefined)
  const extra = keysOf(locale)
    .filter(traduisible)
    .filter((k) => !referenceKeys.includes(k))
  if (missing.length || extra.length) {
    throw new Error(
      `Dictionnaire « ${locale.meta.lang} » désaccordé avec « ${DEFAULT_LANG} » :` +
        (missing.length ? `\n  manquantes : ${missing.join(', ')}` : '') +
        (extra.length ? `\n  en trop : ${extra.join(', ')}` : ''),
    )
  }
}

/* Les partiels sont inlinés AVANT la passe de valeurs : `String.replace` ne re-balaie jamais son
   remplacement, donc un partiel passé comme VALEUR publiait ses marqueurs en clair — 141 par page,
   121 distincts, dans les 15 langues (04/09). La forme fonction neutralise les `$&` du HTML injecté. */
const PARTIALS = join(HERE, 'partials')
let template = await readFile(join(HERE, 'template.html'), 'utf8')
for (const file of existsSync(PARTIALS) ? await readdir(PARTIALS) : []) {
  if (!file.endsWith('.html')) continue
  const partial = await readFile(join(PARTIALS, file), 'utf8')
  template = template.replaceAll(`{{${file.slice(0, -'.html'.length)}}}`, () => partial)
}
const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

/** Chemin public d'une langue, relatif à la racine du site. */
const pathOf = (lang) => (lang === DEFAULT_LANG ? '' : `${lang}/`)

for (const locale of locales) {
  const { lang } = locale.meta
  const dir = pathOf(lang)

  // Les autres langues déclarées aux moteurs de recherche, plus le repli x-default.
  const alternates = [
    ...locales.map((l) => `<link rel="alternate" hreflang="${l.meta.lang}" href="${site}${pathOf(l.meta.lang)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${site}" />`,
    `<link rel="canonical" href="${site}${dir}" />`,
  ].join('\n    ')

  // Les liens du sélecteur restent RELATIFS là où les hreflang sont absolus : ils
  // doivent marcher servis depuis n'importe où (preview locale, fork, domaine custom),
  // alors que les hreflang exigent l'URL canonique.
  const root = dir ? '../' : ''
  // Le drapeau suit le `ogLocale` que le dictionnaire déclare déjà : un drapeau désigne un
  // PAYS et non une langue, et le faire découler de la locale évite d'en choisir un second
  // au jugé. Il est décoratif — `aria-hidden` — parce que le nom natif est juste à côté et
  // qu'un lecteur d'écran annoncerait « drapeau de la France » avant de lire « Français ».
  const pavillon = (l) =>
    l.meta.flag ? `<span class="langs__flag" aria-hidden="true">${l.meta.flag}</span>` : ''
  const langSwitch =
    `<details class="langs"><summary class="langs__current" title="${attr(locale.nav.languageLabel)}">` +
    `${pavillon(locale)}<span>${locale.meta.short}</span></summary>` +
    `<ul class="langs__menu" aria-label="${attr(locale.nav.languageLabel)}">` +
    locales
      .map((l) => {
        const courant = l.meta.lang === lang
        const contenu = `${pavillon(l)}<i lang="${l.meta.lang}">${l.meta.name}</i><b>${l.meta.short}</b>`
        return courant
          ? `<li><span class="langs__item" aria-current="true">${contenu}</span></li>`
          : `<li><a class="langs__item" href="${root}${pathOf(l.meta.lang)}" lang="${l.meta.lang}" hreflang="${l.meta.lang}">${contenu}</a></li>`
      })
      .join('') +
    '</ul></details>'

  // Données structurées : c'est ce qui permet à un moteur de comprendre à quoi il a
  // affaire — une bibliothèque, une application — et pas à une page quelconque. Le
  // type et les champs propres au dépôt viennent de `site.config.json`.
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': config.schemaType,
    name: repo.name,
    description: locale.head.description,
    inLanguage: lang,
    url: `${site}${dir}`,
    codeRepository: `https://github.com/${repo.repo}`,
    license: repo.license,
    version,
    author: { '@type': 'Person', name: repo.author },
    ...config.schema,
  })

  const localeAlternates = locales
    .filter((l) => l.meta.lang !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${l.meta.ogLocale}" />`)
    .join('\n    ')

  const values = {
    lang,
    // `dir` vient du dictionnaire : c'est une propriété de la LANGUE, pas du gabarit.
    dir: locale.meta.dir ?? 'ltr',
    docs: locale.meta.docs,
    root,
    version,
    alternates,
    langSwitch,
    jsonld,
    ogLocale: locale.meta.ogLocale,
    localeAlternates,
  }

  const missing = []
  const html = template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    const value = values[key] ?? lookup(locale, key)
    if (value === undefined) missing.push(key)
    // Les valeurs portent du balisage volontaire (<code>, <a>, <br />) : c'est notre
    // propre contenu, jamais une saisie extérieure.
    return value ?? ''
  })
  if (missing.length) throw new Error(`Clés absentes du dictionnaire « ${lang} » : ${[...new Set(missing)].join(', ')}`)

  await mkdir(join(out, dir), { recursive: true })
  await writeFile(join(out, dir, 'index.html'), html)
  console.log(`  ${dir || './'}index.html — ${locale.meta.name}`)
}

for (const asset of config.copy ?? []) {
  await cp(join(HERE, asset), join(out, asset), { recursive: true })
}
/* Les démos compilées entrent dans le site publié, sous le chemin qu'annoncent les liens
   de la vitrine. Chacune est bâtie par son propre bundler (`pnpm build:example`) : ce qui
   est décrit ici est seulement où sa sortie atterrit. Une démo non bâtie est signalée et
   non fatale — la vitrine se relit sans elle. */
for (const { from, to } of config.examples ?? []) {
  if (!existsSync(join(ROOT, from))) {
    console.warn(`  ⚠ ${from} absent — démo non compilée (\`pnpm build:example\`)`)
    continue
  }
  await mkdir(join(out, to), { recursive: true })
  await cp(join(ROOT, from), join(out, to), { recursive: true })
  console.log(`  ${to}/ — démo`)
}
// Ce qui est produit ailleurs — un décor bundlé, une démo, un manifeste écrit par la
// chaîne de publication — n'est pas versionné : sans lui la page s'affiche très bien, en
// moins riche. Le log le dit, plutôt que de laisser chercher un 404 dans la console. Le
// `pourquoi` vient de la config : ce fichier ne sait pas d'où chaque absent aurait dû venir.
for (const optional of config.optional ?? []) {
  const { path, hint } = typeof optional === 'string' ? { path: optional, hint: null } : optional
  if (!existsSync(join(out, path))) {
    console.warn(`  ⚠ ${path} absent${hint ? ` — ${hint}` : ''}`)
  }
}
// Sans ce fichier, Pages passe la sortie dans Jekyll et ignore tout nom en `_`.
await writeFile(join(out, '.nojekyll'), '')

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  locales
    .map((l) => {
      const liens = locales
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.meta.lang}" href="${site}${pathOf(a.meta.lang)}"/>`)
        .join('\n')
      return `  <url>\n    <loc>${site}${pathOf(l.meta.lang)}</loc>\n${liens}\n  </url>`
    })
    .join('\n') +
  '\n</urlset>\n'
await writeFile(join(out, 'sitemap.xml'), sitemap)
await writeFile(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}sitemap.xml\n`)

console.log(`Vitrine rendue dans ${out} (${locales.length} langues, base ${site})`)
