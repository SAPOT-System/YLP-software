import {
  buildWsUrl,
  buildChatMessage,
  isServerAck,
  isPong,
  buildServerSignalMessage,
  isServerSignalMessage,
  serverSignalToInternal,
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
