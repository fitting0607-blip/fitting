import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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

const MAIN = '#6C47FF';

type GatheringRow = {
  id: string;
  max_male?: number | null;
  max_female?: number | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  description?: string | null;
};

function genderBucket(g: string | null | undefined): 'male' | 'female' | null {
  const s = String(g ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'male' || s === 'm' || s.includes('남')) return 'male';
  if (s === 'female' || s === 'f' || s.includes('여')) return 'female';
  return null;
}

function formatDisplayDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return raw;
}

export default function GatheringScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [gathering, setGathering] = useState<GatheringRow | null>(null);
  const [maleCount, setMaleCount] = useState(0);
  const [femaleCount, setFemaleCount] = useState(0);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);

  const goBack = useCallback(() => router.back(), [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setUserId(null);
        setGathering(null);
        setMaleCount(0);
        setFemaleCount(0);
        setMyStatus(null);
        return;
      }
      setUserId(user.id);

      const { data: gRow, error: gErr } = await supabase
        .from('gatherings')
        .select('id,max_male,max_female,date,time,location,description')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gErr) throw gErr;

      const g = gRow as GatheringRow | null;
      if (!g?.id) {
        setGathering(null);
        setMaleCount(0);
        setFemaleCount(0);
        setMyStatus(null);
        return;
      }

      setGathering(g);

      const { data: apps, error: appsErr } = await supabase
        .from('gathering_applications')
        .select('gender,status')
        .eq('gathering_id', g.id)
        .not('status', 'eq', 'rejected');
      if (appsErr) throw appsErr;

      let m = 0;
      let f = 0;
      for (const r of apps ?? []) {
        const row = r as { gender?: string | null };
        const b = genderBucket(row.gender);
        if (b === 'male') m += 1;
        else if (b === 'female') f += 1;
      }
      setMaleCount(m);
      setFemaleCount(f);

      const { data: mine, error: mineErr } = await supabase
        .from('gathering_applications')
        .select('status')
        .eq('user_id', user.id)
        .eq('gathering_id', g.id)
        .maybeSingle();
      if (mineErr) throw mineErr;
      const mineRow = mine as { status?: string } | null;
      setMyStatus(mineRow?.status ? String(mineRow.status) : null);
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '').trim();
      Alert.alert('불러오기 실패', msg || '잠시 후 다시 시도해주세요.');
      setGathering(null);
      setMaleCount(0);
      setFemaleCount(0);
      setMyStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const statusLabel = useMemo(() => {
    switch (myStatus) {
      case 'pending':
        return '승인 대기 중';
      case 'approved':
        return '승인됨 - 결제 후 참여 가능';
      case 'paid':
        return '결제 완료';
      case 'rejected':
        return '신청 거절됨';
      default:
        return null;
    }
  }, [myStatus]);

  const onApply = useCallback(async () => {
    if (!userId || !gathering?.id || applyBusy) return;
    setApplyBusy(true);
    try {
      const { data: already, error: alreadyErr } = await supabase
        .from('gathering_applications')
        .select('status')
        .eq('user_id', userId)
        .eq('gathering_id', gathering.id)
        .maybeSingle();
      if (alreadyErr) throw alreadyErr;
      const alreadyRow = already as { status?: string } | null;
      if (alreadyRow) {
        setMyStatus(alreadyRow?.status ? String(alreadyRow.status) : null);
        Alert.alert('이미 신청하셨습니다.');
        return;
      }
    } catch (e: unknown) {
      const msg = String((e as { message?: string })?.message ?? e ?? '').trim();
      Alert.alert('처리 실패', msg || '잠시 후 다시 시도해주세요.');
      return;
    } finally {
      setApplyBusy(false);
    }

    Alert.alert('확인', '소모임을 신청하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '확인',
        onPress: () => {
          void (async () => {
            setApplyBusy(true);
            try {
              const { data: me, error: meErr } = await supabase
                .from('users')
                .select('nickname,gender,phone')
                .eq('id', userId)
                .maybeSingle();
              if (meErr) throw meErr;
              const meRow = me as {
                nickname?: string | null;
                gender?: string | null;
                phone?: string | null;
              } | null;
              const nickname = String(meRow?.nickname ?? '').trim();
              if (!nickname) throw new Error('닉네임 정보가 필요합니다. 회원가입 정보를 확인해주세요.');

              const { error: insErr } = await supabase.from('gathering_applications').insert({
                user_id: userId,
                gathering_id: gathering.id,
                nickname,
                name: nickname,
                gender: meRow?.gender ?? null,
                phone: meRow?.phone ?? null,
                status: 'pending',
              });
              if (insErr) throw insErr;

              setMyStatus('pending');
              setMaleCount((c) => (genderBucket(meRow?.gender) === 'male' ? c + 1 : c));
              setFemaleCount((c) => (genderBucket(meRow?.gender) === 'female' ? c + 1 : c));
              Alert.alert('신청이 완료되었습니다. 관리자 승인 후 안내드립니다.');
            } catch (e: unknown) {
              const msg = String((e as { message?: string })?.message ?? e ?? '').trim();
              Alert.alert('신청 실패', msg || '잠시 후 다시 시도해주세요.');
            } finally {
              setApplyBusy(false);
            }
          })();
        },
      },
    ]);
  }, [userId, gathering?.id, applyBusy]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerBtn} accessibilityRole="button" accessibilityLabel="뒤로">
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>소모임</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={MAIN} />
        </View>
      ) : !userId ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>로그인 후 이용할 수 있어요.</Text>
        </View>
      ) : !gathering ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>현재 모집 중인 소모임이 없습니다.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>이번 주 소모임</Text>
          <Text style={styles.subtitle}>신청 후 상세 주소 공개</Text>

          {String(gathering.description ?? '').trim() ? (
            <View style={styles.descBox}>
              <Text style={styles.descText}>{String(gathering.description ?? '').trim()}</Text>
            </View>
          ) : null}

          {statusLabel ? (
            <View style={styles.statusPill} accessibilityLabel={`내 신청 상태: ${statusLabel}`}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Row label="최대 인원" value={`남자 ${gathering.max_male ?? 0}명 / 여자 ${gathering.max_female ?? 0}명`} />
            <Row label="날짜" value={formatDisplayDate(gathering.date)} />
            <Row label="시간" value={String(gathering.time ?? '').trim() || '-'} />
            <Row label="장소" value={String(gathering.location ?? '').trim() || '-'} sub="상세 주소는 신청 후 공개" />
            <Row
              label="현재 신청 인원"
              value={`남자 ${maleCount}명 / 여자 ${femaleCount}명`}
              isLast
            />
          </View>

          <Pressable
            onPress={onApply}
            disabled={applyBusy}
            style={({ pressed }) => [styles.primaryBtn, applyBusy && styles.btnDisabled, pressed && !applyBusy && styles.primaryBtnPressed]}
          >
            {applyBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>신청하기</Text>
            )}
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  sub,
  isLast,
}: {
  label: string;
  value: string;
  sub?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 14,
  },
  descBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EEF0F4',
    marginBottom: 14,
  },
  descText: {
    fontSize: 14,
    color: '#111111',
    lineHeight: 20,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(108, 71, 255, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: MAIN,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 22,
  },
  rowSub: {
    marginTop: 6,
    fontSize: 13,
    color: '#6B7280',
  },
  primaryBtn: {
    backgroundColor: MAIN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryBtnPressed: {
    opacity: 0.92,
  },
  btnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
