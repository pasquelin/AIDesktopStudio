import { useSyncExternalStore } from 'react'
import { mountedGenerator, subscribeGenerator } from '@/features/assistant/generatorBridge'

function currentSubmission() {
  return mountedGenerator()?.submitComment ?? null
}

export function useGeneratorCommentSubmission() {
  return useSyncExternalStore(subscribeGenerator, currentSubmission, currentSubmission)
}
