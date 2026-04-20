import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type BlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
  created_at: string;
};

type PublicUser = {
  id: string;
  nickname: string | null;
  mbti: string | null;
  profile_image_url: string | null;
};

type BlockItem = {
  block: BlockRow;
  user: PublicUser | null;
};

const MAIN = '#3B3BF9';

export default function BlockListScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<BlockItem[]>([]);

  const load = useCallback(() => {
    void (async () => {
      setLoading(true);
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user?.id) throw new Error('로그인이 필요합니다.');

        const { data: blocksData, error: blocksError } = await supabase
          .from('blocks')
          .select('id,blocker_id,blocked_id,created_at')
          .eq('blocker_id', user.id)
          .order('created_at', { ascending: false });
        if (blocksError) throw blocksError;

        const blocks = (blocksData ?? []) as BlockRow[];
        const blockedIds = Array.from(
          new Set(blocks.map((b) => b.blocked_id).filter((id): id is string => typeof id === 'string' && id.length > 0))
        );

        let usersById = new Map<string, PublicUser>();
        if (blockedIds.length > 0) {
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id,nickname,mbti,profile_image_url')
            .in('id', blockedIds);
          if (usersError) throw usersError;
          const users = (usersData ?? []) as PublicUser[];
          usersById = new Map(users.map((u) => [u.id, u]));
        }

        setItems(blocks.map((b) => ({ block: b, user: usersById.get(b.blocked_id) ?? null })));
      } catch (e: any) {
        setItems([]);
        Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const unblock = useCallback((blockedId: string) => {
    Alert.alert('차단 해제', '차단을 해제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '해제',
        onPress: () => {
          void (async () => {
            try {
              const {
                data: { user },
                error: authError,
              } = await supabase.auth.getUser();
              if (authError) throw authError;
              if (!user?.id) throw new Error('로그인이 필요합니다.');

              const { error } = await supabase
                .from('blocks')
                .delete()
                .eq('blocker_id', user.id)
                .eq('blocked_id', blockedId);
              if (error) throw error;

              setItems((prev) => prev.filter((it) => it.block.blocked_id !== blockedId));
            } catch (e: any) {
              Alert.alert('해제 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
            }
          })();
        },
      },
    ]);
  }, []);

  const emptyText = useMemo(() => {
    if (loading) return '불러오는 중…';
    return '차단한 유저가 없어요';
  }, [loading]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>차단목록</Text>
        <View style={styles.headerBtn} />
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.block.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const nickname = item.user?.nickname ? String(item.user.nickname) : '알 수 없음';
            const mbti = item.user?.mbti ? String(item.user.mbti) : '';
            const title = mbti ? `${nickname} · ${mbti}` : nickname;
            const avatar = item.user?.profile_image_url ?? null;
            return (
              <View style={styles.row}>
                <View style={styles.left}>
                  <View style={styles.avatarWrap}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Feather name="user" size={18} color="#9CA3AF" />
                      </View>
                    )}
                  </View>
                  <Text style={styles.title} numberOfLines={1}>
                    {title}
                  </Text>
                </View>

                <Pressable
                  onPress={() => unblock(item.block.blocked_id)}
                  style={styles.unblockBtn}
                  accessibilityRole="button"
                  accessibilityLabel="차단 해제"
                >
                  <Text style={styles.unblockText}>해제</Text>
                </Pressable>
              </View>
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
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
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

  listContent: {
    paddingTop: 10,
    paddingBottom: 16,
  },
  row: {
    height: 68,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  unblockBtn: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

