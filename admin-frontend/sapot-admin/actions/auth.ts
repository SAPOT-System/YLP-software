'use server'

import { clearSessionData } from '@/lib/sync/collectChanges';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { withBasePath } from '@/lib/basePath';

export async function loginAction(prevState: any, formData: FormData) {
  await clearSessionData();
  const username = formData.get('username');
  const password = formData.get('password');
  
  // We'll use this flag to decide when to redirect
  let isSuccess = false;

  const loginData = new URLSearchParams();
  loginData.append('username', username as string);
  loginData.append('password', password as string);

  try {
    const response = await fetch(`${process.env.API_DOMAIN}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: errorData.detail || 'Invalid username or password' };
    }

		// --- THE FIX STARTS HERE ---
    
    // 1. Get the 'Set-Cookie' header from the FastAPI response
    // This header contains the string "access_token=...; HttpOnly; Path=/..."
    const setCookieHeader = response.headers.get('set-cookie');

    if (setCookieHeader) {
      const cookieStore = await cookies();
      
      // 2. Parse the tokens out of the FastAPI set-cookie string
      // We look for 'access_token=' and grab everything until the first ';'
      const accessTokenMatch = setCookieHeader.match(/access_token=([^;]+)/);
      const refreshTokenMatch = setCookieHeader.match(/refresh_token=([^;]+)/);

      if (accessTokenMatch) {
        cookieStore.set('access_token', accessTokenMatch[1], {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 15,
        });
      }

      if (refreshTokenMatch) {
        cookieStore.set('refresh_token', refreshTokenMatch[1], {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }
    }
    // --- THE FIX ENDS HERE ---

    isSuccess = true; // Mark as successful

  } catch (err) {
    // Check if the error is actually a Next.js redirect (unlikely here but good practice)
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    
    return { error: 'Backend server is unreachable' };
  }

  // REDIRECT OUTSIDE THE TRY/CATCH
  if (isSuccess) {
    redirect('/dashboard');
  }
}


export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('auth_token'); // or whatever your cookie name is
	try {
		await fetch(withBasePath('/api/logout'), {method: "POST"});
	} catch {}
  redirect('/');
}
