export const mascotIdleClips = ['BreathingIdle', 'HappyIdle', 'Idle(1)', 'Idle', 'SadIdle', 'StandingW_BriefcaseIdle'];
const dances = ['SwingDancing', 'LockingHipHopDance', 'BboyHipHopMove'];
const choose = (items, roll) => items[Math.floor(roll() * items.length)];

export function createMascotBehavior(bounds, roll = Math.random) {
  let lastIdle = null;
  function resting(previous) {
    const duration = 3 + 12 * roll();
    const clip = choose(mascotIdleClips.filter(name => name !== (lastIdle ?? previous.lastIdle)), roll);
    lastIdle = clip;
    return { clip, lastIdle: clip, duration, loop: true };
  }
  return previous => {
    const from = previous.to ?? 0;
    const base = { from, to: from, yawFrom: previous.yaw ?? 0, yaw: 0, rest: 0, loop: false, walk: null, entering: false };
    if (previous.entering) {
      const clip = choose(['StandingGreeting', 'Waving'], roll);
      return { ...base, kind: 'greet', clip, duration: bounds[clip].duration };
    }
    if (previous.kind === 'turn') return { ...base, ...previous.walk, kind: 'walk' };
    if (!['idle', 'look'].includes(previous.kind)) {
      return { ...base, ...resting(previous), kind: 'idle' };
    }
    const stride = bounds.Walking.travel.at(-1)[1] * previous.size;
    const directions = [1, -1].filter(direction => from + direction * stride >= -0.01 && from + direction * stride <= previous.corridor);
    const choice = roll();
    if (directions.length && choice < 0.65) {
      const direction = choose(directions, roll);
      const available = direction > 0 ? previous.corridor - from : from;
      const loops = 1 + Math.floor(roll() * Math.floor((available + 0.01) / stride));
      const yaw = direction * (previous.side === 'right' ? -1 : 1) * Math.PI / 2;
      const walk = { clip: 'Walking', from, to: Math.max(0, Math.min(previous.corridor, from + direction * stride * loops)), yawFrom: yaw, yaw, duration: bounds.Walking.duration * loops, loop: true };
      return { ...base, kind: 'turn', clip: previous.clip, duration: 0.65, yaw, loop: true, walk };
    }
    if (choice > 0.85 && previous.kind !== 'look') {
      return { ...base, ...resting(previous), kind: 'look', yaw: choose([-0.3, 0.3], roll) };
    }
    const clip = choose(dances.filter(name => name !== previous.lastDance), roll);
    return { ...base, kind: 'dance', clip, duration: bounds[clip].duration, lastDance: clip };
  };
}

export function mascotTravel(samples, duration, time) {
  const cycles = Math.floor(time / duration);
  const local = time - cycles * duration;
  const end = samples.at(-1)[1];
  const right = samples.findIndex(sample => sample[0] >= local);
  if (right <= 0) return cycles * end;
  const a = samples[right - 1], b = samples[right];
  return cycles * end + a[1] + (b[1] - a[1]) * (local - a[0]) / (b[0] - a[0]);
}


export function mascotEntry(candidate, bounds, roll = Math.random) {
  if (candidate.id === 'hero' || roll() >= 0.45) return candidate;
  const stride = bounds.Walking.travel.at(-1)[1] * candidate.size;
  const loops = Math.ceil((candidate.edgeDistance + candidate.size * 0.65) / stride);
  const yaw = (candidate.side === 'right' ? -1 : 1) * Math.PI / 2;
  return { ...candidate, kind: 'walk', clip: 'Walking', entering: true, loop: true, from: -loops * stride, to: 0, yaw, yawFrom: yaw, duration: loops * bounds.Walking.duration };
}
