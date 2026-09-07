import activity from './activity.json'
import ai from './ai.json'
import assets from './assets.json'
import assistant from './assistant.json'
import character from './character.json'
import code from './code.json'
import commands from './commands.json'
import common from './common.json'
import context from './context.json'
import environment from './environment.json'
import fileInfo from './fileInfo.json'
import game from './game.json'
import git from './git.json'
import image from './image.json'
import inspector from './inspector.json'
import material from './material.json'
import memory from './memory.json'
import models from './models.json'
import postfx from './postfx.json'
import scene from './scene.json'
import settings from './settings.json'
import shell from './shell.json'
import ui from './ui.json'
import usage from './usage.json'
import welcome from './welcome.json'

/**
 * The source bundle, split by functional surface. One flat file was the most contested path of
 * the repository — nearly a fifth of the commits touched it — so two branches working on
 * different spaces used to collide on every merge.
 *
 * The sections are merged back into one object on purpose: the studio has a single namespace,
 * and every locale is type-checked against this shape. Splitting the storage must not split the
 * contract.
 */
export const fr = {
  ...activity,
  ...ai,
  ...assets,
  ...assistant,
  ...character,
  ...code,
  ...commands,
  ...common,
  ...context,
  ...environment,
  ...fileInfo,
  ...game,
  ...git,
  ...image,
  ...inspector,
  ...memory,
  ...models,
  ...postfx,
  ...scene,
  ...settings,
  ...shell,
  ...material,
  ...ui,
  ...usage,
  ...welcome,
}

/** The shape every other locale must have, in full. Named here because `fr` defines it. */
export type Translations = typeof fr
