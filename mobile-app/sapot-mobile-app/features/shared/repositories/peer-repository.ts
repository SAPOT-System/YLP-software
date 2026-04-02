import { Collection, Database, Q } from "@nozbe/watermelondb";
import { Peer } from "../database";

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
        });
        return peer;
      });
    } catch (error) {
      console.error(
        `[PeerRepository]: Error creating a peer\n${JSON.stringify(
          newPeer,
          null,
          2
        )}`,
        error
      );
      throw error;
    }
  }

  /**
   * Marks a peer as offline in the database.
   * @param id The peer id
   * @returns Promise<void>
   */
  async markPeerOffline(id: string) {
    if (!id) {
      console.error("[PeerRepository]: id param is undefined:");
    }
    try {
      await this.db.write(async () => {
        const offlinePeer = await this.peersCollection.query(Q.where("id", id));

        if (offlinePeer.length > 0) {
          await offlinePeer[0].update((peer) => {
            peer.isOnline = false;
          });
        }
      });
    } catch (error) {
      console.error(
        `[PeerRepository]: Error marking peer offline\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Marks a peer as online in the database.
   * @param id The peer id
   * @returns Promise<void>
   */
  async markPeerOnline(id: string) {
    if (!id) {
      console.error("[PeerRepository]: id param is undefined:");
    }
    try {
      await this.db.write(async () => {
        const onlinePeer = await this.peersCollection.query(Q.where("id", id));

        if (onlinePeer.length > 0) {
          await onlinePeer[0].update((peer) => {
            peer.isOnline = true;
          });
        }
      });
    } catch (error) {
      console.error(
        `[PeerRepository]: Error marking peer online\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  async updatePeerInfoById(
    peerId: string,
    peerInfo: {
      username?:string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phoneNumber?: string;
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
          });
        }
      });
    } catch (error) {
      console.error(
        `[PeerRepository]: Error updating peer info by id\n${JSON.stringify(
          { peerId, peerInfo }
        )}\n${error}`
      );
      throw error;
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
      console.error(
        `[PeerRepository]: Error checking if peer exist\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
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
      console.error(
        `[PeerRepository]: Error querying peer\n${JSON.stringify(
          { id },
          null,
          2
        )}\n${error}`
      );
      throw error;
    }
  }

  /**
   * Queries all peers from the database.
   * @returns Promise<Peer[]> Array of all peers
   */
  async queryAllPeers() {
    try {
      const allPeers = await this.peersCollection.query().fetch();
      //   console.log("[PeerRepository]: All stored peers:", allPeers);
      return allPeers;
    } catch (error) {
      console.error("[PeerRepository]: Error showing peers:", error);
      throw error;
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
      console.error("[PeerRepository]: Error deleting peers:", error);
      throw error;
    }
  }

  async getPeerDestroyOps() {
    const records = await this.peersCollection.query().fetch();

    return records.map((r) => r.prepareDestroyPermanently());
  }
}
