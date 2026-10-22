import { toRaw } from 'vue';
import type {
  PartyMemberDTO,
  PartyRole,
  SharedPartyDTO,
} from '../../shared/collab';
import { fetchFunnel } from './api/guests';
import { fetchParty } from './api/parties';
import { applyDocument, documentOf, publicationOf } from './collab';
import { mergeFunnel, sameInvites } from '../features/guests/invites';
import { PartySync } from './sync';
import type { Party, PartyPublication } from './types';

/**
 * Everything that runs while a shared party is open: the push of local edits
 * (`PartySync`), the pull of everybody else's every few seconds, and the pull
 * of the guest funnel.
 *
 * One at a time on purpose: only the open party is being edited, and a poll per
 * party in the list would be a lot of requests to learn nothing. The store
 * starts it when a shared party opens (or a party is shared) and stops it when
 * the party closes, so nothing outlives the party it was for.
 *
 * Pulling is a poll rather than a socket: two organisers make a handful of
 * edits a minute between them, and a Durable Object to push those would cost
 * more to run and more to reason about than it saves. The same goes for the
 * funnel — a few RSVPs a minute against a Worker that is already awake.
 */

/** Somebody else's edits to the party. */
export const PULL_MS = 6_000;
/** Guests answering the invite. */
export const FUNNEL_MS = 20_000;

/** What the session reports, for the screens to show. */
export interface SessionStatus {
  /** The open party's co-organisers. */
  members: PartyMemberDTO[];
  /** The caller's role on the open party. */
  role: PartyRole | null;
  /** True while local edits are waiting to reach the server. */
  syncPending: boolean;
  /** Set when a push failed. Cleared by the next success. */
  syncError: string | null;
  /** True while the funnel is being pulled. Never blocks the UI. */
  funnelSyncing: boolean;
  funnelSyncedAt: string | null;
}

/** What the session needs from the store. */
export interface SessionHost {
  /** Where the session reports — the store's reactive state. */
  readonly status: SessionStatus;
  /** The party with this local id, as the store holds it. */
  party(localId: number): Party | undefined;
  /**
   * Persists a change that came from the server. Not pushed back: it is
   * already there.
   */
  save(party: Party, change: (p: Party) => void): void;
}

export class PartySession {
  private sync: PartySync | null = null;
  private localId: number | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly host: SessionHost) {}

  /**
   * Starts syncing `party`, stopping whatever ran before. Does nothing for a
   * party that is not on the server.
   */
  start(party: Party): void {
    this.stop();
    const publication = party.publication;
    if (!publication || party.id === undefined) return;

    const { status } = this.host;
    const localId = party.id;
    // Bound to this party, not to whichever is open when the answer comes: the
    // last push is sent as the party closes, and its answer belongs to it.
    const save = (change: (p: Party) => void) => {
      const target = this.host.party(localId);
      if (target) this.host.save(target, change);
    };
    const sync = new PartySync(
      publication.remoteId,
      documentOf(party),
      publication.version,
      {
        onRemoteDocument: (document) => save((p) => applyDocument(p, document)),
        onVersion: (version) => {
          status.syncError = null;
          save((p) => {
            if (p.publication) p.publication.version = version;
          });
        },
        onError: (error) => {
          status.syncError = error;
        },
        onPendingChanged: (pending) => {
          status.syncPending = pending;
        },
      },
    );
    this.sync = sync;
    this.localId = localId;
    this.timers = [
      setInterval(() => void this.pull(), PULL_MS),
      setInterval(() => void this.syncFunnel(), FUNNEL_MS),
    ];
    void this.pull();
    void this.syncFunnel();
  }

  /** Stops every timer and forgets the party. Safe to call at any time. */
  stop(): void {
    this.sync?.stop();
    this.sync = null;
    this.localId = null;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    const { status } = this.host;
    status.syncPending = false;
    status.members = [];
    status.role = null;
  }

  /**
   * Records a local edit to `party`, to be pushed. An edit to any other party
   * is not this session's: that party is not being synced.
   */
  record(party: Party): void {
    if (this.sync && party.id === this.localId) this.sync.record(party);
  }

  /** Sends whatever is waiting, now. */
  async flush(): Promise<void> {
    await this.sync?.flush();
  }

  /** Pulls the party, so somebody else's edits show up here. */
  async pull(): Promise<void> {
    const sync = this.sync;
    const party = this.current();
    const remoteId = party?.publication?.remoteId;
    // Don't pull over our own unsent work — the push is about to make this
    // version stale anyway, and the merge would be doing it twice.
    if (!sync || !party || !remoteId || sync.hasPending) return;

    const result = await fetchParty(remoteId);
    // The party may have closed, or another opened, while this was out.
    if (this.sync !== sync || !result.ok || !result.value) return;

    const shared = result.value;
    this.host.status.members = shared.members;
    this.host.status.role = shared.role;
    this.refreshPublication(party, shared);
    if (shared.version !== sync.currentVersion) {
      sync.adopt(shared.document, shared.version);
    }
  }

  /**
   * Pulls the funnel and folds it into the party's guest list.
   *
   * Silent on failure. An organiser whose phone dropped off the network should
   * see the list they already have rather than an error where their party used
   * to be.
   */
  async syncFunnel(): Promise<void> {
    const sync = this.sync;
    const party = this.current();
    const remoteId = party?.publication?.remoteId;
    if (!sync || !party || !remoteId) return;

    const { status } = this.host;
    status.funnelSyncing = true;
    try {
      const result = await fetchFunnel(remoteId);
      if (this.sync !== sync || !result.ok || !result.value) return;

      const merged = mergeFunnel(toRaw(party).invites, result.value);
      // Most polls find nothing new. Committing anyway would write the whole
      // party to IndexedDB and re-render the guest list every few seconds, so
      // only commit a list that actually differs.
      if (!sameInvites(party.invites, merged)) {
        this.host.save(party, (p) => {
          p.invites = merged;
        });
      }
      status.funnelSyncedAt = new Date().toISOString();
    } finally {
      status.funnelSyncing = false;
    }
  }

  private current(): Party | undefined {
    return this.localId === null ? undefined : this.host.party(this.localId);
  }

  /**
   * Keeps what the browser holds of the party's publication in step with the
   * server. The owner's plan can change under a co-organiser (an upgrade, a
   * refund), a co-organiser's first pull is where they get the signing key —
   * without which their scanner rejects every guest — and the invite link may
   * have been opened or closed on another phone.
   */
  private refreshPublication(party: Party, shared: SharedPartyDTO): void {
    // Raw: a key carried over from it must not be a Vue proxy, which the
    // structured clone on save refuses.
    const current = toRaw(party).publication;
    if (!current) return;
    const next: PartyPublication = {
      ...publicationOf(shared),
      publishedAt: current.publishedAt,
      ticketKey: shared.ticketKey ?? current.ticketKey,
    };
    if (samePublication(current, next)) return;
    this.host.save(party, (p) => {
      p.publication = next;
    });
  }
}

function samePublication(a: PartyPublication, b: PartyPublication): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every(
    (k) =>
      JSON.stringify(a[k as keyof PartyPublication]) ===
      JSON.stringify(b[k as keyof PartyPublication]),
  );
}
