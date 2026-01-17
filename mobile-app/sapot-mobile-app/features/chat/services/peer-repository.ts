import { Collection, Database, Q } from "@nozbe/watermelondb";
import { Peer } from "@/features/shared";

export class PeerRepository {
  private db: Database;
  private peersCollection: Collection<Peer>;

  constructor(db: Database) {
    this.db = db;
    this.peersCollection = this.db.get<Peer>("peers");
  }

  async addPeer(newPeer: {
    id: string;
    username: string;
    port: number;
    ipAddress: string;
  }) {
    try {
      const createdPeer = await this.db.write(async () => {
        const peer = await this.peersCollection.create((peer: Peer) => {
          peer.username = newPeer.username;
          peer._raw.id = newPeer.id;
          peer.port = newPeer.port;
          peer.ipAddress = newPeer.ipAddress;
        });
        return peer;
      });
    } catch (error) {
      console.error("[PeerRepository]: Error creating a peer:", error);
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
      console.error("[PeerRepository]: Error marking offline:", error);
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
      console.error("[PeerRepository]: Error marking offline:", error);
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
        "[PeerRepository]: Error in finding peeer if exist:",
        error
      );
      throw error;
    }
  }

  async findPeerById(id: string) {
    try {
      const peer = await this.peersCollection.find(id);
      return peer;
    } catch (error) {
      console.error("[DatabaseService]: Error finding id:", error);
    }
  }

  async queryAllPeers() {
    try {
      const allPeers = await this.peersCollection.query().fetch();
    //   console.log("[DatabaseService]: All stored peers:", allPeers);
      return allPeers;
    } catch (error) {
      console.error("[DatabaseService]: Error showing peers:", error);
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
      console.error("[DatabaseService]: Error deleting peers:", error);
    }
  }
}
