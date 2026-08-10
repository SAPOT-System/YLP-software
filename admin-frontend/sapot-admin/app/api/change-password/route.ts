import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { secureFetch } from '@/api/fetch';

export async function POST(request: Request) {
  const body = await request.json();
  const response = await secureFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ detail: 'Password change failed' }));
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const cookieStore = await cookies();
  cookieStore.delete('must_change_password');
  cookieStore.delete('terms_acceptance_required');
  return NextResponse.json(data);
}
