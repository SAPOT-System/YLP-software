import { Database } from "@nozbe/watermelondb";
import { faultInjector } from "@/features/debug/services/fault-injector";
import { SyncService } from "../sync-service";

jest.mock("@/config/debug", () => ({ IS_DEBUG_ENABLED: true }));
import type { MessageRepository } from "@/features/chat/repositories/message-repository";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";

// Mock the sync API and dependencies
jest.mock("../../api/sync.api");
jest.mock("@nozbe/watermelondb/sync");
jest.mock("@/features/shared/core/stores/secure-config");

import * as syncApi from "../../api/sync.api";
import * as secureConfig from "@/features/shared/core/stores/secure-config";
import { synchronize } from "@nozbe/watermelondb/sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = (records: any[] = []) => ({
  get: jest.fn().mockReturnValue({
    query: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue(records),
    }),
  }),
});

describe("SyncService", () => {
  let service: SyncService;
  let mockDatabase: Database;
  let mockSyncApi: jest.Mocked<typeof syncApi>;
  let mockSecureConfig: jest.Mocked<typeof secureConfig>;
  let mockSynchronize: jest.Mocked<typeof synchronize>;
  let mockReceiptManager: jest.Mocked<MessageReceiptManager>;
  let mockMessageRepository: jest.Mocked<MessageRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockDatabase = mockDb() as unknown as Database;
    mockSyncApi = syncApi as unknown as jest.Mocked<typeof syncApi>;
    mockSecureConfig = secureConfig as unknown as jest.Mocked<typeof secureConfig>;
    mockSynchronize = synchronize as jest.Mocked<typeof synchronize>;

    mockReceiptManager = {
      shouldPushReceipt: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<MessageReceiptManager>;

    mockMessageRepository = {
      hasMigrationKeys: jest.fn().mockReturnValue(false),
      reEncryptAfterMigration: jest.fn().mockResolvedValue(undefined),
      clearMigrationKeys: jest.fn(),
      tryDecryptWithMigrationKeys: jest.fn(),
    } as unknown as jest.Mocked<MessageRepository>;

    (mockSecureConfig.getSyncLastPulledAt as jest.Mock).mockResolvedValue(0);
    (mockSecureConfig.saveSyncLastPulledAt as jest.Mock).mockResolvedValue(undefined);
    (mockSecureConfig.clearMigrationState as jest.Mock).mockResolvedValue(undefined);

    (mockSynchronize as jest.Mock).mockResolvedValue(undefined);
    (mockSyncApi.pushLocalDataApi as jest.Mock).mockResolvedValue(undefined);

    service = new SyncService({
      db: mockDatabase,
      messageReceiptManager: mockReceiptManager,
      messageRepository: mockMessageRepository,
      currentUserId: "user-1",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    service.cleanup();
  });

  describe("initialization", () => {
    it("should construct with database and optional managers", () => {
      // Assert
      expect(service).toBeDefined();
      expect(service["db"]).toBe(mockDatabase);
    });

    it("should accept message receipt manager in constructor", () => {
      // Arrange
      const newManager = {
        shouldPushReceipt: jest.fn(),
      } as unknown as jest.Mocked<MessageReceiptManager>;
      const newService = new SyncService({
        db: mockDatabase,
        messageReceiptManager: newManager,
        messageRepository: mockMessageRepository,
      });

      // Assert
      expect(newService["pushFilter"]["messageReceiptManager"]).toBe(newManager);
      newService.cleanup();
    });
  });

  describe("pagination", () => {
    it("should support single-page sync", async () => {
      // Arrange
      (mockSynchronize as jest.Mock).mockImplementationOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async ({ pullChanges }: any) => {
          const result = await pullChanges({
            lastPulledAt: 0,
            schemaVersion: 1,
          });
          return result;
        }
      );

      // Act
      await service.syncNow();

      // Assert
      expect(mockSynchronize).toHaveBeenCalled();
    });
  });

  describe("debug fault injection", () => {
    afterEach(() => {
      faultInjector.setOfflineFlag("syncDown", false);
    });

    it("skips syncNow when the syncDown fault is set", async () => {
      faultInjector.setOfflineFlag("syncDown", true);

      await service.syncNow();

      expect(mockSynchronize).not.toHaveBeenCalled();
    });

    it("runs syncNow normally once syncDown is cleared", async () => {
      faultInjector.setOfflineFlag("syncDown", true);
      faultInjector.setOfflineFlag("syncDown", false);

      await service.syncNow();

      expect(mockSynchronize).toHaveBeenCalled();
    });
  });

  describe("retry logic", () => {
    it("should not retry when isSyncing is true", async () => {
      // Arrange
      service["isSyncing"] = true;

      // Act
      await service.syncNow();

      // Assert
      expect(mockSynchronize).not.toHaveBeenCalled();
    });

    it("should reset retry attempts on connectivity change online", async () => {
      // Arrange
      service["retryAttempts"] = 3;
      service["retryTimer"] = setTimeout(() => {}, 1000);

      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.handleConnectivityChange(true);

      // Assert
      expect(service["retryAttempts"]).toBe(0);
    });

    it("should clear retry timer on connectivity change online", () => {
      // Arrange
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service["retryTimer"] = setTimeout(() => {}, 1000) as any;

      // Act
      service["clearRetryTimer"]();

      // Assert
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should not sync when going offline", async () => {
      // Arrange
      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.handleConnectivityChange(false);

      // Assert
      expect(mockSynchronize).not.toHaveBeenCalled();
    });
  });

  describe("sync status events", () => {
    it("should emit started when sync begins", async () => {
      // Arrange
      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);
      const statusListener = jest.fn();
      service.on("sync-status", statusListener);

      // Act
      await service.syncNow();

      // Assert
      expect(statusListener).toHaveBeenCalledWith(
        expect.objectContaining({ status: "started" })
      );
    });

    it("should emit complete when sync succeeds", async () => {
      // Arrange
      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);
      const statusListener = jest.fn();
      service.on("sync-status", statusListener);

      // Act
      await service.syncNow();

      // Assert
      expect(statusListener).toHaveBeenCalledWith(
        expect.objectContaining({ status: "complete" })
      );
    });
  });

  describe("post-migration re-encryption", () => {
    it("should re-encrypt when hasMigrationKeys is true after sync", async () => {
      // Arrange
      mockMessageRepository.hasMigrationKeys.mockReturnValue(true);

      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.syncNow();

      // Assert
      expect(mockMessageRepository.reEncryptAfterMigration).toHaveBeenCalled();
      expect(mockMessageRepository.clearMigrationKeys).toHaveBeenCalled();
      expect(mockSecureConfig.clearMigrationState).toHaveBeenCalled();
    });

    it("should not re-encrypt when hasMigrationKeys is false", async () => {
      // Arrange
      mockMessageRepository.hasMigrationKeys.mockReturnValue(false);

      (mockSynchronize as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.syncNow();

      // Assert
      expect(mockMessageRepository.reEncryptAfterMigration).not.toHaveBeenCalled();
      expect(mockMessageRepository.clearMigrationKeys).not.toHaveBeenCalled();
    });
  });

  describe("skip encrypted message updates", () => {
    it("should call scheduleSkip on migration guard", () => {
      // Arrange
      const migrationGuardSpy = jest.spyOn(
        service["migrationGuard"],
        "scheduleSkip"
      );

      // Act
      service.skipEncryptedMessageUpdatesOnNextSync();

      // Assert
      expect(migrationGuardSpy).toHaveBeenCalled();
      migrationGuardSpy.mockRestore();
    });
  });

  describe("cleanup", () => {
    it("should clear retry timer on cleanup", () => {
      // Arrange
      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service["retryTimer"] = setTimeout(() => {}, 1000) as any;

      // Act
      service.cleanup();

      // Assert
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should be safe to call cleanup multiple times", () => {
      // Act & Assert
      expect(() => {
        service.cleanup();
        service.cleanup();
      }).not.toThrow();
    });

    it("should call cleanup on service creation and teardown", () => {
      // Arrange
      const newService = new SyncService({
        db: mockDatabase,
        messageReceiptManager: mockReceiptManager,
        messageRepository: mockMessageRepository,
      });

      // Act
      newService.cleanup();

      // Assert - should not crash
      expect(newService).toBeDefined();
    });
  });

  describe("sync logs", () => {
    it("should provide formatted sync logs", () => {
      // Arrange & Act
      const logs = service.formattedSyncLogs;

      // Assert
      expect(logs).toBeDefined();
    });

    it("should provide raw sync logs", () => {
      // Arrange & Act
      const logs = service.syncLogs;

      // Assert
      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });
  });
});
