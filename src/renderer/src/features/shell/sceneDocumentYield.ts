const channel = new MessageChannel()
const waiting: Array<() => void> = []

channel.port1.addEventListener('message', () => waiting.shift()?.())
channel.port1.start()

/** Yields to a new task without the nested-timer delay browsers add after repeated timeouts. */
export function yieldSceneDocument(): Promise<void> {
  return new Promise(resolve => {
    waiting.push(resolve)
    channel.port2.postMessage(null)
  })
}
