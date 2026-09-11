/**
 * Parle au renderer d'une app lancée par `pnpm start:debug`, sans dépendance.
 *
 * Node 22+ porte WebSocket nativement, donc le protocole DevTools se parle en une page de code —
 * ce qui remplace un serveur MCP absent, et ne peut pas disparaître d'une session à l'autre.
 *
 *   node scripts/cdp.mjs "expression JS évaluée dans la fenêtre"
 *   node scripts/cdp.mjs --file mesure.js
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const PORT = process.env.CDP_PORT ?? '9222'

async function rendererTarget() {
  const listed = await fetch(`http://localhost:${PORT}/json/list`)
  const targets = await listed.json()
  // La fenêtre du studio, jamais un devtools ni un worker : eux n'ont pas la scène.
  const page = targets.find(one => one.type === 'page' && !one.url.startsWith('devtools://'))
  if (!page) throw new Error(`aucune fenêtre sur le port ${PORT} — l'app tourne-t-elle en debug ?`)
  return page.webSocketDebuggerUrl
}

/**
 * Charge un harnais du renderer et appelle ce qu'il a posé sur `window`.
 *
 * Trois scripts en avaient chacun leur copie : un harnais vit dans le renderer parce que ni les
 * moteurs ni les mondes ne se mesurent sous node, et le seul moyen de l'atteindre est l'import
 * dynamique que le serveur de dev sert, suivi de la lecture du handle.
 */
export async function harness(modulePath, { handle, timeout = 30_000 }) {
  return await evaluate(
    `(async () => {
      await import(${JSON.stringify(modulePath)})
      const run = Reflect.get(window, ${JSON.stringify(handle)})
      if (typeof run !== 'function') throw new Error('harnais absent : ${handle}')
      return await run()
    })()`,
    { timeout },
  )
}

export async function evaluate(expression, { timeout = 30_000 } = {}) {
  const socket = new WebSocket(await rendererTarget())
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP refusé')), { once: true })
  })

  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP sans réponse')), timeout)
      socket.addEventListener('message', event => {
        const message = JSON.parse(event.data)
        if (message.id !== 1) return
        clearTimeout(timer)
        const { result, exceptionDetails } = message.result ?? {}
        if (exceptionDetails) reject(new Error(exceptionDetails.text ?? 'exception'))
        else resolve(result?.value)
      })
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      )
    })
  } finally {
    socket.close()
  }
}

// `pathToFileURL`, jamais une concaténation : le dossier du projet porte une espace, que
// `import.meta.url` encode et que `process.argv[1]` laisse telle quelle — la comparaison naïve
// était toujours fausse, et ce fichier ne faisait rien du tout.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const source = args[0] === '--file' ? readFileSync(args[1], 'utf8') : args.join(' ')
  const value = await evaluate(source)
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}
