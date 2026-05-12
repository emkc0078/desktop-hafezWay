/** Backup / Redis routes in logs-viewer.html use `Bearer` token */
export function bearerHeaders(token: string, extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}
