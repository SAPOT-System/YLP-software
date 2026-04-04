import { createFactory, createFactoryList } from "../builders/factory.builder";

export interface TestConversation {
  id: string;
  type: string;
}

export interface TestConversationParticipant {
  id: string;
  conversation?: { id: string };
}

export interface TestMessage {
  id: string;
  content: string;
  messageType?: string;
  sender?: { id: string };
  conversation?: { id: string };
  createdAt?: Date;
}

export interface TestMessageStatus {
  id: string;
  status: string;
  update?: jest.Mock;
}

export const createTestConversation = createFactory<TestConversation>(() => ({
  id: "conv-1",
  type: "direct",
}));

export const createTestConversationParticipant =
  createFactory<TestConversationParticipant>(() => ({
    id: "participant-1",
    conversation: { id: "conv-1" },
  }));

export const createTestMessage = createFactory<TestMessage>(() => ({
  id: "msg-1",
  content: "Hello",
  messageType: "text",
  sender: { id: "test-user-id" },
  conversation: { id: "conv-1" },
  createdAt: new Date(),
}));

export const createTestUnsentStatus = createFactory<{ message: { id: string } }>(
  () => ({ message: { id: "msg-1" } })
);

export const createTestMessageStatus = createFactory<TestMessageStatus>(() => ({
  id: "status-1",
  status: "sent",
}));

export const createTestMessages = (
  count: number,
  overrides?: Partial<TestMessage> | ((index: number) => Partial<TestMessage>)
) => createFactoryList(createTestMessage, count, overrides);
