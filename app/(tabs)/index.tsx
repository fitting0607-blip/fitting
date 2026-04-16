import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';

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

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BANNER_RATIO = 240 / 670;

export default function HomeScreen() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<FeedTab>('일반');
  const [posts, setPosts] = useState<PostFeedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedListWidth, setFeedListWidth] = useState(0);
  const [bannerWidth, setBannerWidth] = useState(0);

  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [composeModalVisible, setComposeModalVisible] = useState(false);

  const bannerHeight = useMemo(() => {
    return bannerWidth > 0 ? Math.round(bannerWidth * BANNER_RATIO) : 0;
  }, [bannerWidth]);

  const cardHeight = useMemo(() => Math.round(SCREEN_HEIGHT * 0.6), []);
  const photoHeight = useMemo(() => Math.round(cardHeight * 0.65), [cardHeight]);

  const loadBanners = useCallback(async (): Promise<Banner[]> => {
    // TODO: Supabase 연동 예정
    return [];
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

  const cardWidth = useMemo(() => {
    return feedListWidth > 0 ? Math.floor(feedListWidth) : 0;
  }, [feedListWidth]);

  const renderCard = useCallback(
    ({ item }: { item: PostFeedRow }) => {
      if (cardWidth === 0 || cardHeight === 0 || photoHeight === 0) return null;
      const id = String(item.id ?? '');
      const nickname = item.user?.nickname ? String(item.user.nickname) : '알 수 없음';
      const mbti = item.user?.mbti ? String(item.user.mbti) : '';
      const title = mbti ? `${nickname} · ${mbti}` : nickname;
      const thumb = item.display_image_urls?.[0] ?? item.image_urls?.[0] ?? null;

      const tagsAll = [
        ...(item.user?.sports?.length ? item.user.sports.map((s) => String(s)) : []),
        item.user?.workout_frequency ? String(item.user.workout_frequency) : null,
        ...(item.user?.workout_goals?.length ? item.user.workout_goals.map((g) => String(g)) : []),
      ].filter(Boolean) as string[];

      const expanded = !!expandedIds[id];
      const tagsToShow = expanded ? tagsAll : tagsAll.slice(0, 2);

      return (
        <View style={[styles.cardWrap, { width: cardWidth }]}>
          <View style={[styles.card, { height: cardHeight }]}>
            <View style={[styles.photoArea, { height: photoHeight }]}>
              <Image
                source={thumb ? { uri: thumb } : undefined}
                style={styles.photoImage}
                contentFit="cover"
                transition={150}
              />
              {!thumb ? <View style={styles.photoPlaceholder} /> : null}
              <Pressable
                onPress={() => toggleLike(id)}
                hitSlop={10}
                style={styles.heartBtn}
                accessibilityRole="button"
                accessibilityLabel="하트"
              >
                <Feather
                  name="heart"
                  size={20}
                  color={likedIds[id] ? '#FF3B30' : '#BDBDBD'}
                />
              </Pressable>
            </View>

            <View style={styles.infoArea}>
              <View style={styles.infoTopRow}>
                <Text style={styles.userTitle} numberOfLines={1}>
                  {title}
                </Text>

                <View style={styles.infoRight}>
                  <Pressable
                    onPress={() => {}}
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
                    <Text style={styles.expandText}>{expanded ? '∧' : '∨'}</Text>
                  </Pressable>
                </View>
              </View>

              {item.content?.trim() ? (
                <Text style={styles.postContent} numberOfLines={2}>
                  {item.content}
                </Text>
              ) : null}

              <View style={styles.tagsRow}>
                {tagsToShow.length === 0 ? (
                  <View style={styles.tagPill}>
                    <Text style={styles.tagText}>태그 없음</Text>
                  </View>
                ) : (
                  tagsToShow.map((t) => (
                    <View key={t} style={styles.tagPill}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
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
          <Text style={styles.bannerTitle}>{item.titleMain}</Text>
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
        onLayout={(e) => setBannerWidth(e.nativeEvent.layout.width)}
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
          contentContainerStyle={styles.feedListContent}
          onLayout={(e) => {
            setFeedListWidth(e.nativeEvent.layout.width);
            console.log('[HomeFeed] FlatList layout', {
              w: e.nativeEvent.layout.width,
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
    backgroundColor: '#5B3BE6',
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

  cardWrap: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  photoArea: {
    backgroundColor: '#E6E6E6',
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
  },

  infoArea: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  infoTopRow: {
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
    gap: 8,
    marginTop: 10,
  },
  postContent: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    lineHeight: 18,
  },
  tagPill: {
    backgroundColor: '#F1F1F1',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    fontSize: 12,
    color: '#555555',
    fontWeight: '600',
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
  },
  feedListContent: {
    paddingBottom: 16,
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
