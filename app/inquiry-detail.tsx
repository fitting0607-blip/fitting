import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

const MAIN = '#3B3BF9';

type InquiryStatus = 'pending' | 'answered';

type InquiryDetail = {
  id: string;
  title: string;
  content: string;
  answer: string | null;
  answered_at: string | null;
  status: InquiryStatus;
  created_at: string;
};

function formatDate(value: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return value;
  }
}

function statusLabel(status: InquiryStatus) {
  return status === 'answered' ? '답변완료' : '답변대기';
}

export default function InquiryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const inquiryId = useMemo(() => String(params.id ?? '').trim(), [params.id]);

  const [loading, setLoading] = useState(true);
  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);

  const load = useCallback(async () => {
    if (!inquiryId) {
      setInquiry(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const { data, error } = await supabase
        .from('inquiries')
        .select('id,title,content,answer,answered_at,status,created_at')
        .eq('id', inquiryId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('문의를 찾을 수 없어요.');

      setInquiry(data as InquiryDetail);
    } catch (e: any) {
      setInquiry(null);
      Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [inquiryId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const answered = inquiry?.status === 'answered';

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
        <Text style={styles.headerTitle}>문의 상세</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator color={MAIN} />
        </View>
      ) : inquiry ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.metaRow}>
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
                {statusLabel(inquiry.status)}
              </Text>
            </View>
            <Text style={styles.metaDate}>{formatDate(inquiry.created_at)}</Text>
          </View>

          <Text style={styles.title}>{inquiry.title}</Text>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>내 문의</Text>
            <Text style={styles.cardBody}>{inquiry.content}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>관리자 답변</Text>
            {inquiry.answer ? (
              <>
                <Text style={styles.cardBody}>{inquiry.answer}</Text>
                {inquiry.answered_at ? (
                  <Text style={styles.answeredAt}>답변일: {formatDate(inquiry.answered_at)}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.emptyAnswer}>아직 답변이 등록되지 않았어요.</Text>
            )}
          </View>
        </ScrollView>
      ) : null}
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
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
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
  metaDate: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
    marginBottom: 8,
  },
  cardBody: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
    lineHeight: 22,
  },
  emptyAnswer: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  answeredAt: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
  },
});
