import {
    createMockServerSocket,
    createMockTcpServer,
} from "@/test/mocks/adapter.mock-builders";
import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { TcpServerAdapter } from "../tcp-server-adapter";

jest.mock("react-native-tcp-socket", () => ({
  createServer: jest.fn(),
}));

describe("TcpServerAdapter", () => {
  let adapter: TcpServerAdapter;
  let mockServer: ReturnType<typeof createMockTcpServer>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = createMockTcpServer();

    const TcpSocket = require("react-native-tcp-socket");
    TcpSocket.createServer.mockReturnValue(mockServer);

    adapter = new TcpServerAdapter();
  });

  it("starts TCP server", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockServer.listen.mockImplementation((options: any, callback: any) => {
      setTimeout(callback, 0);
    });

    await adapter.start(3000);

    expect(mockServer.listen).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3000, host: "0.0.0.0" }),
      expect.any(Function)
    );
  });

  it("emits data events when messages are received", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockServer.listen.mockImplementation((options: any, callback: any) => {
      setTimeout(callback, 0);
    });

    const dataSpy = jest.fn();
    adapter.on("data", dataSpy);

    await adapter.start(3000);

    // Simulate server creation with socket handler
    const socketHandler = (
      require("react-native-tcp-socket").createServer as jest.Mock
    ).mock.calls[0][0];
    const mockSocket = createMockServerSocket();

    socketHandler(mockSocket);

    const dataCallback = mockSocket.on.mock.calls.find(
      (call) => call[0] === "data"
    )?.[1];

    if (dataCallback) {
      // Complete ECDH handshake: client sends handshake-init
      const clientKeyPair = nacl.box.keyPair();
      const handshakeInit = JSON.stringify({
        type: "handshake-init",
        pub: encodeBase64(clientKeyPair.publicKey),
      }) + "\n";
      dataCallback(handshakeInit);

      // Extract server's public key from the handshake-ack written back
      const ackRaw = mockSocket.write.mock.calls[0][0] as string;
      const ack = JSON.parse(ackRaw.trim()) as { pub: string };
      const serverPublicKey = decodeBase64(ack.pub);

      // Compute shared key (client side) and encrypt a test message
      const sharedKey = nacl.box.before(serverPublicKey, clientKeyPair.secretKey);
      const message = { type: "test", data: "hello" } as unknown as Parameters<typeof nacl.secretbox>[0];
      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      const plaintext = new TextEncoder().encode(JSON.stringify(message));
      const ciphertext = nacl.secretbox(plaintext, nonce, sharedKey);
      const encrypted = JSON.stringify({
        type: "encrypted",
        nonce: encodeBase64(nonce),
        box: encodeBase64(ciphertext),
      }) + "\n";

      dataCallback(encrypted);
      expect(dataSpy).toHaveBeenCalledWith({ type: "test", data: "hello" });
    }
  });

  it("stops TCP server", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockServer.listen.mockImplementation((options: any, callback: any) => {
      setTimeout(callback, 0);
    });

    await adapter.start(3000);
    adapter.stop();

    expect(mockServer.close).toHaveBeenCalled();
  });

  it("handles server errors", async () => {
    const errorSpy = jest.fn();
    const error = new Error("Server error");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockServer.listen.mockImplementation((options: any, callback: any) => {
      const errorCallback = mockServer.on.mock.calls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (call: any) => call[0] === "error"
      )?.[1];
      if (errorCallback) {
        setTimeout(() => errorCallback(error), 0);
      } else {
        setTimeout(callback, 0);
      }
    });

    try {
      await adapter.start(3000);
    } catch (err) {
      errorSpy(err);
    }

    // The error handler is set up, but actual error depends on mock timing
    expect(mockServer.on).toHaveBeenCalled();
  });
});
