import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { showRelease } from './release.js';

function page(lang = 'en') {
  const dictionary = JSON.parse(readFileSync(new URL(`../../i18n/${lang}.json`, import.meta.url)));
  const state = { textContent: 'fallback' };
  const dot = {};
  const tag = { textContent: 'fallback', querySelector: () => dot, insertBefore(node) { this.dot = node; } };
  const card = {
    href: 'https://github.com/pasquelin/AIDesktopStudio/releases',
    dataset: { dl: 'darwin-arm64', available: dictionary.download.available,
      unavailable: dictionary.download.unavailable, download: dictionary.nav.download },
    querySelector: () => state,
    setAttribute(name, value) { this[name] = value; },
  };
  return {
    documentElement: { lang, dataset: { root: lang === 'en' ? '' : '../' } },
    querySelector: () => tag,
    querySelectorAll: () => [card], card, state, tag, dot,
  };
}

const published = { tag: 'v2.0.0', assets: { 'darwin-arm64': {
  url: 'https://github.com/pasquelin/AIDesktopStudio/releases/download/v2.0.0/installer.dmg',
  sizeBytes: 480050990,
} } };

for (const file of readdirSync(new URL('../../i18n/', import.meta.url)).filter(name => name.endsWith('.json'))) {
  const lang = file.replace('.json', '');
  test(`${lang} : version, lien et taille locale depuis le manifeste commun`, async () => {
    const document = page(lang);
    let requested;
    await showRelease(document, async (url) => { requested = url; return { ok: true, json: async () => published }; });
    assert.equal(requested, `${lang === 'en' ? '' : '../'}assets/release.json`);
    assert.equal(document.tag.textContent, 'v2.0.0');
    assert.equal(document.tag.dot, document.dot);
    assert.equal(document.card.href, published.assets['darwin-arm64'].url);
    const size = new Intl.NumberFormat(lang, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(480050990 / 1048576);
    assert.equal(document.state.textContent, document.card.dataset.available.replace('{size}', size));
  });
}

test('une plateforme absente garde son lien de secours et explique son indisponibilité', async () => {
  const document = page('fr');
  const fallback = document.card.href;
  await showRelease(document, async () => ({ ok: true, json: async () => ({ tag: 'v2.0.0', assets: {} }) }));
  assert.equal(document.card.href, fallback);
  assert.equal(document.state.textContent, document.card.dataset.unavailable);
});

test('hors ligne ou manifeste invalide : les liens HTML restent utilisables', async () => {
  for (const fetchRelease of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false }),
    async () => ({ ok: true, json: async () => null }),
  ]) {
    const document = page();
    const fallback = document.card.href;
    await showRelease(document, fetchRelease);
    assert.equal(document.card.href, fallback);
    assert.equal(document.tag.textContent, 'fallback');
  }
});
