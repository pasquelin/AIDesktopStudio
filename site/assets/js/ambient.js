import { createAmbientPlayback } from './ambientPlayback.js';

const button = document.querySelector('[data-ambient]');
let state = 'off';
let userMuted = false;
try {
  const stored = localStorage.getItem('ambient-muted');
  userMuted = stored === 'true';
  button.dataset.storedMuted = stored ?? 'unset';
} catch { userMuted = false; button.dataset.storedMuted = 'unavailable'; }
const playback = createAmbientPlayback({
  createContext: () => {
    const context = new AudioContext();
    button.dataset.contextState = context.state;
    context.addEventListener('statechange', () => { button.dataset.contextState = context.state; });
    return context;
  },
  loadBuffer: async context => {
    const response = await fetch(button.dataset.src);
    if (!response.ok) throw new Error('Ambient audio unavailable');
    return await context.decodeAudioData(await response.arrayBuffer());
  },
  changed: next => {
    state = next;
    button.dataset.state = next;
    button.setAttribute('aria-pressed', next === 'on' ? 'true' : 'false');
    const action = next === 'on' ? 'stop' : next === 'loading' || next === 'error' || next === 'blocked' ? next : 'start';
    button.title = button.dataset[action];
    button.setAttribute('aria-label', button.title);
  },
});
playback.stop();
button.hidden = false;
button.addEventListener('click', async () => {
  userMuted = state === 'on' || state === 'loading';
  try {
    localStorage.setItem('ambient-muted', String(userMuted));
    button.dataset.storedMuted = localStorage.getItem('ambient-muted');
  } catch { button.dataset.storedMuted = 'unavailable'; }
  await playback.toggle();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) playback.stop(); });
window.addEventListener('pagehide', () => playback.stop());
document.addEventListener('play', event => {
  if (event.target instanceof HTMLMediaElement) playback.stop();
}, true);
if (!userMuted && !document.hidden) await playback.start();
