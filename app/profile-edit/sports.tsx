import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';
import { SportsStep } from '@/app/(auth)/steps/sports-step';
import type { RegisterDraft } from '@/app/(auth)/steps/types';

export default function SportsSelectScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<RegisterDraft>({
    email: '',
    password: '',
    agreements: { termsOfService: false, privacyPolicy: false, pointsPolicy: false },
    mbtiParts: { EI: null, SN: null, TF: null, JP: null },
    mbti: null,
    sports: [],
    workout_frequency: null,
    workout_goals: [],
    nickname: '',
    gender: null,
    profile_image_url: null,
    profile_image_base64: null,
    age: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const { data, error } = await supabase.from('users').select('sports').eq('id', user.id).maybeSingle();
      if (error) throw error;
      const sports = Array.isArray((data as any)?.sports) ? ((data as any).sports as string[]) : [];
      setDraft((prev) => ({ ...prev, sports }));
    } catch (e) {
      Alert.alert('불러오기 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDone = useCallback(async () => {
    if (loading) return;
    try {
      setLoading(true);
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');
      if (!draft.sports.length) throw new Error('최소 1개 이상 선택해 주세요.');

      const { error } = await supabase.from('users').update({ sports: draft.sports }).eq('id', user.id);
      if (error) throw error;

      router.back();
    } catch (e) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [draft.sports, loading, router]);

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
        <Text style={styles.headerTitle}>즐겨하는 운동</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.body}>
        <SportsStep draft={draft} setDraft={setDraft} onNext={onDone} />
      </View>
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
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
  },
});

