import { cookies } from "next/headers";

type LoginResponse = {
  access_token?: string;
  refresh_token?: string;
  must_change_password?: boolean;
  terms_accepted?: boolean;
  detail?: unknown;
};

export async function POST(req: Request) {
  const formData = await req.formData();

  const loginData = new URLSearchParams();
  loginData.append('username', formData.get('username') as string);
  loginData.append('password', formData.get('password') as string);

	const baseUrl = process.env.API_DOMAIN || 'https://127.0.0.1:8000';
  let response: Response;

  try {
    response = await fetch(baseUrl + '/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: loginData,
    });
  } catch (error) {
    console.error('Admin login upstream request failed', error);
    return Response.json(
      { error: 'Login service is unavailable' },
      { status: 502 }
    );
  }

  const rawBody = await response.text();
  let data: LoginResponse | null = null;

  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (parsed && typeof parsed === 'object') {
      data = parsed as LoginResponse;
    }
  } catch {
    // FastAPI returns plain text for unhandled 500 errors.
  }

  if (!response.ok) {
    const error =
      typeof data?.detail === 'string'
        ? data.detail
        : rawBody || 'Login failed';

    if (response.status >= 500) {
      console.error(`Admin login upstream failed with status ${response.status}`);
    }
    return Response.json({ error }, { status: response.status });
  }

  if (!data?.access_token) {
    console.error('Admin login upstream returned an invalid response');
    return Response.json(
      { error: 'Login service returned an invalid response' },
      { status: 502 }
    );
  }

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

  // Must outlive access_token (15m) and match refresh_token (7d). A shorter-lived
  // flag cookie strands the operator: middleware would let /dashboard render while
  // every API call 403s, and /change-password would bounce back to /dashboard.
  const flagCookie = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };

  if (data.must_change_password) {
    cookieStore.set('must_change_password', 'true', flagCookie);
    if (!data.terms_accepted) {
      cookieStore.set('terms_acceptance_required', 'true', flagCookie);
    } else {
      cookieStore.delete('terms_acceptance_required');
    }
  } else {
    cookieStore.delete('must_change_password');
    cookieStore.delete('terms_acceptance_required');
  }

  return Response.json(data);
}
