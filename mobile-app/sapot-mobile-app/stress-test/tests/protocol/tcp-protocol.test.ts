import {
  generateKeyPair, computeSharedKey, encryptMessage, decryptMessage,
  buildHandshakeInit, buildHandshakeAck, parsePublicKey,
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
