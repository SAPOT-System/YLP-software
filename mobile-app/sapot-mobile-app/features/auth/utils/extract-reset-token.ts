export function extractResetToken(url: string): string {
  try {
    return new URL(url).searchParams.get("token") ?? "";
  } catch {
    return url.match(/[?&]token=([^&]+)/)?.[1] ?? "";
  }
}
