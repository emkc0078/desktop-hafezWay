export type LiveKitRoomUrlOptions = {
  /** LiveKit room JWT from `POST /api/livekit/token` (matches Expo WebView `lkToken`). */
  lkToken?: string;
  /** So the web UI treats you as host (admin | teacher). */
  userRole?: string;
};

/** Opens the web app LiveKit room page (not the API `/rooms/:id` route). */
export function buildLivekitRoomViewUrl(
  liveAppBaseUrl: string,
  roomId: string,
  roomTitle: string,
  opts?: LiveKitRoomUrlOptions,
): string {
  const base = liveAppBaseUrl.replace(/\/$/, '');
  const params = new URLSearchParams();
  params.set('roomTitle', (roomTitle || 'Room').trim());
  if (opts?.lkToken) params.set('lkToken', opts.lkToken);
  if (opts?.userRole) params.set('userRole', opts.userRole);
  return `${base}/livekit/${encodeURIComponent(roomId)}?${params.toString()}`;
}
