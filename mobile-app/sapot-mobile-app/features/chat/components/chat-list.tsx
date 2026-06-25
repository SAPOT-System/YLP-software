import {
  Conversation,
  ConversationParticipant,
  ConversationType,
  Message,
  MessageStatus,
  MessageStatusType,
  MessageType,
  Peer,
  database,
  formatDate,
} from "@/features/shared";
import { AnnouncementListRow } from "@/features/announcements";
import { Q } from "@nozbe/watermelondb";
import { withObservables } from "@nozbe/watermelondb/react";
import { useRouter } from "expo-router";
import React, { memo, useEffect, useReducer } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { Avatar, Badge, Text, useTheme } from "react-native-paper";
import { catchError, map, of, switchMap } from "rxjs";

import { ChatRoomSource } from "@/features/chat/types";
import { useMainContainer, useProfilePhoto } from "@/features/shared/hooks";
import { ECDH_PREFIX } from "@/features/chat/repositories/message-repository";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { toLocalPhone } from "@/features/auth/utils/validation";
import { uiLog } from "@/features/shared/utils/logger";
uiLog.debug("[chat-list] module loaded");

const enhanceChats = withObservables([], () => ({
  chats: database
    .get<Conversation>("conversations")
    .query(Q.where("is_deleted", false), Q.sortBy("updated_at", Q.desc))
    .observe(),
}));

const ChatList = enhanceChats(
  ({
    chats,
    refreshing,
    onRefresh,
  }: {
    chats: Conversation[];
    refreshing?: boolean;
    onRefresh?: () => void;
  }) => {
    const userStore = useUserStore();
    const currentUserId = userStore.user?.id ?? "";
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={chats}
          style={{ flex: 1 }}
          ListHeaderComponent={userStore.isGuest ? null : AnnouncementListRow}
          renderItem={({ item }) => (
            <ChatListItem chat={item} currentUserId={currentUserId} />
          )}
          keyExtractor={(chat) => chat.id}
          maxToRenderPerBatch={10}
          initialNumToRender={15}
          windowSize={5}
          removeClippedSubviews
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
              />
            ) : undefined
          }
        />
      </View>
    );
  }
);

const enhanceChat = withObservables(
  ["chat", "currentUserId"],
  ({ chat, currentUserId }: { chat: Conversation; currentUserId: string }) => ({
    chat,
    latestMessage: database
      .get<Message>(Message.table)
      .query(
        Q.where("conversation", chat.id),
        Q.where("is_deleted", false),
        Q.sortBy("created_at", Q.desc),
        Q.take(1)
      )
      .observe()
      .pipe(map((msgs) => msgs[0] ?? null)),
    participants: database
      .get<ConversationParticipant>(ConversationParticipant.table)
      .query(Q.where("conversation", chat.id), Q.where("is_deleted", false))
      .observe(),
    unreadCount: database
      .get<Message>(Message.table)
      .query(
        Q.where("conversation", chat.id),
        Q.where("is_deleted", false),
        Q.where("sender", Q.notEq(currentUserId))
      )
      .observe()
      .pipe(
        switchMap((messages) => {
          const ids = messages.map((m) => m.id);
          if (ids.length === 0) return of(0);
          return database
            .get<MessageStatus>(MessageStatus.table)
            .query(
              Q.where("message", Q.oneOf(ids)),
              Q.where("user", currentUserId),
              Q.where("status", Q.notEq(MessageStatusType.READ)),
              Q.where("is_deleted", false)
            )
            .observeCount();
        })
      ),
  })
);

const enhanceChatPeer = withObservables(
  ["peerParticipant"],
  ({
    peerParticipant,
  }: {
    peerParticipant: ConversationParticipant | null;
  }) => ({
    peer: peerParticipant
      ? peerParticipant.user.observe().pipe(catchError(() => of(null)))
      : of(null),
  })
);

const getMessagePreview = (msg: Message | null, decryptedContent: string): string => {
  if (!msg) return "No messages yet";
  if (msg.messageType === MessageType.CALL_LOG) return "📞 Call";
  if (msg.messageType === MessageType.FILE) return "📎 File";
  const c = decryptedContent ?? "";
  return c.length > 40 ? c.slice(0, 40) + "…" : c;
};

const useDecryptedContent = (msg: Message | null): string => {
  const { messageRepository } = useMainContainer();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!msg) return;
    const convId = (msg._raw as Record<string, string>).conversation;
    return messageRepository.onConversationKeySet((updatedConvId) => {
      if (updatedConvId === convId) forceUpdate();
    });
  }, [msg, messageRepository]);

  if (!msg) return "";
  const content = messageRepository.decryptMessage(msg);
  return content.startsWith(ECDH_PREFIX) ? "" : content;
};

type ChatListItemInnerProps = {
  peerParticipant: ConversationParticipant | null;
  peer: {
    id: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phoneNumber?: string;
  } | null;
  chat: Conversation;
  latestMessage: Message | null;
  unreadCount: number;
};

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: "#7C3AED", text: "#FFFFFF" },
  rescuer: { bg: "#059669", text: "#FFFFFF" },
};

const RoleBadge = ({ role }: { role?: string }) => {
  if (!role || role === "user") return null;
  const colors = ROLE_COLORS[role];
  if (!colors) return null;
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
        marginLeft: 6,
        alignSelf: "center",
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: "600" }}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Text>
    </View>
  );
};

const ChatListItemInner = enhanceChatPeer(
  memo(({ peer, chat, latestMessage, unreadCount }: ChatListItemInnerProps) => {
    const router = useRouter();
    const theme = useTheme();
    const peerId = peer?.id ?? null;
    const { url: peerProfilePicUrl } = useProfilePhoto(peerId);
    const decryptedContent = useDecryptedContent(latestMessage);

    const isSmsConversation = chat.type === ConversationType.SMS;
    const peerName = isSmsConversation && peer?.phoneNumber
      ? toLocalPhone(peer.phoneNumber)
      : peer
      ? `${peer.firstName ?? ""} ${peer.lastName ?? ""}`.trim() ||
        peer.username ||
        "Unknown peer"
      : "Unknown peer";

    const peerRole = peer instanceof Peer ? peer.role : undefined;

    return (
      <Pressable
        onPress={() => {
          uiLog.info("chat-list › open chat", { chatId: chat.id });
          router.push({
            pathname: "/(drawer)/(tabs)/chat/[id]",
            params: { id: chat.id, source: ChatRoomSource.CHAT },
          });
        }}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderColor: theme.dark ? "#0B1020" : "#EEEEEE",
          backgroundColor: theme.dark ? "#121A2E" : "",
          borderTopWidth: 2,
          borderBottomWidth: 2,
          borderRadius: 4,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
          }}
        >
          {peerProfilePicUrl ? (
            <Avatar.Image size={60} source={{ uri: peerProfilePicUrl }} />
          ) : (
            <Avatar.Text size={60} label={(peerName[0] ?? "?").toUpperCase()} />
          )}
          <View style={{ flexGrow: 1, marginLeft: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 17,
                  color: theme.dark ? "#E6ECF5" : "#1E1E1E",
                }}
              >
                {peerName}
              </Text>
              <RoleBadge role={peerRole} />
            </View>
            <Text
              style={{
                fontSize: 17,
                color: theme.dark ? "#6E7891" : "#6B7280",
              }}
            >
              {getMessagePreview(latestMessage, decryptedContent)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", alignSelf: "flex-end" }}>
            <Text
              style={{
                color: theme.dark ? "#6E7891" : "#6B7280",
              }}
            >
              {formatDate(latestMessage?.createdAt ?? chat.createdAt)}
            </Text>
            {unreadCount > 0 && (
              <Badge size={20}>{unreadCount > 99 ? "99+" : unreadCount}</Badge>
            )}
          </View>
        </View>
      </Pressable>
    );
  })
);

type ChatListItemProps = {
  chat: Conversation;
  currentUserId: string;
  latestMessage: Message | null;
  participants: ConversationParticipant[];
  unreadCount: number;
};

const ChatListItem = enhanceChat(
  memo(
    ({
      chat,
      currentUserId,
      latestMessage,
      participants,
      unreadCount,
    }: ChatListItemProps) => {
      const filtered = participants.filter(
        (p) => (p._raw as Record<string, unknown>).user !== currentUserId
      );
      const peerParticipant = filtered[0] ?? participants[0] ?? null;

      return (
        <ChatListItemInner
          peerParticipant={peerParticipant}
          chat={chat}
          latestMessage={latestMessage}
          unreadCount={unreadCount}
        />
      );
    }
  )
);

export default ChatList;
