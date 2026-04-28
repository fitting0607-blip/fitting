import { getSupabaseEnv, supabase } from '@/supabase';

type SendPushArgs =
  | {
      mode: 'notification_id';
      notificationId: string;
      route?: { pathname: string; params?: Record<string, string> };
    }
  | {
      mode: 'message';
      roomId: string;
      messageId: string;
      route?: { pathname: string; params?: Record<string, string> };
    }
  | {
      mode: 'latest_by_related';
      recipientUserId: string;
      type: 'match' | 'like' | 'message' | 'point';
      relatedId: string;
      route?: { pathname: string; params?: Record<string, string> };
    };

async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

export async function requestPushSend(args: SendPushArgs): Promise<void> {
  const env = getSupabaseEnv();
  if (!env?.url) return;

  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const functionUrl = `${env.url.replace(/\/$/, '')}/functions/v1/send-push`;

  const res = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  // Best-effort: don't break main UX flow
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[push] send failed', res.status, text);
  }
}

