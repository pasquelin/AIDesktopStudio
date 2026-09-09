import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMascotPlayback } from './mascotPlayback.js';
import { createMascotBehavior, mascotTravel, mascotEntry, mascotIdleClips } from './mascotBehavior.js';

export function createMascot(scene) {
  const pivot = new THREE.Group();
  pivot.visible = false;
  scene.add(pivot);
  const fill = new THREE.HemisphereLight(0xffffff, 0x52648c, 2);
  const key = new THREE.DirectionalLight(0xffffff, 2.5);
  key.position.set(-4, 12, 14);
  scene.add(fill, key);
  const sections = [...document.querySelectorAll('main > .panel')];
  const hero = document.querySelector('.hero');
  const heroSlot = document.querySelector('.hero-mascot-slot');
  const materials = new Map();
  let mixer = null;
  let action = null;
  let outgoing = null;
  let transition = 0;
  let phaseOffset = 0;
  const actions = new Map();
  let bounds = null;
  let extent = null;
  let greetings = 0;
  let dances = 0;
  const greetingClips = ['StandingGreeting', 'Waving'];
  const danceClips = ['SwingDancing', 'LockingHipHopDance', 'BboyHipHopMove'];
  let advance = null;
  let previous = null;
  let model = null;

  let lastFrame = null;
  let initialHero = window.scrollY === 0 && ['', '#accueil', '#contenu'].includes(window.location.hash);
  const cancelInitialHero = () => { initialHero = false; };
  window.addEventListener('scroll', cancelInitialHero, { passive: true });

  async function load() {
    try {
      const file = await new GLTFLoader().loadAsync(new URL('../models/HeroMedium.glb', import.meta.url).href);
      const response = await fetch(new URL('../models/clips.json', import.meta.url));
      if (!response.ok) throw new Error(`Animation : ${response.status}`);
      bounds = await response.json();
      extent = { height: Math.max(...Object.values(bounds).map(box => box.maxY)), width: Math.max(...Object.values(bounds).map(box => box.maxX - box.minX)) };
      const root = file.scene;
      model = root;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const centre = box.getCenter(new THREE.Vector3());
      const scale = 1 / box.getSize(new THREE.Vector3()).y;
      root.scale.multiplyScalar(scale);
      root.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale);
      root.traverse(node => {
        if (!node.isMesh) return;
        node.frustumCulled = false;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          materials.set(material, material.opacity);
          material.transparent = true;
        }
      });
      pivot.add(root);
      mixer = new THREE.AnimationMixer(root);
      for (const name of [...greetingClips, ...danceClips, ...mascotIdleClips, 'Walking']) {
        const response = await fetch(new URL(`../models/${name}.json`, import.meta.url));
        if (!response.ok) throw new Error(`Animation ${name} : ${response.status}`);
        const clip = THREE.AnimationClip.parse(await response.json());
        const loadedAction = mixer.clipAction(clip);
        loadedAction.setLoop(THREE.LoopOnce, 1);
        loadedAction.clampWhenFinished = true;
        actions.set(name, loadedAction);
      }
      advance = createMascotPlayback(5.1, createMascotBehavior(bounds), candidate => mascotEntry(candidate, bounds), initialHero && window.scrollY === 0);
      window.removeEventListener('scroll', cancelInitialHero);
      document.documentElement.dataset.mascot = 'ready';
    } catch (error) {
      document.documentElement.dataset.mascot = 'unavailable';
      console.error('La mascotte 3D n’a pas pu être chargée.', error);
    }
  }

  function fitted(id, top, floor, width, height) {
    const style = getComputedStyle(document.documentElement);
    const portrait = width >= 600 && width < 1000 && height > width;
    const desired = id === 'hero' ? (portrait ? Math.min(480, width * 0.58) : Math.min(560, Math.max(180, height * 0.5))) * extent.height : parseFloat(style.getPropertyValue('--mascot-height'));
    const margin = parseFloat(getComputedStyle(heroSlot).marginRight) || 20;
    const size = Math.min(desired / extent.height, (width - 2 * margin) / extent.width);
    if (floor > height - 30 || floor - Math.max(top, parseFloat(style.getPropertyValue('--bar-h')) + 12) < size * extent.height) return null;
    const right = id === 'hero' || sections.findIndex(section => section.id === id) % 2 === 1;
    const clip = id === 'hero' ? greetingClips[greetings % greetingClips.length] : danceClips[dances % danceClips.length];
    return {
      edgeDistance: margin + extent.width * size / 2, id, clip, kind: id === 'hero' ? 'greet' : 'dance', lastDance: clip, rest: 0, from: 0, to: 0, yaw: 0, yawFrom: 0, corridor: id === 'hero' ? Math.max(0, Math.min(size * 1.6, width / 2 - margin - extent.width * size / 2 - width * 0.2)) : width - 2 * margin - extent.width * size, duration: bounds[clip].duration, size, side: right ? 'right' : 'left',
      x: id === 'hero' && portrait ? 0 : (width / 2 - margin - extent.width * size / 2) * (right ? 1 : -1),
      y: height / 2 - floor, floor,
    };
  }

  function candidate(scroll, width, height) {
    const heroRect = hero.getBoundingClientRect();
    const narrow = width < 1000 || height < 620;
    const top = narrow ? heroSlot.getBoundingClientRect().top : Math.max(85, heroRect.top + 85);
    const first = fitted('hero', top, heroRect.bottom, width, height);
    if (first) return first;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.bottom > height - 30 || rect.bottom < 180) continue;
      const contentBottom = Math.max(...[...section.children].map(child => child.getBoundingClientRect().bottom));
      const available = fitted(section.id, contentBottom + 24, rect.bottom, width, height);
      if (available) return available;
    }
    return null;
  }

  function setPlacement(placement) {
    previous = placement;
    pivot.scale.setScalar(previous.size);
    pivot.position.set(previous.x, previous.y, 0);
    pivot.rotation.set(0, 0, 0);
    if (outgoing && outgoing !== action) outgoing.stop();
    outgoing = previous.cycle ? action : null;
    if (!previous.cycle) mixer.stopAllAction();
    action = actions.get(previous.clip);
    phaseOffset = action === outgoing ? action.time : 0;
    if (action !== outgoing) action.reset().play();
    action.setLoop(previous.loop ? THREE.LoopRepeat : THREE.LoopOnce, previous.loop ? Infinity : 1);
    transition = 0;
    if (!previous.resume) { if (previous.id === 'hero' && !previous.cycle) greetings++; else if (previous.kind === 'dance') dances++; }
  }

  function blendActions() {
    if (outgoing && outgoing !== action) {
      outgoing.setEffectiveWeight(1 - transition);
      if (transition === 1) { outgoing.stop(); outgoing = null; }
    }
    action.setEffectiveWeight(outgoing && outgoing !== action ? transition : 1);
  }

  void load();

  return {
    update({ time, reduced, scrollY, height }) {
      if (!advance) return;
      const elapsed = lastFrame === null ? 0 : Math.min(0.1, Math.max(0, time - lastFrame));
      lastFrame = time;
      const next = candidate(scrollY, window.innerWidth, height);
      if (reduced) { pivot.visible = false; return; }
      const state = advance(time, scrollY, next, `${window.innerWidth}:${height}`);
      pivot.visible = state.opacity > 0 && state.placement !== null;
      if (!state.placement) {
        return;
      }
      if (state.placement !== previous) setPlacement(state.placement);
      const anchor = previous.id === 'hero' ? hero : document.getElementById(previous.id);
      pivot.position.y = height / 2 - anchor.getBoundingClientRect().bottom;
      const traveled = previous.kind === 'walk' ? mascotTravel(bounds.Walking.travel, bounds.Walking.duration, state.time) * previous.size : 0;
      const offset = previous.kind === 'walk' ? previous.from + Math.sign(previous.to - previous.from) * traveled : previous.to;
      pivot.position.x = previous.x + offset * (previous.side === 'right' ? -1 : 1);
      transition = Math.min(1, transition + elapsed / 0.35);
      pivot.rotation.y = previous.yawFrom + (previous.yaw - previous.yawFrom) * transition;
      action.time = previous.loop ? (state.time + phaseOffset) % action.getClip().duration : state.time;
      blendActions();
      mixer.update(0);
      for (const [material, opacity] of materials) material.opacity = opacity * (previous.entering && !state.exiting ? 1 : state.opacity);
      document.documentElement.dataset.mascotScene = state.placement.id;
      if (pivot.visible && !document.documentElement.dataset.mascotFirstFrame) document.documentElement.dataset.mascotFirstFrame = JSON.stringify({ opacity: state.opacity, placement: previous.id, scrollY });
    },
  };
}
