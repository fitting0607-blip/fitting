import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../supabase';
import { useMatchModal } from './hooks/useMatchModal';
import { usePostLike } from './hooks/usePostLike';

type PublicUser = {
  id: string;
  nickname: string | null;
  mbti: string | null;
  profile_image_url: string | null;
  sports: string[] | null;
  workout_goals: string[] | null;
  workout_frequency: string | null;
};

type PostRow = {
  id: string;
  user_id: string;
  post_type: '일반' | '바디';
  image_urls: string[] | null;
  created_at: string;
};

type PostRowResolved = PostRow & {
  display_image_urls: string[];
};

type FeedTab = '일반' | '바디';

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_ITEM = Math.floor((SCREEN_WIDTH - 16 * 2 - GRID_GAP * 2) / 3);

export default function UserProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const userId = useMemo(() => String(params.userId ?? ''), [params.userId]);
  const { MatchModal, openMatchModal } = useMatchModal();
  const { likedIds, loadMyLikesForPostIds, handleToggleLike, LikeModal } = usePostLike();

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<PostRowResolved[]>([]);
  const [countNormal, setCountNormal] = useState(0);
  const [countBody, setCountBody] = useState(0);
  const [feedTab, setFeedTab] = useState<FeedTab>('일반');
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockingBusy, setBlockingBusy] = useState(false);

  const resolveImageUrls = useCallback(async (urls: string[] | null | undefined) => {
    const list = (urls ?? []).filter(Boolean);
    if (list.length === 0) return [];

    const resolved = await Promise.all(
      list.map(async (u) => {
        if (typeof u !== 'string') return null;
        if (u.startsWith('http://') || u.startsWith('https://')) return u;

        const { data, error } = await supabase.storage.from('posts').createSignedUrl(u, 60 * 60);
        if (!error && data?.signedUrl) return data.signedUrl;

        const pub = supabase.storage.from('posts').getPublicUrl(u).data?.publicUrl;
        return pub || null;
      })
    );

    return resolved.filter(Boolean) as string[];
  }, []);

  useEffect(() => {
    if (!userId) return;

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        const myId = authUser?.id ?? null;
        setViewerId(myId);

        const { data: u, error: uError } = await supabase
          .from('users')
          .select('id,nickname,mbti,profile_image_url,sports,workout_goals,workout_frequency')
          .eq('id', userId)
          .maybeSingle();
        if (uError) throw uError;

        if (myId && userId && myId !== userId) {
          const { data: b, error: bError } = await supabase
            .from('blocks')
            .select('id')
            .eq('blocker_id', myId)
            .eq('blocked_id', userId)
            .maybeSingle();
          if (bError && (bError as any)?.code !== 'PGRST116') throw bError;
          setIsBlocked(Boolean(b?.id));
        } else {
          setIsBlocked(false);
        }

        const { data: p, error: pError } = await supabase
          .from('posts')
          .select('id,user_id,post_type,image_urls,created_at')
          .eq('user_id', userId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false });
        if (pError) throw pError;

        const list = (p ?? []) as PostRow[];
        const resolved = await Promise.all(
          list.map(async (row) => ({
            ...row,
            display_image_urls: await resolveImageUrls(row.image_urls),
          }))
        );

        let n = 0;
        let b = 0;
        for (const row of list) {
          if (row.post_type === '일반') n += 1;
          if (row.post_type === '바디') b += 1;
        }

        if (!mounted) return;
        setUser((u ?? null) as PublicUser | null);
        setPosts(resolved);
        setCountNormal(n);
        setCountBody(b);

        const postIds = list
          .map((row) => String(row.id ?? '').trim())
          .filter((pid) => pid.length > 0);
        await loadMyLikesForPostIds(postIds, myId);
      } catch (e: any) {
        if (!mounted) return;
        setUser(null);
        setPosts([]);
        setCountNormal(0);
        setCountBody(0);
        setViewerId(null);
        setIsBlocked(false);
        void loadMyLikesForPostIds([], null);
        Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadMyLikesForPostIds, resolveImageUrls, userId]);

  const title = useMemo(() => {
    const nickname = user?.nickname ? String(user.nickname) : loading ? '불러오는 중…' : '사용자';
    const mbti = user?.mbti ? String(user.mbti) : '';
    return mbti ? `${nickname} · ${mbti}` : nickname;
  }, [loading, user?.mbti, user?.nickname]);

  const tags = useMemo(() => {
    const parts: string[] = [];
    if (user?.sports?.length) parts.push(...user.sports);
    if (user?.workout_goals?.length) parts.push(...user.workout_goals);
    if (user?.workout_frequency) parts.push(user.workout_frequency);
    return parts;
  }, [user]);

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => p.post_type === feedTab);
  }, [feedTab, posts]);

  const showLikeOnPosts = Boolean(viewerId && userId && viewerId !== userId);
  const showBlockBtn = Boolean(viewerId && userId && viewerId !== userId);

  const toggleBlock = useCallback(() => {
    if (!viewerId || !userId || viewerId === userId) return;
    if (blockingBusy) return;

    const nextIsBlocked = !isBlocked;
    Alert.alert(
      nextIsBlocked ? '차단할까요?' : '차단 해제할까요?',
      nextIsBlocked ? '차단하면 상대방의 게시물이 홈 피드에서 숨겨져요.' : '차단을 해제합니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: nextIsBlocked ? '차단' : '해제',
          style: nextIsBlocked ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              setBlockingBusy(true);
              try {
                if (nextIsBlocked) {
                  const { error } = await supabase.from('blocks').insert({
                    blocker_id: viewerId,
                    blocked_id: userId,
                  });
                  if (error) throw error;
                  setIsBlocked(true);
                  Alert.alert('차단 완료', '차단했어요.');
                } else {
                  const { error } = await supabase
                    .from('blocks')
                    .delete()
                    .eq('blocker_id', viewerId)
                    .eq('blocked_id', userId);
                  if (error) throw error;
                  setIsBlocked(false);
                  Alert.alert('차단 해제', '차단을 해제했어요.');
                }
              } catch (e: any) {
                Alert.alert('처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
              } finally {
                setBlockingBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [blockingBusy, isBlocked, userId, viewerId]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.topIconBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>

        <View style={styles.topRight}>
          <Pressable
            onPress={() => router.push({ pathname: '/report', params: { targetId: userId } })}
            hitSlop={10}
            style={styles.topIconBtn}
            accessibilityRole="button"
            accessibilityLabel="신고"
          >
            <Feather name="alert-triangle" size={20} color="#111111" />
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.profileRow}>
          <View style={styles.avatarWrap}>
            {user?.profile_image_url ? (
              <Image source={{ uri: user.profile_image_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Feather name="user" size={24} color="#9CA3AF" />
              </View>
            )}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.nickname} numberOfLines={1}>
              {title}
            </Text>

            <View style={styles.tagRow}>
              {tags.length === 0 ? (
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>태그 없음</Text>
                </View>
              ) : (
                tags.map((t, idx) => (
                  <View key={`${t}_${idx}`} style={styles.tagPill}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        <View style={styles.countBox}>
          <View style={styles.countCol}>
            <Text style={styles.countNumber}>{countNormal}</Text>
            <Text style={styles.countLabel}>일반 게시글</Text>
          </View>
          <View style={styles.countDivider} />
          <View style={styles.countCol}>
            <Text style={styles.countNumber}>{countBody}</Text>
            <Text style={styles.countLabel}>바디 게시글</Text>
          </View>
        </View>

        <View style={styles.feedTabs}>
          <Pressable
            onPress={() => setFeedTab('일반')}
            hitSlop={10}
            style={styles.feedTabBtn}
            accessibilityRole="button"
            accessibilityLabel="일반 탭"
          >
            <Text style={styles.feedTabIcon}>⊞</Text>
            <Text style={[styles.feedTabText, feedTab === '일반' ? styles.feedTabTextActive : null]}>일반</Text>
            {feedTab === '일반' ? <View style={styles.feedUnderline} /> : null}
          </Pressable>

          <Pressable
            onPress={() => setFeedTab('바디')}
            hitSlop={10}
            style={styles.feedTabBtn}
            accessibilityRole="button"
            accessibilityLabel="바디 탭"
          >
            <Text style={styles.feedTabIcon}>💪</Text>
            <Text style={[styles.feedTabText, feedTab === '바디' ? styles.feedTabTextActive : null]}>바디</Text>
            {feedTab === '바디' ? <View style={styles.feedUnderline} /> : null}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>불러오는 중…</Text>
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>게시물이 없어요</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={styles.gridList}
            columnWrapperStyle={styles.gridRow}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const thumb = item.display_image_urls?.[0] ?? null;
              const postKey = String(item.id ?? '');
              const liked = !!likedIds[postKey];
              return (
                <View style={styles.gridCell}>
                  <Pressable
                    style={styles.gridItem}
                    onPress={() => router.push({ pathname: '/post-detail', params: { id: item.id } })}
                    accessibilityRole="button"
                    accessibilityLabel="게시물 썸네일"
                  >
                    {thumb ? (
                      <Image source={{ uri: thumb }} style={styles.gridImage} contentFit="cover" transition={120} />
                    ) : (
                      <View style={styles.gridPlaceholder} />
                    )}
                  </Pressable>
                  {showLikeOnPosts ? (
                    <Pressable
                      onPress={() => void handleToggleLike(postKey, userId)}
                      hitSlop={8}
                      style={styles.gridHeartBtn}
                      accessibilityRole="button"
                      accessibilityLabel="좋아요"
                    >
                      <Feather name="heart" size={16} color={liked ? '#FF3B30' : '#BDBDBD'} />
                    </Pressable>
                  ) : null}
                </View>
              );
            }}
          />
        )}
      </View>

      <View style={styles.bottomBar}>
        <View style={styles.bottomRow}>
          <Pressable
            onPress={() => openMatchModal(userId)}
            style={styles.matchBtn}
            accessibilityRole="button"
            accessibilityLabel="매칭하기"
          >
            <Text style={styles.matchBtnText}>매칭하기</Text>
          </Pressable>

          {showBlockBtn ? (
            <Pressable
              onPress={toggleBlock}
              style={[styles.blockBtn, isBlocked ? styles.blockBtnOn : null]}
              accessibilityRole="button"
              accessibilityLabel="차단"
            >
              <Text style={[styles.blockBtnText, isBlocked ? styles.blockBtnTextOn : null]}>
                {blockingBusy ? '처리 중…' : isBlocked ? '차단 해제' : '차단'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <LikeModal />
      <MatchModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  profileRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    paddingTop: 6,
  },
  avatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nickname: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111111',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagPill: {
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },

  countBox: {
    marginTop: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111111',
  },
  countLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  countDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#E5E7EB',
  },

  feedTabs: {
    marginTop: 12,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  feedTabBtn: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  feedTabIcon: {
    fontSize: 18,
  },
  feedTabText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6B7280',
  },
  feedTabTextActive: {
    color: '#111111',
  },
  feedUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: '100%',
    backgroundColor: '#111111',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },

  gridList: {
    paddingTop: 10,
    paddingBottom: 110,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridCell: {
    width: GRID_ITEM,
    height: GRID_ITEM,
    position: 'relative',
  },
  gridItem: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  gridHeartBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 10,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  matchBtn: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  blockBtn: {
    width: 96,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBtnOn: {
    backgroundColor: '#111111',
  },
  blockBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111111',
  },
  blockBtnTextOn: {
    color: '#FFFFFF',
  },
});

