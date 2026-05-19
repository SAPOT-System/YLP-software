import { Q } from "@nozbe/watermelondb";
import { withObservables } from "@nozbe/watermelondb/react";
import { Feather } from "@expo/vector-icons";
import React, { memo, useEffect, useRef, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { catchError, map, of } from "rxjs";

import {
  GuestUser,
  Message,
  MessageStatus,
  Peer,
  database,
  formatDate,
} from "@/features/shared";
import { MessageType } from "@/features/shared/database/model/Message";
import { CallType } from "@/features/shared/database/model/Call";
import { useMainContainer } from "@/features/shared/hooks";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import { usePeerService } from "@/features/shared/hooks";
import { uiLog } from "@/features/shared/utils/logger";
import { useChatService } from "@/features/chat/hooks/use-chat-service";
import { useTheme } from "react-native-paper";
import { useInformCall } from "@/features/call";
import { sendSmsToUser } from "@/features/shared/api/gsm.api";
uiLog.debug("[message-list] module loaded");

const enhanceMessages = withObservables(
  ["conversationId"],
  ({ conversationId }: { conversationId: string }) => ({
    messages: database
      .get<Message>(Message.table)
      .query(
        Q.where("conversation", conversationId),
        Q.sortBy("created_at", Q.asc),
        Q.take(100)
      )
      .observe(),
  })
);

const MessageList = enhanceMessages(
  ({ messages, peerId }: { messages: Message[]; peerId: string }) => {
    const listRef = useRef<FlatList<Message>>(null);
    const prevLengthRef = useRef(0);

    useEffect(() => {
      if (messages.length === 0) return;
      const isInitialLoad = prevLengthRef.current === 0;
      prevLengthRef.current = messages.length;
      listRef.current?.scrollToEnd({ animated: !isInitialLoad });
    }, [messages.length]);

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={({ item }) => (
            <MessageListItem message={item} peerId={peerId} />
          )}
          keyExtractor={(message) => message.id}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          maxToRenderPerBatch={10}
          initialNumToRender={20}
          windowSize={5}
          removeClippedSubviews
        />
      </View>
    );
  }
);

const enhanceMessage = withObservables(
  ["message"],
  ({ message }: { message: Message }) => {
    const senderId = (message._raw as Record<string, unknown>).sender as
      | string
      | null;
    return {
      message,
      sender: message.sender.observe().pipe(catchError(() => of(null))),
      guestSender: senderId
        ? database
            .get<GuestUser>(GuestUser.table)
            .query(Q.where("id", senderId))
            .observe()
            .pipe(
              map((r) => r[0] ?? null),
              catchError(() => of(null))
            )
        : of(null),
      status: database
        .get<MessageStatus>(MessageStatus.table)
        .query(Q.where("message", message.id))
        .observeWithColumns(["status"]),
    };
  }
);


const getSenderName = (sender?: Peer | GuestUser | null) => {
  if (!sender) {
    return "Unknown";
  }

  const fullName = `${sender.firstName ?? ""} ${sender.lastName ?? ""}`.trim();
  return fullName || sender.username || "Unknown";
};

type ParsedCallLog = {
  isMissed: boolean;
  isBusy: boolean;
  isAudio: boolean;
  title: string;
  subtitle: string;
};

const parseCallLog = (content: string, createdAt: Date): ParsedCallLog => {
  if (content === "Missed audio call") {
    return {
      isMissed: true,
      isBusy: false,
      isAudio: true,
      title: "Missed audio call",
      subtitle: formatDate(createdAt),
    };
  }
  if (content === "Missed video call") {
    return {
      isMissed: true,
      isBusy: false,
      isAudio: false,
      title: "Missed video call",
      subtitle: formatDate(createdAt),
    };
  }
  if (content === "Busy audio call") {
    return {
      isMissed: false,
      isBusy: true,
      isAudio: true,
      title: "Busy audio call",
      subtitle: formatDate(createdAt),
    };
  }
  if (content === "Busy video call") {
    return {
      isMissed: false,
      isBusy: true,
      isAudio: false,
      title: "Busy video call",
      subtitle: formatDate(createdAt),
    };
  }
  const audioBullet = content.match(/^Audio call \u2022 (.+)$/);
  if (audioBullet) {
    return {
      isMissed: false,
      isBusy: false,
      isAudio: true,
      title: "Audio call",
      subtitle: audioBullet[1],
    };
  }
  const videoBullet = content.match(/^Video call \u2022 (.+)$/);
  if (videoBullet) {
    return {
      isMissed: false,
      isBusy: false,
      isAudio: false,
      title: "Video call",
      subtitle: videoBullet[1],
    };
  }
  return {
    isMissed: false,
    isBusy: false,
    isAudio: true,
    title: content,
    subtitle: formatDate(createdAt),
  };
};

const CallLogMessageCard = ({
  message,
  peerId,
  isOutgoing,
  callType,
}: {
  message: Message;
  peerId: string;
  isOutgoing: boolean;
  callType: CallType | null;
}) => {
  const handleCall = useInformCall();
  const { isMissed, isBusy, isAudio, title, subtitle } = parseCallLog(
    message.content,
    message.createdAt
  );

  let iconName: React.ComponentProps<typeof Feather>["name"];
  if (isAudio) {
    if (isMissed || isBusy) {
      iconName = "phone-off";
    } else if (isOutgoing) {
      iconName = "phone-outgoing";
    } else {
      iconName = "phone-incoming";
    }
  } else {
    iconName = isMissed || isBusy ? "video-off" : "video";
  }

  return (
    <View
      style={{
        width: 250,
        alignSelf: isOutgoing ? "flex-end" : "flex-start",
        height: 130,
        borderRadius: 20,
        backgroundColor: "#363636",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: 16,
          top: 12,
          width: 35,
          height: 35,
          borderRadius: 17.5,
          backgroundColor: isMissed ? "red" : isBusy ? "#FFA500" : "#696969",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Feather name={iconName} size={20} color="white" />
      </View>
      <View style={{ position: "absolute", left: 61, top: 14 }}>
        <Text style={{ color: "white", fontSize: 14 }}>{title}</Text>
        <Text style={{ color: "white", fontSize: 14 }}>{subtitle}</Text>
      </View>
      <TouchableOpacity
        onPress={() =>
          handleCall(callType ?? (isAudio ? "audio" : "video"), peerId)
        }
        style={{
          position: "absolute",
          top: 83,
          left: 26,
          width: 198,
          height: 34,
          borderRadius: 10,
          backgroundColor: "#696969",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 14 }}>Call again</Text>
      </TouchableOpacity>
    </View>
  );
};

type MessageListItemProps = {
  message: Message;
  sender?: Peer | GuestUser | null;
  guestSender?: GuestUser | null;
  status: MessageStatus[];
  peerId: string;
};

const MessageListItemInner = memo(
  ({
    message,
    sender,
    guestSender,
    status,
    peerId,
  }: MessageListItemProps) => {
    const statusObj = status?.[0];
    const senderName = getSenderName(sender ?? guestSender);
    const userStore = useUserStore();
    const theme = useTheme();
    const isCurrentUserMessage = message.sender?.id === userStore.user?.id;
    const chatService = useChatService();
    const peerService = usePeerService();
    const [isResending, setIsResending] = useState(false);
    const { callRepository } = useMainContainer();
    const [callType, setCallType] = useState<CallType | null>(null);

    useEffect(() => {
      if (message.messageType !== "call_log") return;
      callRepository
        .queryByConversation(message.conversation.id)
        .then((calls) => {
          if (calls.length > 0) setCallType(calls[0].callType);
        })
        .catch(() => {});
    }, [
      message.id,
      message.messageType,
      callRepository,
      message.conversation.id,
    ]);

    const handleResend = async () => {
      setIsResending(true);
      try {
        if (message.messageType === MessageType.SMS) {
          await chatService.updateMessageStatus(message.id, MessageStatusType.SENDING);
          const res = await sendSmsToUser(peerId, message.content);
          const status = res.ok
            ? MessageStatusType.DELIVERED
            : MessageStatusType.NOT_SENT;
          await chatService.updateMessageStatus(message.id, status);
        } else {
          const discoveredPeer = peerService.findDiscoveredPeerById(peerId);
          await chatService.tryResendMessage(
            message,
            peerId,
            discoveredPeer
              ? { ipAddress: discoveredPeer.ipAddress, port: discoveredPeer.port }
              : undefined
          );
        }
      } catch (err) {
        uiLog.warn("[message-list] resend failed", { peerId, err });
        if (message.messageType === MessageType.SMS) {
          await chatService.updateMessageStatus(message.id, MessageStatusType.NOT_SENT).catch(() => {});
        }
      } finally {
        setIsResending(false);
      }
    };

    if (message.messageType === "call_log") {
      return (
        <CallLogMessageCard
          message={message}
          peerId={peerId}
          isOutgoing={isCurrentUserMessage}
          callType={callType}
        />
      );
    }

    // For the peer message (incoming)
    if (!isCurrentUserMessage) {
      if (message.messageType === "text") {
        return (
          <View
            style={{
              backgroundColor: theme.dark ? "#1A233A" : "#EAEDF3",
              alignSelf: "flex-start",
              padding: 10,
            }}
          >
            <Text
              style={{
                color: theme.dark ? "#737171" : "#6A6A6A",
                fontSize: 14,
              }}
            >
              {senderName}, {formatDate(message.createdAt)}
            </Text>
            <Text
              style={{
                color: theme.dark ? "#737171" : "#000000",
                fontSize: 17,
              }}
            >
              {message.content}
            </Text>
          </View>
        );
      }
    }

    // For the current user message (outgoing)
    if (isCurrentUserMessage) {
      const isNotSent = statusObj?.status === MessageStatusType.NOT_SENT;

      return (
        <View style={{ alignSelf: "flex-end" }}>
          <View
            style={{
              backgroundColor: "#3A7AFE",
              borderRadius: 4,
              padding: 10,
            }}
          >
            <Text style={{ color: "#DFD8D8", fontSize: 14 }}>
              You, {formatDate(message.createdAt)}
            </Text>
            <Text style={{ color: "#FFFFFF", fontSize: 17 }}>
              {message.content}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {message.messageType === MessageType.SMS ? (
              <Text style={{ color: theme.dark ? "#9C9C9C" : "#6B7280", fontSize: 11 }}>
                SMS: {statusObj?.status ?? "sending"}
              </Text>
            ) : (
              <Text style={{ color: theme.dark ? "#9C9C9C" : "" }}>
                {statusObj?.status}
              </Text>
            )}
            {isNotSent && (
              <TouchableOpacity onPress={handleResend} disabled={isResending}>
                <Text
                  style={{
                    color: isResending ? "#9C9C9C" : "#3A7AFE",
                    fontSize: 13,
                  }}
                >
                  {isResending ? "Resending..." : "Resend"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    // Fallback for message types we don't recognize
    return null;
  }
);

const MessageListItem = enhanceMessage(MessageListItemInner);

export default memo(MessageList);
