import { WsSignalingAdapter } from "../ws-signaling-adapter";

/* eslint-disable @typescript-eslint/no-explicit-any -- reaches into private socket/queue state */

const OPEN = 1;

function makeOpenSocket() {
  return { readyState: OPEN, send: jest.fn() };
}

/**
 * Drives the adapter with no socket so every send lands in the outbound queue,
 * then attaches an open socket and flushes to observe what survived.
 */
function setup() {
  const adapter = new WsSignalingAdapter();
  const sent = () => {
    const socket = makeOpenSocket();
    (adapter as any).socket = socket;
    (adapter as any).flushQueue();
    return socket.send.mock.calls.map(([payload]: [string]) => JSON.parse(payload));
  };
  return { adapter, sent };
}

function signaling(type: "offer" | "ice-candidate", to: string) {
  return { type, data: { to, from: "me", sender: "me" } } as any;
}

describe("WsSignalingAdapter outbound queue", () => {
  beforeAll(() => {
    (globalThis as any).WebSocket = Object.assign(function () {}, { OPEN });
  });

  it("queues negotiation traffic while the socket is down and flushes it on reconnect", () => {
    const { adapter, sent } = setup();

    adapter.sendMessage(signaling("offer", "peer-1"));

    expect(sent()).toEqual([
      expect.objectContaining({ type: "offer", data: expect.objectContaining({ to: "peer-1" }) }),
    ]);
  });

  // The outage-era offers/candidates belong to a call that has since been torn
  // down. Flushing them after the socket comes back replays dead-session SDP at
  // the peer, wrecking the negotiation of whatever call is running by then.
  it("discards queued negotiation traffic for a peer whose call was terminated", () => {
    const { adapter, sent } = setup();

    adapter.sendMessage(signaling("offer", "peer-1"));
    adapter.sendMessage(signaling("ice-candidate", "peer-1"));

    adapter.discardQueuedNegotiationFor("peer-1");

    expect(sent()).toEqual([]);
  });

  it("leaves other peers' queued negotiation traffic alone", () => {
    const { adapter, sent } = setup();

    adapter.sendMessage(signaling("offer", "peer-1"));
    adapter.sendMessage(signaling("offer", "peer-2"));

    adapter.discardQueuedNegotiationFor("peer-1");

    expect(sent()).toEqual([
      expect.objectContaining({ type: "offer", data: expect.objectContaining({ to: "peer-2" }) }),
    ]);
  });

  // call-ended still has to reach the peer after the outage, otherwise their call
  // log never finalizes — only the WebRTC negotiation traffic is stale.
  it("keeps non-negotiation messages queued for the terminated peer", () => {
    const { adapter, sent } = setup();

    adapter.sendMessage({
      type: "call-ended",
      data: { to: "peer-1", from: "me", sender: "me" },
    } as any);

    adapter.discardQueuedNegotiationFor("peer-1");

    expect(sent()).toEqual([expect.objectContaining({ type: "call-ended" })]);
  });

  it("preserves queued call traffic while resetting a stale network transport", () => {
    const { adapter, sent } = setup();

    adapter.sendMessage({
      type: "audio-call",
      data: { to: "peer-1", from: "me", callerName: "Me" },
    } as any);

    adapter.resetTransportForNetworkChange();

    expect(sent()).toEqual([expect.objectContaining({ type: "audio-call" })]);
  });

  it("invalidates and closes a socket that still reports open after network loss", () => {
    const { adapter } = setup();
    const staleSocket = { ...makeOpenSocket(), close: jest.fn() };
    (adapter as any).socket = staleSocket;
    (adapter as any).state = "open";

    adapter.resetTransportForNetworkChange();

    expect(staleSocket.close).toHaveBeenCalledWith(4001, "network_regained");
    expect(adapter.connectionState).toBe("idle");
    expect(adapter.isConnected).toBe(false);
  });

  it("queues a call sent immediately after the stale transport is reset", () => {
    const { adapter, sent } = setup();
    const staleSocket = { ...makeOpenSocket(), close: jest.fn() };
    (adapter as any).socket = staleSocket;
    (adapter as any).state = "open";

    adapter.resetTransportForNetworkChange();
    adapter.sendMessage({
      type: "audio-call",
      data: { to: "peer-1", from: "me", callerName: "Me" },
    } as any);

    expect(staleSocket.send).not.toHaveBeenCalled();
    expect(sent()).toEqual([expect.objectContaining({ type: "audio-call" })]);
  });
});
