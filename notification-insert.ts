import { supabase } from '@/supabase';

/** 내 user_id로만 INSERT (RLS). 실패해도 메인 플로우는 유지. */
export async function insertMyNotification(params: {
  userId: string;
  type: 'match' | 'like' | 'message' | 'point';
  content: string;
  related_id?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    content: params.content,
    is_read: false,
    related_id: params.related_id ?? null,
  });
  if (error) {
    console.warn('[notifications] insert failed', error.message);
  }
}
