import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

function Row({
  label,
  onPress,
  rightSlot,
}: {
  label: string;
  onPress: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} hitSlop={6} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {rightSlot}
        <Feather name="chevron-right" size={18} color="#9CA3AF" />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const goBack = useCallback(() => router.back(), [router]);

  const logout = useCallback(async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/(auth)/login' as any);
    } catch (e) {
      Alert.alert('로그아웃 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoggingOut(false);
    }
  }, [loggingOut, router]);

  const withdraw = useCallback(() => {
    if (withdrawing) return;

    Alert.alert('회원탈퇴', '정말 탈퇴하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '확인',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setWithdrawing(true);
            try {
              const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
              if (sessionErr) throw sessionErr;
              const accessToken = sessionData.session?.access_token;
              if (!accessToken) throw new Error('로그인이 필요합니다.');

              // 1) public.users delete + 2) auth.users delete (server-side service role)
              const { data, error } = await supabase.functions.invoke('delete-account', {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (error) throw error;
              if (!data?.ok) throw new Error('탈퇴 처리에 실패했습니다.');

              // 3) logout + go to login
              const { error: signOutErr } = await supabase.auth.signOut();
              if (signOutErr) throw signOutErr;

              router.replace('/(auth)/login' as any);
              Alert.alert('완료', '탈퇴가 완료되었습니다');
            } catch (e) {
              Alert.alert('탈퇴 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
            } finally {
              setWithdrawing(false);
            }
          })();
        },
      },
    ]);
  }, [router, withdrawing]);

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
        <Text style={styles.headerTitle}>설정</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>내 계정</Text>
        <View style={styles.sectionBox}>
          <Row label="차단목록" onPress={() => router.push('/block-list')} />
          <View style={styles.divider} />
          <Row label="프로필 수정" onPress={() => router.push('/profile-edit')} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>약관 및 정책</Text>
        <View style={styles.sectionBox}>
          <Row
            label="서비스 이용약관"
            onPress={() => router.push('/terms/service' as any)}
            rightSlot={<Feather name="external-link" size={16} color="#9CA3AF" />}
          />
          <View style={styles.divider} />
          <Row
            label="개인정보처리방침"
            onPress={() => router.push('/terms/privacy' as any)}
            rightSlot={<Feather name="external-link" size={16} color="#9CA3AF" />}
          />
          <View style={styles.divider} />
          <Row
            label="포인트 정책 관련"
            onPress={() => router.push('/terms/point' as any)}
            rightSlot={<Feather name="external-link" size={16} color="#9CA3AF" />}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>로그인</Text>
        <View style={styles.sectionBox}>
          <Row label={loggingOut ? '로그아웃 중…' : '로그아웃'} onPress={logout} />
          <View style={styles.divider} />
          <Row label={withdrawing ? '탈퇴 처리 중…' : '계정탈퇴'} onPress={withdraw} />
        </View>
      </View>
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

  section: {
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  sectionBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 14,
  },
});

