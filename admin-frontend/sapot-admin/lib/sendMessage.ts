import { push } from "@/sync/push";
import { queueMutation } from "@/sync/queue";
import { useChatStore } from "@/store/chatStore";
import { v4 as uuidv4 } from "uuid";

export async function sendMessage(payload) {
  const tempId = uuidv4();

  const store = useChatStore.getState();

  // 1. Optimistic UI update
  const newMessage = {
    id: tempId,
    ...payload,
    created_at: Date.now(),
    is_deleted: false,
    status: "pending",
  };

  const existing = store.messages[payload.conversation] || [];

  store.setMessages(payload.conversation, [...existing, newMessage]);

  // 2. Queue mutation
  queueMutation({
    type: "messages",
    action: "created",
    data: newMessage,
  });

  // 3. Push to server
  await push();

  // 4. ❗ OPTIONAL: DO NOT call pull here in most cases
  // pull() is triggered by WebSocket on other devices, not here

}
