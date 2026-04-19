import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { supabase } from '../../supabase';

type MatchRow = {
  id: string;
  requester_id: string;
  target_id: string;
  created_at: string;
};

type ChatRoomRow = {
  id: string;
  match_id: string;
  created_at: string;
};

type UserRow = {
  id: string;
  nickname: string | null;
  profile_image_url: string | null;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  is_read: boolean | null;
  created_at: string;
};

type ChatListItem = {
  roomId: string;
  matchCreatedAt: string;
  otherUserId: string;
  nickname: string;
  profileImageUrl: string | null;
  lastMessage: string;
  lastMessageAt: string | null;
  unreadCount: number;
};

const MAIN = '#6C47FF';

export default function ChatScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ChatListItem[]>([]);

  const loadChatList = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setItems([]);
        return;
      }

      const myId = user.id;

      // 1) matches where I am requester or target
      const { data: matchesData, error: matchesError } = await supabase
        .from('matches')
        .select('id,requester_id,target_id,created_at')
        .or(`requester_id.eq.${myId},target_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(200);
      if (matchesError) throw matchesError;

      const matches = (matchesData ?? []) as MatchRow[];
      if (matches.length === 0) {
        setItems([]);
        return;
      }

      const matchIds = matches.map((m) => m.id);

      // 2) chat_rooms for these matches
      const { data: roomsData, error: roomsError } = await supabase
        .from('chat_rooms')
        .select('id,match_id,created_at')
        .in('match_id', matchIds);
      if (roomsError) throw roomsError;

      const rooms = (roomsData ?? []) as ChatRoomRow[];
      if (rooms.length === 0) {
        setItems([]);
        return;
      }

      const roomByMatchId = new Map<string, ChatRoomRow>();
      for (const r of rooms) roomByMatchId.set(r.match_id, r);

      const filteredMatches = matches.filter((m) => roomByMatchId.has(m.id));
      const roomIds = Array.from(new Set(filteredMatches.map((m) => roomByMatchId.get(m.id)!.id)));

      // 3) other users
      const otherUserIds = Array.from(
        new Set(
          filteredMatches
            .map((m) => (m.requester_id === myId ? m.target_id : m.requester_id))
            .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== myId)
        )
      );

      let usersById = new Map<string, UserRow>();
      if (otherUserIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id,nickname,profile_image_url')
          .in('id', otherUserIds);
        if (usersError) throw usersError;
        const users = (usersData ?? []) as UserRow[];
        usersById = new Map(users.map((u) => [u.id, u]));
      }

      // 4) last messages (fetch recent and pick per room)
      const { data: recentMessagesData, error: recentMessagesError } = await supabase
        .from('messages')
        .select('id,room_id,sender_id,content,is_read,created_at')
        .in('room_id', roomIds)
        .order('created_at', { ascending: false })
        .limit(400);
      if (recentMessagesError) throw recentMessagesError;
      const recentMessages = (recentMessagesData ?? []) as MessageRow[];

      const lastMessageByRoomId = new Map<string, MessageRow>();
      for (const msg of recentMessages) {
        if (!lastMessageByRoomId.has(msg.room_id)) lastMessageByRoomId.set(msg.room_id, msg);
      }

      // 5) unread counts (messages from other user and unread)
      const { data: unreadData, error: unreadError } = await supabase
        .from('messages')
        .select('id,room_id,sender_id,is_read')
        .in('room_id', roomIds)
        .eq('is_read', false)
        .neq('sender_id', myId)
        .limit(1000);
      if (unreadError) throw unreadError;

      const unreadCountByRoomId = new Map<string, number>();
      for (const row of (unreadData ?? []) as Array<Pick<MessageRow, 'room_id'>>) {
        unreadCountByRoomId.set(row.room_id, (unreadCountByRoomId.get(row.room_id) ?? 0) + 1);
      }

      const list: ChatListItem[] = filteredMatches
        .map((m) => {
          const room = roomByMatchId.get(m.id)!;
          const otherUserId = m.requester_id === myId ? m.target_id : m.requester_id;
          const u = usersById.get(otherUserId);
          const nickname = u?.nickname ? String(u.nickname) : '상대';
          const last = lastMessageByRoomId.get(room.id) ?? null;
          const unreadCount = unreadCountByRoomId.get(room.id) ?? 0;

          return {
            roomId: room.id,
            matchCreatedAt: m.created_at,
            otherUserId,
            nickname,
            profileImageUrl: u?.profile_image_url ? String(u.profile_image_url) : null,
            lastMessage: last?.content?.trim()
              ? String(last.content)
              : last
                ? '메시지'
                : '아직 채팅이 없어요',
            lastMessageAt: last?.created_at ?? null,
            unreadCount,
          };
        })
        .sort((a, b) => {
          const aKey = a.lastMessageAt ?? a.matchCreatedAt;
          const bKey = b.lastMessageAt ?? b.matchCreatedAt;
          return bKey.localeCompare(aKey);
        });

      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadChatList();
    }, [loadChatList])
  );

  const emptyText = useMemo(() => {
    if (loading) return '불러오는 중…';
    return '도착한 채팅이 없어요';
  }, [loading]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>채팅</Text>
        <Pressable
          onPress={() => router.push('/notifications')}
          hitSlop={10}
          style={styles.headerIconBtn}
          accessibilityRole="button"
          accessibilityLabel="알림"
        >
          <Feather name="bell" size={22} color="#111111" />
        </Pressable>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.roomId}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => {
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/chat-room',
                    params: { roomId: item.roomId, nickname: item.nickname },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="채팅방 열기"
              >
                <View style={styles.avatarWrap}>
                  {item.profileImageUrl ? (
                    <Image source={{ uri: item.profileImageUrl }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                      <Feather name="user" size={18} color="#9CA3AF" />
                    </View>
                  )}
                </View>

                <View style={styles.mid}>
                  <View style={styles.topLine}>
                    <Text style={styles.nickname} numberOfLines={1}>
                      {item.nickname}
                    </Text>
                    {item.unreadCount > 0 ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText} numberOfLines={1}>
                          {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color="#9CA3AF" />
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
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sep: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  row: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  nickname: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  preview: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});
