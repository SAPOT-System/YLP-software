import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";

export class SyncPushFilter {
  private messageReceiptManager: MessageReceiptManager | undefined;

  constructor(messageReceiptManager: MessageReceiptManager | undefined) {
    this.messageReceiptManager = messageReceiptManager;
  }

  setMessageReceiptManager(mgr: MessageReceiptManager): void {
    this.messageReceiptManager = mgr;
  }

  shouldPushReceipt(status: MessageStatusType): boolean {
    if (this.messageReceiptManager) {
      return this.messageReceiptManager.shouldPushReceipt(status);
    }

    // Fallback: exclude transient statuses
    const transientStatuses = new Set([
      MessageStatusType.SENDING,
      MessageStatusType.NOT_SENT,
      MessageStatusType.SENT,
    ]);
    return !transientStatuses.has(status);
  }

  shouldPushMessage(
    messageId: string,
    receiptsByMessage: Map<string, MessageStatusType[]>
  ): boolean {
    if (!this.messageReceiptManager) {
      // Fallback: if no manager, allow all messages (original behavior)
      return true;
    }

    const receipts = receiptsByMessage.get(messageId);
    if (!receipts || receipts.length === 0) {
      // No receipts for this message, allow push
      return true;
    }

    // Check if ANY receipt should be pushed (non-transient)
    return receipts.some((status) =>
      this.messageReceiptManager!.shouldPushReceipt(status)
    );
  }
}
