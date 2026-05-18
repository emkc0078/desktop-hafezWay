/** Reads `_id` from a JWT access token payload (no signature verification — UI only). */
export function getUserIdFromAccessToken(token: string): string | null {
  if (!token?.trim()) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const payload = JSON.parse(json) as { _id?: unknown };
    if (payload._id == null) return null;
    return String(payload._id);
  } catch {
    return null;
  }
}
