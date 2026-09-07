import { useRef, useEffect } from 'react'
import type { Job } from '@shared/domain/job'

export function useCompletedGeneration(job: Job | null, onCompleted?: (job: Job) => void): void {
  const delivered = useRef<string | null>(null)
  useEffect(() => {
    if (job?.status !== 'succeeded' || delivered.current === job.id) return
    delivered.current = job.id
    onCompleted?.(job)
  }, [job, onCompleted])
}
