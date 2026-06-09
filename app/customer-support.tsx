import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

const MAIN = '#3B3BF9';

type InquiryStatus = 'pending' | 'answered';

type InquiryRow = {
  id: string;
  title: string;
  status: InquiryStatus;
  created_at: string;
};

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return value;
  }
}

function statusLabel(status: InquiryStatus) {
  return status === 'answered' ? '답변완료' : '답변대기';
}

export default function CustomerSupportScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InquiryRow[]>([]);

  const load = useCallback(async () => {
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

      const { data, error } = await supabase
        .from('inquiries')
        .select('id,title,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;

      setItems((data ?? []) as InquiryRow[]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const emptyText = useMemo(() => {
    if (loading) return '불러오는 중…';
    return '문의 내역이 없어요';
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
        <Text style={styles.headerTitle}>고객센터</Text>
        <View style={styles.headerBtn} />
      </View>

      <Pressable
        onPress={() => router.push('/inquiry-create' as any)}
        style={styles.createBtn}
        accessibilityRole="button"
        accessibilityLabel="문의하기"
      >
        <Feather name="edit-3" size={18} color="#FFFFFF" />
        <Text style={styles.createBtnText}>문의하기</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>내 문의 내역</Text>

      {loading && items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color={MAIN} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const answered = item.status === 'answered';
            return (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/inquiry-detail',
                    params: { id: item.id },
                  } as any)
                }
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${statusLabel(item.status)}`}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      answered ? styles.statusBadgeAnswered : styles.statusBadgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        answered ? styles.statusTextAnswered : styles.statusTextPending,
                      ]}
                    >
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.rowDate}>{formatDate(item.created_at)}</Text>
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
  createBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: MAIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 10,
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
    paddingBottom: 16,
  },
  row: {
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgePending: {
    backgroundColor: '#E5E7EB',
  },
  statusBadgeAnswered: {
    backgroundColor: '#E8E8FF',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusTextPending: {
    color: '#6B7280',
  },
  statusTextAnswered: {
    color: MAIN,
  },
  rowDate: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
});
