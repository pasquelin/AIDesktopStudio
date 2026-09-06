import { describe, expect, it } from 'vitest'
import {
  ACTION_COMMITMENTS,
  ACTION_REACHES,
  ACTION_REGISTRY,
  ASSISTANT_MODELS,
  actionReads,
  type ActionCommitment,
  type ActionName,
  type ActionReach,
  type AssistantModel,
} from './assistant'
import { WINDOW_PAGES, type WindowPage } from './window'

/**
 * Each of these lists is walked to check something else — the i18n bundles above all, which are
 * verified key by key against them. A value missing from a list is therefore not caught by the
 * check that reads it: the walk simply never reaches it, and the gap reads as coverage.
 *
 * TypeScript cannot say on its own that an array covers its union. A `Record<Union, true>` can:
 * adding a member without listing it here stops compiling. The comparison then ties the list to
 * that record, so neither can drift alone.
 *
 * `job.ts` and `media.ts` keep theirs in their own test files, beside the behaviour they also
 * check. These have no such file to live in.
 */
const sorted = (values: readonly string[]): readonly string[] => [...values].sort()

describe('the assistant lists that stand for a union', () => {
  it('names every model the assistant may think with', () => {
    const all: Record<AssistantModel, true> = {
      'claude-haiku-4-5': true,
      'claude-sonnet-4-6': true,
      'claude-opus-4-8': true,
      'gemini-3.5-flash': true,
    }

    expect(sorted(ASSISTANT_MODELS)).toEqual(sorted(Object.keys(all)))
  })

  it('names every level of commitment an action can carry', () => {
    const all: Record<ActionCommitment, true> = {
      none: true,
      studio: true,
      files: true,
      asset: true,
      remote: true,
      credits: true,
    }

    expect(sorted(ACTION_COMMITMENTS)).toEqual(sorted(Object.keys(all)))
  })

  /**
   * 🛑 `WINDOW_PAGES` is the `options` list of `help.openStudioWindow`, so a page added to the union and
   * forgotten here compiles, is never published on the MCP wire, and nothing says so — the
   * `Record<WindowPage, …>` in `help.ts` only catches an opener that is missing.
   */
  it('names every window a renderer may raise', () => {
    const all: Record<WindowPage, true> = {
      manual: true,
      licences: true,
      usage: true,
      journal: true,
      welcome: true,
    }

    expect(sorted(WINDOW_PAGES)).toEqual(sorted(Object.keys(all)))
  })

  /**
   * The one union of this family that had no entry here, and the omission had teeth: publishing
   * the whole registry was `actionsReaching`'s fallback, so a third reach would have gone out on
   * the MCP wire by default. What holds the wire now is the `switch` there, which the COMPILER
   * tends; this list — like `ACTION_COMMITMENTS` above it — only keeps the constant in step.
   */
  it('names every door the registry reaches', () => {
    const all: Record<ActionReach, true> = {
      both: true,
      mcp: true,
    }

    expect(sorted(ACTION_REACHES)).toEqual(sorted(Object.keys(all)))
  })
})

/**
 * The one direction nothing else holds. The compiler ties each family table to `ActionName`,
 * and `executor.test.ts` ties the handlers to the registry — so a name added to the union and
 * never built leaves BOTH of those green while the studio publishes nothing for it.
 *
 * `Record` rather than a list, for the reason every case above uses one: the compiler makes
 * the table exhaustive, and the assertion makes the registry match it.
 */
const ALL_ACTIONS: Record<ActionName, true> = {
  'optimization.analyze': true,
  'optimization.report': true,
  'optimization.selection': true,
  'optimization.world': true,
  'optimization.exclude': true,
  'optimization.setMode': true,
  'optimization.clearCache': true,
  'command.runStudioCommand': true,
  'workspace.open': true,
  'models.search': true,
  'models.select': true,
  'generator.prepare': true,
  'generator.readArmedGeneration': true,
  'generator.submit': true,
  'jobs.list': true,
  'prompt.suggest': true,
  'prompt.translate': true,
  'prompt.describeStyle': true,
  'chat.close': true,
  'actions.find': true,
  'target.select': true,
  'studio.state': true,
  'documents.list': true,
  'document.open': true,
  'document.activate': true,
  'document.close': true,
  'document.rename': true,
  'document.save': true,
  'document.deleteFromDisk': true,
  'document.export': true,
  'activity.recent': true,
  'projects.list': true,
  'project.open': true,
  'project.close': true,
  'project.create': true,
  'project.forget': true,
  'project.trash': true,
  'file.open': true,
  'files.list': true,
  'files.search': true,
  'files.move': true,
  'files.copy': true,
  'files.duplicate': true,
  'files.trash': true,
  'files.undoFileOperation': true,
  'files.redoFileOperation': true,
  'files.canUndoRedo': true,
  'file.rename': true,
  'file.facts': true,
  'file.reveal': true,
  'folder.new': true,
  'project.rename': true,
  'models.readGenerationModelFields': true,
  'cost.estimate': true,
  'job.readCloudGeneration': true,
  'job.waitForCloudGeneration': true,
  'job.cancelCloudGeneration': true,
  'task.cancelLocalTask': true,
  'usage.report': true,
  'assets.searchProjectCatalogue': true,
  'assets.counts': true,
  'assets.listMissing': true,
  'assets.captionImages': true,
  'asset.get': true,
  'asset.update': true,
  'asset.reveal': true,
  'asset.extractTextures': true,
  'assets.removeFromLibrary': true,
  'canvas.state': true,
  'img.pin': true,
  'canvas.resize': true,
  'canvas.setPixelArt': true,
  'canvas.drawPixels': true,
  'canvas.crop': true,
  'canvas.flipOrRotate': true,
  'layer.add': true,
  'layer.remove': true,
  'layer.select': true,
  'layer.rename': true,
  'layer.setOpacityBlendAndVisibility': true,
  'layer.transform': true,
  'layer.editTextLayer': true,
  'layer.reorderInStack': true,
  'layer.duplicate': true,
  'layer.group': true,
  'layer.ungroup': true,
  'layer.mergeDown': true,
  'layer.lock': true,
  'layer.editShapeLayer': true,
  'layer.setAdjustmentAmount': true,
  'layer.setMaskOptions': true,
  'guide.add': true,
  'guide.move': true,
  'guide.remove': true,
  'sequence.state': true,
  'sequence.seek': true,
  'clip.add': true,
  'clip.remove': true,
  'clip.move': true,
  'clip.trim': true,
  'clip.split': true,
  'clip.fade': true,
  'clip.gain': true,
  'clip.speed': true,
  'clip.unlink': true,
  'clip.select': true,
  'track.add': true,
  'track.remove': true,
  'track.reorderTracks': true,
  'track.rename': true,
  'track.setMuteSoloLockHeight': true,
  'skybox.state': true,
  'skybox.setViewportOptions': true,
  'skybox.adjustImage': true,
  'skybox.resetAdjustments': true,
  'skybox.setSun': true,
  'skybox.setPreviewLighting': true,
  'skybox.setSourceImage': true,
  'material.state': true,
  'material.setSurfaceSettings': true,
  'material.setPreviewEnvironment': true,
  'material.setPreviewDisplay': true,
  'material.setChannelImage': true,
  'styles.list': true,
  'style.save': true,
  'style.rename': true,
  'style.remove': true,
  'cloud.browseAccountLibrary': true,
  'cloud.explorePublicFeed': true,
  'cloud.findSimilarPublished': true,
  'cloud.previewSync': true,
  'cloud.pull': true,
  'cloud.push': true,
  'auth.state': true,
  'window.state': true,
  'window.fullScreen': true,
  'settings.open': true,
  'updates.state': true,
  'updates.install': true,
  'dictation.state': true,
  'dictation.start': true,
  'dictation.stop': true,
  'panels.list': true,
  'panel.open': true,
  'panel.close': true,
  'media.capabilities': true,
  'media.indexFileInPlace': true,
  'fonts.list': true,
  'favorites.listPinnedRecipes': true,
  'favorite.pinAssetRecipe': true,
  'favorite.unpinAssetRecipe': true,
  'fileInfo.openWindow': true,
  'mirror.openVideoReturnWindow': true,
  'help.openStudioWindow': true,
  'scene.state': true,
  'node.add': true,
  'node.addModel': true,
  'node.markAsCuttingTool': true,
  'node.combineIntoSolid': true,
  'node.swapSolidMatterAndTool': true,
  'node.separate': true,
  'node.remove': true,
  'node.attach': true,
  'node.rename': true,
  'node.transform': true,
  'node.setVisible': true,
  'node.setMeshMaterial': true,
  'node.setPrimitiveParameters': true,
  'node.setShadowCastAndReceive': true,
  'node.setSpriteSettings': true,
  'node.setTextSettings': true,
  'node.setPathShape': true,
  'path.addPoint': true,
  'path.movePoint': true,
  'path.removePoint': true,
  'model.setMaterialDocument': true,
  'model.setBaseColorImage': true,
  'node.setLightSettings': true,
  'node.setCameraLens': true,
  'camera.addShot': true,
  'camera.bindPathToShot': true,
  'camera.createAndBindPath': true,
  'camera.aimShotAt': true,
  'camera.reorder': true,
  'node.reparent': true,
  'node.select': true,
  'view.direction': true,
  'view.setDisplayMode': true,
  'scene.capture': true,
  'world.applyPreset': true,
  'world.setSceneLighting': true,
  'world.setBackground': true,
  'world.setFog': true,
  'world.setGroundPlane': true,
  'world.setToneMapping': true,
  'post.state': true,
  'post.add': true,
  'post.remove': true,
  'post.move': true,
  'post.set': true,
  'post.setEffectEnabled': true,
  'post.setWholeStackEnabled': true,
  'post.applyPreset': true,
  'post.listPresets': true,
  'post.duplicate': true,
  'post.reset': true,
  'post.addKeyframe': true,
  'post.removeKeyframe': true,
  'post.savePreset': true,
  'post.renamePreset': true,
  'post.deleteSavedPreset': true,
  'post.setCameraStackMode': true,
  'rig.state': true,
  'rig.fit': true,
  'rig.clear': true,
  'rig.configureHands': true,
  'socket.add': true,
  'socket.remove': true,
  'bone.add': true,
  'bone.remove': true,
  'bone.rename': true,
  'bone.setRole': true,
  'ik.add': true,
  'ik.remove': true,
  'animations.list': true,
  'inputMaps.list': true,
  'inputMap.read': true,
  'inputMap.write': true,
  'animationGraphs.list': true,
  'animationGraph.read': true,
  'animationGraph.write': true,
  'animation.retargetStatus': true,
  'animation.addBlock': true,
  'animation.removeBlock': true,
  'animation.setBlockSettings': true,
  'animation.setBandLengthAndRate': true,
  'animation.autoKey': true,
  'key.writePoseKeys': true,
  'key.removeSubjectKeys': true,
  'key.writeKeysOnOpenChannels': true,
  'key.move': true,
  'channel.remove': true,
  'channel.setMuteSoloLock': true,
  'git.status': true,
  'git.log': true,
  'git.listCommitFiles': true,
  'git.diff': true,
  'git.branches': true,
  'git.stashes': true,
  'git.init': true,
  'git.stage': true,
  'git.unstage': true,
  'git.restore': true,
  'git.commit': true,
  'git.createBranch': true,
  'git.checkout': true,
  'git.stash': true,
  'git.stashPop': true,
  'git.tag': true,
  'git.stashDrop': true,
  'git.resolve': true,
  'git.abortMerge': true,
  'git.remotes': true,
  'git.addRemote': true,
  'git.fetch': true,
  'git.pull': true,
  'git.push': true,
  'component.attach': true,
  'component.detach': true,
  'component.setProperties': true,
  'play.start': true,
  'play.stop': true,
  'play.pause': true,
  'play.resume': true,
  'play.step': true,
  'play.loadScene': true,
  'runtime.report': true,
  'runtime.errors': true,
  'script.list': true,
  'script.read': true,
  'script.write': true,
  'studio.describe': true,
  'studio.docs': true,
  'studio.batch': true,
  'timeline.addSceneCue': true,
  'timeline.removeSceneCue': true,
  'timeline.setPanelRows': true,
  'game.applyTemplate': true,
  'prefab.define': true,
  'prefab.instantiate': true,
  'game.export': true,
  'memory.recall': true,
  'memory.read': true,
  'memory.write': true,
  'memory.forget': true,
  'memory.link': true,
  'context.readProjectCards': true,
  'context.writeProjectCard': true,
  'context.deleteProjectCard': true,
  'settings.read': true,
  'settings.write': true,
  'settings.triggerAction': true,
  'accounts.list': true,
  'accounts.activate': true,
  'accounts.rename': true,
}

/**
 * A read is what the mission runtime plans after; anything else it verifies. Blind spot: a read
 * whose verb is outside `ACTION_NAME_INTENTS` and that declares no intent is verified as a
 * mutation — 82 names say nothing on their own (2026-09-06), and nothing here lists them.
 */
describe('the assistant action registry', () => {
  it('never flags as a read an action that engages anything', () => {
    const engaging = ACTION_REGISTRY.filter(actionReads).filter(
      one => one.commitment !== 'none' || one.raises !== undefined,
    )

    expect(engaging.map(one => one.name)).toEqual([])
  })

  it('builds every action the union declares', () => {
    expect(sorted(ACTION_REGISTRY.map(entry => entry.name))).toEqual(
      sorted(Object.keys(ALL_ACTIONS)),
    )
  })
})
