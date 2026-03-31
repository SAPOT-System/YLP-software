import { createMockTcpClientSocket } from "@/test/mocks/adapter.mock-builders";
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

    const TcpSocket = require("react-native-tcp-socket");
    TcpSocket.createConnection.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (options: any, callback: any) => {
        setTimeout(callback, 0);
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

    expect(mockSocket.write).toHaveBeenCalledWith(
      JSON.stringify(message) + "\n"
    );
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
});
