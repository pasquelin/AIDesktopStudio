import test from 'node:test';
import assert from 'node:assert/strict';
import { createAmbientPlayback } from './ambientPlayback.js';

function setup(options = {}) {
  const states = [], sources = [], gains = [];
  let created = 0, loads = 0;
  const context = {
    state: 'suspended', currentTime: 0, destination: {},
    async resume() { if (options.blocked) return await new Promise(() => {}); this.state = 'running'; },
    async suspend() { this.state = 'suspended'; },
    createBufferSource() {
      const source = { connect() {}, disconnect() { this.disconnected = true; }, start() { this.started = true; }, stop(at) { this.stopAt = at; } };
      sources.push(source); return source;
    },
    createGain() {
      const changes = [];
      const node = { connect() {}, disconnect() {}, gain: {
        cancelScheduledValues(time) { changes.push(['cancel', time]); },
        setValueAtTime(value, time) { changes.push(['set', value, time]); },
        linearRampToValueAtTime(value, time) { changes.push(['ramp', value, time]); },
      }, changes };
      gains.push(node); return node;
    },
  };
  const playback = createAmbientPlayback({
    createContext: () => { created++; return context; },
    loadBuffer: async () => { loads++; if (options.load) return await options.load(); return {}; },
    changed: state => states.push(state), resumeTimeout: 5,
  });
  return { playback, context, states, sources, gains, counts: () => [created, loads] };
}

test('la tentative autorisée démarre une boucle très faible avec fondu de trois secondes', async () => {
  const env = setup();
  assert.deepEqual(env.counts(), [0, 0]);
  await env.playback.start();
  assert.equal(env.sources[0].loop, true);
  assert.deepEqual(env.gains[0].changes, [['set', 0, 0], ['ramp', 0.12, 3]]);
  assert.equal(env.states.at(-1), 'on');
});
test('un refus autoplay affiche le blocage sans télécharger ni relancer', async () => {
  const env = setup({ blocked: true });
  await env.playback.start();
  assert.equal(env.states.at(-1), 'blocked');
  assert.deepEqual(env.counts(), [1, 0]);
  assert.equal(env.sources.length, 0);
  env.context.state = 'running';
  env.context.onstatechange();
  assert.equal(env.context.state, 'suspended');
});
test('couper pendant le chargement empêche toute apparition sonore tardive', async () => {
  let loaded;
  const env = setup({ load: () => new Promise(resolve => { loaded = resolve; }) });
  const pending = env.playback.start();
  await new Promise(resolve => setImmediate(resolve));
  env.playback.stop();
  loaded({});
  await pending;
  assert.equal(env.sources.length, 0);
  assert.equal(env.states.at(-1), 'off');
});
test('la coupure suit le niveau courant puis arrête la source sur l’horloge audio', async () => {
  const env = setup();
  await env.playback.start();
  env.context.currentTime = 1.5;
  env.playback.stop();
  assert.deepEqual(env.gains[0].changes.slice(-3), [['cancel', 1.5], ['set', 0.06, 1.5], ['ramp', 0, 1.75]]);
  assert.equal(env.sources[0].stopAt, 1.76);
  await env.sources[0].onended();
  assert.equal(env.context.state, 'suspended');
});
test('une réactivation pendant la sortie reste active et réutilise le fichier décodé', async () => {
  const env = setup();
  await env.playback.start();
  env.playback.stop();
  await env.playback.start();
  await env.sources[0].onended();
  assert.equal(env.context.state, 'running');
  assert.equal(env.states.at(-1), 'on');
  assert.deepEqual(env.counts(), [1, 1]);
});
test('une interruption du contexte coupe et ne promet pas une lecture inaudible', async () => {
  const env = setup();
  await env.playback.start();
  env.context.state = 'suspended';
  env.context.onstatechange();
  assert.equal(env.states.at(-1), 'off');
  assert.equal(env.sources[0].disconnected, true);
});
test('un échec de fichier permet une nouvelle tentative dédiée', async () => {
  let attempts = 0;
  const env = setup({ load: () => { if (++attempts === 1) throw new Error('réseau'); return {}; } });
  await env.playback.start();
  assert.equal(env.states.at(-1), 'error');
  await env.playback.start();
  assert.equal(env.states.at(-1), 'on');
});
test('au-delà des 72 secondes la source boucle sans arrêt ni nouvelle attaque', async () => {
  const env = setup();
  await env.playback.start();
  env.context.currentTime = 145;
  assert.equal(env.sources.length, 1);
  assert.equal(env.sources[0].loop, true);
  assert.equal(env.sources[0].stopAt, undefined);
  assert.equal(env.states.at(-1), 'on');
  env.playback.stop();
  await env.sources[0].onended();
  env.context.currentTime = 300;
  assert.equal(env.sources.length, 1);
  assert.equal(env.states.at(-1), 'off');
});
