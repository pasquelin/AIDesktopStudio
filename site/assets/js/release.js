function updateCard(card, release, language) {
  const asset = release.assets?.[card.dataset.dl];
  const state = card.querySelector('.state');
  if (!asset || typeof asset.url !== 'string' || !asset.url.startsWith('https://')) {
    if (state) state.textContent = card.dataset.unavailable;
    return;
  }
  card.href = asset.url;
  card.setAttribute('download', '');
  if (state) {
    const bytes = asset.sizeBytes;
    const size = typeof bytes === 'number'
      ? new Intl.NumberFormat(language, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 0 }).format(bytes / 1048576)
      : asset.size;
    state.textContent = size ? card.dataset.available.replace('{size}', size) : card.dataset.download;
  }
}

export async function showRelease(document, fetchRelease = fetch) {
  const root = document.documentElement.dataset.root || '';
  try {
    const response = await fetchRelease(root + 'assets/release.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const release = await response.json();
    if (!release || typeof release.tag !== 'string') return;
    const tag = document.querySelector('[data-release-tag]');
    if (tag) {
      const dot = tag.querySelector('.dot');
      tag.textContent = release.tag;
      if (dot) tag.insertBefore(dot, tag.firstChild);
    }
    for (const card of document.querySelectorAll('[data-dl]')) updateCard(card, release, document.documentElement.lang);
  } catch { /* Hors ligne, les liens HTML vers les versions publiées restent utilisables. */ }
}
if (typeof document !== 'undefined') void showRelease(document);
