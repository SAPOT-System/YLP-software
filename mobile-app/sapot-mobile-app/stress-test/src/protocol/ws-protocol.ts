import { randomUUID } from 'crypto';
import type { SignalMessage } from './tcp-protocol';

export interface WsChatMessage {
  type: 'chat';
  data: { from: string; to: string; messageId: string; content: string; timestamp: number; messageType: 'text' };
}

export interface WsServerAck {
  type: 'server-ack';
  data: { messageId: string; message_type: string };
}

export interface WsPong { type: 'pong' }

export function decodeToken(token: string): { userId: string } {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return { userId: payload.sub || payload.userId || payload.user_id };
  } catch (e) {
    throw new Error(`Failed to decode token: ${(e as Error).message}`);
  }
}

export function buildWsUrl(serverUrl: string, token: string): string {
  const base = serverUrl.replace(/\/+$/, '');
  const wsBase = base.startsWith('https://')
    ? `wss://${base.slice('https://'.length)}`
    : base.startsWith('http://')
    ? `ws://${base.slice('http://'.length)}`
    : `ws://${base}`;
  return `${wsBase}/ws/?token=${encodeURIComponent(token)}`;
}

export function buildChatMessage(from: string, to: string, content: string): WsChatMessage {
  return {
    type: 'chat',
    data: { from, to, messageId: randomUUID(), content, timestamp: Date.now(), messageType: 'text' },
  };
}

const AUTH_TIMEOUT_MS = 10000;

export async function fetchJwt(serverUrl: string, username: string, password: string): Promise<string> {
  const base = serverUrl.replace(/\/+$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }).toString(),
      // signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (e) {
    const reason = (e as Error).name === 'TimeoutError'
      ? `no response within ${AUTH_TIMEOUT_MS}ms`
      : (e as Error).message;
    throw new Error(`Auth request to ${base}/auth/token failed: ${reason}`);
  }
  if (!res.ok) throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export function isServerAck(msg: unknown): msg is WsServerAck {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  return m['type'] === 'server-ack' && typeof (m['data'] as Record<string, unknown>)?.['messageId'] === 'string';
}

export function isPong(msg: unknown): msg is WsPong {
  if (!msg || typeof msg !== 'object') return false;
  return (msg as Record<string, unknown>)['type'] === 'pong';
}

// Server-format signal message — matches the FastAPI SignalMessage / SDPData models.
// type is the signal type directly ("offer"|"answer"|"ice-candidate"), not a "signal" wrapper.
// sender/to are user UUID strings. sdp/candidate match SDPData's optional dict fields.
export interface ServerSignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: {
    sender: string;
    to: string;
    sdp?: { type: string; sdp: string };
    candidate?: { candidate: string; sdpMid: string };
  };
}

export function buildServerSignalMessage(from: string, to: string, signal: SignalMessage): ServerSignalMessage {
  if (signal.type === 'offer' || signal.type === 'answer') {
    return { type: signal.type, data: { sender: from, to, sdp: { type: signal.type, sdp: signal.sdp } } };
  }
  return {
    type: 'ice-candidate',
    data: { sender: from, to, candidate: { candidate: signal.candidate, sdpMid: signal.mid } },
  };
}

export function isServerSignalMessage(msg: unknown): msg is ServerSignalMessage {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (!['offer', 'answer', 'ice-candidate'].includes(m['type'] as string)) return false;
  const d = m['data'] as Record<string, unknown> | undefined;
  return typeof d?.['sender'] === 'string';
}

export function serverSignalToInternal(msg: ServerSignalMessage): SignalMessage {
  if (msg.type === 'offer' || msg.type === 'answer') {
    return { type: msg.type, sdp: msg.data.sdp?.sdp ?? '' };
  }
  return { type: 'candidate', candidate: msg.data.candidate?.candidate ?? '', mid: msg.data.candidate?.sdpMid ?? '0' };
}
