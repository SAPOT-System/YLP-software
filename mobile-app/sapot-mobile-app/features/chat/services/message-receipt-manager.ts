import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { chatLog } from "@/features/shared/utils/logger";

chatLog.debug("[message-receipt-manager] module loaded");

/**
 * MessageReceiptManager centralizes filtering logic for message receipts (statuses).
 *
 * Rationale: Local message statuses transition through SENDING → SENT/NOT_SENT → DELIVERED → READ.
 * However, only DELIVERED and READ statuses should be synced to the server. Transient statuses
 * (SENDING, SENT, NOT_SENT) are local-only and represent in-flight or failed delivery states.
 *
 * Filtering at the source (when creating receipts or filtering for sync) prevents:
 * - Orphaned receipts on the server (receipt without corresponding message)
 * - Inconsistent message/receipt pairs in the sync payload
 * - Race conditions where a transient receipt syncs but the message is excluded
 */
export class MessageReceiptManager {
  /**
   * Determines if a receipt status should be synced to the server.
   * Only DELIVERED and READ statuses are server-synced; transient statuses stay local.
   *
   * @param status The message receipt status
   * @returns true if the status should be pushed to the server
   */
  shouldPushReceipt(status: MessageStatusType): boolean {
    const transientStatuses = new Set([
      MessageStatusType.SENDING,
      MessageStatusType.SENT,
      MessageStatusType.NOT_SENT,
    ]);
    return !transientStatuses.has(status);
  }

  /**
   * Determines if a message should be pushed to the server based on its associated receipts.
   *
   * A message is excluded from push if ALL of its receipts have transient statuses.
   * This prevents orphaned messages on the server when the full receipt lifecycle
   * hasn't completed yet.
   *
   * @param messageId The message to check
   * @param receiptStatuses Map of receipt IDs to their statuses (from sync payload)
   * @returns true if the message should be pushed to the server
   */
  shouldPushMessage(
    messageId: string,
    receiptStatuses: Map<string, MessageStatusType>
  ): boolean {
    // If no receipts exist for this message, allow push (message exists independently)
    if (receiptStatuses.size === 0) return true;

    // If ANY receipt is non-transient, allow message push
    for (const status of receiptStatuses.values()) {
      if (this.shouldPushReceipt(status)) {
        return true;
      }
    }

    // All receipts are transient; exclude message to prevent orphans
    chatLog.debug("message › excluding message with transient receipts", {
      messageId,
      receiptCount: receiptStatuses.size,
    });
    return false;
  }

  /**
   * Returns the set of transient status values (local-only, not synced).
   * Useful for filtering operations across the codebase.
   */
  getTransientStatuses(): Set<MessageStatusType> {
    return new Set([
      MessageStatusType.SENDING,
      MessageStatusType.SENT,
      MessageStatusType.NOT_SENT,
    ]);
  }
}
