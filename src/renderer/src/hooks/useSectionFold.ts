import { useContext, useEffect, useId, useState } from 'react'
import { SectionFoldScope } from '@/components/SectionFoldScope'
import { useSectionFolds } from '@/stores/sectionFolds'

export type SectionFold = { open: boolean; toggle: () => void }

/**
 * Whether one titled group is unfolded, and what the panel-wide order does to it.
 *
 * Apart from `PropertySection` because it is state, not markup: the heading, its buttons and its
 * body are what that component draws, and the three subscriptions under them had made one
 * component of sixty lines out of two things that change for different reasons.
 */
export function useSectionFold(defaultOpen: boolean): SectionFold {
  const id = useId()
  // Whether the panel-wide order reaches this section at all — see `SectionFoldScope`.
  const ordered = useContext(SectionFoldScope)
  const stamp = useSectionFolds(state => state.stamp)
  const wanted = useSectionFolds(state => state.wanted)
  const [held, setHeld] = useState({ stamp, open: defaultOpen })

  // Adjusted during the render rather than in an effect, the way `useCatalogueAssets` takes a new
  // question: an effect would fold the section one frame after the press, visibly.
  if (ordered && held.stamp !== stamp) setHeld({ stamp, open: wanted })

  const open = held.open
  // What the title button reads to know whether it has anything left to fold. The subscription is
  // dropped when the face changes, so sections that went away stop answering for it.
  useEffect(
    () => (ordered ? useSectionFolds.getState().noteSection(id, open) : undefined),
    [ordered, id, open],
  )

  return { open, toggle: () => setHeld(current => ({ ...current, open: !current.open })) }
}
