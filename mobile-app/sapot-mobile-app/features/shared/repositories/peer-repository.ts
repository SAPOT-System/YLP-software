import { Collection, Database, Q } from "@nozbe/watermelondb";
import { Peer } from "../database";

// This class will communicate to the peers table in the database
export class PeerRepository {
  private db: Database;
  private peersCollection: Collection<Peer>;

  constructor(db: Database) {
    this.db = db;
    this.peersCollection = this.db.get<Peer>(Peer.table);
  }

  async savePeer(newPeer: { id: string; username: string }) {
    try {
      return await this.db.write(async () => {
        const peer = await this.peersCollection.create((peer: Peer) => {
          peer.username = newPeer.username;
          peer.isOnline = false;
          peer._raw.id = newPeer.id;
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
}
