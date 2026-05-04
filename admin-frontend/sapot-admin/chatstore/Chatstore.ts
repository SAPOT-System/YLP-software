import { Conversation, Message } from "@/lib/db";
import { create } from "zustand";

type ChatStore = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;

  setConversations: (c: Conversation[]) => void;

  setMessages: (convId: string, msgs: Message[]) => void;

  addMessage: (convId: string, msg: Message) => void;
};

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  messages: {},

  setConversations: (conversations) => set({ conversations }),

  setMessages: (convId, messages) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: messages,
      },
    })),

  addMessage: (convId, msg) =>
    set((state) => {
      const existing = state.messages[convId] || [];

      return {
        messages: {
          ...state.messages,
          [convId]: [...existing, msg],
        },
      };
    }),
}));
