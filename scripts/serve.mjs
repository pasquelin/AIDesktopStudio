/**
 * Sert un dossier statique, pour relire la vitrine telle qu'elle sera publiée.
 *
 * Node pur, zéro dépendance, pour la même raison que `site/build.mjs` : la page se
 * regarde sans rien installer. Et c'est le même serveur pour les trois dépôts, donc
 * ce qu'on voit en local ne dépend pas de l'outil qui l'a servi.
 *
 * CE FICHIER EST PARTAGÉ À L'IDENTIQUE par map3D, panels et AI Desktop Studio.
 *
 *   node scripts/serve.mjs [dossier] [--port=8080] [--base=/nom-du-depot/]
 *
 * `--base` monte le site sous le même chemin qu'en production : sur GitHub Pages un site
 * de projet est servi sous `/nom-du-depot/`, et une preview servie à la racine cacherait
 * exactement les liens absolus qui casseraient une fois publiés.
 */
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { URL } from 'node:url'

const [dirArg, ...flags] = process.argv.slice(2).filter((a) => !a.startsWith('--') || a.startsWith('--port='))
const racine = resolve(process.cwd(), dirArg && !dirArg.startsWith('--') ? dirArg : '_site')
const port = Number(flags.find((f) => f.startsWith('--port='))?.slice('--port='.length) ?? 8080)
const base = (process.argv.slice(2).find((f) => f.startsWith('--base='))?.slice('--base='.length) ?? '/').replace(
  /\/*$/,
  '/',
)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.hdr': 'image/vnd.radiance',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const serveur = createServer(async (requete, reponse) => {
  // `normalize` puis vérification du préfixe : sans quoi `/../..` sortirait du dossier.
  const demande = decodeURIComponent(new URL(requete.url, 'http://localhost').pathname)
  if (base !== '/' && !demande.startsWith(base)) {
    // Hors du préfixe : on renvoie vers lui plutôt que de servir un 404 que la production
    // n'aurait jamais donné.
    reponse.writeHead(302, { location: base }).end()
    return
  }
  const chemin = base === '/' ? demande : demande.slice(base.length - 1)
  let cible = normalize(join(racine, chemin))
  if (cible !== racine && !cible.startsWith(racine + sep)) {
    reponse.writeHead(403).end('403')
    return
  }

  try {
    let infos = await stat(cible)
    if (infos.isDirectory()) {
      cible = join(cible, 'index.html')
      infos = await stat(cible)
    }
    reponse.writeHead(200, {
      'content-type': TYPES[extname(cible).toLowerCase()] ?? 'application/octet-stream',
      'content-length': infos.size,
      // Une relecture ne doit jamais montrer l'état d'avant la correction qu'on vient de faire.
      'cache-control': 'no-store',
    })
    createReadStream(cible).pipe(reponse)
  } catch {
    reponse.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 — ${demande}`)
  }
})

serveur.listen(port, () => {
  console.log(`${racine}\n  → http://localhost:${port}${base}`)
})
