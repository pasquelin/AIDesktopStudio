import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { focusableWithin } from '@/helpers/focusableWithin'

export function useVirtualFieldFocus(
  count: number,
  rowHeight: number,
  scroll: RefObject<HTMLDivElement | null>,
  virtualItems: VirtualItem[],
) {
  const pendingFocus = useRef<{ index: number; edge: 'first' | 'last' } | null>(null)
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending) return
    const row = scroll.current?.querySelector(`[data-virtual-field-index="${pending.index}"]`)
    if (!row) return
    const focusable = focusableWithin(row)
    const target = pending.edge === 'first' ? focusable[0] : focusable.at(-1)
    if (!target) return
    pendingFocus.current = null
    target.focus()
  }, [virtualItems, scroll])

  return (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab' || !(event.target instanceof Element)) return
    const row = event.target.closest<HTMLElement>('[data-virtual-field-index]')
    if (!row) return
    const focusable = focusableWithin(row)
    const edge = event.shiftKey ? focusable[0] : focusable.at(-1)
    if (event.target !== edge) return
    const index = Number(row.dataset.virtualFieldIndex)
    const next = index + (event.shiftKey ? -1 : 1)
    if (next < 0 || next >= count) return
    if (scroll.current?.querySelector(`[data-virtual-field-index="${next}"]`)) return
    event.preventDefault()
    pendingFocus.current = { index: next, edge: event.shiftKey ? 'last' : 'first' }
    scroll.current?.scrollTo({ top: next * rowHeight })
  }
}
