import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import type { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { stackShapeKey, type PostStack } from '@shared/domain/postProcessing'
import type { EffectInstance } from './effectInstance'

export type PostChain = {
  key: string
  users: Set<string>
  composer: EffectComposer
  head: RenderPass | null
  appliers: readonly EffectInstance['apply'][]
  instances: readonly EffectInstance[]
  width: number
  height: number
  usedAt: number
}

/**
 * When to sweep the chains NOBODY is drawing through. Not a cap on the total: a chain a surface
 * still uses is never taken, so a layout with enough stateful surfaces holds more than this.
 */
const SWEEP_ABOVE = 6

export class PostChainCache {
  private readonly chains = new Set<PostChain>()
  private readonly bindings = new Map<string, PostChain>()

  acquire(key: string, binding: string, width: number, height: number): PostChain | undefined {
    const current = this.bindings.get(binding)
    if (current && sameSize(current, width, height)) return current
    const matched = this.match(key, width, height)
    if (!matched && current?.users.size === 1) return current
    if (current) {
      current.users.delete(binding)
      this.bindings.delete(binding)
      // Spare passes survive splitter changes, but their full-size GPU targets do not.
      if (current.users.size === 0) resizePostChain(current, 1, 1)
    }
    const chain = matched ?? this.spare(key)
    if (chain) this.bind(binding, chain)
    else this.evict()
    return chain
  }

  bind(binding: string, chain: PostChain): void {
    chain.users.add(binding)
    this.bindings.set(binding, chain)
    this.chains.add(chain)
  }

  sweep(live: readonly PostStack[]): void {
    const wanted = new Set(live.map(stackShapeKey))
    for (const chain of this.chains) {
      if (!wanted.has(chain.key.slice(0, chain.key.indexOf('#')))) this.drop(chain)
    }
  }

  releaseSurface(surface: string): void {
    for (const [binding, chain] of this.bindings) {
      if (!binding.endsWith(`#${surface}`)) continue
      this.bindings.delete(binding)
      chain.users.delete(binding)
      if (chain.users.size === 0) this.drop(chain)
    }
  }

  dispose(): void {
    for (const chain of this.chains) this.drop(chain)
  }

  private match(key: string, width: number, height: number): PostChain | undefined {
    for (const chain of this.chains) {
      if (chain.key === key && sameSize(chain, width, height)) return chain
    }
    return undefined
  }

  private spare(key: string): PostChain | undefined {
    for (const chain of this.chains) {
      if (chain.key === key && chain.users.size === 0) return chain
    }
    return undefined
  }

  /** Frees one unused chain — a spare left behind when a binding moved to another size. */
  private evict(): void {
    if (this.chains.size < SWEEP_ABOVE) return
    let oldest: PostChain | undefined
    for (const chain of this.chains) {
      if (chain.users.size > 0) continue
      if (!oldest || chain.usedAt < oldest.usedAt) oldest = chain
    }
    if (oldest) this.drop(oldest)
  }

  private drop(chain: PostChain): void {
    for (const binding of chain.users) this.bindings.delete(binding)
    for (const instance of chain.instances) instance.dispose()
    chain.composer.dispose()
    this.chains.delete(chain)
  }
}

function sameSize(chain: PostChain, width: number, height: number): boolean {
  return chain.width === width && chain.height === height
}

/** EffectComposer already propagates sizes to every pass. */
export function resizePostChain(chain: PostChain, width: number, height: number): void {
  if (sameSize(chain, width, height)) return
  chain.composer.setSize(width, height)
  chain.width = width
  chain.height = height
}
