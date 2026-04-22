import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type TermsType = 'service' | 'privacy' | 'point';

function isTermsType(value: unknown): value is TermsType {
  return value === 'service' || value === 'privacy' || value === 'point';
}

function titleFor(type: TermsType) {
  if (type === 'service') return '서비스 이용약관';
  if (type === 'privacy') return '개인정보 처리방침';
  return '포인트 정책';
}

function formatDate(value: string | null) {
  if (!value) return '-';
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

export default function TermsDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const typeParam = params?.type;
  const type: TermsType | null = useMemo(() => (isTermsType(typeParam) ? typeParam : null), [typeParam]);

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const goBack = useCallback(() => router.back(), [router]);

  const load = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('terms')
        .select('content,updated_at')
        .eq('type', type)
        .maybeSingle();
      if (error) throw error;

      const c = typeof (data as any)?.content === 'string' ? String((data as any).content) : '';
      const u = typeof (data as any)?.updated_at === 'string' ? String((data as any).updated_at) : null;
      setContent(c);
      setUpdatedAt(u);
    } catch (e) {
      Alert.alert('불러오기 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
      setContent('');
      setUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!type) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="chevron-left" size={24} color="#111111" />
          </Pressable>
          <Text style={styles.headerTitle}>약관</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.centerWrap}>
          <Text style={styles.centerText}>잘못된 접근입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>{titleFor(type)}</Text>
        <Pressable
          onPress={() => void load()}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="새로고침"
        >
          <Feather name="rotate-ccw" size={18} color="#6C47FF" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="small" color="#6C47FF" />
          <Text style={[styles.centerText, { marginTop: 10 }]}>불러오는 중…</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>마지막 업데이트: {formatDate(updatedAt)}</Text>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator>
            <Text style={styles.contentText}>{content?.trim() ? content : '등록된 약관 내용이 없습니다.'}</Text>
          </ScrollView>
        </View>
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
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    maxWidth: 240,
  },
  body: {
    flex: 1,
    paddingBottom: 12,
  },
  metaRow: {
    paddingVertical: 8,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  scroll: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  contentText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#111111',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
});

