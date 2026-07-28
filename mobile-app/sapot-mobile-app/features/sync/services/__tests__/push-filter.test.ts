import { SyncPushFilter } from "../push-filter";
import { MessageStatusType } from "@/features/shared/core/database/model/MessageStatus";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";

describe("SyncPushFilter", () => {
  let filter: SyncPushFilter;
  let mockReceiptManager: jest.Mocked<MessageReceiptManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockReceiptManager = {
      shouldPushReceipt: jest.fn(),
    } as unknown as jest.Mocked<MessageReceiptManager>;
  });

  describe("shouldPushReceipt", () => {
    it("should delegate to manager", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt.mockReturnValue(true);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.DELIVERED);

      // Assert
      expect(result).toBe(true);
      expect(mockReceiptManager.shouldPushReceipt).toHaveBeenCalledWith(MessageStatusType.DELIVERED);
    });

    it("should return false for SENDING when manager returns false", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt.mockReturnValue(false);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.SENDING);

      // Assert
      expect(result).toBe(false);
    });
  });
});
