export type AssetHandlerCalls = {
  listed: unknown[]
  searched: unknown[]
  tagged: unknown[]
  deleted: string[][]
  pulled: string[]
  pushed: string[]
  removedFiles: string[]
  renamedFiles: { id: string; name: string }[]
}

export function assetHandlerCalls(): AssetHandlerCalls {
  return {
    listed: [],
    searched: [],
    tagged: [],
    deleted: [],
    pulled: [],
    pushed: [],
    removedFiles: [],
    renamedFiles: [],
  }
}
