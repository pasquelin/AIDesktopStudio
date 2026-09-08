import { isRecord, messageOf } from './guards'
import type { Translations } from './i18n'

export type DiagnosticKey = keyof Translations['diagnostics']
export type DiagnosticValues = Record<string, string | number>
type Diagnostic = { key: string; values: DiagnosticValues }

// Two bounded frames and their relay prefixes must fit in a 4000-character journal entry.
const MAX_PAYLOAD = 1500

function encodedDiagnostic(key: string, values: DiagnosticValues): string {
  return `\u001e${JSON.stringify({ key, values })}\u001f`
}

function readDiagnostic(encoded: string): Diagnostic | null {
  try {
    const held: unknown = JSON.parse(encoded)
    if (!isRecord(held) || typeof held.key !== 'string' || !isRecord(held.values)) return null
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(held.key)) return null
    const values: DiagnosticValues = {}
    for (const [name, value] of Object.entries(held.values)) {
      if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))
        return null
      values[name] = value
    }
    return { key: held.key, values }
  } catch {
    // External diagnostic text may contain framing controls without being a studio error.
    return null
  }
}

function mapDiagnostics(
  message: string,
  convert: (key: string, values: DiagnosticValues) => string,
  textLimit: number = message.length,
): string {
  return message
    .split('\u001e')
    .map((part, index) => {
      if (index === 0) return part.slice(0, textLimit)
      const end = part.indexOf('\u001f')
      const diagnostic = end === -1 ? null : readDiagnostic(part.slice(0, end))
      if (!diagnostic) return `\u001e${part}`.slice(0, textLimit)
      return convert(diagnostic.key, diagnostic.values) + part.slice(end + 1, end + 1 + textLimit)
    })
    .join('')
}

function shortenedDiagnostic(message: string, limit: number): string {
  return mapDiagnostics(
    message,
    (key, values) =>
      encodedDiagnostic(
        key,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            typeof value === 'string' ? shortenedDiagnostic(value, limit) : value,
          ]),
        ),
      ),
    limit,
  )
}

// Shorten only text leaves, never JSON or a nested frame; search for the largest fitting text budget.
function boundedMessage(message: string, maximum: number): string {
  if (message.length <= maximum) return message
  let result = shortenedDiagnostic(message, 0)
  if (result.length > maximum) return encodedDiagnostic('detailsTruncated', {})
  let low = 0
  let high = maximum
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = shortenedDiagnostic(message, middle)
    if (candidate.length <= maximum) {
      result = candidate
      low = middle + 1
    } else high = middle - 1
  }
  return result
}

// Error.message is the only field preserved by both Electron and worker rejection relays.
export function localizedError(key: DiagnosticKey, values: DiagnosticValues = {}): Error {
  return new Error(boundedMessage(encodedDiagnostic(key, values), MAX_PAYLOAD))
}

export function boundedDiagnosticMessage(subject: string, error: unknown, maximum: number): string {
  return boundedMessage(`${subject}: ${messageOf(error)}`, maximum)
}

export function localizeErrorMessage(
  message: string,
  translate: (key: string, values: DiagnosticValues) => string,
): string {
  return mapDiagnostics(message, (key, values) =>
    translate(
      `diagnostics.${key}`,
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          typeof value === 'string' ? localizeErrorMessage(value, translate) : value,
        ]),
      ),
    ),
  )
}
