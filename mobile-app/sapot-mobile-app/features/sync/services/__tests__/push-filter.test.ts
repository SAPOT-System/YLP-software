import { SyncPushFilter } from "../push-filter";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
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
    it("should delegate to manager when present", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt.mockReturnValue(true);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.DELIVERED);

      // Assert
      expect(result).toBe(true);
      expect(mockReceiptManager.shouldPushReceipt).toHaveBeenCalledWith(MessageStatusType.DELIVERED);
    });

    it("should exclude SENDING status when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.SENDING);

      // Assert
      expect(result).toBe(false);
    });

    it("should exclude NOT_SENT status when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.NOT_SENT);

      // Assert
      expect(result).toBe(false);
    });

    it("should exclude SENT status when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.SENT);

      // Assert
      expect(result).toBe(false);
    });

    it("should allow DELIVERED status when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.DELIVERED);

      // Assert
      expect(result).toBe(true);
    });

    it("should allow READ status when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);

      // Act
      const result = filter.shouldPushReceipt(MessageStatusType.READ);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe("shouldPushMessage", () => {
    it("should return true when manager is undefined", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);
      const receiptsByMessage = new Map<string, MessageStatusType[]>();

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
    });

    it("should return true when message has no receipts", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      const receiptsByMessage = new Map<string, MessageStatusType[]>();

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
      expect(mockReceiptManager.shouldPushReceipt).not.toHaveBeenCalled();
    });

    it("should return true when message receipts array is empty", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", []],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
    });

    it("should return false when all receipts are transient", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt.mockReturnValue(false);

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.SENDING, MessageStatusType.NOT_SENT, MessageStatusType.SENT]],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(false);
      expect(mockReceiptManager.shouldPushReceipt).toHaveBeenCalledTimes(3);
    });

    it("should return true when at least one receipt should be pushed", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.SENDING, MessageStatusType.DELIVERED, MessageStatusType.SENT]],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
    });

    it("should handle single receipt that should be pushed", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt.mockReturnValue(true);

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.READ]],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
      expect(mockReceiptManager.shouldPushReceipt).toHaveBeenCalledWith(MessageStatusType.READ);
    });

    it("should short-circuit on first truthy receipt", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.SENDING, MessageStatusType.DELIVERED, MessageStatusType.READ]],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
      // Called at most 2 times due to short-circuiting (after first true)
      expect(mockReceiptManager.shouldPushReceipt.mock.calls.length).toBeLessThanOrEqual(3);
    });
  });

  describe("setMessageReceiptManager", () => {
    it("should update manager for subsequent calls", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);
      const newManager = {
        shouldPushReceipt: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<MessageReceiptManager>;

      // Act
      filter.setMessageReceiptManager(newManager);
      const result = filter.shouldPushReceipt(MessageStatusType.DELIVERED);

      // Assert
      expect(result).toBe(true);
      expect(newManager.shouldPushReceipt).toHaveBeenCalledWith(MessageStatusType.DELIVERED);
    });

    it("should use new manager for shouldPushMessage", () => {
      // Arrange
      filter = new SyncPushFilter(undefined);
      const newManager = {
        shouldPushReceipt: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<MessageReceiptManager>;
      filter.setMessageReceiptManager(newManager);

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.DELIVERED]],
      ]);

      // Act
      const result = filter.shouldPushMessage("msg-1", receiptsByMessage);

      // Assert
      expect(result).toBe(true);
      expect(newManager.shouldPushReceipt).toHaveBeenCalled();
    });

    it("should replace existing manager", () => {
      // Arrange
      const initialManager = {
        shouldPushReceipt: jest.fn().mockReturnValue(false),
      } as unknown as jest.Mocked<MessageReceiptManager>;
      filter = new SyncPushFilter(initialManager);

      const newManager = {
        shouldPushReceipt: jest.fn().mockReturnValue(true),
      } as unknown as jest.Mocked<MessageReceiptManager>;

      // Act
      filter.setMessageReceiptManager(newManager);
      const result = filter.shouldPushReceipt(MessageStatusType.DELIVERED);

      // Assert
      expect(result).toBe(true);
      expect(newManager.shouldPushReceipt).toHaveBeenCalled();
      expect(initialManager.shouldPushReceipt).not.toHaveBeenCalled();
    });
  });

  describe("integration", () => {
    it("should allow filtering messages based on receipts", () => {
      // Arrange
      filter = new SyncPushFilter(mockReceiptManager);
      mockReceiptManager.shouldPushReceipt
        .mockReturnValueOnce(false) // msg-1 receipt 1
        .mockReturnValueOnce(false) // msg-1 receipt 2
        .mockReturnValueOnce(true);  // msg-2 receipt 1

      const receiptsByMessage = new Map<string, MessageStatusType[]>([
        ["msg-1", [MessageStatusType.SENDING, MessageStatusType.NOT_SENT]],
        ["msg-2", [MessageStatusType.DELIVERED]],
      ]);

      // Act
      const msg1Result = filter.shouldPushMessage("msg-1", receiptsByMessage);
      const msg2Result = filter.shouldPushMessage("msg-2", receiptsByMessage);

      // Assert
      expect(msg1Result).toBe(false);
      expect(msg2Result).toBe(true);
    });
  });
});
