import { buildWsUrl, buildChatMessage, isServerAck, isPong } from '@/protocol/ws-protocol';

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
