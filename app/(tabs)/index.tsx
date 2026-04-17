import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Image as RNImage,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { supabase } from '../../supabase';

type FeedTab = '일반' | '바디';

type PostUser = {
  id: string;
  nickname: string | null;
  mbti: string | null;
  sports: string[] | null;
  workout_frequency: string | null;
  workout_goals: string[] | null;
  profile_image_url: string | null;
};

type PostFeedRow = {
  id: string;
  user_id: string;
  content: string | null;
  post_type: FeedTab;
  image_urls: string[] | null;
  created_at: string;
  user?: PostUser | null;
  display_image_urls: string[];
};

type Banner = {
  id: string;
  titleTop: string;
  titleMain: string;
};

type TagKind = 'sport' | 'frequency' | 'goal';
type TagItem = { kind: TagKind; label: string };

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BANNER_RATIO = 240 / 670;
const MAX_FEED_WIDTH_WEB = 430;

export default function HomeScreen() {
  const router = useRouter();
  const tabBarHeight = useBottomTabBarHeight();
  const [selectedTab, setSelectedTab] = useState<FeedTab>('일반');
  const [posts, setPosts] = useState<PostFeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedListWidth, setFeedListWidth] = useState(0);
  const [bannerWidth, setBannerWidth] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [feedBarHeight, setFeedBarHeight] = useState(0);
  const [bannerWrapHeight, setBannerWrapHeight] = useState(0);

  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [composeModalVisible, setComposeModalVisible] = useState(false);
  const [openingProfile, setOpeningProfile] = useState(false);

  const openUserProfileWithPoints = useCallback(
    (targetUserId: string) => {
      if (!targetUserId) return;
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

                const { data: me, error: meError } = await supabase
                  .from('users')
                  .select('points')
                  .eq('id', user.id)
                  .maybeSingle();
                if (meError) throw meError;

                const currentPoints = typeof (me as any)?.points === 'number' ? (me as any).points : 0;
                if (currentPoints < 10) {
                  Alert.alert('포인트 부족', '포인트가 부족해서 프로필을 열람할 수 없어요.');
                  return;
                }

                const { error: updateError } = await supabase
                  .from('users')
                  .update({ points: currentPoints - 10 })
                  .eq('id', user.id);
                if (updateError) throw updateError;

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

  const bannerHeight = useMemo(() => {
    return bannerWidth > 0 ? Math.round(bannerWidth * BANNER_RATIO) : 0;
  }, [bannerWidth]);

  const cardHeight = useMemo(() => {
    const taken = headerHeight + feedBarHeight + bannerWrapHeight + tabBarHeight;
    const remaining = Math.floor(SCREEN_HEIGHT - taken);
    return remaining > 0 ? remaining : 0;
  }, [bannerWrapHeight, feedBarHeight, headerHeight, tabBarHeight]);

  const photoHeight = useMemo(() => {
    return cardHeight > 0 ? Math.round(cardHeight * 0.72) : 0;
  }, [cardHeight]);

  const cardWidth = useMemo(() => {
    return feedListWidth > 0 ? Math.floor(feedListWidth) : 0;
  }, [feedListWidth]);

  const loadBanners = useCallback(async (): Promise<Banner[]> => {
    // TODO: Supabase 연동 예정
    // Temporary dummy banner (design reference)
    return [{ id: 'dummy_event', titleTop: 'EVENT', titleMain: '' }];
  }, []);

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

  const loadFeedPosts = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const myId = user?.id ?? null;

      let query = supabase
        .from('posts')
        .select(`
          id,
          user_id,
          content,
          post_type,
          image_urls,
          created_at
        `)
        .eq('post_type', selectedTab)
        .order('created_at', { ascending: false })
        .limit(50);

      if (myId) query = query.neq('user_id', myId);

      const { data, error } = await query;
      if (error) {
        console.log('[HomeFeed] posts query error', {
          message: (error as any)?.message,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
          code: (error as any)?.code,
        });
        throw error;
      }

      const list = (data ?? []) as Omit<PostFeedRow, 'display_image_urls'>[];
      console.log('[HomeFeed] posts query ok', {
        selectedTab,
        myId,
        count: list.length,
        sample: list[0] ? { id: list[0].id, user_id: list[0].user_id } : null,
      });

      const userIds = Array.from(
        new Set(list.map((p) => p.user_id).filter((id): id is string => typeof id === 'string' && id.length > 0))
      );

      let usersById = new Map<string, PostUser>();
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id,nickname,mbti,sports,workout_goals,workout_frequency,profile_image_url')
          .in('id', userIds);
        if (usersError) throw usersError;

        const usersList = (usersData ?? []) as PostUser[];
        usersById = new Map(usersList.map((u) => [u.id, u]));
      }

      const resolved = await Promise.all(
        list.map(async (p) => {
          const resolvedUrls = await resolveImageUrls(p.image_urls);
          const original = (p.image_urls ?? []).filter(Boolean) as string[];
          return {
            ...p,
            user: usersById.get(p.user_id) ?? null,
            // If resolving fails (signed/public URL), still try to render original values
            // so "image_urls exists => show image" holds.
            display_image_urls: resolvedUrls.length > 0 ? resolvedUrls : original,
          };
        })
      );
      setPosts(resolved);
      console.log('[HomeFeed] posts resolved', {
        count: resolved.length,
        sampleThumb: resolved[0]?.display_image_urls?.[0] ?? null,
      });
    } catch (e: any) {
      console.log('[HomeFeed] loadFeedPosts failed', e?.message ?? e);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [resolveImageUrls, selectedTab]);

  useEffect(() => {
    void loadFeedPosts();
  }, [loadFeedPosts]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await loadBanners();
        if (!mounted) return;
        setBanners(list);
        setCurrentBannerIndex(0);
      } catch {
        if (!mounted) return;
        setBanners([]);
        setCurrentBannerIndex(0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadBanners]);

  const toggleLike = useCallback((id: string) => {
    setLikedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const renderCard = useCallback(
    ({ item }: { item: PostFeedRow }) => {
      if (cardWidth === 0 || cardHeight === 0 || photoHeight === 0) return null;
      const id = String(item.id ?? '');
      const nickname = item.user?.nickname ? String(item.user.nickname) : '알 수 없음';
      const mbti = item.user?.mbti ? String(item.user.mbti) : '';
      const title = mbti ? `${nickname} · ${mbti}` : nickname;
      const thumb = item.display_image_urls?.[0] ?? item.image_urls?.[0] ?? null;

      const tagsAll: TagItem[] = [
        ...(item.user?.sports?.length
          ? item.user.sports.map((s) => ({ kind: 'sport' as const, label: String(s) }))
          : []),
        ...(item.user?.workout_frequency
          ? [{ kind: 'frequency' as const, label: String(item.user.workout_frequency) }]
          : []),
        ...(item.user?.workout_goals?.length
          ? item.user.workout_goals.map((g) => ({ kind: 'goal' as const, label: String(g) }))
          : []),
      ];

      const expanded = !!expandedIds[id];
      const tagsToShow = expanded ? tagsAll : [];

      return (
        <View style={{ width: cardWidth }}>
          <View style={[styles.cardShell, { width: cardWidth, height: cardHeight }]}>
            <ScrollView
              style={{ height: cardHeight }}
              contentContainerStyle={styles.cardScrollContent}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              bounces={false}
            >
              <View style={[styles.photoArea, { width: cardWidth, height: photoHeight }]}>
                {thumb ? (
                  <RNImage
                    source={{ uri: thumb }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                ) : null}
                {!thumb ? <View style={styles.photoPlaceholder} /> : null}

                <Pressable
                  onPress={() => Alert.alert('매칭권을 사용하시겠어요?')}
                  hitSlop={10}
                  style={styles.dumbbellBtn}
                  accessibilityRole="button"
                  accessibilityLabel="매칭권 사용"
                >
                  <MaterialCommunityIcons name="dumbbell" size={24} color="#FFFFFF" />
                </Pressable>

                <Pressable
                  onPress={() => toggleLike(id)}
                  hitSlop={10}
                  style={styles.heartBtn}
                  accessibilityRole="button"
                  accessibilityLabel="하트"
                >
                  <Feather name="heart" size={20} color={likedIds[id] ? '#FF3B30' : '#BDBDBD'} />
                </Pressable>
              </View>

              {/* 게시물 글 */}
              {item.content?.trim() ? <Text style={styles.cardContent}>{item.content}</Text> : null}

              {/* 닉네임 · MBTI + 프로필/확장 */}
              <View style={styles.infoTopRow}>
                <Text style={styles.userTitle} numberOfLines={1}>
                  {title}
                </Text>

                <View style={styles.infoRight}>
                  <Pressable
                    onPress={() => openUserProfileWithPoints(String(item.user_id ?? ''))}
                    style={styles.profileBtn}
                    accessibilityRole="button"
                    accessibilityLabel="프로필 보기"
                  >
                    <Text style={styles.profileBtnText}>프로필 보기</Text>
                    <Feather name="chevron-right" size={16} color="#FFFFFF" />
                  </Pressable>

                  <Pressable
                    onPress={() => toggleExpanded(id)}
                    hitSlop={10}
                    style={styles.expandBtn}
                    accessibilityRole="button"
                    accessibilityLabel="태그 펼치기/접기"
                  >
                    <Text style={styles.expandText}>{expanded ? '∨' : '∧'}</Text>
                  </Pressable>
                </View>
              </View>

              {expanded ? (
                <View style={styles.tagsRow}>
                  {tagsToShow.length === 0 ? (
                    <View style={styles.tagPill}>
                      <Text style={styles.tagText}>태그 없음</Text>
                    </View>
                  ) : (
                    tagsToShow.map((t, idx) => (
                      <View key={`${t.kind}_${t.label}_${idx}`} style={styles.tagPill}>
                        {t.kind === 'sport' ? (
                          <MaterialCommunityIcons name="dumbbell" size={13} color="#6B7280" />
                        ) : t.kind === 'frequency' ? (
                          <Feather name="zap" size={13} color="#6B7280" />
                        ) : (
                          <Feather name="check-square" size={13} color="#6B7280" />
                        )}
                        <Text style={styles.tagText}>{t.label}</Text>
                      </View>
                    ))
                  )}
                </View>
              ) : null}

              <Pressable
                onPress={() => Alert.alert('매칭권을 사용하시겠어요?')}
                style={styles.matchBtn}
                accessibilityRole="button"
                accessibilityLabel="매칭하기"
              >
                <Text style={styles.matchBtnText}>매칭하기</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      );
    },
    [cardHeight, cardWidth, expandedIds, likedIds, photoHeight, toggleExpanded, toggleLike]
  );

  const renderBanner = useCallback(({ item }: { item: Banner }) => {
    return (
      <View
        style={[
          styles.bannerCard,
          bannerWidth ? { width: bannerWidth } : null,
          bannerHeight ? { height: bannerHeight } : null,
        ]}
      >
        <View style={styles.bannerLeft}>
          <Text style={styles.bannerEvent}>{item.titleTop}</Text>
          {item.titleMain ? <Text style={styles.bannerTitle}>{item.titleMain}</Text> : null}
        </View>

        <View style={styles.bannerRight}>
          <View style={[styles.ticket, styles.ticketBack]}>
            <Text style={styles.ticketText}>POINT</Text>
          </View>
          <View style={[styles.ticket, styles.ticketFront]}>
            <Text style={styles.ticketText}>1 POINT</Text>
            <View style={styles.ticketBadge}>
              <Feather name="heart" size={12} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <Text style={styles.bannerPager}>
          {banners.length === 0 ? '' : `${currentBannerIndex + 1} / ${banners.length}`}
        </Text>
      </View>
    );
  }, [bannerHeight, bannerWidth, banners.length, currentBannerIndex]);

  const onBannerMomentumEnd = useCallback((e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const denom = bannerWidth > 0 ? bannerWidth : SCREEN_WIDTH - 32;
    const idx = Math.round(x / denom);
    setCurrentBannerIndex(Math.max(0, Math.min(idx, Math.max(0, banners.length - 1))));
  }, [bannerWidth, banners.length]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
        <View
          style={styles.header}
          onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <Pressable
            onPress={() => {}}
            hitSlop={10}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="상점"
          >
            <Feather name="award" size={22} color="#111111" />
          </Pressable>

          <Text style={styles.headerTitle}>fitting</Text>

          <Pressable
            onPress={() => {}}
            hitSlop={10}
            style={styles.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="알림"
          >
            <Feather name="bell" size={22} color="#111111" />
          </Pressable>
        </View>

        <View
          style={styles.feedBar}
          onLayout={(e) => setFeedBarHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.tabs}>
            <Pressable onPress={() => setSelectedTab('일반')} hitSlop={10}>
              <Text
                style={[
                  styles.tabText,
                  selectedTab === '일반' ? styles.tabActive : styles.tabInactive,
                ]}
              >
                일반
              </Text>
            </Pressable>
            <Pressable onPress={() => setSelectedTab('바디')} hitSlop={10}>
              <Text
                style={[
                  styles.tabText,
                  selectedTab === '바디' ? styles.tabActive : styles.tabInactive,
                ]}
              >
                바디
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setComposeModalVisible(true)}
            style={styles.composeBtn}
            accessibilityRole="button"
            accessibilityLabel="게시물 작성"
          >
            <Feather name="edit-2" size={18} color="#FFFFFF" />
          </Pressable>
        </View>

      <Modal
        visible={composeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setComposeModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setComposeModalVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>게시물을 작성하시겠어요?</Text>
            <Text style={styles.modalDesc}>일반 피드 하루 2회, 바디 피드 하루 2회 무료</Text>

            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={() => {
                setComposeModalVisible(false);
                router.push('/post-create');
              }}
              accessibilityRole="button"
              accessibilityLabel="작성할게요"
            >
              <Text style={styles.modalPrimaryBtnText}>작성할게요</Text>
            </Pressable>

            <Pressable
              style={styles.modalTextBtn}
              onPress={() => setComposeModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="안할래요"
            >
              <Text style={styles.modalTextBtnText}>안할래요</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        style={[styles.bannerWrap, bannerHeight ? { height: bannerHeight } : null]}
        onLayout={(e) => {
          setBannerWidth(e.nativeEvent.layout.width);
          setBannerWrapHeight(e.nativeEvent.layout.height);
        }}
      >
        {banners.length === 0 ? (
          <View style={[styles.bannerPlaceholder, bannerHeight ? { height: bannerHeight } : null]} />
        ) : (
          <FlatList
            data={banners}
            keyExtractor={(item) => item.id}
            renderItem={renderBanner}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
            onMomentumScrollEnd={onBannerMomentumEnd}
          />
        )}
      </View>

      {loading ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>불러오는 중…</Text>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>아직 피드가 없어요</Text>
        </View>
      ) : (
        <FlatList
          key={selectedTab}
          data={posts}
          keyExtractor={(item) => item.id}
          renderItem={(info) => {
            if (info.index === 0) {
              const thumb =
                info.item.display_image_urls?.[0] ?? info.item.image_urls?.[0] ?? null;
              console.log('[HomeFeed] renderItem debug', {
                id: info.item.id,
                user: info.item.user,
                image_urls: info.item.image_urls,
                display_image_urls: info.item.display_image_urls,
                thumb,
              });
            }
            if (cardWidth === 0 || cardHeight === 0) return null;
            return renderCard(info);
          }}
          style={styles.feedList}
          contentContainerStyle={[styles.feedListContent, { paddingBottom: 100 }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            // Only constrain width on web; on native, FlatList width should match the viewport width.
            setFeedListWidth(Platform.OS === 'web' ? Math.min(w, MAX_FEED_WIDTH_WEB) : Math.floor(w));
            console.log('[HomeFeed] FlatList layout', {
              w,
              h: e.nativeEvent.layout.height,
            });
          }}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={false}
          initialNumToRender={3}
          windowSize={5}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },

  feedBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  tabText: {
    fontSize: 22,
  },
  tabActive: {
    color: '#111111',
    fontWeight: 'bold',
  },
  tabInactive: {
    color: '#9CA3AF',
  },
  composeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  bannerPlaceholder: {
    height: 1,
  },
  bannerCard: {
    width: SCREEN_WIDTH - 32,
    borderRadius: 18,
    backgroundColor: '#5B4FE9',
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bannerLeft: {
    paddingRight: 140,
  },
  bannerEvent: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 10,
    lineHeight: 26,
  },
  bannerRight: {
    position: 'absolute',
    right: 14,
    top: 32,
    width: 160,
    height: 90,
  },
  ticket: {
    position: 'absolute',
    width: 108,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  ticketBack: {
    right: 0,
    top: 18,
    transform: [{ rotate: '12deg' }],
    opacity: 0.9,
  },
  ticketFront: {
    right: 44,
    top: 6,
    transform: [{ rotate: '-10deg' }],
  },
  ticketText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '900',
  },
  ticketBadge: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPager: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(0,0,0,0.45)',
    fontSize: 14,
    fontWeight: '700',
  },

  cardShell: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    position: 'relative',
  },
  photoArea: {
    backgroundColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#E5E7EB',
  },
  dumbbellBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 6,
  },

  cardContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    lineHeight: 20,
  },
  infoTopRow: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  userTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  infoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: MAIN,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
  },
  profileBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  expandBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  expandText: {
    color: '#111111',
    fontSize: 12,
    fontWeight: '700',
    marginTop: -1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '700',
  },
  matchBtn: {
    backgroundColor: MAIN,
    borderRadius: 12,
    marginHorizontal: 14,
    marginVertical: 12,
    paddingTop: 14,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '600',
  },

  feedList: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' ? { maxWidth: MAX_FEED_WIDTH_WEB } : {}),
  },
  feedListContent: {
    paddingBottom: 16,
  },

  cardScrollContent: {
    paddingBottom: 80,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  modalDesc: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 18,
  },
  modalPrimaryBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  modalTextBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modalTextBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
});
