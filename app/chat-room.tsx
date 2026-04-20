import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase } from '../supabase';

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  is_read: boolean | null;
  created_at: string;
};

const MAIN = '#6C47FF';

export default function ChatRoomScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ roomId?: string; nickname?: string }>();
  const roomId = useMemo(() => String(params.roomId ?? ''), [params.roomId]);
  const nickname = useMemo(() => String(params.nickname ?? '채팅'), [params.nickname]);

  const [myId, setMyId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const listRef = useRef<FlatList<MessageRow> | null>(null);

  const loadMyId = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMyId(user?.id ? String(user.id) : '');
  }, []);

  /** 해당 방에서 '상대가 보낸' 메시지만 읽음 처리 (목록 뱃지용 DB와 일치) */
  const markAllMessagesInRoomRead = useCallback(async (rid?: string, uid?: string) => {
    const effectiveRoomId = rid ?? roomId;
    const effectiveMyId = uid ?? myId;
    if (!effectiveRoomId || !effectiveMyId) return;
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('room_id', effectiveRoomId)
      .neq('sender_id', effectiveMyId);
    if (error) throw error;
  }, [myId, roomId]);

  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const safeMarkAllReadFireAndForget = useCallback(() => {
    const rid = roomIdRef.current;
    const uid = myIdRef.current;
    if (!rid || !uid) return;
    void supabase.from('messages').update({ is_read: true }).eq('room_id', rid).neq('sender_id', uid);
  }, []);

  const handleBack = useCallback(async () => {
    try {
      await markAllMessagesInRoomRead();
    } catch {
      // ignore; navigation should still work
    }
    router.back();
  }, [markAllMessagesInRoomRead, router]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        // Run when leaving this screen (back gesture, hardware back, tab change, etc.)
        safeMarkAllReadFireAndForget();
      };
    }, [safeMarkAllReadFireAndForget])
  );

  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const uid = user?.id ? String(user.id) : '';
      setMyId(uid);

      // 진입 직후 DB 읽음 처리 완료 → 목록으로 돌아올 때 재조회와 순서 맞춤
      await markAllMessagesInRoomRead(roomId, uid);

      const { data, error } = await supabase
        .from('messages')
        .select('id,room_id,sender_id,content,is_read,created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;

      setMessages((data ?? []) as MessageRow[]);

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: false });
      });
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [markAllMessagesInRoomRead, roomId]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!roomId || !myId || !content) return;
    if (sending) return;
    setSending(true);
    try {
      setInput('');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: roomId,
          sender_id: myId,
          content,
          is_read: false,
        })
        .select('id,room_id,sender_id,content,is_read,created_at')
        .single();
      if (error) throw error;

      if (data?.id) {
        const inserted = data as MessageRow;
        setMessages((prev) => {
          if (prev.some((m) => m.id === inserted.id)) return prev;
          return [...prev, inserted].sort((a, b) => a.created_at.localeCompare(b.created_at));
        });
      }

      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    } catch {
      // if insert fails, keep UI stable; user can retry
    } finally {
      setSending(false);
    }
  }, [input, myId, roomId, sending]);

  useEffect(() => {
    void loadMyId();
  }, [loadMyId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    return () => {
      safeMarkAllReadFireAndForget();
    };
  }, [safeMarkAllReadFireAndForget]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (!row?.id) return;

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const next = [...prev, row].sort((a, b) => a.created_at.localeCompare(b.created_at));
            return next;
          });

          if (myId && row.sender_id !== myId) void markAllMessagesInRoomRead();

          requestAnimationFrame(() => {
            listRef.current?.scrollToEnd({ animated: true });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [markAllMessagesInRoomRead, myId, roomId]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={handleBack}
            hitSlop={10}
            style={styles.topIconBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="chevron-left" size={24} color="#111111" />
          </Pressable>

          <Text style={styles.topTitle} numberOfLines={1}>
            {nickname}
          </Text>

          <View style={styles.topRightSpace} />
        </View>

        {loading && messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>불러오는 중…</Text>
          </View>
        ) : (
          <FlatList
            ref={(r) => {
              listRef.current = r;
            }}
            data={messages}
            keyExtractor={(m) => m.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const isMine = myId && item.sender_id === myId;
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowMine : styles.msgRowOther]}>
                  <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : styles.bubbleTextOther]}>
                      {item.content ?? ''}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={[styles.composer, { paddingBottom: Math.max(10, insets.bottom) }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
          />
          <Pressable
            onPress={sendMessage}
            disabled={!input.trim() || sending || !roomId}
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || sending || !roomId) && styles.sendBtnDisabled,
              pressed && !sending ? styles.sendBtnPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="보내기"
          >
            <Text style={styles.sendBtnText}>{sending ? '...' : '전송'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    paddingHorizontal: 10,
  },
  topRightSpace: {
    width: 44,
    height: 44,
  },

  body: {
    flex: 1,
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
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  list: {
    flex: 1,
  },
  msgRow: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bubbleMine: {
    backgroundColor: MAIN,
    borderTopRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: '#E5E7EB',
    borderTopLeftRadius: 6,
  },
  bubbleText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  bubbleTextMine: {
    color: '#FFFFFF',
  },
  bubbleTextOther: {
    color: '#111111',
  },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  sendBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnPressed: {
    opacity: 0.9,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

