import type { AnimationRow } from '@/engines/timeline/bandRows'
import { AnimationHeadersChannel } from './AnimationHeadersChannel'
import { AnimationHeadersClip } from './AnimationHeadersClip'
import { AnimationHeadersSubject } from './AnimationHeadersSubject'

export function AnimationHeadersRow({
  documentId,
  row,
  shown,
}: {
  documentId: string
  row: AnimationRow
  shown: readonly string[]
}) {
  if (row.kind === 'subject')
    return <AnimationHeadersSubject documentId={documentId} row={row} shown={shown} />
  if (row.kind === 'channel') return <AnimationHeadersChannel documentId={documentId} row={row} />
  return <AnimationHeadersClip documentId={documentId} row={row} />
}
