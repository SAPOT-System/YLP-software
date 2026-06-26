import { ChatService } from "@/features/chat";
import { CallStatus, CallType } from "@/features/shared/database/model/Call";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { MessageType } from "@/features/shared/database/model/Message";
import { GuestUser } from "@/features/shared/database/model/guest-user";
import { Peer } from "@/features/shared/database/model/Peer";
import { ConversationKeyManager } from "@/features/shared/services/conversation-key-manager";
import { toAppError, captureAppError } from "@/features/shared/errors";
import { callLog } from "@/features/shared/utils/logger";
import { MessageRepository } from "@/features/chat/repositories/message-repository";
import { MessageStatusRepository } from "@/features/chat/repositories/message-status-repository";

export type CallSession = {
  callId: string;
  peerId: string;
  callType: CallType;
  startedAt: Date;
  answeredAt?: Date;
  peerName: string;
  isIncoming: boolean;
  finalized: boolean;
  conversationId: string;
};

type CallLogChatService = Pick<ChatService, "updateMessageStatus" | "acknowledgeIncomingMessage"> & {
  getOrCreateDirectConversationByPeer(
    peerId: string,
    conversationId?: string,
  ): Promise<Awaited<ReturnType<ChatService["getOrCreateDirectConversationByPeer"]>>>;
};

type CallLogPeerService = {
  findPeerById(peerId: string): Promise<Peer | GuestUser | null>;
};

type CallLogUserStore = {
  user: { id: string };
};

export class CallLogService {
  constructor(
    private readonly chatService: CallLogChatService,
    private readonly messageRepository: MessageRepository,
    private readonly messageStatusRepository: MessageStatusRepository,
    private readonly conversationKeyManager: ConversationKeyManager,
    private readonly userStore: CallLogUserStore,
    private readonly peerService: CallLogPeerService,
  ) {}

  async saveCallLogWithReceipts(params: {
    peerId: string;
    content: string;
    status?: MessageStatusType;
    senderId: string;
    messageId?: string;
    conversationId?: string;
  }): Promise<string> {
    const {
      peerId,
      content,
      status = MessageStatusType.DELIVERED,
      senderId,
      messageId,
      conversationId,
    } = params;

    if (senderId !== this.userStore.user.id && senderId !== peerId) {
      throw new Error("senderId must be current user or peerId");
    }

    try {
      if (messageId) {
        const existingMessage =
          await this.messageRepository.queryMessageById(messageId);
        if (existingMessage) {
          const existingStatus =
            await this.messageStatusRepository.queryMessageStatusByMessage(
              existingMessage.id,
            );
          if (existingStatus && existingStatus.status !== status) {
            await this.messageStatusRepository.updateMessageStatusByMessage(
              existingMessage.id,
              status,
            );
          }
          callLog.info("call › call log deduped", { peerId, messageId });
          return existingMessage.id;
        }
      }

      const peer = await this.peerService.findPeerById(peerId);
      if (!peer) throw new Error("Peer not found");
      const conversation =
        await this.chatService.getOrCreateDirectConversationByPeer(
          peerId,
          conversationId,
        );
      await this.conversationKeyManager.deriveAndSetConversationKey(
        peerId,
        conversation.id,
      );

      const sender: Peer | GuestUser =
        senderId === this.userStore.user.id
          ? (this.userStore.user as unknown as Peer)
          : peer;

      const newMessage = await this.messageRepository.saveMessage({
        sender,
        content,
        conversation,
        messageId,
        messageType: MessageType.CALL_LOG,
      });
      if (senderId === this.userStore.user.id) {
        await this.messageStatusRepository.saveMessageStatus({
          message: newMessage,
          user: sender,
          status,
        });
      }

      callLog.info("call › call log saved", {
        peerId,
        conversationId: conversation.id,
        messageId: newMessage.id,
        senderId: sender.id,
        status,
      });
      return newMessage.id;
    } catch (error) {
      const appErr = toAppError(error, "database");
      callLog.error("call › call log save failed", {
        peerId,
        contentLength: content.length,
        status,
        ...appErr,
      });
      captureAppError(appErr);
      throw appErr;
    }
  }

  buildCallLogMessage(
    session: CallSession,
    status: CallStatus,
    endTime: Date,
    durationSecondsOverride?: number,
  ): string {
    if (status === CallStatus.REJECTED) {
      return "Call declined";
    }

    if (status === CallStatus.MISSED) {
      const callLabel = session.callType === CallType.VIDEO ? "video" : "audio";
      return `Missed ${callLabel} call`;
    }

    const durationFrom = session.answeredAt ?? session.startedAt;
    const durationInSeconds =
      typeof durationSecondsOverride === "number"
        ? Math.max(0, Math.floor(durationSecondsOverride))
        : Math.max(
            0,
            Math.floor((endTime.getTime() - durationFrom.getTime()) / 1000),
          );

    const callLabel = session.callType === CallType.VIDEO ? "Video" : "Audio";
    return `${callLabel} call • ${this.formatDuration(durationInSeconds)}`;
  }

  calculateDurationSeconds(
    session: CallSession | undefined,
    endTime: Date,
  ): number {
    if (!session) {
      return 0;
    }

    const durationFrom = session.answeredAt ?? session.startedAt;
    return Math.max(
      0,
      Math.floor((endTime.getTime() - durationFrom.getTime()) / 1000),
    );
  }

  resolveFinalStatus(
    reason: "completed" | "missed" | "rejected" | undefined,
    session?: CallSession,
  ): CallStatus {
    if (reason === "rejected") return CallStatus.REJECTED;
    if (reason === "missed") return CallStatus.MISSED;
    if (reason === "completed") return CallStatus.COMPLETED;
    return session?.answeredAt ? CallStatus.COMPLETED : CallStatus.MISSED;
  }

  getDisplayName(peer: Peer | GuestUser): string {
    const fullName = [peer.firstName, peer.lastName].filter(Boolean).join(" ");
    return fullName || peer.username || "Unknown";
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(
        remainingSeconds,
      ).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }
}
