const hosts = new Map<string, () => Promise<void>>()

export function registerRetargetHost(assetId: string, open: () => Promise<void>): () => void {
  hosts.set(assetId, open)
  return () => {
    if (hosts.get(assetId) === open) hosts.delete(assetId)
  }
}

export async function openRetargetForAsset(assetId: string): Promise<void> {
  await hosts.get(assetId)?.()
}

export function hasRetargetHost(assetId: string): boolean {
  return hosts.has(assetId)
}
