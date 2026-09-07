import type { Scenario } from './run'
import * as read from './oracle'
import { assetOf, opened } from './setups'

/**
 * 🛑 Both decors open by their SPACE, never by a file: a `.png` reads as an image whatever folder
 * it sits in, so `Skyboxes/…png` puts an image in front and every `skybox.*` call is refused.
 */

const sky = (title = 'Ciel Test') => opened('skyboxes', title)

const material = (title = 'Matière Test') => opened('materials', title)

export const SKY_SCENARIOS: readonly Scenario[] = [
  {
    name: '37.1 says which picture the sky uses and how bright it is',
    said: ['Quelle image sert de ciel en ce moment, et à quelle intensité ?'],
    setup: sky(),
    passed: run => read.spoke(run) && read.answeredWith(run, 'skybox.state'),
  },
  {
    name: '37.2 uses the first skybox of the project as the sky picture',
    said: ['Utilise ma première skybox comme image de ce ciel.'],
    setup: sky(),
    passed: run => (read.sky(run)?.source ?? null) !== null,
  },
  {
    name: '37.3 raises the sun to an intensity of 3',
    said: ["Monte l'intensité du soleil à 3."],
    setup: sky(),
    passed: run => read.near(read.sky(run)?.sun.intensity ?? 0, 3, 0.01),
  },
  {
    name: '37.4 lowers the environment intensity to 0.4',
    said: ["Réduis l'intensité de l'environnement du ciel à 0,4."],
    setup: sky(),
    passed: run => read.near(read.sky(run)?.environment.intensity ?? 0, 0.4, 0.01),
  },
  {
    name: '37.5 warms the sky up on contrast and saturation',
    said: ['Augmente le contraste et la saturation de ce ciel.'],
    setup: sky(),
    passed: run => read.adjusted(run),
  },
  {
    name: '37.6 puts the colour adjustments back to neutral',
    said: ['Remets les réglages colorimétriques du ciel à zéro.'],
    // Adjusted before the person speaks, or « remets à zéro » sorts nothing and a model doing
    // nothing at all would pass.
    setup: async studio => {
      await sky()(studio)
      await studio.run('skybox.adjustImage', { contrast: 1.4, saturation: 1.2 })
    },
    passed: run => !read.adjusted(run),
  },
  {
    name: '37.7 shows the light probes of the sky',
    said: ['Affiche les sondes de lumière de ce ciel.'],
    // Put out first: a sky opens with its probes ON, so « affiche-les » asks for nothing.
    setup: async studio => {
      await sky()(studio)
      await studio.run('skybox.setViewportOptions', { probes: false })
    },
    passed: run => read.skyView(run)?.probes === true,
  },

  {
    name: '38.1 says what the material is made of and which pictures it carries',
    said: ['De quoi est faite cette matière et quelles images porte-t-elle ?'],
    setup: material(),
    passed: run => read.spoke(run) && read.answeredWith(run, 'material.state'),
  },
  {
    name: '38.2 turns its base colour blue',
    said: ['Mets sa couleur de base en bleu.'],
    setup: material(),
    // A material always stands there: what is scored is its base colour LEAVING the default.
    passed: run => (read.surface(run)?.material.color ?? '#ffffff') !== '#ffffff',
  },
  {
    name: '38.3 assigns the project planks to its base colour channel',
    said: ['Assigne ma texture de planches à son canal de couleur de base.'],
    setup: material(),
    passed: run => Object.keys(read.surface(run)?.channels ?? {}).length > 0,
  },
  {
    name: '38.4 adds the matching normal map on its own channel',
    said: ['Ajoute la normal map correspondante sur son canal de relief.'],
    // One channel already filled, so « la normal map » is a SECOND one and not the first.
    setup: async studio => {
      await material()(studio)
      await studio.run('material.setChannelImage', {
        channel: 'baseColor',
        assetId: assetOf(studio, 'weathered oak planks, seamless.png'),
      })
    },
    passed: run => Object.keys(read.surface(run)?.channels ?? {}).length >= 2,
  },
  {
    name: '38.5 brightens the preview environment and sets it spinning',
    said: ["Fais tourner l'aperçu de la matière et monte l'intensité de son environnement."],
    setup: material(),
    passed: run =>
      read.surface(run)?.preview.autoSpin === true &&
      (read.surface(run)?.preview.envIntensity ?? 1) > 1,
  },
  {
    name: '38.6 judges the material under a sky DOCUMENT of the project',
    said: ['Éclaire cet aperçu avec mon ciel Ciel Test.'],
    setup: async studio => {
      // The sky first, so the material is the document in front when the request lands.
      await sky()(studio)
      await material()(studio)
    },
    // The DOCUMENT and not an asset: a preview naming the picture would read `skybox`, and editing
    // that sky would reach no preview at all.
    passed: run => read.surface(run)?.preview.environment.kind === 'sky',
  },
]
