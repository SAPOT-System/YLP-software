// Must match `basePath` in next.config.ts. Next.js does not automatically
// prefix plain fetch() calls or next/image src values with basePath. Route all
// browser requests for this app through this helper so nginx keeps them under
// /admin instead of sending them to the FastAPI catch-all.
const BASE_PATH = '/admin';

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
