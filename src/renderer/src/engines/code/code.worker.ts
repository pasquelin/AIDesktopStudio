/// <reference lib="webworker" />
import { messageOf } from '@shared/guards'
import type { CodeRequest, CodeResponse } from './codeMessage'
import { transpile } from './transpile'

declare const self: DedicatedWorkerGlobalScope

/** TypeScript to JavaScript, off the UI thread — CLAUDE.md invariant 6. */
self.addEventListener('message', (event: MessageEvent<CodeRequest>) => {
  const { id, script, source, inputMaps } = event.data

  try {
    const held = transpile(source, { script, inputMaps })
    self.postMessage({ id, ...held } satisfies CodeResponse)
  } catch (error) {
    self.postMessage({ id, trouble: messageOf(error), line: 0 } satisfies CodeResponse)
  }
})
