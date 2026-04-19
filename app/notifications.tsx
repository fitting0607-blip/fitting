import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLocalDateString } from '@/attendance-helpers';
import { insertMyNotification } from '@/notification-insert';
import { supabase } from '@/supabase';

const MAIN = '#6C47FF';
/** 홈 피드 `프로필 보기` 버튼과 동일 */
const FEED_MAIN = '#3B3BF9';

type NotificationRow = {
  id: string;
  type: string;
  content: string;
  is_read: boolean | null;
  related_id: string | null;
  created_at: string;
};

/** DB/enum 대소문자·공백 차이 흡수 */
function normalizeNotificationType(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase();
}

type Section = { title: string; data: NotificationRow[] };

function dateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return getLocalDateString(new Date());
  return getLocalDateString(d);
}

function sectionTitleForDateKey(dateKey: string): string {
  const today = getLocalDateString(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalDateString(yesterdayDate);
  if (dateKey === today) return '오늘';
  if (dateKey === yesterday) return '어제';
  const [y, m, day] = dateKey.split('-').map(Number);
  if (!y || !m || !day) return dateKey;
  return `${y}년 ${m}월 ${day}일`;
}

function buildSections(rows: NotificationRow[]): Section[] {
  const map = new Map<string, NotificationRow[]>();
  for (const row of rows) {
    const key = dateKeyFromIso(row.created_at);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
  return keys.map((k) => ({
    title: sectionTitleForDateKey(k),
    data: map.get(k) ?? [],
  }));
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [openingProfile, setOpeningProfile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, content, is_read, related_id, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      let list = (data ?? []) as NotificationRow[];
      const unreadIds = list.filter((r) => !r.is_read).map((r) => r.id);
      if (unreadIds.length > 0) {
        const { error: upErr } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .in('id', unreadIds);
        if (!upErr) {
          list = list.map((r) => ({ ...r, is_read: true }));
        }
      }
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const sections = useMemo(() => buildSections(rows), [rows]);

  const goBack = useCallback(() => router.back(), [router]);

  const openUserProfileWithPointsFromPostId = useCallback(
    (postId: string | null | undefined) => {
      const pid = String(postId ?? '').trim();
      if (!pid) {
        Alert.alert('안내', '게시물 정보를 찾을 수 없어요.');
        return;
      }

      Alert.alert('프로필을 열람하시겠어요?', '10포인트가 차감됩니다.', [
        { text: '안할래요', style: 'cancel' },
        {
          text: '사용할게요',
          onPress: () => {
            void (async () => {
              if (openingProfile) return;
              setOpeningProfile(true);
              try {
                const {
                  data: { user },
                  error: authError,
                } = await supabase.auth.getUser();
                if (authError) throw authError;
                if (!user?.id) throw new Error('로그인이 필요합니다.');

                const { data: postRow, error: postError } = await supabase
                  .from('posts')
                  .select('user_id')
                  .eq('id', pid)
                  .eq('is_deleted', false)
                  .maybeSingle();
                if (postError) throw postError;

                const targetUserId = String((postRow as { user_id?: string } | null)?.user_id ?? '').trim();
                if (!targetUserId) {
                  Alert.alert('안내', '게시물을 찾을 수 없어요.');
                  return;
                }

                if (targetUserId === user.id) {
                  router.push({ pathname: '/user-profile', params: { userId: targetUserId } });
                  return;
                }

                const { data: me, error: meError } = await supabase
                  .from('users')
                  .select('points')
                  .eq('id', user.id)
                  .maybeSingle();
                if (meError) throw meError;

                const currentPoints = typeof (me as { points?: number })?.points === 'number' ? (me as any).points : 0;
                if (currentPoints < 10) {
                  Alert.alert('포인트 부족', '포인트가 부족해서 프로필을 열람할 수 없어요.');
                  return;
                }

                const { error: updateError } = await supabase
                  .from('users')
                  .update({ points: currentPoints - 10 })
                  .eq('id', user.id);
                if (updateError) throw updateError;

                const { error: logError } = await supabase.from('point_logs').insert({
                  user_id: user.id,
                  amount: -10,
                  reason: 'profile_view',
                });
                if (logError) throw logError;

                await insertMyNotification({
                  userId: user.id,
                  type: 'point',
                  content: '프로필 열람 -10p 차감됐어요',
                  related_id: targetUserId,
                });

                router.push({ pathname: '/user-profile', params: { userId: targetUserId } });
              } catch (e: any) {
                Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
              } finally {
                setOpeningProfile(false);
              }
            })();
          },
        },
      ]);
    },
    [openingProfile, router]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>알림</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={MAIN} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>알림이 없어요</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, index) =>
            item.id ? String(item.id) : `nf-${index}-${item.created_at ?? ''}`
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const k = normalizeNotificationType(item.type);
            const isMatch = k === 'match';
            const isLike = k === 'like';
            const isPoint = k === 'point';
            return (
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  {isMatch ? (
                    <MaterialCommunityIcons name="dumbbell" size={22} color={MAIN} />
                  ) : isLike ? (
                    <Feather name="heart" size={20} color={MAIN} />
                  ) : isPoint ? (
                    <MaterialCommunityIcons name="cash-multiple" size={22} color={MAIN} />
                  ) : (
                    <Feather name="bell" size={20} color={MAIN} />
                  )}
                </View>
                <View style={styles.rowTextCol}>
                  <Text style={styles.rowContent}>{item.content}</Text>
                  <Text style={styles.rowTime}>
                    {new Date(item.created_at).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                {isLike && item.related_id ? (
                  <Pressable
                    onPress={() => openUserProfileWithPointsFromPostId(item.related_id)}
                    style={styles.profileBtn}
                    accessibilityRole="button"
                    accessibilityLabel="프로필 보기"
                  >
                    <Text style={styles.profileBtnText}>프로필 보기</Text>
                    <Feather name="chevron-right" size={16} color="#FFFFFF" />
                  </Pressable>
                ) : null}
              </View>
            );
          }}
          SectionSeparatorComponent={() => <View style={styles.sectionSep} />}
          ItemSeparatorComponent={() => <View style={styles.itemSep} />}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionSep: {
    height: 0,
  },
  itemSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#F3F4F6',
    marginLeft: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 12,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: FEED_MAIN,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  profileBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(108, 71, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
  },
  rowContent: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    lineHeight: 21,
  },
  rowTime: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
});
