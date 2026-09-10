import type { RecoveryDraft, RecoveryEntry, RecoveryWrite } from './domain/recovery'

export type StudioBridgeRecovery = {
  /**
   * Unsaved work, held where a crash cannot take it — see `RECOVERY_FOLDER`.
   *
   * A store of its own beside `documents`, and it has to be: what a document WRITE puts on disk is
   * the user's file, and using it as a net is how simply opening a video came to create an
   * `.otio` beside it. Nothing written here is ever listed, opened, or taken for the work itself.
   */
  recovery: {
    /**
     * Writes one document's unsaved state. Answers `over-budget` when the project's recovery has
     * grown past its ceiling — a SENTENCE, never an eviction: every entry may be the only copy
     * of somebody's afternoon.
     */
    write: (draft: RecoveryDraft) => Promise<RecoveryWrite>
    /** What is waiting, newest first — enough to offer it without opening anything. */
    list: () => Promise<RecoveryEntry[]>
    read: (documentId: string) => Promise<RecoveryDraft | null>
    /** Drops one entry: what a save that COVERS it asks for, and a confirmed discard. */
    clear: (documentId: string) => Promise<void>
    /**
     * Whether to bring back what is waiting. OFFERED, never taken: a person who says no keeps
     * every entry — it is still the only copy of that work — and is asked again next time.
     */
    confirmRestore: (count: number) => Promise<boolean>
  }
}
