import { hashPayload, hashRoute } from './hashPayload'

const RETARGET_ROUTE = 'retarget'

export function retargetRoute(sessionId: string): string {
  return hashRoute(RETARGET_ROUTE, sessionId)
}

export function isRetargetRoute(hash: string): boolean {
  return hash.replace(/^#/, '').startsWith(`${RETARGET_ROUTE}/`)
}

export function retargetSessionOf(hash: string): string | null {
  return hashPayload(hash, RETARGET_ROUTE)
}
