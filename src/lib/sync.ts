import type { PartyDocument } from '../../shared/collab';
import { apply, diff, squash, type MergePatch } from '../../shared/patch';
import { documentOf, patchParty } from './collab';
import type { Party } from './types';

/**
 * Keeps one party's document in step with the server while it is open.
 *
 * Deliberately not a general sync engine. It does two things:
 *
 * 1. **Push** — after a local edit, diff the document against what was last
 *    known to the server and send only that. Edits to different fields merge on
 *    the server, so a co-organiser working on the menu does not undo a change to
 *    the guest count made a second earlier (`shared/patch.ts`).
 * 2. **Pull** — poll for somebody else's edits and apply them locally.
 *
 * Writes are debounced, because a slider drag is fifty edits and one intent.
 */

const PUSH_DEBOUNCE_MS = 700;

export interface SyncTarget {
  /** The party's id on the server. */
  remoteId: string;
  /** The version the local copy was built from. */
  version: number;
}

export interface SyncCallbacks {
  /** The document as the server now has it, after somebody else's edit. */
  onRemoteDocument(document: PartyDocument, version: number): void;
  onVersion(version: number): void;
  onError(error: string): void;
  onPendingChanged(pending: boolean): void;
}

export class PartySync {
  /** What the server is believed to hold. The base every diff is taken from. */
  private shadow: PartyDocument;
  private version: number;
  /** Edits made but not yet accepted, folded into one patch. */
  private pending: MergePatch | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private stopped = false;

  constructor(
    private readonly remoteId: string,
    document: PartyDocument,
    version: number,
    private readonly callbacks: SyncCallbacks,
  ) {
    this.shadow = structuredClone(document);
    this.version = version;
  }

  /**
   * Records a local edit.
   *
   * The diff is against the shadow — what the server is believed to hold — not
   * against the previous local state. That is what makes a failed push
   * self-healing: the change stays in the diff until the server has actually
   * taken it.
   */
  record(party: Party): void {
    if (this.stopped) return;
    const patch = diff(
      this.shadow as unknown as Record<string, never>,
      documentOf(party) as unknown as Record<string, never>,
    );
    if (!patch) return;

    this.pending = this.pending ? squash(this.pending, patch) : patch;
    this.callbacks.onPendingChanged(true);
    this.schedule();
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS);
  }

  /** Sends whatever is pending. Safe to call at any time. */
  async flush(): Promise<void> {
    if (this.stopped || this.inFlight) return;
    const patch = this.pending;
    if (!patch) return;

    this.inFlight = true;
    // Cleared before the request, and restored on failure: an edit made *during*
    // the request must not be dropped by a success that never saw it.
    this.pending = null;

    const result = await patchParty(this.remoteId, this.version, patch);

    if (result.ok && result.value) {
      // The shadow advances by the patch we sent, so the next diff is taken
      // from what the server actually has.
      this.shadow = applyTo(this.shadow, patch);
      this.version = result.value.version;
      this.callbacks.onVersion(this.version);

      // Returned only when this client had fallen behind — somebody else had
      // edited in between. Adopting it is how the two converge.
      if (result.value.document) {
        this.shadow = structuredClone(result.value.document);
        this.callbacks.onRemoteDocument(result.value.document, this.version);
      }
    } else {
      this.pending = this.pending ? squash(patch, this.pending) : patch;
      this.callbacks.onError(result.error ?? 'sync_failed');
      this.schedule();
    }

    this.inFlight = false;
    this.callbacks.onPendingChanged(this.pending !== null);

    // An edit landed while the request was out.
    if (this.pending) this.schedule();
  }

  /**
   * Adopts a document pulled from the server.
   *
   * Pending local edits are replayed on top, so a poll arriving mid-edit does
   * not throw away what the user is in the middle of doing.
   */
  adopt(document: PartyDocument, version: number): void {
    if (this.stopped) return;
    this.shadow = structuredClone(document);
    this.version = version;

    const merged = this.pending
      ? (applyTo(document, this.pending) as PartyDocument)
      : document;
    this.callbacks.onRemoteDocument(merged, version);
  }

  get currentVersion(): number {
    return this.version;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Typed wrapper over the shared merge, which speaks plain JSON.
 *
 * The casts are the price of `PartyDocument` being a real type while the patch
 * layer is deliberately generic — it has to be, since a menu's keys are
 * whatever the host named their cocktails.
 */
function applyTo(document: PartyDocument, patch: MergePatch): PartyDocument {
  return apply(
    document as unknown as Record<string, never>,
    patch,
  ) as unknown as PartyDocument;
}
