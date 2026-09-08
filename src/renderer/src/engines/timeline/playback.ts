/**
 * One playback token for the whole app — spec § 8.7. Two players at once means two audible
 * streams and two hardware decoders fighting over the GPU, which reads as random stutter.
 */
export type PlaybackToken = {
  acquire: (owner: string, onRevoked: () => void) => void
  release: (owner: string) => void
  holder: () => string | null
}

export function createPlaybackToken(): PlaybackToken {
  let current: { owner: string; onRevoked: () => void } | null = null

  return {
    acquire: (owner, onRevoked) => {
      if (current && current.owner !== owner) current.onRevoked()
      current = { owner, onRevoked }
    },
    release: owner => {
      if (current?.owner === owner) current = null
    },
    holder: () => current?.owner ?? null,
  }
}

/** The studio's single token. Every player takes it from here, nobody makes its own. */
export const playbackToken = createPlaybackToken()

/** What a player exposes to whoever asks it to start, beyond taking the token itself. */
type Transport = {
  play: () => void
  pause: () => void
  playing: () => boolean
}

/**
 * Who can be asked to play, by name. The timeline strip is a tool window and the monitor a
 * document tab: the space bar is pressed on one and has to reach the other, and neither sits
 * inside the other's tree.
 */
export type TransportRegistry = {
  /** Returns the unregistration, so a player that goes away cannot be asked to play. */
  register: (owner: string, transport: Transport) => () => void
  get: (owner: string) => Transport | null
  toggle: (owner: string) => void
}

export function createTransportRegistry(): TransportRegistry {
  const players = new Map<string, Transport>()

  return {
    register: (owner, transport) => {
      players.set(owner, transport)
      return () => {
        // Guarded: a remount registers the new player before the old one cleans up, and an
        // unguarded delete would drop the live one.
        if (players.get(owner) === transport) players.delete(owner)
      }
    },

    get: owner => players.get(owner) ?? null,

    toggle: owner => {
      const transport = players.get(owner)
      if (!transport) return
      if (transport.playing()) transport.pause()
      else transport.play()
    },
  }
}

export const transports = createTransportRegistry()

/** The monitor a sequence's transport keys drive: the programme one, never the source. */
export function programOwner(documentId: string): string {
  return `${documentId}:program`
}

/** The take being judged, which runs its own transport beside the programme's. */
export function sourceOwner(documentId: string): string {
  return `${documentId}:source`
}
