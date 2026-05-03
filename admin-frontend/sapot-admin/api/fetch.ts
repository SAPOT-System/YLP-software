'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function secureFetch(endpoint: string, options: RequestInit = {}) {
	const cookieStore = await cookies();
	const token = cookieStore.get('access_token')?.value;

	const baseUrl = process.env.API_DOMAIN || 'http://127.0.0.1:8000';

	const headers = {
		...options.headers,
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
	};

	let response = await fetch(`${baseUrl}${endpoint}`, {
		...options,
		headers,
	});

	if (response.status === 401) {
		// Attempt refresh
		const refreshToken = cookieStore.get('refresh_token')?.value;

		if (!refreshToken) {
			return redirect('/login');
		}
		try {
			const response = await fetch(`${process.env.API_DOMAIN}/auth/refresh`, {
				method: "POST",
				headers: {
					'accept': 'application/json',
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					refresh_token: refreshToken
				})
			})


			if (!response.ok) {
				if (response.status === 401 ) redirect("/")
				throw new Error('Refresh failed');
			}

			const data = await response.json(); // Assuming FastAPI returns { access_token, refresh_token }

			// 3. Create the response and set the NEW cookies
			// const nextResponse = NextResponse.json({ success: true });
			cookieStore.set('access_token', data.access_token, {
			  httpOnly: true,
			  secure: false,//process.env.NODE_ENV === 'production',
			  sameSite: 'lax',
			  path: '/',
			});

			cookieStore.set('refresh_token', data.refresh_token, {
				httpOnly: true,
			  secure: false,//process.env.NODE_ENV === 'production',
				sameSite: 'lax',
				path: '/',
			});
		} catch (error) {
			redirect('/');
		}
	}

	return response;
}
