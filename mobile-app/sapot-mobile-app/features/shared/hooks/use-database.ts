import { toAppError, captureAppError } from "@/features/shared/errors";
import { database, Peer } from "../database";
import { dbLog } from "../utils/logger";

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
      const appErr = toAppError(error, "database");
      dbLog.error("database › peer create failed", appErr);
    }
  };

  const showPeers = async () => {
    try {
      const allPeers = await database.get<Peer>("peers").query().fetch();
      dbLog.debug("database › peers listed", { count: allPeers.length });
      return allPeers;
    } catch (error) {
      const appErr = toAppError(error, "database");
      dbLog.error("database › peers list failed", appErr);
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
      const appErr = toAppError(error, "database");
      dbLog.error("database › peers delete failed", appErr);
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
      const appErr = toAppError(error, "database");
      dbLog.error("database › reset failed", appErr);
    }
  };

  return { createPeer, showPeers, deletePeers, deleteDatabase };
};

export default useDatabase;
