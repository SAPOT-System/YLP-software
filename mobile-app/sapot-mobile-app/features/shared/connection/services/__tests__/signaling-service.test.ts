import type { DataChatMessageI } from "@/features/shared/core/messaging-types";
import type {
  AckMessage,
  DataAckMessage,
  SignalingMessage,
} from "../../../types";
import type { WebrtcAdapter } from "../../adapters/webrtc-adapter";
import type { WsSignalingAdapter } from "../../adapters";
import type { AppModeStore, NetworkConfig, UserStore } from "../../../stores";
import { SignalingService } from "../signaling-service";

jest.mock("@/config/runtime", () => ({
  getWsUrl: jest.fn(() => "ws://localhost:8000"),
  getApiUrl: jest.fn(() => "http://localhost:8000"),
}));

jest.mock("../../../crypto/peer-key-service");
jest.mock("../../../crypto/peer-key-store");

// ── Factories ─────────────────────────────────────────────────────────────────

function makeIceMessage(to: string, sender: string): SignalingMessage {
  return {
    type: "ice-candidate",
    data: {
      to,
      sender,
      candidate: { candidate: "candidate:1 ...", sdpMid: "0", sdpMLineIndex: 0 } as RTCIceCandidate,
      ipAddress: "192.168.1.2",
      port: 9090,
    },
  };
}

function makeOfferMessage(to: string, sender: string): SignalingMessage {
  return {
    type: "offer",
    data: {
      to,
      sender,
      sdp: { type: "offer", sdp: "mock-offer-sdp" },
      ipAddress: "192.168.1.2",
      port: 9090,
    },
  };
}

function makeAnswerMessage(to: string, sender: string): SignalingMessage {
  return {
    type: "answer",
    data: {
      to,
      sender,
      sdp: { type: "answer", sdp: "mock-answer-sdp" },
      ipAddress: "192.168.1.2",
      port: 9090,
    },
  };
}

function makeHandshakeMessage(
  to: string,
  sender: string,
  ipAddress = "192.168.1.3",
  port = 7070
): SignalingMessage {
  return {
    type: "handshake",
    data: { to, sender, ipAddress, port },
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

const MY_USER_ID = "user-1";
const PEER_ID = "peer-2";

describe("SignalingService", () => {
  let service: SignalingService;

  let mockWsSignalingAdapter: {
    on: jest.Mock;
    sendMessage: jest.Mock;
    disconnect: jest.Mock;
    connect: jest.Mock;
    notifyPeerKeyAvailable: jest.Mock;
    isConnected: boolean;
  };
  let mockWebrtcAdapter: {
    isConnected: boolean;
    handleOffer: jest.Mock;
    handleAnswer: jest.Mock;
    addIceCandidate: jest.Mock;
  };
  let mockGetWebrtcAdapter: jest.Mock;
  let mockUserStore: Pick<UserStore, "user" | "isGuest">;
  let mockNetworkConfig: Pick<NetworkConfig, "ipAddress" | "port">;
  let mockAppModeStore: { isTcpAllowed: jest.Mock; isWebSocketAllowed: jest.Mock };
  let mockTcpClientAdapter: { connect: jest.Mock; isConnected: boolean };
  let mockSendTcpMessage: jest.Mock;
  let mockGetTcpAdapter: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWebrtcAdapter = {
      isConnected: false,
      handleOffer: jest.fn(),
      handleAnswer: jest.fn(),
      addIceCandidate: jest.fn(),
    };

    mockGetWebrtcAdapter = jest.fn(() => mockWebrtcAdapter);

    mockWsSignalingAdapter = {
      on: jest.fn(),
      sendMessage: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
      notifyPeerKeyAvailable: jest.fn(),
      isConnected: false,
    };

    mockUserStore = {
      user: { id: MY_USER_ID } as UserStore["user"],
      isGuest: false,
    };

    mockNetworkConfig = {
      ipAddress: "192.168.1.1",
      port: 8080,
    };

    mockAppModeStore = {
      isTcpAllowed: jest.fn(() => true),
      isWebSocketAllowed: jest.fn(() => true),
    };

    mockTcpClientAdapter = {
      connect: jest.fn().mockResolvedValue(undefined),
      isConnected: false,
    };

    mockSendTcpMessage = jest.fn();
    mockGetTcpAdapter = jest.fn(() => mockTcpClientAdapter);

    service = new SignalingService(
      mockGetWebrtcAdapter as (peerId: string) => WebrtcAdapter,
      mockWsSignalingAdapter as unknown as WsSignalingAdapter,
      "ws://localhost:8000",
      mockUserStore as unknown as UserStore,
      mockNetworkConfig as unknown as NetworkConfig,
      mockAppModeStore as unknown as AppModeStore
    );

    service.setTcpCallbacks(mockGetTcpAdapter, mockSendTcpMessage);
  });

  // ── ensureWsSignaling ──────────────────────────────────────────────────────

  describe("ensureWsSignaling", () => {
    it("returns false when WS mode is not allowed", () => {
      mockAppModeStore.isWebSocketAllowed.mockReturnValue(false);
      service.setSignalingToken("token-123");

      const result = service.ensureWsSignaling();

      expect(result).toBe(false);
      expect(mockWsSignalingAdapter.connect).not.toHaveBeenCalled();
    });

    it("returns false when no signaling token is set", () => {
      const result = service.ensureWsSignaling();

      expect(result).toBe(false);
      expect(mockWsSignalingAdapter.connect).not.toHaveBeenCalled();
    });

    it("calls connect and returns true when token is set and WS is allowed", () => {
      service.setSignalingToken("token-123");

      const result = service.ensureWsSignaling();

      expect(result).toBe(true);
      expect(mockWsSignalingAdapter.connect).toHaveBeenCalledWith({
        baseUrl: "ws://localhost:8000",
        token: "token-123",
      });
    });

    it("reuses existing connection without calling connect again", () => {
      mockWsSignalingAdapter.isConnected = true;
      service.setSignalingToken("token-123");

      const result = service.ensureWsSignaling();

      expect(result).toBe(true);
      expect(mockWsSignalingAdapter.connect).not.toHaveBeenCalled();
    });
  });

  // ── setSignalingToken ──────────────────────────────────────────────────────

  describe("setSignalingToken", () => {
    it("disconnects WS when mode becomes WS-disallowed after token is set", () => {
      mockWsSignalingAdapter.isConnected = true;
      mockAppModeStore.isWebSocketAllowed.mockReturnValue(false);

      service.setSignalingToken("token-123");

      expect(mockWsSignalingAdapter.disconnect).toHaveBeenCalled();
    });

    it("disconnects WS when token is cleared while adapter is connected", () => {
      service.setSignalingToken("token-123");
      jest.clearAllMocks();
      mockWsSignalingAdapter.isConnected = true;

      service.setSignalingToken(undefined);

      expect(mockWsSignalingAdapter.disconnect).toHaveBeenCalled();
    });

    it("does not disconnect when token is set and WS is allowed", () => {
      mockWsSignalingAdapter.isConnected = true;

      service.setSignalingToken("token-123");

      expect(mockWsSignalingAdapter.disconnect).not.toHaveBeenCalled();
    });
  });

  // ── sendSignalingMessage ───────────────────────────────────────────────────

  describe("sendSignalingMessage", () => {
    beforeEach(() => {
      service.setSignalingToken("token-123");
    });

    it("sends via WS when WS is configured and peer TCP is not connected", async () => {
      mockTcpClientAdapter.isConnected = false;
      const msg = makeIceMessage(PEER_ID, MY_USER_ID);

      await service.sendSignalingMessage(PEER_ID, msg);

      expect(mockWsSignalingAdapter.sendMessage).toHaveBeenCalledWith(msg);
      expect(mockSendTcpMessage).not.toHaveBeenCalled();
    });

    it("routes via TCP when peer TCP adapter is connected", async () => {
      mockTcpClientAdapter.isConnected = true;
      const msg = makeIceMessage(PEER_ID, MY_USER_ID);

      await service.sendSignalingMessage(PEER_ID, msg);

      expect(mockSendTcpMessage).toHaveBeenCalledWith(PEER_ID, msg);
      expect(mockWsSignalingAdapter.sendMessage).not.toHaveBeenCalled();
    });

    it("throws when neither WS nor TCP is available", async () => {
      service.setSignalingToken(undefined);
      mockAppModeStore.isWebSocketAllowed.mockReturnValue(false);
      mockAppModeStore.isTcpAllowed.mockReturnValue(false);
      const msg = makeIceMessage(PEER_ID, MY_USER_ID);

      await expect(service.sendSignalingMessage(PEER_ID, msg)).rejects.toThrow();
    });

    it("attaches credential to offer messages when peerKeyService is configured", async () => {
      const mockCredential = {
        peerId: MY_USER_ID,
        ecdhPublicKey: "base64key",
        issuedAt: "2026-01-01T00:00:00Z",
        expiresAt: "2099-01-01T00:00:00Z",
        signature: "sig",
      };
      const mockPeerKeyService = {
        isCredentialExpiringSoon: jest.fn(() => false),
        getCredential: jest.fn(() => mockCredential),
      };

      const serviceWithKey = new SignalingService(
        mockGetWebrtcAdapter as (peerId: string) => WebrtcAdapter,
        mockWsSignalingAdapter as unknown as WsSignalingAdapter,
        "ws://localhost:8000",
        mockUserStore as unknown as UserStore,
        mockNetworkConfig as unknown as NetworkConfig,
        mockAppModeStore as unknown as AppModeStore,
        mockPeerKeyService as never
      );
      serviceWithKey.setSignalingToken("token-123");
      const offerMsg = makeOfferMessage(PEER_ID, MY_USER_ID);

      await serviceWithKey.sendSignalingMessage(PEER_ID, offerMsg);

      expect(mockWsSignalingAdapter.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ credential: mockCredential }),
        })
      );
    });
  });

  // ── sendChatMessage ────────────────────────────────────────────────────────

  describe("sendChatMessage", () => {
    it("sends chat message via WS when connected", () => {
      mockWsSignalingAdapter.isConnected = true;
      service.setSignalingToken("token-123");
      const chatData: DataChatMessageI = {
        messageId: "msg-1",
        message: "hello",
        from: MY_USER_ID,
        to: PEER_ID,
        sentAt: new Date(),
        conversationId: "conv-1",
        messageType: "text" as never,
        senderProfile: { username: "user1", firstName: "User" },
      };

      service.sendChatMessage(PEER_ID, chatData);

      expect(mockWsSignalingAdapter.sendMessage).toHaveBeenCalledWith({
        type: "chat",
        data: chatData,
      });
    });

    it("throws when WS is not available", () => {
      mockWsSignalingAdapter.isConnected = false;
      mockAppModeStore.isWebSocketAllowed.mockReturnValue(false);
      const chatData: DataChatMessageI = {
        messageId: "msg-1",
        message: "hello",
        from: MY_USER_ID,
        to: PEER_ID,
        sentAt: new Date(),
        conversationId: "conv-1",
        messageType: "text" as never,
        senderProfile: { username: "user1", firstName: "User" },
      };

      expect(() => service.sendChatMessage(PEER_ID, chatData)).toThrow();
    });
  });

  // ── sendAckMessage ─────────────────────────────────────────────────────────

  describe("sendAckMessage", () => {
    it("sends ack message via WS when connected", () => {
      mockWsSignalingAdapter.isConnected = true;
      service.setSignalingToken("token-123");
      const ackData: DataAckMessage = {
        messageId: "msg-1",
        from: MY_USER_ID,
        to: PEER_ID,
      };

      service.sendAckMessage(PEER_ID, ackData);

      expect(mockWsSignalingAdapter.sendMessage).toHaveBeenCalledWith({
        type: "ack",
        data: ackData,
      } as AckMessage);
    });

    it("throws when WS is unavailable", () => {
      const ackData: DataAckMessage = { messageId: "m", from: MY_USER_ID, to: PEER_ID };
      expect(() => service.sendAckMessage(PEER_ID, ackData)).toThrow();
    });
  });

  // ── sendCallMessage ────────────────────────────────────────────────────────

  describe("sendCallMessage", () => {
    const callMsg = {
      type: "audio-call" as const,
      data: { from: MY_USER_ID, to: PEER_ID, callerName: "User One" },
    };

    it("returns 'ws' when routed via WS", () => {
      service.setSignalingToken("token-123");
      mockTcpClientAdapter.isConnected = false;

      const result = service.sendCallMessage(PEER_ID, callMsg);

      expect(result).toBe("ws");
      expect(mockWsSignalingAdapter.sendMessage).toHaveBeenCalledWith(callMsg);
    });

    it("returns 'tcp' when TCP adapter is connected", () => {
      mockTcpClientAdapter.isConnected = true;

      const result = service.sendCallMessage(PEER_ID, callMsg);

      expect(result).toBe("tcp");
      expect(mockSendTcpMessage).toHaveBeenCalledWith(PEER_ID, callMsg);
    });

    it("throws when no transport is available", () => {
      mockAppModeStore.isWebSocketAllowed.mockReturnValue(false);
      mockAppModeStore.isTcpAllowed.mockReturnValue(false);

      expect(() => service.sendCallMessage(PEER_ID, callMsg)).toThrow();
    });
  });

  // ── handleIncomingSignaling ────────────────────────────────────────────────

  describe("handleIncomingSignaling", () => {
    it("ignores messages not addressed to current user", async () => {
      const msg = makeIceMessage("other-user", PEER_ID);

      await service.handleIncomingSignaling(msg);

      expect(mockWebrtcAdapter.addIceCandidate).not.toHaveBeenCalled();
    });

    it("adds ICE candidate to webrtcAdapter when peer is not yet connected", async () => {
      mockWebrtcAdapter.isConnected = false;
      const msg = makeIceMessage(MY_USER_ID, PEER_ID);

      await service.handleIncomingSignaling(msg);

      expect(mockGetWebrtcAdapter).toHaveBeenCalledWith(PEER_ID);
      expect(mockWebrtcAdapter.addIceCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ candidate: expect.any(String) })
      );
    });

    it("ignores ICE candidate when webrtc peer is already connected", async () => {
      mockWebrtcAdapter.isConnected = true;
      const msg = makeIceMessage(MY_USER_ID, PEER_ID);

      await service.handleIncomingSignaling(msg);

      expect(mockWebrtcAdapter.addIceCandidate).not.toHaveBeenCalled();
    });

    it("handles offer: calls handleOffer and dispatches answer", async () => {
      mockWebrtcAdapter.handleOffer.mockResolvedValue({ type: "answer", sdp: "answer-sdp" });
      service.setSignalingToken("token-123");
      const sendSignalingSpy = jest
        .spyOn(service, "sendSignalingMessage")
        .mockResolvedValue(undefined);
      const msg = makeOfferMessage(MY_USER_ID, PEER_ID);

      await service.handleIncomingSignaling(msg);
      await Promise.resolve();

      expect(mockWebrtcAdapter.handleOffer).toHaveBeenCalledWith({
        type: "offer",
        sdp: "mock-offer-sdp",
      });
      expect(sendSignalingSpy).toHaveBeenCalledWith(
        PEER_ID,
        expect.objectContaining({ type: "answer" })
      );
    });

    it("handles answer: calls handleAnswer on webrtcAdapter", async () => {
      mockWebrtcAdapter.handleAnswer.mockResolvedValue(undefined);
      const msg = makeAnswerMessage(MY_USER_ID, PEER_ID);

      await service.handleIncomingSignaling(msg);

      expect(mockWebrtcAdapter.handleAnswer).toHaveBeenCalledWith({
        type: "answer",
        sdp: "mock-answer-sdp",
      });
    });

    it("handles handshake: connects TCP adapter to provided address and port", async () => {
      mockWebrtcAdapter.isConnected = false;
      mockTcpClientAdapter.isConnected = false;
      const msg = makeHandshakeMessage(MY_USER_ID, PEER_ID, "10.0.0.5", 5555);

      await service.handleIncomingSignaling(msg);

      expect(mockGetTcpAdapter).toHaveBeenCalledWith(PEER_ID);
      expect(mockTcpClientAdapter.connect).toHaveBeenCalledWith("10.0.0.5", 5555);
    });

    it("throws when signaling message has no sender", async () => {
      const msgWithoutSender = {
        type: "ice-candidate" as const,
        data: {
          to: MY_USER_ID,
          sender: undefined as unknown as string,
          candidate: null,
          ipAddress: "1.2.3.4",
          port: 5678,
        },
      };

      await expect(service.handleIncomingSignaling(msgWithoutSender)).rejects.toThrow();
    });
  });
});
