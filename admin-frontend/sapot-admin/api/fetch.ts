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

  let response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

	if (!response) 
		throw Error("Authentication error")

  if (response.status === 401) {
    const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
    
    if (refreshRes.ok) {
      // Refresh worked! Now retry the original request
      response = await fetch(`${baseUrl}${endpoint}`, options);
    } else {
      // Refresh failed (token expired), redirect to login
      window.location.href = '/login';
    }
  }

  return response;


}
