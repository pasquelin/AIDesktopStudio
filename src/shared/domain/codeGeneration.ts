import { isCloudProviderId, type CloudProviderId } from './aiCloud'

/**
 * What a code generation is made of, and what comes back — read by both processes. The window
 * fills the body; the main process composes the two messages and strips the fence.
 */

/** The script the generation reworks, when there is one. Empty for a `txt2code`. */
export const CODE_SOURCE_FIELD = 'source'

/**
 * The declaration a script types against — `game/api/studio.d.ts`, carried in the BODY.
 *
 * 🛑 MEASURED TWICE: the main process cannot inline it. electron-vite writes its CommonJS shim
 * after the last static import it finds by regex, and this file's own `import … from` lines are
 * inside the string — `pnpm build` dies on an unterminated literal while `pnpm validate` is green.
 */
export const CODE_API_FIELD = 'api'

/**
 * `cloud:<cloudId>` — what a generation names as its model when the CLOUD is the model.
 *
 * The case of a cloud that publishes no catalogue: there is no row for a browser to have picked,
 * so the account itself is the choice, and which of its models answers is its own setting.
 */
const CLOUD_PREFIX = 'cloud:'

export function cloudModelId(cloud: CloudProviderId): string {
  return `${CLOUD_PREFIX}${cloud}`
}

/**
 * The cloud such an id names, or nothing for anything else — a model of this machine, a catalogue
 * row, a stored id this build no longer knows.
 */
export function cloudOfModelId(modelId: string): CloudProviderId | null {
  if (!modelId.startsWith(CLOUD_PREFIX)) return null

  const cloud = modelId.slice(CLOUD_PREFIX.length)
  return isCloudProviderId(cloud) ? cloud : null
}

/**
 * What a chat may write when the form says nothing — a script, not a sentence.
 *
 * Shared because both halves read it: the descriptor opens its `maxTokens` on it, and the runner
 * falls back to it for a body that carries none.
 */
export const CODE_MAX_TOKENS = 4096

export type CodeAsk = {
  readonly prompt: string
  /** The script to rework, or nothing — which is what tells `code2code` from `txt2code`. */
  readonly source: string | null
  readonly api: string
}

/**
 * The instruction, deliberately short: what makes an answer usable is that it carries NOTHING but
 * the script.
 *
 * 🛑 No line here may read as `import … from "…"`. MEASURED: electron-vite finds the last static
 * import by regex and writes its CommonJS shim after it, so such a sentence takes the shim INSIDE
 * the string — `pnpm build` then dies on an unterminated literal, and `pnpm validate` is green.
 */
const RULES: readonly string[] = [
  'You write TypeScript for the AI Desktop Studio script runtime.',
  'Answer with the SCRIPT ALONE: no prose, no explanation, no Markdown fence.',
  'A script may reach "@studio" and nothing else: no filesystem, no network, no DOM.',
  'The declaration below is the whole of what a script can reach.',
]

/** The two messages a chat is asked with — composed once, for a cloud as for this machine. */
export function codeChatPrompt(ask: CodeAsk): { system: string; user: string } {
  return {
    system: [...RULES, '', ask.api].join('\n'),
    user:
      ask.source === null
        ? ask.prompt
        : [ask.prompt, '', 'The script to rework, in full:', ask.source].join('\n'),
  }
}

/**
 * The script a chat answered, with the fence taken off.
 *
 * 🛑 Asked for and stripped anyway: every one of these clouds fences code some of the time, and a
 * script opening on ``` does not compile. Only an answer that OPENS on a fence is touched, and
 * only up to the first line that closes it — a sentence after the fence is dropped with it, where
 * a script whose own text holds three backticks is left whole.
 */
export function unfencedCode(answer: string): string {
  const trimmed = answer.trim()
  const opening = /^```[^\n]*\n/.exec(trimmed)
  if (!opening) return trimmed

  const body = trimmed.slice(opening[0].length)
  const closing = /\n?```[^\n]*$|\n```/.exec(body)
  return closing ? body.slice(0, closing.index).trimEnd() : trimmed
}
