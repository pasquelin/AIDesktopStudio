import { Arch } from 'electron-builder'
import { checkEngineRuntime, packagedEngineOf } from './check-engine-runtime.mjs'
import { ENGINELESS_TARGETS } from './fetch-engine.mjs'

export default async function afterPack(context) {
  const arch = Arch[context.arch]
  if (!arch) throw new Error(`Unknown packaged architecture ${context.arch}`)

  // Same reason `beforePack` skips it: a universal macOS build merges two single-arch ones, each
  // already checked through this hook. The two hooks have to agree, or the merge dies here.
  if (arch === 'universal') return

  // Rien à contrôler là où rien n'a été posé — `beforePack` a vidé le dossier.
  const platform = context.electronPlatformName
  if (ENGINELESS_TARGETS.has(`${platform}-${arch}`)) return

  checkEngineRuntime(packagedEngineOf(context), platform, arch)
}
