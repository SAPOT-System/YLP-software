import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeInit, buildHandshakeAck, parsePublicKey,
  buildTcpSignalPayload, isTcpSignalPayload,
} from '@/protocol/tcp-protocol';

describe('tcp-protocol', () => {
  it('round-trips a message through encrypt/decrypt', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const aliceShared = computeSharedKey(alice.secretKey, bob.publicKey);
    const bobShared = computeSharedKey(bob.secretKey, alice.publicKey);
    const msg = { type: 'chat', payload: 'hello' };
    const envelope = encryptMessage(aliceShared, msg);
    const decrypted = decryptMessage(bobShared, envelope);
    expect(decrypted).toEqual(msg);
  });

  it('buildHandshakeInit produces correct type', () => {
    const kp = generateKeyPair();
    const frame = buildHandshakeInit(kp.publicKey);
    expect(frame.type).toBe('handshake-init');
    expect(typeof frame.pub).toBe('string');
  });

  it('buildHandshakeAck produces correct type', () => {
    const kp = generateKeyPair();
    const frame = buildHandshakeAck(kp.publicKey);
    expect(frame.type).toBe('handshake-ack');
    expect(typeof frame.pub).toBe('string');
  });

  it('parsePublicKey round-trips through base64', () => {
    const { encodeBase64 } = require('tweetnacl-util');
    const kp = generateKeyPair();
    const b64 = encodeBase64(kp.publicKey);
    expect(parsePublicKey(b64)).toEqual(kp.publicKey);
  });

  it('decryptMessage throws when key is wrong', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const charlie = generateKeyPair();
    const aliceShared = computeSharedKey(alice.secretKey, bob.publicKey);
    const wrongShared = computeSharedKey(charlie.secretKey, alice.publicKey);
    const envelope = encryptMessage(aliceShared, { type: 'chat', payload: 'hi' });
    expect(() => decryptMessage(wrongShared, envelope)).toThrow();
  });
});

describe('TcpSignalPayload', () => {
  it('buildTcpSignalPayload wraps a SignalMessage with type=signal', () => {
    const payload = buildTcpSignalPayload({ type: 'offer', sdp: 'v=0\r\n' });
    expect(payload.type).toBe('signal');
    expect(payload.signal).toEqual({ type: 'offer', sdp: 'v=0\r\n' });
  });

  it('isTcpSignalPayload returns true for a valid payload', () => {
    const payload = buildTcpSignalPayload({ type: 'candidate', candidate: 'c', mid: '0' });
    expect(isTcpSignalPayload(payload)).toBe(true);
  });

  it('isTcpSignalPayload returns false for non-signal messages', () => {
    expect(isTcpSignalPayload({ type: 'stress-chat', seq: 1 })).toBe(false);
    expect(isTcpSignalPayload({ type: 'signal' })).toBe(false);
  });

  it('round-trips a TcpSignalPayload through NaCl encrypt/decrypt', () => {
    const alice = generateKeyPair();
    const bob = generateKeyPair();
    const sharedKey = computeSharedKey(alice.secretKey, bob.publicKey);
    const bobShared = computeSharedKey(bob.secretKey, alice.publicKey);
    const payload = buildTcpSignalPayload({ type: 'answer', sdp: 'v=0\r\nfoo' });
    const envelope = encryptMessage(sharedKey, payload as unknown as Record<string, unknown>);
    const decrypted = decryptMessage(bobShared, envelope);
    expect(isTcpSignalPayload(decrypted)).toBe(true);
    expect((decrypted as unknown as typeof payload).signal).toEqual({ type: 'answer', sdp: 'v=0\r\nfoo' });
  });
});
