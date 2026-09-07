import { isLocalPicture, PICTURES } from '@shared/domain/asset'
import { placeAsset } from '@/features/image/placeAsset'
import { createGenerationLanding } from './generationLanding'
import type { AiRoleId } from '@shared/domain/aiRole'
import { isFinished, type Job } from '@shared/domain/job'
import type { LandingTarget } from '@shared/domain/landingTarget'
import { useJobs } from './jobs'

const targetLayers = new Map<string, string>()

/**
 * An image generation comes back into the canvas it was launched from — the whole batch, unlike
 * the sky and the scene. See `generationLanding`, which documents what `takes` means.
 */
const landing = createGenerationLanding({
  kind: 'image',
  accepts: isLocalPicture,
  types: PICTURES,
  takes: 'every',
  scope: 'canvas.place',
  land: (documentId, asset, jobId) => placeAsset(documentId, asset, targetLayers.get(jobId)),
  onSettled: jobId => targetLayers.delete(jobId),
})

export function claimImageOnSubmit(
  into?: LandingTarget,
  _role?: AiRoleId | null,
  imageLayerId?: string,
): (job: Job | null) => void {
  const claim = landing.claimOnSubmit(into)
  return job => {
    claim(job)
    if (job && imageLayerId) targetLayers.set(job.id, imageLayerId)
  }
}

export function connectImageGeneration(): () => void {
  const stop = landing.connect()
  const stopFailures = useJobs.subscribe(state => {
    for (const job of state.jobs) {
      if (isFinished(job.status) && job.status !== 'succeeded') targetLayers.delete(job.id)
    }
  })
  return () => {
    stop()
    stopFailures()
    targetLayers.clear()
  }
}
