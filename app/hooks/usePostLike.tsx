import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  InteractionManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import { supabase } from '../../supabase';

const MAIN = '#3B3BF9';

function getLocalDateKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduleAlert(show: () => void) {
  InteractionManager.runAfterInteractions(() => {
    setTimeout(show, 0);
  });
}

export type PendingLikePayload = {
  myId: string;
  postId: string;
  authorId: string;
  points: number;
  daily_likes_used: number;
  isPaid: boolean;
};

async function ensureDailyLikeDay(
  userId: string
): Promise<{ points: number; daily_likes_used: number }> {
  const { data, error } = await supabase
    .from('users')
    .select('points, daily_likes_used, last_daily_reset')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const todayKey = getLocalDateKey();
  const lastKey = (data as any)?.last_daily_reset
    ? getLocalDateKey(new Date(String((data as any).last_daily_reset)))
    : null;
  if (lastKey !== todayKey) {
    const { error: upError } = await supabase
      .from('users')
      .update({ daily_likes_used: 0, last_daily_reset: new Date().toISOString() })
      .eq('id', userId);
    if (upError) throw upError;
    return {
      points: typeof (data as any)?.points === 'number' ? (data as any).points : 0,
      daily_likes_used: 0,
    };
  }
  return {
    points: typeof (data as any)?.points === 'number' ? (data as any).points : 0,
    daily_likes_used: typeof (data as any)?.daily_likes_used === 'number' ? (data as any).daily_likes_used : 0,
  };
}

export function usePostLike() {
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const likeBusyRef = useRef(false);
  const pendingLikeRef = useRef<PendingLikePayload | null>(null);
  const [likeModalVisible, setLikeModalVisible] = useState(false);
  const [likeModalConfirming, setLikeModalConfirming] = useState(false);
  const [likeModalDailyUsed, setLikeModalDailyUsed] = useState(0);
  const [likeModalIsPaid, setLikeModalIsPaid] = useState(false);

  const likeModalMainLine = useMemo(() => {
    if (likeModalIsPaid) {
      return '0회 남음 (-3p 차감)';
    }
    const n = Math.max(0, 5 - likeModalDailyUsed);
    return `${n}회 남음`;
  }, [likeModalDailyUsed, likeModalIsPaid]);

  const executeLikeInsert = useCallback(async (p: PendingLikePayload) => {
    const { myId, postId, authorId, points, daily_likes_used, isPaid } = p;

    const { error: insError } = await supabase.from('likes').insert({
      user_id: myId,
      post_id: postId,
    });
    if (insError) throw insError;

    const { data: authorRow, error: authorErr } = await supabase
      .from('users')
      .select('points')
      .eq('id', authorId)
      .maybeSingle();
    if (authorErr) throw authorErr;
    const authorPoints =
      typeof (authorRow as any)?.points === 'number' ? (authorRow as any).points : 0;
    const { error: authorUpErr } = await supabase
      .from('users')
      .update({ points: authorPoints + 1 })
      .eq('id', authorId);
    if (authorUpErr) throw authorUpErr;

    if (isPaid) {
      const { error: senderUpErr } = await supabase
        .from('users')
        .update({ points: points - 3 })
        .eq('id', myId);
      if (senderUpErr) throw senderUpErr;

      const { error: sentLogErr } = await supabase.from('point_logs').insert({
        user_id: myId,
        amount: -3,
        reason: 'like_sent',
      });
      if (sentLogErr) throw sentLogErr;
    }

    const { error: dailyUpErr } = await supabase
      .from('users')
      .update({ daily_likes_used: daily_likes_used + 1 })
      .eq('id', myId);
    if (dailyUpErr) throw dailyUpErr;

    setLikedIds((prev) => ({ ...prev, [postId]: true }));
  }, []);

  const closeLikeModal = useCallback(() => {
    if (likeModalConfirming) return;
    setLikeModalVisible(false);
    pendingLikeRef.current = null;
    likeBusyRef.current = false;
  }, [likeModalConfirming]);

  const onConfirmLikeModal = useCallback(() => {
    const p = pendingLikeRef.current;
    if (!p || likeModalConfirming) return;
    setLikeModalConfirming(true);
    setLikeModalVisible(false);
    void (async () => {
      try {
        await executeLikeInsert(p);
      } catch (e: any) {
        scheduleAlert(() => {
          Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
        });
      } finally {
        setLikeModalConfirming(false);
        pendingLikeRef.current = null;
        likeBusyRef.current = false;
      }
    })();
  }, [executeLikeInsert, likeModalConfirming]);

  const loadMyLikesForPostIds = useCallback(async (postIds: string[], myId: string | null) => {
    if (!myId || postIds.length === 0) {
      setLikedIds({});
      return;
    }
    const { data: likeRows, error: likesError } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', myId)
      .in('post_id', postIds);

    const feedIdSet = new Set(postIds);
    const next: Record<string, boolean> = {};
    if (!likesError && likeRows?.length) {
      for (const row of likeRows as { post_id: string }[]) {
        const pid = row?.post_id != null ? String(row.post_id).trim() : '';
        if (pid && feedIdSet.has(pid)) {
          next[pid] = true;
        }
      }
    }
    setLikedIds(next);
  }, []);

  const handleToggleLike = useCallback(async (postIdRaw: string, authorId: string) => {
    const postId = String(postIdRaw ?? '').trim();
    if (!postId || !authorId || likeBusyRef.current) return;
    likeBusyRef.current = true;
    let deferReleaseBusy = false;
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');
      const myId = user.id;
      if (myId === authorId) return;

      const { data: existingLike } = await supabase
        .from('likes')
        .select('id')
        .eq('user_id', myId)
        .eq('post_id', postId)
        .maybeSingle();
      const wasLiked = !!existingLike;

      if (wasLiked) {
        const { error: delError } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', myId)
          .eq('post_id', postId);
        if (delError) throw delError;

        setLikedIds((prev) => ({ ...prev, [postId]: false }));
        return;
      }

      const { points, daily_likes_used } = await ensureDailyLikeDay(myId);
      const isPaid = daily_likes_used >= 5;
      if (isPaid && points < 3) {
        scheduleAlert(() => {
          Alert.alert('포인트 부족', '좋아요를 보내려면 포인트가 3p 이상 필요해요.');
        });
        return;
      }

      pendingLikeRef.current = {
        myId,
        postId,
        authorId,
        points,
        daily_likes_used,
        isPaid,
      };
      setLikeModalDailyUsed(daily_likes_used);
      setLikeModalIsPaid(isPaid);
      deferReleaseBusy = true;
      setLikeModalVisible(true);
      return;
    } catch (e: any) {
      scheduleAlert(() => {
        Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      });
    } finally {
      if (!deferReleaseBusy) {
        likeBusyRef.current = false;
      }
    }
  }, []);

  const LikeModal = useCallback(() => {
    return (
      <Modal visible={likeModalVisible} transparent animationType="fade" onRequestClose={closeLikeModal}>
        <Pressable style={modalStyles.backdrop} onPress={closeLikeModal}>
          <Pressable style={modalStyles.card} onPress={() => {}}>
            <Text style={modalStyles.title}>좋아요를 보내시겠어요?</Text>
            <Text style={modalStyles.desc}>{likeModalMainLine}</Text>
            <Text style={modalStyles.descHint}>좋아요 일일 5회 무료</Text>

            <Pressable
              style={[
                modalStyles.primaryBtn,
                likeModalConfirming ? modalStyles.primaryBtnDisabled : null,
              ]}
              onPress={onConfirmLikeModal}
              disabled={likeModalConfirming}
              accessibilityRole="button"
              accessibilityLabel="사용할게요"
            >
              <Text style={modalStyles.primaryBtnText}>사용할게요</Text>
            </Pressable>

            <Pressable
              style={modalStyles.textBtn}
              onPress={closeLikeModal}
              disabled={likeModalConfirming}
              accessibilityRole="button"
              accessibilityLabel="안할게요"
            >
              <Text style={modalStyles.textBtnText}>안할게요</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }, [
    closeLikeModal,
    likeModalConfirming,
    likeModalMainLine,
    likeModalVisible,
    onConfirmLikeModal,
  ]);

  return {
    likedIds,
    loadMyLikesForPostIds,
    handleToggleLike,
    LikeModal,
  };
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  desc: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 18,
  },
  descHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    lineHeight: 15,
  },
  primaryBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  textBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  textBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
});
