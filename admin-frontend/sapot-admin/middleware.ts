import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const protectedPaths = [
  '/dashboard',
  '/admin',
  '/analytics',
  '/users',
  '/nodes',
  '/logs',
  '/gsm',
  '/announcements',
  '/settings',
];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  const pathname = request.nextUrl.pathname;

  // Check if route is protected
  const isProtectedRoute = protectedPaths.some((path) =>
    pathname.startsWith(path)
  );

  // Redirect unauthenticated users away from protected pages
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Redirect logged-in users away from login page
  const isLoginPage = pathname === '/';
  if (isLoginPage && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
    '/analytics/:path*',
    '/users/:path*',
    '/nodes/:path*',
    '/logs/:path*',
    '/gsm/:path*',
    '/announcements/:path*',
    '/settings/:path*',
  ],
};
