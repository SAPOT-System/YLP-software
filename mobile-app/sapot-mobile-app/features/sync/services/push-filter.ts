import { MessageStatusType } from "@/features/shared/core/database/model/MessageStatus";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";

export class SyncPushFilter {
  constructor(private readonly messageReceiptManager: MessageReceiptManager) {}

  shouldPushReceipt(status: MessageStatusType): boolean {
    return this.messageReceiptManager.shouldPushReceipt(status);
  }
}
