import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type PublicUser = {
  id: string;
  email: string | null;
  nickname: string | null;
  gender: string | null;
  age: number | null;
  mbti: string | null;
  profile_image_url: string | null;
  sports: string[] | null;
  workout_goals: string[] | null;
  workout_frequency: string | null;
  points: number | null;
  matching_tickets: number | null;
  is_trainer: boolean | null;
};

type FeedTab = 'grid' | 'body';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const GRID_ITEM = Math.floor((SCREEN_WIDTH - 16 * 2 - GRID_GAP * 2) / 3);

export default function MyScreen() {
  const router = useRouter();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [feedTab, setFeedTab] = useState<FeedTab>('grid');
  const [posts, setPosts] = useState<PostRowResolved[]>([]);
  const [countNormal, setCountNormal] = useState(0);
  const [countBody, setCountBody] = useState(0);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setMe(null);
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select(
          'id,email,nickname,gender,age,mbti,profile_image_url,sports,workout_goals,workout_frequency,points,matching_tickets,is_trainer'
        )
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      setMe((data ?? null) as PublicUser | null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveImageUrls = useCallback(async (urls: string[] | null | undefined) => {
    const list = (urls ?? []).filter(Boolean);
    if (list.length === 0) return [];

    const resolved = await Promise.all(
      list.map(async (u) => {
        if (typeof u !== 'string') return null;
        if (u.startsWith('http://') || u.startsWith('https://')) return u;

        // If `image_urls` stores storage paths (e.g. "{user_id}/{ts}_0.jpg"),
        // generate a signed URL so it works even when the bucket isn't public.
        const { data, error } = await supabase.storage.from('posts').createSignedUrl(u, 60 * 60);
        if (!error && data?.signedUrl) return data.signedUrl;

        // Fallback: attempt public URL (works when bucket is public)
        const pub = supabase.storage.from('posts').getPublicUrl(u).data?.publicUrl;
        return pub || null;
      })
    );

    return resolved.filter(Boolean) as string[];
  }, []);

  const loadMyPosts = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setPosts([]);
        setCountNormal(0);
        setCountBody(0);
        return;
      }

      const { data, error } = await supabase
        .from('posts')
        .select('id,user_id,post_type,image_urls,created_at')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const list = (data ?? []) as PostRow[];
      const resolved = await Promise.all(
        list.map(async (p) => ({
          ...p,
          display_image_urls: await resolveImageUrls(p.image_urls),
        }))
      );
      setPosts(resolved);

      let n = 0;
      let b = 0;
      for (const p of list) {
        if (p.post_type === '일반') n += 1;
        if (p.post_type === '바디') b += 1;
      }
      setCountNormal(n);
      setCountBody(b);
    } catch {
      setPosts([]);
      setCountNormal(0);
      setCountBody(0);
    }
  }, [resolveImageUrls]);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
      void loadMyPosts();
    }, [loadMe, loadMyPosts])
  );

  const tags = useMemo(() => {
    const parts: string[] = [];
    if (me?.sports?.length) parts.push(...me.sports);
    if (me?.workout_goals?.length) parts.push(...me.workout_goals);
    if (me?.workout_frequency) parts.push(me.workout_frequency);
    return parts;
  }, [me]);

  const tagsToShow = useMemo(() => {
    if (tagsExpanded) return tags;
    return tags.slice(0, 4);
  }, [tags, tagsExpanded]);

  const filteredPosts = useMemo(() => {
    const targetType = feedTab === 'grid' ? '일반' : '바디';
    return posts.filter((p) => p.post_type === targetType);
  }, [feedTab, posts]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>마이</Text>
        <Pressable
          onPress={() => router.push('/settings')}
          hitSlop={10}
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="설정"
        >
          <Feather name="settings" size={22} color="#111111" />
        </Pressable>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <View style={styles.avatarWrap}>
            {me?.profile_image_url ? (
              <Image source={{ uri: me.profile_image_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Feather name="user" size={22} color="#9CA3AF" />
              </View>
            )}
          </View>

          <View style={{ flex: 1, minHeight: 64, justifyContent: 'center' }}>
            <View style={styles.nameRow}>
              <Text style={styles.nickname} numberOfLines={1}>
                {me?.nickname ?? (loading ? '불러오는 중…' : '사용자')}
              </Text>
              <Pressable
                onPress={() => setTagsExpanded((v) => !v)}
                hitSlop={10}
                style={styles.expandBtn}
                accessibilityRole="button"
                accessibilityLabel="운동 정보 태그 펼치기/접기"
              >
                <Text style={styles.expandText}>{tagsExpanded ? '∧' : '∨'}</Text>
              </Pressable>
            </View>

            {tagsToShow.length > 0 ? (
              <View style={styles.tagRow}>
                {tagsToShow.map((t, idx) => (
                  <View key={`${t}_${idx}`} style={styles.tagPill}>
                    <Text style={styles.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.tagRow}>
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>태그 없음</Text>
                </View>
              </View>
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
          onPress={() => setFeedTab('grid')}
          hitSlop={10}
          style={styles.feedTabBtn}
          accessibilityRole="button"
          accessibilityLabel="일반 피드"
        >
          <Feather name="grid" size={20} color="#111111" />
          {feedTab === 'grid' ? <View style={styles.feedUnderline} /> : null}
        </Pressable>
        <Pressable
          onPress={() => setFeedTab('body')}
          hitSlop={10}
          style={styles.feedTabBtn}
          accessibilityRole="button"
          accessibilityLabel="바디 피드"
        >
          <Text style={styles.bodyIcon}>💪</Text>
          {feedTab === 'body' ? <View style={styles.feedUnderline} /> : null}
        </Pressable>
      </View>

      {filteredPosts.length === 0 ? (
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
            return (
              <Pressable
                style={styles.gridItem}
                onPress={() =>
                  router.push({ pathname: '/post-detail', params: { id: item.id } })
                }
                accessibilityRole="button"
                accessibilityLabel="내 게시물"
              >
                {thumb ? (
                  <Image
                    source={{ uri: thumb }}
                    style={styles.gridImage}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <View style={styles.gridPlaceholder} />
                )}
              </Pressable>
            );
          }}
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileCard: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  profileRow: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nickname: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
  },
  expandBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
    marginTop: -1,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagPill: {
    backgroundColor: '#E5E7EB',
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
    marginTop: 14,
    marginHorizontal: 16,
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
    color: '#3B3BF9',
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
    marginTop: 10,
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  feedTabBtn: {
    flex: 1,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyIcon: {
    fontSize: 18,
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: GRID_ITEM,
    height: GRID_ITEM,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  gridPlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
});
