import { randomUUID } from 'crypto';

export interface WsChatMessage {
  type: 'chat';
  data: { from: string; to: string; messageId: string; content: string; timestamp: number; messageType: 'text' };
}

export interface WsServerAck {
  type: 'server-ack';
  data: { messageId: string; message_type: string };
}

export interface WsPong { type: 'pong' }

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

export async function fetchJwt(serverUrl: string, username: string, password: string): Promise<string> {
  const base = serverUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }).toString(),
  });
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
