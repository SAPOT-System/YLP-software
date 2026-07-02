import { MessageReceiptManager } from "../message-receipt-manager";
import { MessageStatusType } from "@/features/shared/core/database/model/MessageStatus";

describe("MessageReceiptManager", () => {
  let manager: MessageReceiptManager;

  beforeEach(() => {
    manager = new MessageReceiptManager();
  });

  describe("shouldPushReceipt", () => {
    it("should allow DELIVERED status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.DELIVERED)).toBe(true);
    });

    it("should allow READ status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.READ)).toBe(true);
    });

    it("should exclude SENDING status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.SENDING)).toBe(false);
    });

    it("should exclude SENT status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.SENT)).toBe(false);
    });

    it("should exclude NOT_SENT status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.NOT_SENT)).toBe(false);
    });
  });

  describe("shouldPushMessage", () => {
    it("should allow push when no receipts exist", () => {
      const emptyReceipts = new Map<string, MessageStatusType>();
      expect(manager.shouldPushMessage("msg-1", emptyReceipts)).toBe(true);
    });

    it("should allow push when at least one receipt is non-transient", () => {
      const receipts = new Map<string, MessageStatusType>([
        ["r1", MessageStatusType.SENDING],
        ["r2", MessageStatusType.DELIVERED],
      ]);
      expect(manager.shouldPushMessage("msg-1", receipts)).toBe(true);
    });

    it("should allow push when all receipts are non-transient", () => {
      const receipts = new Map<string, MessageStatusType>([
        ["r1", MessageStatusType.DELIVERED],
        ["r2", MessageStatusType.READ],
      ]);
      expect(manager.shouldPushMessage("msg-1", receipts)).toBe(true);
    });

    it("should exclude push when all receipts are transient", () => {
      const receipts = new Map<string, MessageStatusType>([
        ["r1", MessageStatusType.SENDING],
        ["r2", MessageStatusType.NOT_SENT],
        ["r3", MessageStatusType.SENT],
      ]);
      expect(manager.shouldPushMessage("msg-1", receipts)).toBe(false);
    });
  });

  describe("getTransientStatuses", () => {
    it("should return set of transient statuses", () => {
      const transient = manager.getTransientStatuses();
      expect(transient.has(MessageStatusType.SENDING)).toBe(true);
      expect(transient.has(MessageStatusType.SENT)).toBe(true);
      expect(transient.has(MessageStatusType.NOT_SENT)).toBe(true);
      expect(transient.has(MessageStatusType.DELIVERED)).toBe(false);
      expect(transient.has(MessageStatusType.READ)).toBe(false);
    });

    it("should return a set with exactly 3 transient statuses", () => {
      const transient = manager.getTransientStatuses();
      expect(transient.size).toBe(3);
    });
  });
});
