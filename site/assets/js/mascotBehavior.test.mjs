import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMascotBehavior, mascotTravel, mascotEntry } from './mascotBehavior.js';
const bounds = { Walking: { duration: 1, travel: [[0, 0], [.5, .4], [1, .8]] }, SwingDancing: { duration: 20 }, LockingHipHopDance: { duration: 17 }, BboyHipHopMove: { duration: 2 } };
const idle = { kind: 'idle', to: 0, yaw: 0, size: 100, corridor: 180, side: 'left', lastDance: 'SwingDancing' };
const rolls = values => () => values.shift() ?? 0;

test('un repos peut conduire à une marche puis un retour dans le corridor', () => {
  const next = createMascotBehavior(bounds, rolls([.1, 0, 0, 0, 0, .1, .9, 0]));
  const turn = { ...idle, ...next(idle) };
  assert.equal(turn.kind, 'turn');
  const walk = { ...turn, ...next(turn) };
  assert.equal(walk.kind, 'walk'); assert.equal(walk.to, 80);
  const rest = { ...walk, ...next(walk) };
  assert.equal(rest.kind, 'idle'); assert.equal(rest.to, 80);
  const back = { ...rest, ...next(rest) };
  assert.equal(back.walk.to, 0);
});

test('un même repos peut conduire directement à une autre danse', () => {
  const next = createMascotBehavior(bounds, rolls([.7, 0]));
  const dance = next(idle);
  assert.equal(dance.kind, 'dance'); assert.notEqual(dance.clip, idle.lastDance);
});

test('un petit corridor exclut la marche sans redimensionner le personnage', () => {
  const next = createMascotBehavior(bounds, () => 0);
  assert.equal(next({ ...idle, corridor: 40 }).kind, 'dance');
});

test('la distance suit les phases du clip et reste continue à sa boucle', () => {
  assert.equal(mascotTravel(bounds.Walking.travel, 1, .25), .2);
  assert.equal(mascotTravel(bounds.Walking.travel, 1, 1), .8);
  assert.ok(Math.abs(mascotTravel(bounds.Walking.travel, 1, 1.5) - 1.2) < 1e-10);
});

test('mille transitions restent dans le corridor et sans danse répétée immédiatement', () => {
  let seed = 1;
  const next = createMascotBehavior(bounds, () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; });
  let state = idle;
  const kinds = new Set();
  for (let index = 0; index < 1000; index++) {
    const after = { ...state, ...next(state) };
    assert.ok(after.to >= 0 && after.to <= idle.corridor);
    if (after.kind === 'dance') assert.notEqual(after.clip, state.lastDance);
    kinds.add(after.kind); state = after;
  }
  assert.deepEqual([...kinds].sort(), ['dance', 'idle', 'look', 'turn', 'walk']);
});


test('chaque repos reçoit un nouveau tirage continu entre trois et quinze secondes', () => {
  const next = createMascotBehavior(bounds, rolls([0, 0, 0.123, 0, 0.999999, 0]));
  const durations = [next({ ...idle, kind: 'dance' }).duration, next({ ...idle, kind: 'walk' }).duration, next({ ...idle, kind: 'dance' }).duration];
  assert.equal(durations[0], 3);
  assert.equal(durations[1], 4.476);
  assert.ok(durations[2] > 14.99 && durations[2] <= 15);
  assert.equal(new Set(durations).size, 3);
});


test('une marche longue utilise toute la longueur admissible du séparateur', () => {
  const next = createMascotBehavior(bounds, rolls([.1, 0, .999]));
  const turn = next({ ...idle, corridor: 1000 });
  assert.equal(turn.walk.to, 960);
  assert.equal(turn.walk.duration, 12);
});

test('une entrée marche depuis hors champ et rejoint exactement le départ stable', () => {
  const candidate = { ...idle, id: 'image', edgeDistance: 150 };
  const entry = mascotEntry(candidate, bounds, () => 0);
  assert.ok(entry.from < -215); assert.equal(entry.to, 0);
  assert.equal(entry.entering, true);
  assert.ok(Math.abs(entry.from + mascotTravel(bounds.Walking.travel, 1, entry.duration) * candidate.size) < 1e-10);
  assert.equal(mascotEntry(candidate, bounds, () => .9), candidate);
});


test('les six Idle peuvent être choisis sans répétition immédiate', () => {
  const seen = new Set();
  for (let index = 0; index < 6; index++) {
    const next = createMascotBehavior(bounds, rolls([.5, index / 6]));
    const result = next({ ...idle, kind: 'dance' });
    seen.add(result.clip);
    const changed = next({ ...idle, kind: 'dance' });
    assert.notEqual(changed.clip, result.clip);
  }
  assert.equal(seen.size, 6);
});
