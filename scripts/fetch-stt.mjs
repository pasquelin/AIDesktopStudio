/**
 * Fetches the voice activity detector dictation listens through, into `resources/stt/`.
 *
 * Only the detector, and deliberately so: it weighs 640 KB while the recognition model weighs
 * 640 MB. The small one ships, so the studio can open the microphone, draw a level and know
 * whether anyone is speaking without a download; the large one is fetched at runtime, once, by
 * `main/ai/modelInstall.ts`.
 *
 *     node scripts/fetch-stt.mjs
 *     node scripts/fetch-stt.mjs --digests    # after rotating the URL
 *
 * Unlike ffmpeg there is nothing per-platform here: an ONNX file is the same bytes everywhere,
 * and it is read by the engine rather than executed. The rest is the same discipline — a pinned
 * URL, a recorded digest, and nothing unverified ever left at the path the engine loads from.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { download } from './download.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DESTINATION = join(ROOT, 'resources', 'stt')

/**
 * Silero VAD, as published by the sherpa-onnx project alongside its models. The `asr-models` tag
 * is a permanent release asset, not a rolling one.
 */
export const VAD = {
  name: 'silero_vad.onnx',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
  version: 'v5',
  licence: 'MIT',
  source: 'https://github.com/snakers4/silero-vad',
  digest: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
}

function digestOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

async function stageVad(work, verify) {
  const staged = join(work, VAD.name)
  await download(VAD.url, staged)
  const seen = digestOf(staged)
  if (verify && seen !== VAD.digest) {
    throw new Error(
      `${VAD.name} does not match its recorded digest.\n` +
        `  expected ${VAD.digest}\n  got      ${seen}\n` +
        'Rotate deliberately: update the URL and rerun with --digests.',
    )
  }
  return { staged, seen }
}

function writeNotice(destination) {
  writeFileSync(
    join(destination, 'NOTICE.txt'),
    [
      `Silero VAD ${VAD.version}`,
      `Licence: ${VAD.licence}`,
      `Source: ${VAD.source}`,
      '',
      'A voice activity detector: it decides when someone is speaking, and nothing else.',
      'It is read by the recognition engine, never executed.',
      '',
      'The recognition model itself is NOT here. It is fetched on first use into the user',
      'data folder.',
      '',
    ].join('\n'),
  )
}

/**
 * Puts the detector in `resources/stt/`, replacing whatever was there.
 *
 * `verify: false` skips the comparison and answers what it saw, which is how `--digests` learns
 * the value to pin. Everything else refuses a file that does not match.
 */
export async function fetchStt(options = {}) {
  const destination = options.destination ?? DESTINATION
  const verify = options.verify ?? true

  const work = mkdtempSync(join(tmpdir(), 'ai-desktop-studio-stt-'))
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  try {
    const { staged, seen } = await stageVad(work, verify)
    // Copied rather than renamed: the scratch directory and the repository can sit on different
    // volumes, which makes `rename` fail with EXDEV — the same reason `fetch-ffmpeg` copies.
    writeFileSync(join(destination, VAD.name), readFileSync(staged))

    writeNotice(destination)

    if (!existsSync(join(destination, VAD.name))) {
      throw new Error(`${VAD.name} is missing from ${destination} after the fetch`)
    }

    return { [VAD.name]: seen }
  } catch (error) {
    // Half a fetch looks like a whole one to everything downstream, and a missing detector is a
    // dictation that silently never hears the end of a sentence.
    rmSync(destination, { recursive: true, force: true })
    throw error
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  const printDigests = process.argv.includes('--digests')

  fetchStt({ verify: !printDigests })
    .then(seen => {
      if (printDigests) {
        console.log(`digest: '${seen[VAD.name]}',`)
        return
      }
      console.log(`Silero VAD ${VAD.version} → resources/stt/`)
    })
    .catch(error => {
      console.error(error.message)
      process.exit(1)
    })
}
