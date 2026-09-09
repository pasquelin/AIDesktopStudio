/**
 * The one place the build reaches a third-party host. Three scripts pull a packaging input into
 * the same job — ffmpeg, the Python interpreter, the voice detector — and each owned a copy of
 * this without a retry until 2026-09-09.
 */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'

/**
 * An answer the host will repeat word for word: a pruned autobuild stays pruned, and asking again
 * only burns another packaging job. A cut socket and a 5xx are worth repeating — and so are the
 * two 4xx that say "not now" rather than "no", which is the shape throttling takes when the host
 * bothers to name it.
 */
class Refused extends Error {}

const NOT_NOW = new Set([408, 429])

/**
 * 🛑 Retrying is not enough on its own; the PAUSE is what earns the second answer. Measured
 * 2026-09-09 on the v2.1.0 tag: osxexperts.net served `ffmpeg711arm.zip`, then cut the socket on
 * `ffprobe711arm.zip` 1.3 s later, twice in a row, while both files downloaded whole from a desktop
 * seconds afterwards. The runner was being throttled for asking twice in a second, not refused, so
 * an immediate retry would have been cut too. Each pause is longer than the last for that reason.
 */
const ATTEMPTS = 4
const PAUSE_MS = 3000

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** One whole attempt, headers AND body: a throttled host cuts the socket after answering 200. */
async function fetchOnce(url) {
  const started = performance.now()
  let response
  try {
    response = await fetch(url, { redirect: 'follow' })
  } catch (cause) {
    throw new Error(`Could not reach ${url}: ${cause.message}`, { cause })
  }
  if (!response.ok) {
    const message = `${url} answered ${response.status}`
    const refused = response.status < 500 && !NOT_NOW.has(response.status)
    throw refused ? new Refused(message) : new Error(message)
  }
  const length = response.headers.get('content-length')
  let bytes
  try {
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch (cause) {
    // Without this the failure surfaces as a bare `TypeError: terminated` on an undici stack that
    // names no file — what the first v2.1.0 tag showed, and what cost the run its diagnosis.
    throw new Error(`${url} cut its body: ${cause.message}`, { cause })
  }
  console.log(
    `  ${response.url} ${response.status} ${response.headers.get('content-type') ?? 'unknown'} ` +
      `${bytes.byteLength} bytes in ${Math.round(performance.now() - started)} ms`,
  )
  if (length !== null && bytes.byteLength !== Number(length)) {
    throw new Error(`${response.url} closed at ${bytes.byteLength} bytes, expected ${length}`)
  }
  return bytes
}

/** Writes the file and answers its sha256, which every caller either records or verifies. */
export async function download(url, into, { attempts = ATTEMPTS, wait = sleep } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const bytes = await fetchOnce(url)
      writeFileSync(into, bytes)
      return createHash('sha256').update(bytes).digest('hex')
    } catch (failure) {
      if (failure instanceof Refused || attempt >= attempts) throw failure
      console.log(`  attempt ${attempt} of ${attempts} failed: ${failure.message}`)
      await wait(PAUSE_MS * attempt)
    }
  }
}
