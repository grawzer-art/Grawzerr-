import "server-only";

/** Rejects cross-site requests (defence in depth on top of SameSite cookies). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from some browsers omit it
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
