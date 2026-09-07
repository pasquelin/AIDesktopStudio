export type SizeKind = 'file' | 'class' | 'function' | 'complex' | 'component' | 'hook'

export type SizeFinding = {
  kind: SizeKind
  name: string
  lines: number
  complexity?: number
}

export const LIMITS: Readonly<Record<SizeKind, number>>
export const COMPLEXITY_THRESHOLD: number
export function analyseTypeScript(source: string, filename?: string): SizeFinding[]
export function violationsFor(filename: string, source?: string): SizeFinding[]
export function maintainedFiles(): string[]
export function run(): number
