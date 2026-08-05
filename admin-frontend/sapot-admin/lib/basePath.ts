// Must match `basePath` in next.config.ts. Next.js does not automatically
// prefix plain fetch() calls with basePath (unlike next/link, next/navigation,
// next/image) — every client-side fetch to this app's own /api/* routes has
// to go through this helper or it will be routed outside /admin by nginx.
const BASE_PATH = '/admin';

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
