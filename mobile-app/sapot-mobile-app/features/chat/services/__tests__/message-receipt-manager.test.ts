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

    it("should exclude NOT_SENT status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.NOT_SENT)).toBe(false);
    });

    it("should allow SENT status", () => {
      expect(manager.shouldPushReceipt(MessageStatusType.SENT)).toBe(true);
    });
  });

  describe("getTransientStatuses", () => {
    it("should return set of transient statuses", () => {
      const transient = manager.getTransientStatuses();
      expect(transient.has(MessageStatusType.SENDING)).toBe(true);
      expect(transient.has(MessageStatusType.NOT_SENT)).toBe(true);
      expect(transient.has(MessageStatusType.SENT)).toBe(false);
      expect(transient.has(MessageStatusType.DELIVERED)).toBe(false);
      expect(transient.has(MessageStatusType.READ)).toBe(false);
    });

    it("should return a set with exactly 2 transient statuses", () => {
      const transient = manager.getTransientStatuses();
      expect(transient.size).toBe(2);
    });
  });
});
