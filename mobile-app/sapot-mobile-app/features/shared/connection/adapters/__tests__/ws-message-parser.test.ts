import { parseWsMessage } from "../ws-message-parser";

const offer = (overrides = {}) =>
  JSON.stringify({
    type: "offer",
    data: { to: "peer-b", sender: "peer-a", sdp: {}, ipAddress: "1.2.3.4", port: 5000, ...overrides },
  });

const smsRaw = JSON.stringify({
  type: "chat",
  data: {
    from: "peer-a",
    to: "peer-b",
    message: "hello",
    conversationId: "conv-1",
    messageId: "msg-1",
    sentAt: 1000,
    messageType: "sms",
    senderProfile: { username: "alice", firstName: "Alice", lastName: "Liddell" },
  },
});

const chatRaw = JSON.stringify({
  type: "chat",
  data: { from: "peer-a", from_user: "peer-a", messageId: "msg-2", conversationId: "conv-1", message: "hi" },
});

const audioCallRaw = JSON.stringify({
  type: "audio-call",
  data: { from: "peer-a", to: "peer-b", callerName: "Alice", callId: "call-1" },
});

const ackRaw = JSON.stringify({ type: "ack", data: { messageId: "msg-1", from: "peer-a", to: "peer-b" } });

const serverAckRaw = JSON.stringify({
  type: "server-ack",
  data: { messageId: "msg-1", message_type: "chat", from: "peer-a", to: "peer-b" },
});

const publicChatRaw = JSON.stringify({
  type: "public-chat",
  content: "hello world",
  from: "peer-a",
  created_at: 1000,
  updated_at: 1000,
  is_deleted: false,
  sender_first_name: "Alice",
  sender_username: "alice",
});

const activeUsersRaw = JSON.stringify(["peer-a", "peer-b"]);

describe("parseWsMessage", () => {
  describe("control messages", () => {
    it("returns pong for pong message", () => {
      const result = parseWsMessage(JSON.stringify({ type: "pong" }));
      expect(result).toEqual({ kind: "pong" });
    });

    it("returns ping for ping message", () => {
      const result = parseWsMessage(JSON.stringify({ type: "ping" }));
      expect(result).toEqual({ kind: "ping" });
    });
  });

  describe("active users", () => {
    it("detects bare JSON array as active-users", () => {
      const result = parseWsMessage(activeUsersRaw);
      expect(result.kind).toBe("active-users");
      if (result.kind === "active-users") {
        expect(result.ids).toEqual(["peer-a", "peer-b"]);
      }
    });
  });

  describe("SMS vs direct-chat ordering", () => {
    it("SMS wins over direct-chat when both match type=chat", () => {
      const smsResult = parseWsMessage(smsRaw);
      expect(smsResult.kind).toBe("sms");
    });

    it("direct-chat is returned when message is not SMS", () => {
      const chatResult = parseWsMessage(chatRaw);
      expect(chatResult.kind).toBe("chat");
    });
  });

  describe("call messages", () => {
    it("returns call kind for audio-call", () => {
      const result = parseWsMessage(audioCallRaw);
      expect(result.kind).toBe("call");
    });
  });

  describe("ack messages", () => {
    it("returns ack kind for peer ack", () => {
      const result = parseWsMessage(ackRaw);
      expect(result.kind).toBe("ack");
    });

    it("returns server-ack kind for server ack", () => {
      const result = parseWsMessage(serverAckRaw);
      expect(result.kind).toBe("server-ack");
    });
  });

  describe("public chat", () => {
    it("returns public-chat kind", () => {
      const result = parseWsMessage(publicChatRaw);
      expect(result.kind).toBe("public-chat");
    });
  });

  describe("signaling messages (plaintext)", () => {
    it("returns signaling kind for plaintext offer", () => {
      const result = parseWsMessage(offer());
      expect(result.kind).toBe("signaling");
    });

    it("includes peerCredential when credential is present in plaintext offer", () => {
      const credential = { ecdhPublicKey: "abc123", signature: "sig", publicKey: "pk", userId: "user-a" };
      const raw = offer({ credential });
      const result = parseWsMessage(raw);
      expect(result.kind).toBe("signaling");
      if (result.kind === "signaling") {
        expect(result.peerCredential).toEqual(credential);
      }
    });

    it("peerCredential is undefined when credential is absent", () => {
      const result = parseWsMessage(offer());
      if (result.kind === "signaling") {
        expect(result.peerCredential).toBeUndefined();
      }
    });
  });

  describe("encrypted signaling", () => {
    it("returns signaling kind when decrypt succeeds", () => {
      const encRaw = JSON.stringify({
        type: "offer",
        data: {
          to: "peer-b",
          sender: "peer-a",
          enc: { nonce: "abc", box: "xyz" },
          credential: { ecdhPublicKey: "key", signature: "sig", publicKey: "pk", userId: "peer-a" },
        },
      });
      const decryptedData = { to: "peer-b", sender: "peer-a", sdp: {}, ipAddress: "1.2.3.4", port: 5000 };
      const decrypt = jest.fn().mockReturnValue(decryptedData);

      const result = parseWsMessage(encRaw, decrypt);

      expect(result.kind).toBe("signaling");
      expect(decrypt).toHaveBeenCalledWith({ nonce: "abc", box: "xyz" }, "peer-a");
      if (result.kind === "signaling") {
        expect(result.peerCredential).toEqual({ ecdhPublicKey: "key", signature: "sig", publicKey: "pk", userId: "peer-a" });
      }
    });

    it("returns unknown when decrypt returns null", () => {
      const encRaw = JSON.stringify({
        type: "offer",
        data: { to: "peer-b", sender: "peer-a", enc: { nonce: "abc", box: "xyz" } },
      });
      const decrypt = jest.fn().mockReturnValue(null);

      const result = parseWsMessage(encRaw, decrypt);
      expect(result.kind).toBe("unknown");
    });

    it("returns unknown when no decrypt fn is provided for encrypted message", () => {
      const encRaw = JSON.stringify({
        type: "offer",
        data: { to: "peer-b", sender: "peer-a", enc: { nonce: "abc", box: "xyz" } },
      });

      const result = parseWsMessage(encRaw);
      expect(result.kind).toBe("unknown");
    });

    it("bootstraps sender key from credential before decrypting when peer key is not yet known", () => {
      // Scenario: callee has no pre-existing key for peer-a.
      // The encrypted offer arrives with a credential containing peer-a's ECDH public key.
      // parseWsMessage must call storePeerKey BEFORE invoking decrypt so the decrypt fn
      // can succeed on first contact — without this, every first-contact call fails.
      const encRaw = JSON.stringify({
        type: "offer",
        data: {
          to: "peer-b",
          sender: "peer-a",
          enc: { nonce: "abc", box: "xyz" },
          credential: { ecdhPublicKey: "peer-a-ecdh-key", signature: "sig", publicKey: "pk", userId: "peer-a" },
        },
      });
      const decryptedData = { to: "peer-b", sender: "peer-a", sdp: {}, ipAddress: "1.2.3.4", port: 5000 };

      const callOrder: string[] = [];
      const storePeerKey = jest.fn().mockImplementation(() => { callOrder.push("storePeerKey"); });
      const decrypt = jest.fn().mockImplementation((_enc, _sender) => {
        callOrder.push("decrypt");
        return decryptedData;
      });

      const result = parseWsMessage(encRaw, decrypt, storePeerKey);

      expect(storePeerKey).toHaveBeenCalledWith("peer-a", "peer-a-ecdh-key");
      expect(callOrder.indexOf("storePeerKey")).toBeLessThan(callOrder.indexOf("decrypt"));
      expect(result.kind).toBe("signaling");
    });

    it("does not call storePeerKey when credential is absent from encrypted message", () => {
      const encRaw = JSON.stringify({
        type: "offer",
        data: { to: "peer-b", sender: "peer-a", enc: { nonce: "abc", box: "xyz" } },
      });
      const storePeerKey = jest.fn();
      const decrypt = jest.fn().mockReturnValue(null);

      parseWsMessage(encRaw, decrypt, storePeerKey);

      expect(storePeerKey).not.toHaveBeenCalled();
    });
  });

  describe("malformed input", () => {
    it("returns unknown for malformed JSON", () => {
      const result = parseWsMessage("not valid json {{{");
      expect(result.kind).toBe("unknown");
    });

    it("returns unknown for unrecognized message shape", () => {
      const result = parseWsMessage(JSON.stringify({ type: "mystery", data: {} }));
      expect(result.kind).toBe("unknown");
    });
  });
});
