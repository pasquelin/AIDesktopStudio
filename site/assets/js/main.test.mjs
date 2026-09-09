import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
function page(workshop = false, hash = '') {
  const listeners = {}, docListeners = {}, frames = [], calls = [];
  let now = 0;
  const window = { location: { hash }, scrollY: 0, innerHeight: 720, innerWidth: 1280, history: { pushState() {} }, matchMedia: query => ({ matches: query.includes('min-width') }), addEventListener(name, fn) { listeners[name] = fn; }, scrollTo(value) { calls.push(value); } };
  const rect = (top, height) => ({ top: top - window.scrollY, bottom: top + height - window.scrollY, height });
  const frame = { style: {}, querySelector: () => ({ style: {} }) };
  const pin = { style: {}, offsetHeight: 668, getBoundingClientRect: () => ({ top: Math.min(Math.max(1000 - window.scrollY, 52), 2400 - window.scrollY - 668) }) };
  const stage = { style: { setProperty() {} }, classList: { add(name) { this.value = name; } }, offsetHeight: 1400, getBoundingClientRect: () => rect(1000, stage.classList.value === 'stage--complete' ? 668 : 1400), querySelector: selector => selector === '.stage__pin' ? pin : frame };
  const targets = { '#accueil': { id: 'accueil', getBoundingClientRect: () => rect(720, 2000) }, '#image': { id: 'image', getBoundingClientRect: () => rect(2800, 700) }, '#video': { id: 'video', getBoundingClientRect: () => rect(3500, 700) } };
  const tabs = Object.keys(targets).map(href => ({ dataset: {}, getAttribute: () => href, setAttribute() {}, addEventListener(name, fn) { this.click = () => fn({ preventDefault() {} }); } }));
  const item = { dataset: { speedx: '.036' }, style: {}, classList: { contains: () => false }, hasAttribute: name => name === 'data-still', closest: () => ({}), getBoundingClientRect: () => rect(300, 100) };
  const img = { style: {}, offsetHeight: 100, closest: selector => selector === '.mode' ? {} : { getBoundingClientRect: () => rect(300, 100) } };
  const summary = { focused: 0, focus() { this.focused += 1; } };
  const langs = { open: false, contains: node => node === summary, querySelector: () => summary };
  const document = { hidden: false, addEventListener(name, fn) { docListeners[name] = fn; }, getElementById: id => id === 'modeles-locaux' ? { getBoundingClientRect: () => rect(stage.classList.value === 'stage--complete' ? 4268 : 5000, 100) } : null, documentElement: { classList: { add() {} }, dataset: {}, scrollHeight: 5000 }, querySelector: selector => selector === '[data-stage]' ? stage : selector === '.langs' ? langs : targets[selector] ?? null, querySelectorAll: selector => selector === '[data-tab]' ? tabs : workshop && selector === '[data-fx]' ? [item] : workshop && selector === '[data-depth]' ? [img] : [] };
  runInNewContext(source, { window, document, performance: { now: () => now }, requestAnimationFrame: fn => frames.push(fn), getComputedStyle: () => ({ top: '52px', scrollMarginTop: '124px' }), fetch: async () => ({ ok: false }) });
  return { window, calls, tabs, frame, pin, stage, item, img, listeners, docListeners, langs, summary, step(time, y) { now = time; window.scrollY = y; frames.shift()(time); } };
}

test('le menu traverse la scène sans épinglage ni zoom et garde la destination', () => {
  const p = page(); p.step(0, 0); p.tabs[1].click();
  p.step(100, 1100);
  assert.equal(p.frame.style.transform, 'scale(0.6000)');
  assert.equal(p.pin.style.transform, 'translateY(-152.000px)');
  p.step(200, 1500);
  assert.equal(p.frame.style.transform, 'scale(0.6000)');
  assert.equal(p.calls[0].top, 2822);
  p.step(1000, 2822); p.step(1300, 2822);
  assert.equal(p.pin.style.transform, '');
});

test('le scroll manuel conserve l’agrandissement de la scène', () => {
  const p = page(); p.step(0, 0); const initial = p.frame.style.transform;
  p.step(100, 1300);
  assert.notEqual(p.frame.style.transform, initial);
  assert.equal(p.pin.style.transform, undefined);
});

test('la reprise manuelle annule le trajet et rend progressivement la scène au scroll', () => {
  const p = page(); p.step(0, 0); p.tabs[1].click(); p.step(100, 1300);
  p.listeners.wheel();
  assert.equal(p.calls.at(-1).behavior, 'instant');
  assert.equal(p.calls.at(-1).top, 1300);
  p.step(100, 1300); assert.equal(p.frame.style.transform, 'scale(0.6000)');
  p.step(400, 1300); assert.equal(p.pin.style.transform, '');
  assert.notEqual(p.frame.style.transform, 'scale(0.6000)');
});

test('les clics successifs remplacent la destination sans ajouter un deuxième défilement', () => {
  const p = page(); p.step(0, 0); p.tabs[1].click(); p.step(100, 500); p.tabs[2].click();
  assert.equal(p.calls.length, 2); assert.equal(p.calls.at(-1).top, 3522);
});


test('la capture reste grande après son premier agrandissement complet', () => {
  const p = page(); p.step(0, 0);
  assert.equal(p.frame.style.transform, 'scale(0.6000)');
  p.step(100, 1800); assert.equal(p.frame.style.transform, 'scale(1.0000)');
  p.step(200, 0); assert.equal(p.frame.style.transform, 'scale(1.0000)');
  p.tabs[1].click(); p.step(300, 1200);
  assert.equal(p.frame.style.transform, 'scale(1.0000)');
  const reload = page(); reload.step(0, 0);
  assert.equal(reload.frame.style.transform, 'scale(0.6000)');
});


test('le passage mobile aligne l’atelier et montre la capture entière, puis restaure le desktop', () => {
  const p = page(true); p.step(0, 0);
  assert.notEqual(p.item.style.transform, 'translate3d(0.00px,0.00px,0)');
  p.window.innerWidth = 390; p.step(100, 0);
  assert.equal(p.item.style.transform, 'translate3d(0.00px,0.00px,0)');
  assert.equal(p.img.style.transform, 'none');
  p.window.innerWidth = 1280; p.step(200, 0);
  assert.notEqual(p.item.style.transform, 'translate3d(0.00px,0.00px,0)');
  assert.notEqual(p.img.style.transform, 'none');
});


test('la fin du zoom retire définitivement le mécanisme sticky pour la visite', () => {
  const p = page(); p.step(0, 0); p.step(100, 1800);
  assert.equal(p.stage.classList.value, 'stage--complete');
  p.step(200, 1200); p.tabs[1].click(); p.step(300, 1400);
  assert.equal(p.pin.style.transform, '');
  assert.equal(p.frame.style.transform, 'scale(1.0000)');
});


test('la suppression de l’espace du zoom conserve la position du contenu suivant', () => {
  const p = page(); p.step(0, 0); p.step(100, 3000); p.step(200, 3000);
  assert.equal(p.calls.at(-1).top, 2268);
  assert.equal(p.calls.at(-1).behavior, 'instant');
});


test('un lien direct vers les modèles reste aligné après la réduction de l’accueil', () => {
  const p = page(false, '#modeles-locaux'); p.step(0, 0); p.step(100, 800);
  assert.equal(p.stage.classList.value, 'stage--complete');
  assert.equal(p.calls.at(-1).top, 4144);
  assert.equal(p.calls.at(-1).behavior, 'instant');
});

test('le menu des langues se referme au clic à côté et sur Échap, jamais sur lui-même', () => {
  const p = page();
  p.langs.open = true;
  p.docListeners.click({ target: p.summary });
  assert.equal(p.langs.open, true);
  p.docListeners.click({ target: {} });
  assert.equal(p.langs.open, false);

  p.langs.open = true;
  p.docListeners.keydown({ key: 'Escape' });
  assert.equal(p.langs.open, false);
  assert.equal(p.summary.focused, 1);
});
