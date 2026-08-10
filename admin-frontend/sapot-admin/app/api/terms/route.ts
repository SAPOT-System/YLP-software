import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.API_DOMAIN || 'https://127.0.0.1:8000';
  const response = await fetch(`${baseUrl}/auth/terms`);
  const text = await response.text();
  return new NextResponse(text, { status: response.status, headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain; charset=utf-8' } });
}
