'use server'

import { db } from '@/lib/db';
import { clearSessionData } from '@/lib/sync/collectChanges';
import { pull, sync } from '@/lib/sync/syncEngine';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(formData: FormData) {
  await clearSessionData();
  const username = formData.get('username');
  const password = formData.get('password');

  // 1. Prepare the request to FastAPI
  // FastAPI's OAuth2 login usually expects application/x-www-form-urlencoded
  const loginData = new URLSearchParams();
  loginData.append('username', username as string);
  loginData.append('password', password as string);

  const baseUrl = process.env.API_DOMAIN || 'https://localhost:8000';

  try {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: loginData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: errorData.detail || 'Login failed' };
    }

    const data = await response.json();

    // 2. Save tokens in HttpOnly cookies
    // This makes them accessible to subsequent 'Authorization: Bearer' requests
    const cookieStore = await cookies();
    
    cookieStore.set('access_token', data.access_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 15, // 15 minutes
    });

    if (data.refresh_token) {
      cookieStore.set('refresh_token', data.refresh_token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    }

		await db.open();
		await sync();

  } catch (err) {
    return { error: 'Connection to backend failed' };
  }

  // 3. Success! Redirect to the dashboard
  redirect('/dashboard');
}
