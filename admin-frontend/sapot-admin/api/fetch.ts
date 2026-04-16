'use server'
import { cookies } from 'next/headers';

export async function secureFetch(endpoint: string, options: RequestInit = {}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;

  const baseUrl = process.env.API_DOMAIN || 'http://127.0.0.1:8000';

  // Merge the Authorization header with any other headers provided
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });
}
