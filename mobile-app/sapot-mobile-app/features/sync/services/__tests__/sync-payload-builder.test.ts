import { SyncPayloadBuilder } from "../sync-payload-builder";
import { CallStatus } from "@/features/shared/database/model/Call";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";

describe("SyncPayloadBuilder.toServerPayload", () => {
  const builder = new SyncPayloadBuilder();

  it("maps a conversations local payload to server payload with integer timestamps", () => {
    const out = builder.toServerPayload("conversations", {
      id: "conv1",
      title: "Test Conversation",
      is_deleted: false,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: 1735689600000,
    });
    expect(out).toMatchObject({
      id: "conv1",
      title: "Test Conversation",
      is_deleted: false,
    });
    expect(typeof (out as { created_at: number }).created_at).toBe("number");
    expect(typeof (out as { updated_at: number }).updated_at).toBe("number");
  });

  it("maps a conversation_participants local payload to server payload", () => {
    const out = builder.toServerPayload("conversation_participants", {
      id: "cp1",
      conversation_id: "conv1",
      user_id: "u1",
      joined_at: 1735689600000,
      is_deleted: false,
      created_at: 1735689600000,
      updated_at: 1735689600000,
    });
    expect(out).toMatchObject({
      id: "cp1",
      conversation_id: "conv1",
      user_id: "u1",
      is_deleted: false,
    });
    expect(typeof (out as { joined_at: number }).joined_at).toBe("number");
  });

  it("maps a messages local payload to server payload with integer timestamps", () => {
    const out = builder.toServerPayload("messages", {
      id: "m1",
      conversation_id: "c1",
      sender_id: "u1",
      content: "hi",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: 1735689600000,
    });
    expect(out).toMatchObject({ id: "m1", conversation_id: "c1", sender_id: "u1" });
    expect(typeof (out as { created_at: number }).created_at).toBe("number");
    expect(typeof (out as { updated_at: number }).updated_at).toBe("number");
  });

  it("maps a calls local payload to server payload", () => {
    const out = builder.toServerPayload("calls", {
      id: "call1",
      status: CallStatus.COMPLETED,
      conversation_id: "conv1",
      initiator_id: "u1",
      start_time: 1735689600000,
      end_time: 1735689700000,
      is_deleted: false,
      created_at: 1735689600000,
      updated_at: 1735689700000,
    });
    expect(out).toMatchObject({
      id: "call1",
      conversation_id: "conv1",
      initiator_id: "u1",
    });
    expect(typeof (out as { start_time: number }).start_time).toBe("number");
  });

  it("maps a call_participants local payload to server payload", () => {
    const out = builder.toServerPayload("call_participants", {
      id: "cp1",
      call_id: "call1",
      user_id: "u1",
      joined_at: 1735689600000,
      left_at: 1735689700000,
      is_deleted: false,
      created_at: 1735689600000,
      updated_at: 1735689700000,
    });
    expect(out).toMatchObject({
      id: "cp1",
      call_id: "call1",
      user_id: "u1",
    });
    expect(typeof (out as { joined_at: number }).joined_at).toBe("number");
  });

  it("maps a message_receipts local payload to server payload", () => {
    const out = builder.toServerPayload("message_receipts", {
      id: "mr1",
      message_id: "m1",
      user_id: "u1",
      status: MessageStatusType.DELIVERED,
      is_deleted: false,
      created_at: 1735689600000,
      updated_at: 1735689600000,
    });
    expect(out).toMatchObject({
      id: "mr1",
      message_id: "m1",
      user_id: "u1",
    });
  });

  it("does not throw when a message is missing conversation_id (warns instead)", () => {
    expect(() =>
      builder.toServerPayload("messages", {
        id: "m-bad",
        sender_id: "u1",
        content: "missing fk",
        created_at: 0,
        updated_at: 0,
      })
    ).not.toThrow();
  });
});
