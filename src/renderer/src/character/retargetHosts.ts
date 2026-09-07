import { createHostRegistry } from '@/helpers/hostRegistry'

const hosts = createHostRegistry<() => Promise<void>>()

export function registerRetargetHost(assetId: string, open: () => Promise<void>): () => void {
  return hosts.hold(assetId, () => open)
}

export async function openRetargetForAsset(assetId: string): Promise<void> {
  await hosts.get(assetId)?.()
}

export function hasRetargetHost(assetId: string): boolean {
  return hosts.get(assetId) !== null
}
