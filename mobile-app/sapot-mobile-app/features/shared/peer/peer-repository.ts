import { Collection, Database, Q } from "@nozbe/watermelondb";
import { Peer } from "../core/database";
import { peerLog } from "../core/utils/logger";
import { toAppError, captureAppError } from "@/features/shared/core/errors";

peerLog.debug("[peer-repository] module loaded");

/**
 * PeerRepository communicates with the peers table in the database and manages CRUD operations for peers.
 */
export class PeerRepository {
  private db: Database;
  private peersCollection: Collection<Peer>;

  /**
   * Constructs a PeerRepository instance.
   * @param db The WatermelonDB database instance
   */
  constructor(db: Database) {
    this.db = db;
    this.peersCollection = this.db.get<Peer>(Peer.table);
    peerLog.info("peer › repository constructed", { hasDatabase: Boolean(db) });
  }

  /**
   * Saves a new peer to the database.
   * @param newPeer The peer data (id, username)
   * @returns Promise<Peer> The saved peer
   */
  async savePeer(newPeer: {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
    emailVerified?: boolean;
    phoneNumberVerified?: boolean;
    role?: string;
    isGuest?: boolean;
  }) {
    try {
      return await this.db.write(async () => {
        const peer = await this.peersCollection.create((peer: Peer) => {
          peer.username = newPeer.username;
          peer.isOnline = false;
          peer._raw.id = newPeer.id;
          peer.firstName = newPeer.firstName;
          peer.lastName = newPeer.lastName || "";
          peer.email = newPeer.email || "";
          peer.phoneNumber = newPeer.phoneNumber || "";
          if (newPeer.emailVerified !== undefined) {
            peer.emailVerified = newPeer.emailVerified;
          }
          if (newPeer.phoneNumberVerified !== undefined) {
            peer.phoneNumberVerified = newPeer.phoneNumberVerified;
          }
          if (newPeer.role !== undefined) {
            peer.role = newPeer.role;
          }
          if (newPeer.isGuest !== undefined) {
            peer.isGuest = newPeer.isGuest;
          }
        });
        return peer;
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › create failed", {
        peerId: newPeer.id,
        hasEmail: Boolean(newPeer.email),
        hasPhoneNumber: Boolean(newPeer.phoneNumber),
        hasLastName: Boolean(newPeer.lastName),
        emailVerified: newPeer.emailVerified,
        phoneNumberVerified: newPeer.phoneNumberVerified,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Creates or updates a peer in a single write to avoid race conditions.
   * @param peerInfo The peer data (id plus optional fields)
   * @param options Optional behavior flags
   * @returns Promise<Peer> The created or updated peer
   */
  async createOrUpdatePeer(
    peerInfo: {
      id: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      emailVerified?: boolean;
      phoneNumberVerified?: boolean;
      role?: string;
      isGuest?: boolean;
    },
    options?: { markOnline?: boolean }
  ) {
    try {
      return await this.db.write(async () => {
        const peers = await this.peersCollection
          .query(Q.where("id", peerInfo.id))
          .fetch();

        if (peers.length > 0) {
          await peers[0].update((peer) => {
            if (peerInfo.username !== undefined) {
              peer.username = peerInfo.username;
            }
            if (peerInfo.firstName !== undefined) {
              peer.firstName = peerInfo.firstName;
            }
            if (peerInfo.lastName !== undefined) {
              peer.lastName = peerInfo.lastName;
            }
            if (peerInfo.email !== undefined) {
              peer.email = peerInfo.email;
            }
            if (peerInfo.phoneNumber !== undefined) {
              peer.phoneNumber = peerInfo.phoneNumber;
            }
            if (peerInfo.emailVerified !== undefined) {
              peer.emailVerified = peerInfo.emailVerified;
            }
            if (peerInfo.phoneNumberVerified !== undefined) {
              peer.phoneNumberVerified = peerInfo.phoneNumberVerified;
            }
            if (peerInfo.role !== undefined) {
              peer.role = peerInfo.role;
            }
            if (peerInfo.isGuest !== undefined) {
              peer.isGuest = peerInfo.isGuest;
            }
            if (options?.markOnline) {
              peer.isOnline = true;
            }
          });
          return peers[0];
        }

        const peer = await this.peersCollection.create((peer: Peer) => {
          peer.username = peerInfo.username ?? "Guest";
          peer.isOnline = false;
          peer._raw.id = peerInfo.id;
          peer.firstName = peerInfo.firstName ?? "Guest";
          peer.lastName = peerInfo.lastName ?? "";
          peer.email = peerInfo.email ?? "";
          peer.phoneNumber = peerInfo.phoneNumber ?? "";
          if (peerInfo.emailVerified !== undefined) {
            peer.emailVerified = peerInfo.emailVerified;
          }
          if (peerInfo.phoneNumberVerified !== undefined) {
            peer.phoneNumberVerified = peerInfo.phoneNumberVerified;
          }
          if (peerInfo.role !== undefined) {
            peer.role = peerInfo.role;
          }
          if (peerInfo.isGuest !== undefined) {
            peer.isGuest = peerInfo.isGuest;
          }
        });
        return peer;
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › upsert failed", {
        peerId: peerInfo.id,
        hasUsername: peerInfo.username !== undefined,
        hasFirstName: peerInfo.firstName !== undefined,
        hasLastName: peerInfo.lastName !== undefined,
        hasEmail: peerInfo.email !== undefined,
        hasPhoneNumber: peerInfo.phoneNumber !== undefined,
        emailVerified: peerInfo.emailVerified,
        phoneNumberVerified: peerInfo.phoneNumberVerified,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Marks a peer as offline in the database.
   * @param id The peer id
   * @returns Promise<void>
   */
  async markPeerOffline(id: string) {
    if (!id) {
      peerLog.warn("peer › missing id", { action: "markPeerOffline" });
    }
    try {
      await this.db.write(async () => {
        const offlinePeer = await this.peersCollection.query(Q.where("id", id));

        if (offlinePeer.length > 0) {
          await offlinePeer[0].update((peer) => {
            peer.isOnline = false;
            // Stamp last-seen so an offline peer can show "Last seen …" (LAN/mDNS source).
            peer.lastSeenAt = Date.now();
          });
        }
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › mark offline failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Updates a peer's last-seen timestamp, keeping the most recent value so a
   * stale server reading never overwrites a fresher local stamp (or vice versa).
   * @param id The peer id
   * @param ms Epoch milliseconds of the observed activity
   */
  async setPeerLastSeen(id: string, ms: number) {
    if (!id || !Number.isFinite(ms)) return;
    try {
      await this.db.write(async () => {
        const peers = await this.peersCollection.query(Q.where("id", id));
        if (peers.length > 0) {
          await peers[0].update((peer) => {
            if (!peer.lastSeenAt || ms > peer.lastSeenAt) {
              peer.lastSeenAt = ms;
            }
          });
        }
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › set last seen failed", { peerId: id, ...appErr });
    }
  }

  /**
   * Marks a peer as online in the database.
   * @param id The peer id
   * @returns Promise<void>
   */
  async markPeerOnline(id: string) {
    if (!id) {
      peerLog.warn("peer › missing id", { action: "markPeerOnline" });
    }
    try {
      await this.db.write(async () => {
        const onlinePeer = await this.peersCollection.query(Q.where("id", id));

        if (onlinePeer.length > 0) {
          await onlinePeer[0].update((peer) => {
            peer.isOnline = true;
            peer.lastSeenAt = Date.now();
          });
        }
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › mark online failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async updatePeerInfoById(
    peerId: string,
    peerInfo: {
      username?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
      emailVerified?: boolean;
      phoneNumberVerified?: boolean;
      role?: string;
      isGuest?: boolean;
    }
  ) {
    try {
      return await this.db.write(async () => {
        const peers = await this.peersCollection.query(Q.where("id", peerId));

        if (peers.length > 0) {
          await peers[0].update((peer) => {
            if (peerInfo.username !== undefined) {
              peer.username = peerInfo.username;
            }
            if (peerInfo.firstName !== undefined) {
              peer.firstName = peerInfo.firstName;
            }
            if (peerInfo.lastName !== undefined) {
              peer.lastName = peerInfo.lastName;
            }
            if (peerInfo.email !== undefined) {
              peer.email = peerInfo.email;
            }
            if (peerInfo.phoneNumber !== undefined) {
              peer.phoneNumber = peerInfo.phoneNumber;
            }
            if (peerInfo.emailVerified !== undefined) {
              peer.emailVerified = peerInfo.emailVerified;
            }
            if (peerInfo.phoneNumberVerified !== undefined) {
              peer.phoneNumberVerified = peerInfo.phoneNumberVerified;
            }
            if (peerInfo.role !== undefined) {
              peer.role = peerInfo.role;
            }
            if (peerInfo.isGuest !== undefined) {
              peer.isGuest = peerInfo.isGuest;
            }
          });
        }
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › update info failed", {
        peerId,
        hasEmail: peerInfo.email !== undefined,
        hasPhoneNumber: peerInfo.phoneNumber !== undefined,
        hasLastName: peerInfo.lastName !== undefined,
        emailVerified: peerInfo.emailVerified,
        phoneNumberVerified: peerInfo.phoneNumberVerified,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Checks if a peer exists in the database by id.
   * @param id The peer id
   * @returns Promise<boolean> True if exists, false otherwise
   */
  async isPeerExist(id: string) {
    try {
      const existing = await this.peersCollection
        .query(Q.where("id", id))
        .fetch();
      return existing.length > 0;
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › check exists failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Queries a peer by id from the database.
   * @param id The peer id
   * @returns Promise<Peer | undefined> The peer or undefined
   */
  async queryPeerById(id: string) {
    try {
      const peer = await this.peersCollection.query(Q.where("id", id)).fetch();
      return peer[0];
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › query by id failed", { peerId: id, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  /**
   * Queries all peers from the database.
   * @returns Promise<Peer[]> Array of all peers
   */
  async queryAllPeers() {
    try {
      const allPeers = await this.peersCollection.query().fetch();
      //   peerLog.debug("peer › list", { count: allPeers.length });
      return allPeers;
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › list failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  // This is for debugging purposes
  /**
   * Deletes all peers from the database (for debugging/testing purposes).
   * @returns Promise<void>
   */
  async deleteAllPeers() {
    try {
      await this.db.write(async () => {
        const records = await this.peersCollection.query().fetch();

        const ops = records.map((r) => r.prepareDestroyPermanently());

        await this.db.batch(...ops);
      });
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › delete all failed", appErr);
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getByIds(ids: string[]): Promise<Peer[]> {
    if (ids.length === 0) return [];
    try {
      return this.peersCollection.query(Q.where("id", Q.oneOf(ids))).fetch();
    } catch (error) {
      const appErr = toAppError(error, "database");
      peerLog.error("peer › get by ids failed", { count: ids.length, ...appErr });
      captureAppError(appErr);
      throw appErr;
    }
  }

  async getAllPeerIds(): Promise<string[]> {
    const peers = await this.peersCollection.query().fetch();
    return peers.map(p => p.id);
  }

  async getPeerDestroyOps() {
    peerLog.debug("peer › destroy ops requested");
    const records = await this.peersCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
