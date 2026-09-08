const FADE_SECONDS = 1;

export function createMascotPlayback(duration, nextClip = () => null, enter = candidate => candidate, initialHero = false) {
  let lastScroll = null;
  let lastMotion = 0;
  let started = null;
  let placement = null;
  let opacity = 0;
  let previous = null;
  let exiting = false;
  let lastPlacement = null;
  let lastStartScroll = 0;
  let layout = null;
  let clipDuration = duration;
  let leftPlacement = false;

  function updateLayout(now, dimensions) {
    if (layout !== null && layout !== dimensions) {
      started = null;
      placement = null;
      opacity = 0;
      lastPlacement = null;
      lastMotion = now;
    }
    layout = dimensions;
  }

  function beginPlacement(now, scroll, candidate) {
    const fresh = candidate && (candidate.id !== lastPlacement || Math.abs(scroll - lastStartScroll) >= 120 || leftPlacement);
    const immediate = initialHero && scroll === 0 && candidate?.id === 'hero';
    if (scroll !== 0 || (candidate && candidate.id !== 'hero')) initialHero = false;
    if (started === null && candidate && (immediate || now - lastMotion >= 0.9)) {
      placement = immediate ? candidate : fresh || !placement ? enter(candidate) : { ...candidate, clip: placement.clip, duration: clipDuration, resume: true };
      if (immediate) opacity = 1;
      initialHero = false;
      lastPlacement = candidate.id;
      lastStartScroll = scroll;
      clipDuration = placement.duration ?? duration;
      started = placement.resume ? now - clipDuration - 0.45 : now;
      leftPlacement = false;
      exiting = false;
    }
  }

  return function advance(now, scroll, candidate, dimensions = '') {
    updateLayout(now, dimensions);
    const elapsed = previous === null ? 0 : Math.max(0, now - previous);
    previous = now;
    const moved = lastScroll !== null && Math.abs(scroll - lastScroll) > 0.5;
    if (lastScroll === null || moved) lastMotion = now;
    lastScroll = scroll;
    if ((moved || candidate?.id !== placement?.id) && started !== null) exiting = true;
    if (lastPlacement && candidate?.id !== lastPlacement) leftPlacement = true;
    beginPlacement(now, scroll, candidate);
    if (started !== null && !exiting && now - started >= clipDuration + (placement.rest ?? 0)) {
      const next = nextClip(placement);
      if (next) {
        placement = { ...placement, ...next, resume: false, cycle: true, cycleIndex: (placement.cycleIndex ?? 0) + 1 };
        clipDuration = next.duration;
        started = now;
      }
    }
    const time = started === null ? clipDuration : Math.min(clipDuration, now - started);
    const target = started !== null && !exiting ? 1 : 0;
    opacity = target ? Math.min(1, opacity + elapsed / FADE_SECONDS) : Math.max(0, opacity - elapsed / FADE_SECONDS);
    if (exiting && opacity === 0) started = null;
    const idleTime = started === null ? null : Math.max(0, now - started - clipDuration);
    return { placement, opacity, time, idleTime, exiting };
  };
}
