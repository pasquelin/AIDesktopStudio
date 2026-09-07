/**
 * Where the CATALOGUE's passes are built — one factory per effect that draws by itself.
 * `PostComposer` builds the frame around them (render, fusion, output) and chains the lot, so
 * `engines/postfx/` and nothing else knows three.js has passes at all.
 */
import { Vector2, type Camera, type Data3DTexture, type Scene, type WebGLRenderer } from 'three'
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js'
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js'
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { HalftonePass } from 'three/addons/postprocessing/HalftonePass.js'
import { LUTPass } from 'three/addons/postprocessing/LUTPass.js'
import type { Pass } from 'three/addons/postprocessing/Pass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { SSAARenderPass } from 'three/addons/postprocessing/SSAARenderPass.js'
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js'
import { HALFTONE_SHAPES, type PostEffect, type PostEffectId } from '@shared/domain/postProcessing'
import type { FusedId } from './shaders/fusableChunks'
import { onePass, type EffectInstance, type ViewInfo } from './effectInstance'
import { samplesOf } from './postQuality'
import {
  paramFlag,
  paramNumber,
  paramText,
  write,
  writeColour,
  writeVector,
  type Uniforms,
} from './uniforms'
import {
  blurAxisShader,
  chromaticAberrationShader,
  crtShader,
  kuwaharaShader,
  outlineShader,
  radialBlurShader,
  sharpenShader,
  vhsShader,
} from './shaders/standaloneShaders'

/** What a pass is built with. The camera is the one of the FIRST draw; `apply` moves it after. */
export type BuildContext = {
  scene: Scene
  camera: Camera
  renderer: WebGLRenderer
  width: number
  height: number
  /** The LUT for an asset if it is loaded, `null` while it is not — see `PostComposer`. */
  lutOf: (assetId: string) => Data3DTexture | null
}

export type EffectFactory = (context: BuildContext) => EffectInstance

/** `as`: every pass built here carries `uniforms`; three's addon types spell it `object` on three. */
const uniformsOf = (pass: Pass): Uniforms => (pass as unknown as { uniforms: Uniforms }).uniforms

/** Scratch: one pixel of the chain, in UV — what every neighbourhood shader steps by. */
const texel = new Vector2()

const texelOf = (view: ViewInfo): Vector2 => texel.set(1 / view.width, 1 / view.height)

/** One `ShaderPass`, its uniforms written per frame. The shape most effects here take. */
function shaderEffect(
  shader: object,
  apply: (uniforms: Uniforms, effect: PostEffect, view: ViewInfo) => void,
): EffectFactory {
  return () => {
    const pass = new ShaderPass(shader)
    return onePass(pass, (effect, view) => apply(pass.uniforms, effect, view))
  }
}

const gtao: EffectFactory = context => {
  const pass = new GTAOPass(context.scene, context.camera, context.width, context.height)
  return onePass(pass, (effect, view) => {
    pass.scene = view.scene
    pass.camera = view.camera
    pass.blendIntensity = paramNumber(effect, 'blend')
    pass.updateGtaoMaterial({
      radius: paramNumber(effect, 'radius'),
      distanceExponent: paramNumber(effect, 'distanceExponent'),
      thickness: paramNumber(effect, 'thickness'),
      scale: paramNumber(effect, 'scale'),
      samples: samplesOf(paramNumber(effect, 'samples'), view.budget),
    })
  })
}

const ssao: EffectFactory = context => {
  const pass = new SSAOPass(context.scene, context.camera, context.width, context.height)
  return onePass(pass, (effect, view) => {
    pass.scene = view.scene
    pass.camera = view.camera
    pass.kernelRadius = paramNumber(effect, 'radius')
    pass.minDistance = paramNumber(effect, 'minDistance')
    pass.maxDistance = paramNumber(effect, 'maxDistance')
  })
}

const ssaa: EffectFactory = context => {
  const pass = new SSAARenderPass(context.scene, context.camera)
  return onePass(pass, (effect, view) => {
    pass.scene = view.scene
    pass.camera = view.camera
    // Each level DOUBLES the renders of the scene, so the budget cuts it before anything else.
    pass.sampleLevel = Math.max(1, Math.round(paramNumber(effect, 'level') * view.budget.samples))
  })
}

const bloom: EffectFactory = context => {
  const pass = new UnrealBloomPass(new Vector2(context.width, context.height), 0.6, 0.4, 0.85)
  return onePass(pass, effect => {
    pass.strength = paramNumber(effect, 'strength')
    pass.radius = paramNumber(effect, 'radius')
    pass.threshold = paramNumber(effect, 'threshold')
  })
}

const dof: EffectFactory = context => {
  const pass = new BokehPass(context.scene, context.camera, {})
  return onePass(pass, (effect, view) => {
    pass.scene = view.scene
    pass.camera = view.camera
    const uniforms = uniformsOf(pass)
    write(uniforms, 'focus', paramNumber(effect, 'focusDistance'))
    write(uniforms, 'aperture', paramNumber(effect, 'aperture'))
    write(uniforms, 'maxblur', paramNumber(effect, 'maxBlur'))
    write(uniforms, 'aspect', view.height === 0 ? 1 : view.width / view.height)
  })
}

const lut: EffectFactory = context => {
  const pass = new LUTPass({ intensity: 1 })
  // The one field it needs, not the whole context: closing over `context` would hold the Scene,
  // the Camera and the WebGLRenderer of the FIRST draw for the life of the chain — six of them.
  const { lutOf } = context

  return onePass(pass, effect => {
    const picked = paramText(effect, 'texture')
    const table = picked === '' ? null : lutOf(picked)
    pass.lut = table ?? undefined
    // No table means no grade, whatever the slider says: a LUT still loading must not be drawn
    // as the identity at full cost.
    pass.enabled = table !== null
    pass.intensity = paramNumber(effect, 'intensity')
  })
}

const blur: EffectFactory = () => {
  const across = new ShaderPass(blurAxisShader)
  const down = new ShaderPass(blurAxisShader)
  // Written once: the two directions are constants, and rewriting them per frame was two
  // vector stores for a value that never moves.
  writeVector(across.uniforms, 'direction', 1, 0)
  writeVector(down.uniforms, 'direction', 0, 1)

  return {
    passes: [across, down],
    apply: (effect, view) => {
      const radius = paramNumber(effect, 'radius')
      const boxed = paramText(effect, 'kind') === 'box' ? 1 : 0
      const step = texelOf(view)
      write(across.uniforms, 'radius', radius)
      write(down.uniforms, 'radius', radius)
      write(across.uniforms, 'boxed', boxed)
      write(down.uniforms, 'boxed', boxed)
      writeVector(across.uniforms, 'texel', step.x, step.y)
      writeVector(down.uniforms, 'texel', step.x, step.y)
    },
    dispose: () => {
      across.dispose()
      down.dispose()
    },
  }
}

const halftone: EffectFactory = () => {
  const pass = new HalftonePass({})
  return onePass(pass, (effect, view) => {
    // The shapes are named on the panel and numbered in the shader, one-based.
    const shape = HALFTONE_SHAPES.indexOf(paramText(effect, 'shape'))
    pass.uniforms.shape.value = shape < 0 ? 1 : shape + 1
    pass.uniforms.radius.value = paramNumber(effect, 'radius')
    pass.uniforms.scatter.value = paramNumber(effect, 'scatter')
    pass.uniforms.blending.value = paramNumber(effect, 'blending')
    pass.uniforms.width.value = view.width
    pass.uniforms.height.value = view.height
  })
}

const glitch: EffectFactory = () => {
  const pass = new GlitchPass()
  return onePass(pass, effect => {
    pass.goWild = paramFlag(effect, 'wild')
  })
}

const passOnly =
  (make: () => Pass): EffectFactory =>
  () =>
    onePass(make(), () => {})

/**
 * The catalogue MINUS what fuses, and typed on that difference: an effect added to `PostEffectId`
 * fails to compile until one of the two tables implements it, and neither may claim it twice.
 */
const OWN_PASS: Readonly<Record<Exclude<PostEffectId, FusedId>, EffectFactory>> = {
  gtao,
  ssao,
  ssaa,
  bloom,
  dof,
  lut,
  blur,
  halftone,
  glitch,
  fxaa: passOnly(() => new FXAAPass()),
  smaa: passOnly(() => new SMAAPass()),

  chromaticAberration: shaderEffect(chromaticAberrationShader, (uniforms, effect) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    write(uniforms, 'radial', paramFlag(effect, 'radial') ? 1 : 0)
  }),

  radialBlur: shaderEffect(radialBlurShader, (uniforms, effect, view) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    write(uniforms, 'hole', paramNumber(effect, 'hole'))
    // Through the budget, like every other sampling count: the cheap end of the quality setting
    // is what makes a stack of heavy effects usable at all.
    const taps = samplesOf(paramNumber(effect, 'samples'), view.budget)
    write(uniforms, 'taps', taps)
    // The reciprocal here rather than a division per TAP: a uniform is not a compile-time
    // constant, so the driver cannot fold it out of the loop.
    write(uniforms, 'spread', 1 / Math.max(taps - 1, 1))
    writeVector(uniforms, 'centre', paramNumber(effect, 'centreX'), paramNumber(effect, 'centreY'))
  }),

  kuwahara: shaderEffect(kuwaharaShader, (uniforms, effect, view) => {
    const radius = paramNumber(effect, 'radius')
    write(uniforms, 'radius', radius)
    // One reciprocal for the whole quadrant rather than six divisions each: the count is a
    // function of the radius alone, and a uniform is never folded.
    write(uniforms, 'invCount', 1 / (Math.min(radius, 6) + 1) ** 2)
    const step = texelOf(view)
    writeVector(uniforms, 'texel', step.x, step.y)
  }),

  sharpen: shaderEffect(sharpenShader, (uniforms, effect, view) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    const step = texelOf(view)
    writeVector(uniforms, 'texel', step.x, step.y)
  }),

  outline: shaderEffect(outlineShader, (uniforms, effect, view) => {
    write(uniforms, 'thickness', paramNumber(effect, 'thickness'))
    write(uniforms, 'threshold', paramNumber(effect, 'threshold'))
    write(uniforms, 'opacity', paramNumber(effect, 'opacity'))
    writeColour(uniforms, 'lineColour', paramText(effect, 'colour'))
    const step = texelOf(view)
    writeVector(uniforms, 'texel', step.x, step.y)
  }),

  rgbShift: shaderEffect(RGBShiftShader, (uniforms, effect) => {
    write(uniforms, 'amount', paramNumber(effect, 'amount'))
    write(uniforms, 'angle', paramNumber(effect, 'angle'))
  }),

  crt: shaderEffect(crtShader, (uniforms, effect, view) => {
    write(uniforms, 'curvature', paramNumber(effect, 'curvature'))
    write(uniforms, 'scanline', paramNumber(effect, 'scanline'))
    write(uniforms, 'aberration', paramNumber(effect, 'aberration'))
    write(uniforms, 'edgeFall', paramNumber(effect, 'vignette'))
    writeVector(uniforms, 'resolution', view.width, view.height)
  }),

  vhs: shaderEffect(vhsShader, (uniforms, effect, view) => {
    write(uniforms, 'bleed', paramNumber(effect, 'bleed'))
    write(uniforms, 'jitter', paramNumber(effect, 'jitter'))
    write(uniforms, 'noise', paramNumber(effect, 'noise'))
    write(uniforms, 'bands', paramNumber(effect, 'bands'))
    write(uniforms, 'seed', view.time)
  }),
}

/** Widened for the one lookup that arrives with any id of the catalogue. */
const BY_ID: Partial<Record<PostEffectId, EffectFactory>> = OWN_PASS

export function standaloneFor(id: PostEffectId): EffectFactory | undefined {
  return BY_ID[id]
}
