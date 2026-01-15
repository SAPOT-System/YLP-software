import { Collection, Database, Q } from "@nozbe/watermelondb";
import Peer from "../database/model/Peer";

export class PeerDatabaseService {
  private db: Database;
  private peersCollection: Collection<Peer>;

  constructor(database: Database) {
    this.db = database;
    this.peersCollection = this.db.get<Peer>("peers");
  }

  async add(newPeer: {
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
      // console.log(
      //   `[DatabaseService]: New peer created: \nName: ${createdPeer.username} ID: ${createdPeer.id} Port: ${createdPeer.port} IP Address: ${createdPeer.ipAddress}`
      // );
    } catch (error) {
      console.error("[DatabaseService]: Error creating a peer:", error);
    }
  }

  async markOnline(service: {
    id: string;
    username: string;
    port: number;
    ipAddress: string;
  }) {
    try {
      await this.db.write(async () => {
        const existing = await this.peersCollection
          .query(Q.where("id", service.id))
          .fetch();

        if (existing.length > 0) {
          await existing[0].update((peer) => {
            peer.isOnline = true;
          });
        } else {
          this.add({
            id: service.id,
            username: service.username,
            port: service.port,
            ipAddress: service.ipAddress,
          });
        }
      });
    } catch (error) {
      console.error("[PeerDatabaseService]: Error marking online:", error);
      throw error;
    }
  }

  async markOffline(id: string) {
    if (!id) {
      console.error("[PeerDatabaseService]: id param is undefined:");
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
      console.error("[PeerDatabaseService]: Error marking offline:", error);
      throw error;
    }
  }

  async findById(id: string) {
    try {
      const peer = await this.peersCollection.find(id);
      return peer;
    } catch (error) {
      console.error("[DatabaseService]: Error finding id:", error);
    }
  }

  async queryAll() {
    try {
      const allPeers = await this.peersCollection.query().fetch();
      // console.log("[DatabaseService]: All stored peers:", allPeers);
      return allPeers;
    } catch (error) {
      console.error("[DatabaseService]: Error showing peers:", error);
      throw error;
    }
  }

  // This is for debugging purposes
  async delete() {
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
