import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";

export class SyncPushFilter {
  constructor(private readonly messageReceiptManager: MessageReceiptManager) {}

  shouldPushReceipt(status: MessageStatusType): boolean {
    return this.messageReceiptManager.shouldPushReceipt(status);
  }

  shouldPushMessage(
    messageId: string,
    receiptsByMessage: Map<string, MessageStatusType[]>
  ): boolean {
    const receipts = receiptsByMessage.get(messageId);
    if (!receipts || receipts.length === 0) {
      return true;
    }
    return receipts.some((status) => this.messageReceiptManager.shouldPushReceipt(status));
  }
}
