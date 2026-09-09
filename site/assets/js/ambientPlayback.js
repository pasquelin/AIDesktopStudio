export function createAmbientPlayback({ createContext, loadBuffer, changed, resumeTimeout = 500 }) {
  let context;
  let buffer;
  let source;
  let gain;
  let wanted = false;
  let version = 0;
  let started = 0;
  let loading;

  async function suspendIfIdle() {
    if (!wanted && context && context.state === 'running') {
      try { await context.suspend(); } catch { changed('error'); }
    }
  }

  function stop() {
    wanted = false;
    version++;
    changed('off');
    if (source) {
      const ending = source;
      const envelope = gain;
      source = null;
      if (context.state !== 'running') {
        ending.stop();
        ending.disconnect();
        envelope.disconnect();
        return;
      }
      const now = context.currentTime;
      const level = 0.12 * Math.min(1, Math.max(0, (now - started) / 3));
      envelope.gain.cancelScheduledValues(now);
      envelope.gain.setValueAtTime(level, now);
      envelope.gain.linearRampToValueAtTime(0, now + 0.25);
      ending.onended = async () => {
        ending.disconnect();
        envelope.disconnect();
        await suspendIfIdle();
      };
      ending.stop(now + 0.26);
    } else {
      void suspendIfIdle();
    }
  }

  function ensureContext() {
  if (!context) {
    context = createContext();
    context.onstatechange = () => {
      if (wanted && source && context.state !== 'running') stop();
      else if (!wanted) void suspendIfIdle();
    };
  }
  }

  function playBuffer() {
  source = context.createBufferSource();
  gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  gain.connect(context.destination);
  started = context.currentTime;
  gain.gain.setValueAtTime(0, started);
  gain.gain.linearRampToValueAtTime(0.12, started + 3);
  source.start();
  changed('on');
  }

  async function start() {
    if (wanted) return;
    wanted = true;
    const request = ++version;
    changed('loading');
    let timeout;
    try {
      ensureContext();
      const resumed = await Promise.race([
        context.resume(),
        new Promise(resolve => { timeout = setTimeout(() => resolve(false), resumeTimeout); }),
      ]);
      clearTimeout(timeout);
      if (request !== version) { await suspendIfIdle(); return; }
      if (resumed === false || context.state !== 'running') {
        stop();
        changed('blocked');
        return;
      }
      if (!buffer) {
        loading ??= loadBuffer(context);
        buffer = await loading;
      }
      if (request !== version) { await suspendIfIdle(); return; }
      playBuffer();
    } catch {
      clearTimeout(timeout);
      loading = null;
      if (request !== version) return;
      stop();
      changed('error');
    }
  }

  return { start, stop, toggle: async () => { if (wanted) stop(); else await start(); } };
}
