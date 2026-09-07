import type { Translations } from '../fr'
import type * as frActivity from '../fr/activity.json'
import type * as frAi from '../fr/ai.json'
import type * as frAssets from '../fr/assets.json'
import type * as frAssistant from '../fr/assistant.json'
import type * as frCharacter from '../fr/character.json'
import type * as frCommands from '../fr/commands.json'
import type * as frCommon from '../fr/common.json'
import type * as frContext from '../fr/context.json'
import type * as frEnvironment from '../fr/environment.json'
import type * as frFileInfo from '../fr/fileInfo.json'
import type * as frGame from '../fr/game.json'
import type * as frGit from '../fr/git.json'
import type * as frImage from '../fr/image.json'
import type * as frInspector from '../fr/inspector.json'
import type * as frMaterial from '../fr/material.json'
import type * as frMemory from '../fr/memory.json'
import type * as frModels from '../fr/models.json'
import type * as frPostfx from '../fr/postfx.json'
import type * as frScene from '../fr/scene.json'
import type * as frSettings from '../fr/settings.json'
import type * as frCode from '../fr/code.json'
import type * as frShell from '../fr/shell.json'
import type * as frUi from '../fr/ui.json'
import type * as frUsage from '../fr/usage.json'
import type * as frWelcome from '../fr/welcome.json'
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

/** The roots a section is responsible for, read off its French twin rather than listed here. */
type Section<Roots extends keyof Translations> = Pick<Translations, Roots>

/**
 * Each section is checked against its French twin as it is merged. The whole bundle is checked
 * at once by `TRANSLATIONS` too, but that error points at a 1700-key object; these ones name the
 * section a key was forgotten in, which is what a reader needs to fix it.
 *
 * The roots come from the French files rather than being spelled out here. A list written by
 * hand goes stale the day a root is added to a French section and not to its line, and the check
 * then falls back — in silence — to the imprecise one it exists to replace. Measured on a
 * mutation: derived, a new French root fails at its section; listed, it only failed globally.
 */
export const en = {
  ...(activity satisfies Section<keyof typeof frActivity>),
  ...(ai satisfies Section<keyof typeof frAi>),
  ...(assets satisfies Section<keyof typeof frAssets>),
  ...(assistant satisfies Section<keyof typeof frAssistant>),
  ...(character satisfies Section<keyof typeof frCharacter>),
  ...(code satisfies Section<keyof typeof frCode>),
  ...(commands satisfies Section<keyof typeof frCommands>),
  ...(common satisfies Section<keyof typeof frCommon>),
  ...(context satisfies Section<keyof typeof frContext>),
  ...(environment satisfies Section<keyof typeof frEnvironment>),
  ...(fileInfo satisfies Section<keyof typeof frFileInfo>),
  ...(game satisfies Section<keyof typeof frGame>),
  ...(git satisfies Section<keyof typeof frGit>),
  ...(image satisfies Section<keyof typeof frImage>),
  ...(inspector satisfies Section<keyof typeof frInspector>),
  ...(memory satisfies Section<keyof typeof frMemory>),
  ...(models satisfies Section<keyof typeof frModels>),
  ...(postfx satisfies Section<keyof typeof frPostfx>),
  ...(scene satisfies Section<keyof typeof frScene>),
  ...(settings satisfies Section<keyof typeof frSettings>),
  ...(shell satisfies Section<keyof typeof frShell>),
  ...(material satisfies Section<keyof typeof frMaterial>),
  ...(ui satisfies Section<keyof typeof frUi>),
  ...(usage satisfies Section<keyof typeof frUsage>),
  ...(welcome satisfies Section<keyof typeof frWelcome>),
}
