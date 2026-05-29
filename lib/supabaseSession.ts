import { supabase } from '@/supabase';

/** Refresh access token when within this many seconds of expiry. */
const SESSION_REFRESH_BUFFER_SEC = 60;

/**
 * Load session from storage and refresh if expired or near expiry.
 * Returns true only when a valid session exists after recovery.
 */
export async function recoverSupabaseSession(): Promise<boolean> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return false;
  }

  const expiresAt = session.expires_at;
  if (expiresAt == null) {
    return true;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSec >= SESSION_REFRESH_BUFFER_SEC) {
    return true;
  }

  const {
    data: { session: refreshed },
    error: refreshError,
  } = await supabase.auth.refreshSession();

  return !refreshError && Boolean(refreshed);
}
