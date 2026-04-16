import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type PostRow = {
  id: string;
  user_id: string;
  content: string | null;
  post_type: '일반' | '바디';
  image_urls: string[] | null;
  created_at: string;
  user?: {
    id?: string | null;
    nickname?: string | null;
    mbti?: string | null;
    profile_image_url?: string | null;
  } | null;
};

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PostDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const postId = useMemo(() => String(params.id ?? ''), [params.id]);

  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<PostRow | null>(null);
  const [displayUrls, setDisplayUrls] = useState<string[]>([]);

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
    if (!postId) return;

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('posts')
          .select(`
            id,
            user_id,
            content,
            post_type,
            image_urls,
            created_at,
            user:users(id, nickname, mbti, sports, workout_goals, workout_frequency, profile_image_url)
          `)
          .eq('id', postId)
          .maybeSingle();
        if (error) throw error;
        if (!mounted) return;

        const row = (data ?? null) as PostRow | null;
        setPost(row);
        setDisplayUrls(await resolveImageUrls(row?.image_urls));
      } catch (e: any) {
        if (!mounted) return;
        setPost(null);
        setDisplayUrls([]);
        Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [postId, resolveImageUrls]);

  const title = useMemo(() => {
    const nickname = post?.user?.nickname ? String(post.user.nickname) : '핏친';
    const mbti = post?.user?.mbti ? String(post.user.mbti) : '';
    return mbti ? `${nickname} · ${mbti}` : nickname;
  }, [post?.user?.mbti, post?.user?.nickname]);

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
        <Text style={styles.topTitle}>게시물</Text>
        <View style={styles.topRightSpace} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>불러오는 중…</Text>
        </View>
      ) : !post ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>게시물을 찾을 수 없어요</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.author}>{title}</Text>

          {displayUrls.length === 0 ? (
            <View style={styles.heroPlaceholder} />
          ) : (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {displayUrls.map((u, idx) => (
                <Image
                  key={`${u}_${idx}`}
                  source={{ uri: u }}
                  style={[styles.heroImage, { width: SCREEN_WIDTH - 32 }]}
                  contentFit="cover"
                  transition={150}
                />
              ))}
            </ScrollView>
          )}

          <View style={styles.body}>
            <Text style={styles.contentText}>{post.content?.trim() ? post.content : ' '}</Text>
          </View>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{post.post_type}</Text>
            </View>
            <View style={[styles.badge, styles.badgeAccent]}>
              <Text style={[styles.badgeText, styles.badgeTextAccent]}>fitting</Text>
            </View>
          </View>
        </ScrollView>
      )}
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
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  topIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  topRightSpace: {
    width: 44,
    height: 44,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  centerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  author: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
  },
  heroPlaceholder: {
    width: '100%',
    height: 360,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  heroImage: {
    width: '100%',
    height: 360,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  body: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  contentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    lineHeight: 20,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  badgeAccent: {
    borderColor: 'rgba(59,59,249,0.25)',
    backgroundColor: 'rgba(59,59,249,0.10)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },
  badgeTextAccent: {
    color: MAIN,
  },
});

