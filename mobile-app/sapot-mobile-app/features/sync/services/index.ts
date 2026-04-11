import baseLogger from "@/features/shared/utils/logger";

const syncLog = baseLogger.extend("sync");
syncLog.debug("[sync/services] module loaded");

export { InMemorySyncQueueStorage, SyncService } from "./sync-service";
export type {
  EntityLocalPayloadMap,
  SyncEntity,
  SyncOperationType,
  SyncQueueItem,
  SyncQueueStorage,
} from "./sync-service";
