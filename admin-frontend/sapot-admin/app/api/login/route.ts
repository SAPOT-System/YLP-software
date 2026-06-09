import { cookies } from "next/headers";

export async function POST(req: Request) {
  const formData = await req.formData();

  const loginData = new URLSearchParams();
  loginData.append('username', formData.get('username') as string);
  loginData.append('password', formData.get('password') as string);

	const baseUrl = process.env.API_DOMAIN || 'http://127.0.0.1:8000';
  const response = await fetch(baseUrl + '/admin/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: loginData,
  });

  if (!response.ok) {
    const err = await response.json();
    return Response.json({ error: err.detail || 'Login failed' }, { status: 401 });
  }

  // IMPORTANT: DO NOT set cookies here anymore
  const data = await response.json();

	const cookieStore = await cookies();

	const isSecure = process.env.NODE_ENV === 'production';

	cookieStore.set('access_token', data.access_token, {
		httpOnly: true,
		secure: isSecure,
		sameSite: 'lax',
		maxAge: 60 * 15,
	});

	if (data.refresh_token) {
		cookieStore.set('refresh_token', data.refresh_token, {
			httpOnly: true,
			secure: isSecure,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 7,
		});
	}

  return Response.json(data);
}
