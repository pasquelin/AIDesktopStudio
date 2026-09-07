import { Arch } from 'electron-builder'
import { checkEngineRuntime, packagedEngineOf } from './check-engine-runtime.mjs'

export default async function afterPack(context) {
  const arch = Arch[context.arch]
  if (!arch || arch === 'universal')
    throw new Error(`Unknown packaged architecture ${context.arch}`)
  checkEngineRuntime(packagedEngineOf(context), context.electronPlatformName, arch)
}
