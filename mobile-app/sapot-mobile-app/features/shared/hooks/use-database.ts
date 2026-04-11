import { database, Peer } from "../database";
import baseLogger from "../utils/logger";

const dbLog = baseLogger.extend("database");

dbLog.debug("[use-database] module loaded");

const useDatabase = () => {
  const createPeer = async (newPeer: {
    id: string;
    username: string;
  }) => {
    try {
      const createdPeer = await database.write(async () => {
        const peer = await database.get<Peer>("peers").create((peer: Peer) => {
          peer.username = newPeer.username;
          peer._raw.id = newPeer.id;
        });
        return peer;
      });
      dbLog.info("database › peer created", { peerId: createdPeer.id });
    } catch (error) {
      dbLog.error("database › peer create failed", { error });
    }
  };

  const showPeers = async () => {
    try {
      const allPeers = await database.get<Peer>("peers").query().fetch();
      dbLog.debug("database › peers listed", { count: allPeers.length });
      return allPeers;
    } catch (error) {
      dbLog.error("database › peers list failed", { error });
    }
  };

  const deletePeers = async () => {
    try {
      dbLog.info("database › peers delete start");
      await database.write(async () => {
        const records = await database.get<Peer>("peers").query().fetch();

        const ops = records.map((r) => r.prepareDestroyPermanently());

        await database.batch(...ops);
      });
      dbLog.info("database › peers delete complete");
    } catch (error) {
      dbLog.error("database › peers delete failed", { error });
    }
  };

  const deleteDatabase = async () => {
    try {
      dbLog.warn("database › reset requested");
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
      dbLog.info("database › reset complete");
    } catch (error) {
      dbLog.error("database › reset failed", { error });
    }
  };

  return { createPeer, showPeers, deletePeers, deleteDatabase };
};

export default useDatabase;
