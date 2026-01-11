import { database } from "../database";
import Peer from "../database/model/Peer";

const useDatabase = () => {
  const createPeer = async (newPeer: {
    id: string;
    username: string;
    port: number;
    ipAddress: string;
  }) => {
    try {
      const createdPeer = await database.write(async () => {
        const peer = await database.get<Peer>("peers").create((peer: Peer) => {
          peer.username = newPeer.username;
          peer._raw.id = newPeer.id;
          peer.port = newPeer.port;
          peer.ip_address = newPeer.ipAddress;
        });
        return peer;
      });
      console.log(`[useDatabase]: New peer created \n ${createdPeer}`);
    } catch (error) {
      console.error("Error creating a peer:", error);
    }
  };

  const showPeers = async () => {
    try {
      const allPeers = await database.get<Peer>("peers").query().fetch();
      console.log("All stored peers:", allPeers);
      return allPeers;
    } catch (error) {
      console.error("Error showing peers:", error);
    }
  };

  const deletePeers = async () => {
    try {
      await database.write(async () => {
        const records = await database.get<Peer>("peers").query().fetch();

        const ops = records.map((r) => r.prepareDestroyPermanently());

        await database.batch(...ops);
      });
    } catch (error) {
      console.error("Error deleting peers:", error);
    }
  };

  const deleteDatabase = async () => {
    try {
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
    } catch (error) {
      console.error("Error deleting database:", error);
    }
  };

  return { createPeer, showPeers, deletePeers, deleteDatabase };
};

export default useDatabase;
