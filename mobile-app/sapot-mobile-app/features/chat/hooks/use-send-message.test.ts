import { renderHook, act } from "@testing-library/react-native";
import { GsmGatewayError } from "@/features/shared/core/errors/gsm-error";
import { useSendMessage } from "./use-send-message";

const mockSendSmsToUser = jest.fn();

jest.mock("@/features/shared/hooks", () => ({
  useGsmService: () => ({ sendSmsToUser: mockSendSmsToUser }),
}));

jest.mock("@/features/shared/core/utils/logger", () => ({
  uiLog: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/features/shared/core/database/model/MessageStatus", () => ({
  MessageStatusType: { DELIVERED: "delivered", NOT_SENT: "not_sent" },
}));

function makeChatService(overrides: Record<string, unknown> = {}) {
  return {
    hasPeer: jest.fn().mockReturnValue(true),
    sendChatMessage: jest
      .fn()
      .mockResolvedValue({ conversationId: "conv-1", messageId: "msg-1" }),
    sendSmsChannelMessage: jest
      .fn()
      .mockResolvedValue({ conversationId: "conv-1", messageId: "sms-1" }),
    updateMessageStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    message: "hello",
    setMessage: jest.fn(),
    conversationId: undefined as string | undefined,
    setConversationId: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chatService: makeChatService() as any,
    isSmsMode: false,
    isSmsConversation: false,
    peerId: "peer-1",
    showError: jest.fn(),
    ...overrides,
  };
}

describe("useSendMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendSmsToUser.mockResolvedValue({
      ok: true,
      msg_id: "sms-log-id",
      to: "+639171234567",
    });
  });

  it("returns synchronously before sendChatMessage resolves", () => {
    let resolveDeferred!: (v: { conversationId: string; messageId: string }) => void;
    const deferred = new Promise<{ conversationId: string; messageId: string }>(
      (res) => {
        resolveDeferred = res;
      }
    );

    const params = makeParams({
      chatService: makeChatService({
        sendChatMessage: jest.fn().mockReturnValue(deferred),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });

    const { result } = renderHook(() => useSendMessage(params));

    const sendFinished = jest.fn();

    act(() => {
      result.current();
      sendFinished();
    });

    // sendFinished ran without awaiting the deferred promise
    expect(sendFinished).toHaveBeenCalled();
    // input was cleared synchronously
    expect(params.setMessage).toHaveBeenCalledWith("");

    resolveDeferred({ conversationId: "conv-1", messageId: "msg-1" });
  });

  it("sets message to empty string immediately after handler call", () => {
    const params = makeParams();
    const { result } = renderHook(() => useSendMessage(params));

    act(() => {
      result.current();
    });

    expect(params.setMessage).toHaveBeenCalledWith("");
    expect(params.setMessage).toHaveBeenCalledTimes(1);
  });

  it("does not clear input and does not call sendChatMessage when hasPeer returns false", () => {
    const params = makeParams({
      chatService: makeChatService({
        hasPeer: jest.fn().mockReturnValue(false),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
    const { result } = renderHook(() => useSendMessage(params));

    act(() => {
      result.current();
    });

    expect(params.setMessage).not.toHaveBeenCalled();
    expect(params.chatService.sendChatMessage).not.toHaveBeenCalled();
    expect(params.showError).toHaveBeenCalledWith("Not connected to peer");
  });

  it("does not call sendChatMessage when message is empty", () => {
    const params = makeParams({ message: "   " });
    const { result } = renderHook(() => useSendMessage(params));

    act(() => {
      result.current();
    });

    expect(params.chatService.sendChatMessage).not.toHaveBeenCalled();
    expect(params.setMessage).not.toHaveBeenCalled();
  });

  it("shows error toast when sendChatMessage rejects", async () => {
    const params = makeParams({
      chatService: makeChatService({
        sendChatMessage: jest.fn().mockRejectedValue(new Error("DB failure")),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
    const { result } = renderHook(() => useSendMessage(params));

    act(() => {
      result.current();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(params.showError).toHaveBeenCalledWith("Failed to send message");
  });

  it("shows a busy message and marks SMS not sent when the queue is full", async () => {
    mockSendSmsToUser.mockRejectedValue(
      new GsmGatewayError({
        status: 503,
        reason: "QUEUE_FULL",
        message: "Outbound SMS queue is full",
        messageId: "sms-log-id",
      })
    );
    const params = makeParams({ isSmsMode: true });
    const { result } = renderHook(() => useSendMessage(params));

    act(() => {
      result.current();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(params.chatService.updateMessageStatus).toHaveBeenCalledWith(
      "sms-1",
      "not_sent"
    );
    expect(params.showError).toHaveBeenCalledWith(
      "SMS service is busy. Please try again shortly."
    );
  });
});
