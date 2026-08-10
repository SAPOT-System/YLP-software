import { MessageStatusType } from "@/features/shared/core/database/model/MessageStatus";
import { chatLog } from "@/features/shared/core/utils/logger";

chatLog.debug("[message-receipt-manager] module loaded");

/**
 * MessageReceiptManager centralizes filtering logic for message receipts (statuses).
 *
 * Rationale: Local message statuses transition through SENDING → SENT/NOT_SENT → DELIVERED → READ.
 * SENDING and NOT_SENT are local-only because they represent an in-flight attempt or a
 * transport failure. SENT, DELIVERED, and READ are durable server-side states.
 *
 * Filtering at the source (when creating receipts or filtering for sync) prevents:
 * - Publishing a send attempt before any transport accepted it
 * - Publishing a local transport failure as shared conversation state
 */
export class MessageReceiptManager {
  /**
   * Determines if a receipt status should be synced to the server.
   * SENDING and NOT_SENT stay local; SENT, DELIVERED, and READ are server-synced.
   *
   * @param status The message receipt status
   * @returns true if the status should be pushed to the server
   */
  shouldPushReceipt(status: MessageStatusType): boolean {
    const transientStatuses = new Set([
      MessageStatusType.SENDING,
      MessageStatusType.NOT_SENT,
    ]);
    return !transientStatuses.has(status);
  }

  /**
   * Returns the set of transient status values (local-only, not synced).
   * Useful for filtering operations across the codebase.
   */
  getTransientStatuses(): Set<MessageStatusType> {
    return new Set([
      MessageStatusType.SENDING,
      MessageStatusType.NOT_SENT,
    ]);
  }
}
