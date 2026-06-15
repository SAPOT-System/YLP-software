import {
  buildWsUrl,
  buildChatMessage,
  isServerAck,
  isPong,
  buildServerSignalMessage,
  isServerSignalMessage,
  serverSignalToInternal,
  fetchJwt,
} from '@/protocol/ws-protocol';

describe('ws-protocol', () => {
  it('buildWsUrl constructs correct websocket URL', () => {
    expect(buildWsUrl('http://192.168.1.100:8000', 'test-token')).toBe('ws://192.168.1.100:8000/ws/?token=test-token');
  });

  it('buildWsUrl converts https to wss', () => {
    expect(buildWsUrl('https://sapot.online', 'tok')).toBe('wss://sapot.online/ws/?token=tok');
  });

  it('buildChatMessage produces correct shape', () => {
    const msg = buildChatMessage('peer-a', 'peer-b', 'hello');
    expect(msg.type).toBe('chat');
    expect(msg.data.from).toBe('peer-a');
    expect(msg.data.to).toBe('peer-b');
    expect(typeof msg.data.messageId).toBe('string');
  });

  it('isServerAck identifies server-ack messages', () => {
    expect(isServerAck({ type: 'server-ack', data: { messageId: 'abc', message_type: 'chat' } })).toBe(true);
    expect(isServerAck({ type: 'chat' })).toBe(false);
    expect(isServerAck(null)).toBe(false);
  });

  it('isPong identifies pong messages', () => {
    expect(isPong({ type: 'pong' })).toBe(true);
    expect(isPong({ type: 'ping' })).toBe(false);
  });
});

describe('ServerSignalMessage', () => {
  it('buildServerSignalMessage produces offer in server format', () => {
    const msg = buildServerSignalMessage('user-a', 'user-b', { type: 'offer', sdp: 'v=0\r\n' });
    expect(msg.type).toBe('offer');
    expect(msg.data.sender).toBe('user-a');
    expect(msg.data.to).toBe('user-b');
    expect(msg.data.sdp).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
    expect(msg.data.candidate).toBeUndefined();
  });

  it('buildServerSignalMessage produces ice-candidate in server format', () => {
    const msg = buildServerSignalMessage('a', 'b', { type: 'candidate', candidate: 'cand', mid: '0' });
    expect(msg.type).toBe('ice-candidate');
    expect(msg.data.candidate).toEqual({ candidate: 'cand', sdpMid: '0' });
    expect(msg.data.sdp).toBeUndefined();
  });

  it('isServerSignalMessage returns true for offer/answer/ice-candidate with sender', () => {
    const offer = buildServerSignalMessage('a', 'b', { type: 'offer', sdp: 'v=0\r\n' });
    expect(isServerSignalMessage(offer)).toBe(true);
    const ice = buildServerSignalMessage('a', 'b', { type: 'candidate', candidate: 'c', mid: '0' });
    expect(isServerSignalMessage(ice)).toBe(true);
  });

  it('isServerSignalMessage returns false for chat and non-signal types', () => {
    expect(isServerSignalMessage({ type: 'chat', data: { sender: 'a', to: 'b' } })).toBe(false);
    expect(isServerSignalMessage({ type: 'signal', data: { from: 'a', to: 'b' } })).toBe(false);
    expect(isServerSignalMessage(null)).toBe(false);
  });

  it('serverSignalToInternal converts offer back to internal format', () => {
    const server = buildServerSignalMessage('a', 'b', { type: 'offer', sdp: 'v=0\r\n' });
    const internal = serverSignalToInternal(server);
    expect(internal).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
  });

  it('serverSignalToInternal converts ice-candidate back to internal format', () => {
    const server = buildServerSignalMessage('a', 'b', { type: 'candidate', candidate: 'cand', mid: '1' });
    const internal = serverSignalToInternal(server);
    expect(internal).toEqual({ type: 'candidate', candidate: 'cand', mid: '1' });
  });
});

describe('fetchJwt', () => {
  const AUTH_TIMEOUT_MS = 10000;

  beforeEach(() => {
    jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('rejects with timeout message when the server does not respond within the budget', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const jwtPromise = fetchJwt('http://server', 'user', 'pass');

    // Register the rejection handler before advancing timers so the rejection is never unhandled.
    await Promise.all([
      expect(jwtPromise).rejects.toThrow(`no response within ${AUTH_TIMEOUT_MS}ms`),
      jest.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS + 1),
    ]);
  });

  it('calls fetch without a signal option', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok123' }),
    });

    await fetchJwt('http://server', 'user', 'pass');

    const opts = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(opts).not.toHaveProperty('signal');
  });

  it('resolves with the access token on successful auth', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok-abc' }),
    });

    const token = await fetchJwt('http://server/', 'alice', 'secret');
    expect(token).toBe('tok-abc');
  });

  it('leaves no lingering timer after a successful auth', async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok-abc' }),
    });

    await fetchJwt('http://server', 'alice', 'secret');
    // Advancing past the timeout must not throw — the timer was cleared.
    await expect(jest.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS + 1)).resolves.not.toThrow();
  });
});
