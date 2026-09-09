import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('le build publie le catalogue entier et traduit dans les 15 langues sans panneaux repliables', () => {
  const output = mkdtempSync(join(tmpdir(), 'site-modeles-'));
  try {
    execFileSync(process.execPath, [join(root, 'build.mjs'), output], { stdio: 'pipe' });
    const locales = readdirSync(join(root, 'i18n')).filter(file => file.endsWith('.json'));
    assert.equal(locales.length, 15);
    for (const file of locales) {
    const locale = JSON.parse(readFileSync(join(root, 'i18n', file), 'utf8'));
    const directory = locale.meta.lang === 'en' ? '' : locale.meta.lang;
    const html = readFileSync(join(output, directory, 'index.html'), 'utf8');
    const section = html.match(/<section class="panel ai-models"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section);
    const local = section.slice(section.indexOf('<div class="ai-local-grid">'), section.indexOf('<div class="ai-own">'));
    const names = [...local.matchAll(/<span>([^<]+)<\/span>/g)].map(match => match[1].replaceAll('&amp;', '&'));
    const catalogue = JSON.parse(readFileSync(join(root, '../src/shared/domain/localModels.json'), 'utf8'));
    assert.deepEqual(names.sort(), [...Object.values(catalogue).flat().map(model => model.name), 'Parakeet TDT 0.6b v3'].sort());
    assert.equal((local.match(/class="ai-local-group"/g) ?? []).length, 12);
    assert.doesNotMatch(local, /<details|<summary|\bhidden\b/);
    assert.match(html, /href="#modeles-ia"/);
    assert.doesNotMatch(html, /\{\{[\w.]+\}\}/);
    const logos = [...section.matchAll(/src="([^\"]+providers\/[^\"]+)"/g)];
    assert.equal(logos.length, 9);
    for (const [, path] of logos) assert.ok(existsSync(join(output, directory, path)), path);
    assert.ok(section.includes(locale.aiModels.intro));
    assert.ok(section.includes(locale.aiModels.unavailable));
    if (locale.meta.lang !== 'fr') assert.doesNotMatch(section, /Les modèles locaux, par usage|Non proposé au téléchargement/);
    }

  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
