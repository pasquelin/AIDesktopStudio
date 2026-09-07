import type { InputMapModule } from '@shared/domain/inputMap'

/** What crosses to the transpiler and back. Its own module, so the worker imports no engine. */
export type CodeRequest = {
  id: number
  script: string
  source: string
  inputMaps: readonly InputMapModule[]
}

export type CodeResponse =
  { id: number; code: string } | { id: number; trouble: string; line: number }
