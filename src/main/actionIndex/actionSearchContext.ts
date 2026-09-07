import type { SnapshotDocument, StudioSnapshot } from '@shared/domain/studioSnapshot'
import { ACTION_TARGET_DESCRIPTORS, type ActionTarget } from '@shared/domain/actionCapabilities'
import type { ContextState } from '@shared/domain/projectContext'
import { foldForSearch, searchWords } from '@shared/text'
import type { ActionSearchScope } from './actionIndex'
import { actionQueryIntent } from './actionLexical'

export function namedActionTarget(
  query: string,
  activeDocument: SnapshotDocument['kind'] | undefined,
): ActionTarget | null {
  const words = new Set(searchWords(query))
  const matched = ACTION_TARGET_DESCRIPTORS.filter(domain =>
    domain.names.some(word => words.has(word)),
  )
  if (matched.length === 1) return matched[0]?.target ?? null
  if (activeDocument === 'scene' && (words.has('fade') || words.has('fondu'))) return 'timeline'
  return null
}

function namedDocument(
  documents: readonly SnapshotDocument[],
  query: string,
): SnapshotDocument | null {
  const request = foldForSearch(query)
  const words = new Set(searchWords(query))
  const navigates = actionQueryIntent(query) === 'execute'
  const matches = documents.filter(document => {
    const title = foldForSearch(document.title)
    const path = document.path ? foldForSearch(document.path) : ''
    return (
      (navigates && title !== '' && request.includes(title)) ||
      (navigates && path !== '' && request.includes(path)) ||
      words.has(document.kind) ||
      words.has(document.workspace)
    )
  })
  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function actionSearchScope(
  snapshot: StudioSnapshot | null,
  query: string,
  availableTargets: readonly ActionTarget[] = [],
): ActionSearchScope {
  const request = foldForSearch(query)
  const refersToSelection = /-(?:la|le|les)\b|\b(?:it|them|lui|sa|son|ses)\b/.test(request)
  const targetsSelection =
    refersToSelection ||
    snapshot?.selection?.items.some(item => {
      const name = foldForSearch(item.name)
      return name !== '' && request.includes(name)
    })
  const targetDocument = namedDocument(snapshot?.documents ?? [], query)
  const domainTarget = namedActionTarget(query, snapshot?.activeDocumentState?.kind)
  return {
    ...(availableTargets.length > 0 ? { availableTargets } : {}),
    ...(domainTarget
      ? { target: domainTarget }
      : snapshot?.selection && targetsSelection
        ? { target: snapshot.selection.kind }
        : targetDocument
          ? { target: 'document' }
          : {}),
    ...(targetDocument
      ? { document: targetDocument.kind, documentAuthority: 'explicit' }
      : snapshot?.activeDocumentState
        ? { document: snapshot.activeDocumentState.kind, documentAuthority: 'active' }
        : {}),
  }
}

export function availableActionTargets(
  context: ContextState,
  query: string,
): readonly ActionTarget[] {
  const words = new Set(searchWords(query))
  return context.cards.some(
    card => card.active && searchWords(`${card.title} ${card.body}`).some(word => words.has(word)),
  )
    ? ['projectContext']
    : []
}
