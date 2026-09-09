import { create } from 'zustand'
import type { DocumentKind } from '@shared/domain/document'
import { getBridge } from '@/services/bridge'
import { reportFailure } from '@/services/diagnostics'
import { withoutKey } from '@/helpers/objects'

/** A copy read off disk, and whether that read found everything the file names. */
type SourceCopy<S, A> = { state: S; whole: boolean; against: A | undefined }

export type DocumentSource<S> = {
  /** What the file holds, or `null` while no read has landed. Never the open tab's — see `held`. */
  copyOf: (documentId: string) => S | null
  /** The copy as a hook, for a panel. Same reading as `copyOf`, without its side effect. */
  useCopyOf: (documentId: string) => S | null
  /** Reads the file once. A second ask while one is in flight, or after one landed, does nothing. */
  load: (documentId: string) => Promise<void>
  /** Drops the copy, so the next `load` reads the file again — what opening a tab does. */
  forget: (documentId: string) => void
  /** Every landing of a read, so a window can push it into an engine that subscribes to nothing. */
  subscribe: (listen: (documentIds: readonly string[]) => void) => () => void
}

export type DocumentSourceOptions<S, A> = {
  kind: DocumentKind
  /** The file's payload, through the very door an open tab comes through. */
  parse: (payload: unknown, documentId: string) => S
  /**
   * Whether a read found everything the file NAMES. Absent means it always does — the reader
   * resolves nothing against the catalogue, so a read can only be complete.
   */
  whole?: (state: S, payload: unknown) => boolean
  /**
   * What the read was resolved against, as identities, and whether one has landed since. A file
   * naming its pictures by PATH resolves nothing before the catalogue and the listing arrive.
   */
  against?: () => A
  landed?: (against: A) => boolean
}

type SourceState<S, A> = {
  copies: Record<string, SourceCopy<S, A>>
  /** Which reads are in flight, so sixty asks a second read the file once. */
  reading: Set<string>
}

/**
 * The copies of documents that ANOTHER document names, read off disk because no tab holds them.
 * The CHOICE between this copy and the open tab stays the caller's: only it knows which store
 * holds the tabs, and the tab always wins — that is where the edits land.
 */
export function createDocumentSource<S, A = never>({
  kind,
  parse,
  whole,
  against,
  landed,
}: DocumentSourceOptions<S, A>): DocumentSource<S> {
  const use = create<SourceState<S, A>>()(() => ({ copies: {}, reading: new Set() }))

  const usable = (copy: SourceCopy<S, A>): boolean =>
    copy.whole || !landed || copy.against === undefined || !landed(copy.against)

  const forget = (documentId: string): void => {
    const held = use.getState()
    if (!(documentId in held.copies) && !held.reading.has(documentId)) return

    held.reading.delete(documentId)
    use.setState({ copies: withoutKey(held.copies, documentId) })
  }

  const copyOf = (documentId: string): S | null => {
    const copy = use.getState().copies[documentId]
    if (!copy) return null
    if (usable(copy)) return copy.state

    // Dropped so the next ask reads the file again — and only from here: `forget` writes to a
    // store, which a component asking the same question during its render may not do.
    forget(documentId)
    return null
  }

  return {
    copyOf,
    forget,

    useCopyOf: documentId => {
      const copy = use(state => state.copies[documentId] ?? null)
      return copy && usable(copy) ? copy.state : null
    },

    subscribe: listen =>
      use.subscribe((state, before) => {
        const landing = Object.keys(state.copies).filter(
          id => state.copies[id] !== before.copies[id],
        )
        if (landing.length > 0) listen(landing)
      }),

    load: async documentId => {
      const bridge = getBridge()
      if (!bridge || use.getState().reading.has(documentId)) return
      use.getState().reading.add(documentId)

      try {
        const file = await bridge.documents.read(documentId, kind)
        // 🛑 The flag goes back here too: a document nothing was ever written under would other-
        // wise stay « being read » for the life of the window, and every later ask return at once.
        if (!file) {
          use.getState().reading.delete(documentId)
          return
        }

        // Parsed ONCE and handed to both: `DocumentFile.content` is serialized TEXT, and a reader
        // given the string finds nothing in it — the defect this family was hit by twice.
        const payload: unknown = JSON.parse(file.content)
        const state = parse(payload, documentId)
        use.setState(held => ({
          copies: {
            ...held.copies,
            [documentId]: {
              state,
              whole: whole ? whole(state, payload) : true,
              against: against?.(),
            },
          },
        }))
      } catch (error) {
        // The flag goes back, or a file caught mid-rewrite by another window is never read again.
        use.getState().reading.delete(documentId)
        reportFailure('document.load', documentId, error)
      }
    },
  }
}
