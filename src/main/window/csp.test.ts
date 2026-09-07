import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ASSET_SCHEME } from '@shared/domain/asset'

/**
 * The policies, read as data — and from the main process for the reasons `theme.test.ts` gives.
 * Every directive below was added because something broke silently without it.
 */
function policyOf(page: string): string {
  const html = readFileSync(new URL(`../../renderer/${page}`, import.meta.url), 'utf8')
  // Anchored on the directive: any other `content=` attribute would otherwise match first.
  const meta = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/.exec(html)?.[0] ?? ''
  return /content="([^"]*)"/.exec(meta)?.[1] ?? ''
}

const policy = policyOf('index.html')

const directive = (name: string): string =>
  policy
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name} `)) ?? ''

describe('the window policy', () => {
  it('is declared at all', () => {
    expect(policy).not.toBe('')
  })

  // The splash has no scripts of its own and must stay that way — it shows before anything is
  // trusted, and it is the one window that never needs to reach the network.
  it('keeps the splash screen shut', () => {
    expect(policyOf('splash.html')).toContain("default-src 'none'")
  })

  /**
   * Mediabunny decodes on workers it creates from blobs. Without this the monitor decodes
   * nothing and the console fills with policy violations — which is how this was found.
   */
  it('lets the decoder start its workers', () => {
    expect(directive('worker-src')).toContain('blob:')
  })

  /**
   * A `.glb` carries its textures inside itself, and three turns each one into a blob before
   * decoding it. Which loader reads that blob depends on the user agent, and Electron's lands on
   * `ImageBitmapLoader` — which uses `fetch`, not an `<img>`. So `img-src blob:` is not enough:
   * without this, EVERY textured model showed up white, and `GLTFLoader` swallowed the refusal
   * (`.catch(() => null)` on a texture), so nothing anywhere said why. Measured, not deduced.
   */
  it('lets an embedded texture be read back from its blob', () => {
    expect(directive('connect-src')).toContain('blob:')
  })

  /**
   * PixiJS asks whether `createImageBitmap` works by FETCHING a 1×1 png written as a `data:` URL,
   * from a worker of its own. Refused, the probe answers "unsupported" — its whole body sits in a
   * `try/catch` — and Pixi then decodes every texture on the UI thread instead of off it. Nothing
   * breaks on screen, which is exactly why it is worth a line here: the only sign was one console
   * violation, and the cost was invariant 6 quietly lost.
   *
   * A `data:` URL carries its own payload and reaches no host, so this widens what the renderer
   * can READ from itself and not what it can talk to.
   */
})

describe('renderer window policy', () => {
  it('lets Pixi ask whether it may decode off the UI thread', () => {
    expect(directive('connect-src')).toContain('data:')
  })

  /**
   * The asset scheme is fetched, not just linked: the monitor reads a rush through it.
   *
   * Taken from `ASSET_SCHEME` rather than spelt again: `protocol.handle` registers whatever that
   * constant says, so a policy naming a different scheme leaves every picture, video and thumbnail
   * blank — and `GLTFLoader` swallows the refusal, as the case above records.
   */
  it('lets the asset scheme be fetched and shown', () => {
    expect(directive('connect-src')).toContain(`${ASSET_SCHEME}:`)
    expect(directive('img-src')).toContain(`${ASSET_SCHEME}:`)
    expect(directive('media-src')).toContain(`${ASSET_SCHEME}:`)
  })

  /**
   * Nothing runs that the application did not ship. Pixi builds its shaders with `new Function`
   * and is given static polyfills instead — see `engines/core/mount.ts`.
   *
   * `wasm-unsafe-eval` is the one addition, and it is not `unsafe-eval`: it allows compiling
   * WebAssembly and nothing else — no `eval`, no `new Function`. The Draco and KTX2 decoders a
   * compressed `.glb` needs are wasm, and Chromium refuses to instantiate any module without it.
   * The modules themselves still have to come from `'self'`, and they are shipped, not fetched.
   */
  it('keeps scripts to the application itself, wasm aside', () => {
    expect(directive('script-src')).toBe("script-src 'self' 'wasm-unsafe-eval'")
  })

  // The decoders are served from the application's own origin, never from a CDN: loading a
  // model must not depend on the network.
  it('lets nothing be fetched from a script CDN', () => {
    expect(directive('script-src')).not.toContain('http')
  })
})
