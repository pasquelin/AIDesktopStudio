import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMascotPlayback } from './mascotPlayback.js';
const hero = { id: 'hero', x: 100 };
const image = { id: 'image', x: 300 };

test('attend la fin du scroll et annule une attente lors de sa reprise', () => {
  const tick = createMascotPlayback(5.1);
  assert.equal(tick(0, 0, hero).placement, null);
  assert.equal(tick(0.8, 0, hero).placement, null);
  assert.equal(tick(0.85, 10, hero).placement, null);
  assert.equal(tick(1.5, 10, hero).placement, null);
  assert.equal(tick(1.8, 10, hero).placement, hero);
});

test('le temps avance normalement malgré les inversions et le personnage ne se téléporte pas', () => {
  const tick = createMascotPlayback(5.1);
  tick(0, 0, hero);tick(1, 0, hero);tick(1.4, 0, hero);
  const down = tick(1.5, 500, image);
  const up = tick(1.6, 0, hero);
  assert.ok(up.time > down.time);
  assert.equal(up.placement, hero);
  assert.ok(up.opacity < down.opacity);
  assert.equal(tick(2.5, 500, image).opacity, 0);
  assert.equal(tick(3.5, 500, image).placement, image);
  assert.equal(tick(6.2, 500, image).placement, image);
});

test('ne relance pas le salut en restant immobile ni sur un micro aller-retour', () => {
  const tick = createMascotPlayback(5.1);
  tick(0, 0, hero);tick(1, 0, hero);
  tick(2, 5, hero);tick(2.1, 0, hero);
  const resumed = tick(6.2, 0, hero);
  assert.equal(resumed.placement.resume, true);
  assert.equal(resumed.time, 5.1);
  assert.ok(tick(30, 0, hero).idleTime > 0);
});

test('un resize masque immédiatement et attend un nouveau cadre stable', () => {
  const tick = createMascotPlayback(5.1);
  tick(0, 0, hero, '1280:720');tick(1, 0, hero, '1280:720');
  const narrow = tick(1.2, 0, null, '390:844');
  assert.equal(narrow.opacity, 0);assert.equal(narrow.placement, null);
  assert.equal(tick(1.5, 0, image, '390:844').placement, null);
  assert.equal(tick(2.2, 0, image, '390:844').placement, image);
});

test('une animation terminée laisse avancer le temps idle sans relancer le clip ponctuel', () => {
  const tick = createMascotPlayback(5.1);
  tick(0, 0, hero);tick(1, 0, hero);
  const held = tick(20, 0, hero);
  assert.equal(held.time, 5.1);assert.equal(held.opacity, 1);assert.ok(held.idleTime > 0);
  assert.equal(tick(40, 0, hero).time, 5.1);
});

test('chaque clip garde sa durée réelle et une reprise termine le fondu avant le suivant', () => {
  const tick = createMascotPlayback(5.1);
  const dance = { ...image, duration: 20.9 };
  tick(0, 0, dance);tick(1, 0, dance);
  assert.equal(tick(10, 0, dance).time, 9);
  tick(10.1, 500, hero);
  assert.equal(tick(11.1, 500, hero).opacity, 0);
  assert.equal(tick(11.3, 500, hero).placement, hero);
});


test('une véritable sortie puis retour en haut permet une nouvelle apparition', () => {
  const tick = createMascotPlayback(5.1);
  tick(0, 0, hero);tick(1, 0, hero);tick(1.4, 0, hero);
  tick(2, 900, null);tick(2.5, 900, null);
  tick(3, 0, hero);
  const returned = tick(4, 0, hero);
  assert.equal(returned.placement, hero);
  assert.equal(returned.time, 0);
  assert.ok(tick(4.4, 0, hero).opacity > 0);
});


test('enchaîne deux actions de durée naturelle en gardant le placement', () => {
  const clips = [{ clip: 'dance1', duration: 2 }, { clip: 'dance2', duration: 3 }];
  const tick = createMascotPlayback(5.1, () => clips.shift());
  tick(0, 0, hero); tick(1, 0, hero);
  assert.equal(tick(6.09, 0, hero).placement, hero);
  const first = tick(6.11, 0, hero);
  assert.equal(first.placement.clip, 'dance1');
  assert.equal(first.placement.x, hero.x);
  assert.equal(tick(8.1, 0, hero).placement.cycleIndex, 1);
  const second = tick(8.12, 0, hero);
  assert.equal(second.placement.clip, 'dance2');
  assert.equal(second.placement.cycleIndex, 2);
  assert.equal(second.placement.x, hero.x);
});

test('un scroll interrompt le cycle sans lancer de danse cachée', () => {
  let count = 0;
  const tick = createMascotPlayback(5.1, () => { count++; return { clip: 'dance', duration: 2 }; });
  tick(0, 0, hero); tick(1, 0, hero); tick(7, 0, hero);
  const visibleActions = count;
  tick(8, 100, null); tick(8.4, 200, null);
  tick(40, 500, null);
  assert.equal(count, visibleActions);
});


test('une entrée en marche interrompue se termine sans déclencher une suite cachée', () => {
  let choices = 0;
  const tick = createMascotPlayback(3, () => { choices++; return null; }, candidate => ({ ...candidate, entering: true, duration: 3 }));
  tick(0, 0, image); tick(1, 0, image);
  assert.equal(tick(1.2, 0, image).placement.entering, true);
  assert.equal(tick(1.3, 50, null).exiting, true);
  assert.equal(tick(2.3, 100, null).opacity, 0);
  tick(40, 200, null);
  assert.equal(choices, 0);
});


test('la perte de zone conserve le placement animé jusqu’à la fin du fondu', () => {
  const tick = createMascotPlayback(5);
  tick(0, 0, image); tick(1, 0, image); tick(1.5, 0, image);
  const first = tick(1.6, 1, null);
  const middle = tick(1.8, 2, null);
  assert.equal(first.placement, image);
  assert.ok(first.opacity > middle.opacity && middle.opacity > 0);
  assert.ok(middle.time > first.time);
  assert.equal(tick(2.6, 3, null).opacity, 0);
});


test('les fondus montent et descendent à une unité d’opacité par seconde', () => {
  const tick = createMascotPlayback(5);
  tick(0, 0, image); tick(.89, 0, image);
  const start = tick(.9, 0, image);
  const half = tick(1.4, 0, image);
  assert.ok(Math.abs(half.opacity - start.opacity - .5) < 1e-10);
  assert.equal(tick(2, 0, image).opacity, 1);
  tick(2, 1, image);
  assert.equal(tick(2.5, 1, image).opacity, .5);
  assert.equal(tick(3, 1, image).opacity, 0);
});


test('la première frame du hero est pleine sans délai, mais son retour garde le fondu', () => {
  const tick = createMascotPlayback(5, () => null, candidate => candidate, true);
  const first = tick(0, 0, hero);
  assert.equal(first.opacity, 1); assert.equal(first.placement, hero);
  tick(.1, 100, null); tick(1.2, 100, null); tick(1.3, 0, hero);
  assert.equal(tick(2.1, 0, hero).opacity, 0);
  const returned = tick(2.3, 0, hero);
  assert.ok(returned.opacity > 0 && returned.opacity < 1);
});

test('un scroll avant la disponibilité du hero annule l’apparition immédiate', () => {
  const tick = createMascotPlayback(5, () => null, candidate => candidate, true);
  tick(0, 0, null); tick(.2, 200, null);
  assert.equal(tick(.3, 0, hero).placement, null);
  assert.equal(tick(.8, 0, hero).opacity, 0);
});

test('une arrivée sur une autre section ne reçoit pas l’exception du hero', () => {
  const tick = createMascotPlayback(5, () => null, candidate => candidate, true);
  assert.equal(tick(0, 0, image).opacity, 0);
});
