import { Alert } from 'react-native';
import { router } from 'expo-router';

import { insertMyNotification } from '@/notification-insert';
import { requestPushSend } from '@/app/utils/pushApi';
import { supabase } from '../supabase';

let matchRequestInFlight = false;

function getTodayRangeISO() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function getMyUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user?.id) throw new Error('로그인이 필요합니다.');
  return user.id;
}

async function getTodaySentCount(requesterId: string) {
  const { startISO, endISO } = getTodayRangeISO();
  const { count, error } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', requesterId)
    .gte('created_at', startISO)
    .lt('created_at', endISO);
  if (error) throw error;
  return count ?? 0;
}

export async function getMatchDailyFreeRemaining() {
  const myId = await getMyUserId();
  const todaySentCount = await getTodaySentCount(myId);
  const freeRemaining = Math.max(0, 3 - todaySentCount);
  return { myId, todaySentCount, freeRemaining };
}

async function hasAlreadyRequested(requesterId: string, targetId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('requester_id', requesterId)
    .eq('target_id', targetId)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function consumeTicketIfNeeded(myId: string, todaySentCount: number) {
  if (todaySentCount < 3) return;

  const { data: me, error: meError } = await supabase
    .from('users')
    .select('matching_tickets')
    .eq('id', myId)
    .maybeSingle();
  if (meError) throw meError;

  const currentTickets =
    typeof (me as any)?.matching_tickets === 'number' ? (me as any).matching_tickets : 0;

  if (currentTickets <= 0) {
    Alert.alert('매칭권이 부족해요');
    throw new Error('NO_TICKET');
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ matching_tickets: currentTickets - 1 })
    .eq('id', myId)
    .gt('matching_tickets', 0);
  if (updateError) throw updateError;
}

function showFreeRemainingAlert(todaySentCountBeforeThis: number) {
  // 1회 사용 후(=기존 0회) → 2회 남음
  if (todaySentCountBeforeThis === 0) {
    Alert.alert('일일 무료 매칭권 2회 남았어요');
    return;
  }
  // 2회 사용 후(=기존 1회) → 1회 남음
  if (todaySentCountBeforeThis === 1) {
    Alert.alert('일일 무료 매칭권 1회 남았어요');
  }
}

function getFreeRemainingMessage(todaySentCountBeforeThis: number) {
  if (todaySentCountBeforeThis === 0) return '일일 무료 매칭권 2회 남았어요';
  if (todaySentCountBeforeThis === 1) return '일일 무료 매칭권 1회 남았어요';
  return null;
}

async function getUserNickname(userId: string) {
  if (!userId) return '상대';
  const { data, error } = await supabase.from('users').select('nickname').eq('id', userId).maybeSingle();
  if (error) return '상대';
  const nick = (data as any)?.nickname;
  return nick ? String(nick) : '상대';
}

async function createMatchRequest(myId: string, targetId: string) {
  const { data, error } = await supabase
    .from('matches')
    .insert({
      requester_id: myId,
      target_id: targetId,
    })
    .select('id')
    .single();
  if (error) throw error;

  const matchId = String((data as any)?.id ?? '');
  if (!matchId) throw new Error('매칭 생성에 실패했어요.');

  // 2) chat_rooms INSERT right after match is created
  const { data: room, error: roomError } = await supabase
    .from('chat_rooms')
    .insert({ match_id: matchId })
    .select('id')
    .single();
  if (roomError) {
    // Best-effort rollback so we don't leave a match without a room.
    await supabase.from('matches').delete().eq('id', matchId);
    throw roomError;
  }

  const roomId = String((room as any)?.id ?? '');
  if (!roomId) throw new Error('채팅방 생성에 실패했어요.');

  return { matchId, roomId };
}

export async function runMatchRequest(
  targetUserId: string,
  prefetched?: { myId: string; todaySentCount: number }
) {
  if (!targetUserId) return;

  if (matchRequestInFlight) return;
  matchRequestInFlight = true;
  try {
    const myId = prefetched?.myId ?? (await getMyUserId());
    const todaySentCountBeforeThis = prefetched?.todaySentCount ?? (await getTodaySentCount(myId));

    if (myId === targetUserId) {
      Alert.alert('처리 실패', '자기 자신에게는 매칭 요청을 보낼 수 없어요.');
      return;
    }

    const already = await hasAlreadyRequested(myId, targetUserId);
    if (already) {
      Alert.alert('이미 매칭 요청을 보냈어요');
      return;
    }

    await consumeTicketIfNeeded(myId, todaySentCountBeforeThis);

    const { matchId, roomId } = await createMatchRequest(myId, targetUserId);

    // Push to target (best-effort). DB trigger already inserts notifications row for target.
    try {
      const myNicknameForTarget = await getUserNickname(myId);
      await requestPushSend({
        mode: 'latest_by_related',
        recipientUserId: targetUserId,
        type: 'match',
        relatedId: matchId,
        route: { pathname: '/chat-room', params: { roomId, nickname: myNicknameForTarget } },
      });
    } catch {
      // ignore
    }

    const { data: meAfterMatch, error: mePointsError } = await supabase
      .from('users')
      .select('points')
      .eq('id', myId)
      .maybeSingle();
    if (mePointsError) throw mePointsError;
    const prevPoints = typeof (meAfterMatch as any)?.points === 'number' ? (meAfterMatch as any).points : 0;
    const { error: rewardError } = await supabase
      .from('users')
      .update({ points: prevPoints + 5 })
      .eq('id', myId);
    if (rewardError) throw rewardError;
    const { error: matchLogError } = await supabase.from('point_logs').insert({
      user_id: myId,
      amount: 5,
      reason: 'match_request',
    });
    if (matchLogError) throw matchLogError;

    await insertMyNotification({
      userId: myId,
      type: 'point',
      content: '매칭 요청 +5p 적립됐어요',
      related_id: matchId,
    });

    const nickname = await getUserNickname(targetUserId);

    const freeMsg = getFreeRemainingMessage(todaySentCountBeforeThis);
    const message = freeMsg ? `${freeMsg}\n채팅방으로 이동할게요.` : '채팅방으로 이동할게요.';

    Alert.alert('매칭이 완료됐어요! 채팅을 시작해보세요', message, [
      {
        text: '확인',
        onPress: () => {
          router.push({ pathname: '/chat-room', params: { roomId, nickname } });
        },
      },
    ]);
  } catch (e: any) {
    if (e?.message === 'NO_TICKET') return;
    Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
  } finally {
    matchRequestInFlight = false;
  }
}

export function confirmMatchRequest(targetUserId: string) {
  if (!targetUserId) return;

  void (async () => {
    if (matchRequestInFlight) return;
    matchRequestInFlight = true;
    try {
      const myId = await getMyUserId();
      if (myId === targetUserId) {
        Alert.alert('처리 실패', '자기 자신에게는 매칭 요청을 보낼 수 없어요.');
        return;
      }

      const todaySentCountBeforeThis = await getTodaySentCount(myId);
      const freeRemaining = Math.max(0, 3 - todaySentCountBeforeThis);
      const title =
        freeRemaining > 0
          ? `매칭권을 사용하시겠어요?\n(일일 무료 ${freeRemaining}회 남음)`
          : '매칭권을 사용하시겠어요?\n(일일 무료 0회 남음, 매칭권 1개 사용)';

      Alert.alert(title, '1 매칭권을 사용해요!', [
        { text: '안할래요', style: 'cancel' },
        {
          text: '사용할게요',
          onPress: () => {
            void runMatchRequest(targetUserId, { myId, todaySentCount: todaySentCountBeforeThis });
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      matchRequestInFlight = false;
    }
  })();
}

