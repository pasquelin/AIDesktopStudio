import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const script = (await readFile(new URL('./ambient.js', import.meta.url), 'utf8')).replace(/^import .*;\n/, '');
async function mount(muted = false, unavailable = false) {
  const events = {}, clicks = {};
  const attrs = {};
  let starts = 0, stops = 0, active = false, preference = String(muted), changed;
  const button = { dataset: { start: 'activer', stop: 'couper', loading: 'chargement', error: 'erreur', blocked: 'activation requise' }, hidden: true,
    setAttribute(k, v) { attrs[k] = v; }, addEventListener(k, fn) { clicks[k] = fn; } };
  const document = { hidden: false, querySelector: () => button, addEventListener(k, fn) { events[k] = fn; } };
  const context = { document, window: { addEventListener(k, fn) { events[k] = fn; } }, HTMLMediaElement: class {},
    localStorage: { getItem() { if (unavailable) throw new Error('indisponible'); return preference; }, setItem(k,v) { if (unavailable) throw new Error('indisponible'); preference = v; } },
    createAmbientPlayback(options) {
      changed = options.changed;
      return {
        async start() { starts++; active = true; changed('on'); },
        stop() { stops++; active = false; changed('off'); },
        async toggle() { active = !active; changed(active ? 'on' : 'off'); },
      };
    },
  };
  await vm.runInNewContext(`(async () => {${script}})()`, context);
  return { button, attrs, document, events, clicks, changed, counts: () => [starts, stops], preference: () => preference };
}
test('le défaut tente la lecture mais une coupure mémorisée empêche toute tentative', async () => {
  assert.equal((await mount()).counts()[0], 1);
  const muted = await mount(true);
  assert.equal(muted.counts()[0], 0);
  assert.equal(muted.button.dataset.state, 'off');
});
test('masquer arrête, revenir ne relance pas et aucun geste générique n’active le son', async () => {
  const env = await mount();
  env.document.hidden = true;
  env.events.visibilitychange();
  env.document.hidden = false;
  env.events.visibilitychange();
  assert.equal(env.button.dataset.state, 'off');
  assert.equal(env.counts()[0], 1);
  assert.equal(env.events.scroll, undefined);
  assert.equal(env.events.resize, undefined);
  assert.equal(env.events.click, undefined);
});
test('le contrôle dédié mémorise la coupure et reflète le refus autoplay', async () => {
  const env = await mount();
  await env.clicks.click();
  assert.equal(env.preference(), 'true');
  assert.equal(env.attrs['aria-pressed'], 'false');
  env.changed('blocked');
  assert.equal(env.attrs['aria-label'], 'activation requise');
  assert.equal(env.attrs['aria-pressed'], 'false');
});

test('le choix ON autorise une tentative à la visite suivante, OFF la supprime', async () => {
  const env = await mount(true);
  await env.clicks.click();
  assert.equal(env.preference(), 'false');
  assert.equal((await mount(env.preference() === 'true')).counts()[0], 1);
  await env.clicks.click();
  assert.equal((await mount(env.preference() === 'true')).counts()[0], 0);
});
test('refus autoplay et masquage ne modifient pas le choix enregistré', async () => {
  const env = await mount(false);
  env.changed('blocked');
  env.document.hidden = true;
  env.events.visibilitychange();
  assert.equal(env.preference(), 'false');
});
test('un stockage indisponible laisse le contrôle utilisable sans erreur', async () => {
  const env = await mount(false, true);
  assert.equal(env.counts()[0], 1);
  await env.clicks.click();
  assert.equal(env.button.dataset.state, 'off');
  await env.clicks.click();
  assert.equal(env.button.dataset.state, 'on');
});
