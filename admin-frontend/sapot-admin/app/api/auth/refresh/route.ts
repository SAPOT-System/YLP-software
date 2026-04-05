import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // 1. Get the refresh token from HttpOnly cookies
  const refreshToken = request.cookies.get('refresh_token')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No refresh token found' }, { status: 401 });
  }

  // 2. Prepare Form Data for FastAPI
  const formData = new FormData();
  formData.append('refresh_token', refreshToken);

  try {
    const response = await fetch(`${process.env.API_DOMAIN}/auth/refresh`, {
      method: 'POST',
      body: formData, // Sending as form-data as requested
    });

    if (!response.ok) {
      throw new Error('Refresh failed');
    }

    const data = await response.json(); // Assuming FastAPI returns { access_token, refresh_token }

    // 3. Create the response and set the NEW cookies
    const nextResponse = NextResponse.json({ success: true });

    nextResponse.cookies.set('access_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    nextResponse.cookies.set('refresh_token', data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return nextResponse;
  } catch (error) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }
}
