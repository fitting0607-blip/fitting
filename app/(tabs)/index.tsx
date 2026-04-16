import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../supabase';

type FeedTab = '일반' | '바디';

type PublicUserRow = {
  id?: string | null;
  nickname?: string | null;
  mbti?: string | null;
  workout_type?: string | null;
  workout_frequency?: string | null;
  workout_goal?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
};

type Banner = {
  id: string;
  titleTop: string;
  titleMain: string;
};

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BANNER_HEIGHT = 160;

export default function HomeScreen() {
  const [selectedTab, setSelectedTab] = useState<FeedTab>('일반');
  const [users, setUsers] = useState<PublicUserRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const cardHeight = useMemo(() => Math.round(SCREEN_HEIGHT * 0.6), []);

  const loadBanners = useCallback(async (): Promise<Banner[]> => {
    // TODO: Supabase 연동 예정
    return [];
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;

      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;

      const list = (data ?? []) as PublicUserRow[];
      const filtered = user?.id
        ? list.filter((u) => (u.id ?? '') !== user.id)
        : list;
      setUsers(filtered);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
    ({ item }: { item: PublicUserRow }) => {
      const id = String(item.id ?? '');
      const nickname = String(item.nickname ?? '핏친');
      const mbti = item.mbti ? String(item.mbti) : '';
      const title = mbti ? `${nickname} · ${mbti}` : nickname;

      const tagsAll = [
        item.workout_type ? String(item.workout_type) : null,
        item.workout_frequency ? String(item.workout_frequency) : null,
        item.workout_goal ? String(item.workout_goal) : null,
      ].filter(Boolean) as string[];

      const expanded = !!expandedIds[id];
      const tagsToShow = expanded ? tagsAll : tagsAll.slice(0, 2);

      return (
        <View style={[styles.cardWrap, { width: SCREEN_WIDTH }]}>
          <View style={[styles.card, { height: cardHeight }]}>
            <View style={styles.photoArea}>
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
    [cardHeight, expandedIds, likedIds, toggleExpanded, toggleLike]
  );

  const renderBanner = useCallback(({ item }: { item: Banner }) => {
    return (
      <View style={styles.bannerCard}>
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
  }, [banners.length, currentBannerIndex]);

  const onBannerMomentumEnd = useCallback((e: any) => {
    const x = e?.nativeEvent?.contentOffset?.x ?? 0;
    const idx = Math.round(x / (SCREEN_WIDTH - 32));
    setCurrentBannerIndex(Math.max(0, Math.min(idx, Math.max(0, banners.length - 1))));
  }, [banners.length]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
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

      <View style={styles.feedBar}>
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
          onPress={() => {}}
          style={styles.composeBtn}
          accessibilityRole="button"
          accessibilityLabel="게시물 작성"
        >
          <Feather name="edit-2" size={18} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.bannerWrap}>
        {banners.length === 0 ? (
          <View style={styles.bannerPlaceholder} />
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
      ) : users.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>아직 주변 핏친이 없어요</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item, index) => String(item.id ?? index)}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={false}
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
    height: BANNER_HEIGHT,
  },
  bannerPlaceholder: {
    height: BANNER_HEIGHT,
  },
  bannerCard: {
    height: BANNER_HEIGHT,
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
    flex: 1,
    backgroundColor: '#E6E6E6',
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
});
