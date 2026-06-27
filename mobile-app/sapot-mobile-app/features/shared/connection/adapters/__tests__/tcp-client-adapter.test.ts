import { createMockTcpClientSocket } from "@/test/mocks/adapter.mock-builders";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
import { TcpClientAdapter } from "../tcp-client-adapter";

jest.mock("react-native-tcp-socket", () => ({
  createConnection: jest.fn(),
}));

describe("TcpClientAdapter", () => {
  let adapter: TcpClientAdapter;
  let mockSocket: ReturnType<typeof createMockTcpClientSocket>;

  const createHandshakeMessage = () => ({
    type: "handshake" as const,
    data: {
      sender: "peer-1",
      to: "peer-2",
      ipAddress: "127.0.0.1",
      port: 3000,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSocket = createMockTcpClientSocket();

    // Capture the data handler so we can simulate the server handshake-ack
    let dataHandler: ((data: string) => void) | null = null;
    mockSocket.on.mockImplementation((event: string, handler: (data: string) => void) => {
      if (event === "data") dataHandler = handler;
    });

    const TcpSocket = require("react-native-tcp-socket");
    TcpSocket.createConnection.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options: any, callback: any) => {
        setTimeout(() => {
          callback();
          // Simulate the server responding with a handshake-ack
          const serverKeyPair = nacl.box.keyPair();
          const ack = JSON.stringify({
            type: "handshake-ack",
            pub: encodeBase64(serverKeyPair.publicKey),
          }) + "\n";
          if (dataHandler) dataHandler(ack);
        }, 0);
        return mockSocket;
      }
    );

    adapter = new TcpClientAdapter("peer-1");
  });

  it("creates adapter with peer id", () => {
    expect(adapter.peerId).toBe("peer-1");
  });

  it("connects to a TCP server", async () => {
    await adapter.connect("127.0.0.1", 3000);

    expect(adapter.isConnected).toBe(true);
  });

  it("sends a message when connected", async () => {
    await adapter.connect("127.0.0.1", 3000);
    const message = createHandshakeMessage();

    adapter.sendMessage(message);

    // After handshake, messages are encrypted; check the last write is an encrypted frame
    const lastWrite = mockSocket.write.mock.calls.at(-1)?.[0] as string;
    expect(JSON.parse(lastWrite)).toMatchObject({ type: "encrypted" });
  });

  it("throws error when sending message while disconnected", async () => {
    expect(() => {
      adapter.sendMessage(createHandshakeMessage());
    }).toThrow("TCP not connected");
  });

  it("disconnects from server", async () => {
    await adapter.connect("127.0.0.1", 3000);
    adapter.disconnect();

    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it("is not connected before connecting", () => {
    expect(adapter.isConnected).toBe(false);
  });

  describe("probe", () => {
    it("resolves true when the connection callback fires", async () => {
      const probeSocket = createMockTcpClientSocket();
      const TcpSocket = require("react-native-tcp-socket");
      TcpSocket.createConnection.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (_options: any, callback: any) => {
          setTimeout(() => callback(), 0);
          return probeSocket;
        }
      );

      await expect(
        TcpClientAdapter.probe("127.0.0.1", 3000, 1000)
      ).resolves.toBe(true);
      expect(probeSocket.destroy).toHaveBeenCalled();
    });

    it("resolves false on socket error", async () => {
      const probeSocket = createMockTcpClientSocket();
      let errorHandler: (() => void) | null = null;
      probeSocket.on.mockImplementation(
        (event: string, handler: () => void) => {
          if (event === "error") errorHandler = handler;
        }
      );
      const TcpSocket = require("react-native-tcp-socket");
      TcpSocket.createConnection.mockImplementation(() => {
        setTimeout(() => errorHandler?.(), 0);
        return probeSocket;
      });

      await expect(
        TcpClientAdapter.probe("127.0.0.1", 3000, 1000)
      ).resolves.toBe(false);
    });

    it("resolves false on timeout when neither connect nor error fires", async () => {
      jest.useFakeTimers();
      const probeSocket = createMockTcpClientSocket();
      const TcpSocket = require("react-native-tcp-socket");
      TcpSocket.createConnection.mockImplementation(() => probeSocket);

      const result = TcpClientAdapter.probe("127.0.0.1", 3000, 1000);
      jest.advanceTimersByTime(1000);

      await expect(result).resolves.toBe(false);
      jest.useRealTimers();
    });
  });
});
