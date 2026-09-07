/**
 * A typed reference to one thing the studio holds — what a script, a component field or an MCP
 * call names when it points at something else.
 *
 * **Typed rather than a bare identifier, and that is the whole of it.** A uuid on its own does
 * not say whether to ask the catalogue, a document store or the disk, and a resolver that tries
 * all three answers wrongly once in a while without anything going red. It is added OVER the
 * identifiers already written in thousands of documents; nothing is renamed.
 *
 * **`document` rides in the reference of everything a document HOLDS.** A node identifier is
 * unique inside its document, not inside the project, so duplicating a scene produces exactly
 * that collision.
 *
 * `script` carries a PATH and not an identifier: a script is an ordinary `.ts` file of the
 * project. What turns `prefab` and `script` identifiers into something resolvable is the table
 * `game.json` holds — see `domain/game.ts`.
 */
export type Ref =
  | { kind: NamedKind; id: string }
  | { kind: PartKind; document: string; id: string }
  | { kind: 'component'; document: string; entity: string; type: string }
  | { kind: 'script'; path: string }

/** What the project names on its own, without a document to hold it. */
export type NamedKind = 'asset' | 'document' | 'prefab'

/** What a document holds under an identifier of its own. */
export type PartKind = 'entity' | 'track' | 'clip' | 'shot' | 'layer'

const NAMED_KINDS: readonly NamedKind[] = ['asset', 'document', 'prefab']
const PART_KINDS: readonly PartKind[] = ['entity', 'track', 'clip', 'shot', 'layer']

/**
 * The reference as one string — `asset:asset_1`, `entity:<document>/<node>`.
 *
 * Readable on purpose, rather than percent-encoded: this is what a model writes into an MCP
 * argument and what a reader has to recognise in a log. **The price is written and measured by
 * its own case**: an identifier holding a `/` produces a string `refFromString` cannot read
 * back, since `/` is what separates the parts. No identifier in this repository holds one —
 * they are uuids, or a uuid behind a prefix — and a path, which does, is only ever last.
 */
export function refToString(ref: Ref): string {
  if (ref.kind === 'script') return `script:${ref.path}`
  if (ref.kind === 'component') return `component:${ref.document}/${ref.entity}/${ref.type}`
  if ('document' in ref) return `${ref.kind}:${ref.document}/${ref.id}`
  return `${ref.kind}:${ref.id}`
}

/**
 * The reference back, or `null` for anything that is not one — never a throw. What reads these
 * is a script the user wrote and an argument a model composed, so a malformed one is the
 * ordinary case rather than a fault.
 */
export function refFromString(text: string): Ref | null {
  const cut = text.indexOf(':')
  if (cut <= 0) return null

  const kind = text.slice(0, cut)
  const rest = text.slice(cut + 1)

  // The whole tail, `/` included: a script is named by its path inside the project.
  if (kind === 'script') return rest.length > 0 ? { kind, path: rest } : null

  const parts = rest.split('/')
  if (kind === 'component') return componentRef(parts)
  if (isPartKind(kind)) return partRef(kind, parts)
  if (isNamedKind(kind)) return namedRef(kind, parts)
  return null
}

function componentRef(parts: string[]): Ref | null {
  const [document, entity, type] = parts
  return parts.length === 3 && document && entity && type
    ? { kind: 'component', document, entity, type }
    : null
}

function partRef(kind: PartKind, parts: string[]): Ref | null {
  const [document, id] = parts
  return parts.length === 2 && document && id ? { kind, document, id } : null
}

function namedRef(kind: NamedKind, parts: string[]): Ref | null {
  const [id] = parts
  return parts.length === 1 && id ? { kind, id } : null
}

const isNamedKind = (value: string): value is NamedKind => NAMED_KINDS.some(kind => kind === value)

const isPartKind = (value: string): value is PartKind => PART_KINDS.some(kind => kind === value)
