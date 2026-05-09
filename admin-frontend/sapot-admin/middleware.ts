import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // 1. Get the access token from cookies
  const token = request.cookies.get('access_token')?.value;
  // 2. Define which paths are protected
  const isDashboardPage = request.nextUrl.pathname.startsWith('/dashboard');
  const isAdminPage = request.nextUrl.pathname.startsWith('/admin');

  // 3. If the user is trying to access a protected page without a token
  if ((isDashboardPage || isAdminPage) && !token) {
    // Redirect them to the login page
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 4. If they have a token or are on a public page, let them through
	// Add this inside your middleware function
	const isLoginPage = request.nextUrl.pathname === '/';

	if (isLoginPage && token) {
		// User is already logged in, send them to the dashboard
		return NextResponse.redirect(new URL('/dashboard', request.url));
	}
	return NextResponse.next();
}

// 5. Tell Next.js which routes this middleware should run on
export const config = {
	matcher: ['/dashboard/:path*', '/admin/:path*'],
};
