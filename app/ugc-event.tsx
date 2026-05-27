import { useFocusEffect } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { supabase } from '@/supabase';

const MAIN = '#6C47FF';
const INPUT_PLACEHOLDER_COLOR = '#4B5563';
const OFFICIAL_INSTAGRAM_URL = 'https://www.instagram.com/fitting_official.kr';

function normalizeId(v: string): string {
  const s = (v ?? '').trim();
  return s;
}

export default function UgcEventScreen() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [instagramId, setInstagramId] = useState('');
  const [tiktokId, setTiktokId] = useState('');

  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  const canSubmit = useMemo(() => {
    if (!userId) return false;
    if (loading || submitting) return false;
    const ig = normalizeId(instagramId);
    const tt = normalizeId(tiktokId);
    if (!ig && !tt) return false;
    if (alreadySubmitted) return false;
    return true;
  }, [alreadySubmitted, instagramId, loading, submitting, tiktokId, userId]);

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
        setAlreadySubmitted(false);
        return;
      }
      setUserId(user.id);

      const { data: entry, error: entryErr } = await supabase
        .from('ugc_event_entries')
        .select('id,instagram_id,tiktok_id,created_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (entryErr) throw entryErr;

      const hasEntry = !!(entry as { id?: string } | null)?.id;
      setAlreadySubmitted(hasEntry);

      if (hasEntry) {
        const ig = (entry as any)?.instagram_id ? String((entry as any).instagram_id) : '';
        const tt = (entry as any)?.tiktok_id ? String((entry as any).tiktok_id) : '';
        if (ig) setInstagramId(ig);
        if (tt) setTiktokId(tt);
      }
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      setUserId(null);
      setAlreadySubmitted(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const submit = useCallback(async () => {
    if (!userId || submitting) return;

    const ig = normalizeId(instagramId);
    const tt = normalizeId(tiktokId);

    if (!ig && !tt) {
      Alert.alert('입력 필요', '인스타그램 ID 또는 틱톡 ID 중 하나 이상 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: entry, error: entryErr } = await supabase
        .from('ugc_event_entries')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      if (entryErr) throw entryErr;
      if ((entry as { id?: string } | null)?.id) {
        setAlreadySubmitted(true);
        Alert.alert('안내', '이미 참여했습니다');
        return;
      }

      const { count: postCnt, error: postErr } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_deleted', false);
      if (postErr) throw postErr;
      if ((postCnt ?? 0) < 1) {
        Alert.alert('안내', '게시물을 먼저 등록해주세요');
        return;
      }

      const { error: insErr } = await supabase.from('ugc_event_entries').insert({
        user_id: userId,
        instagram_id: ig || null,
        tiktok_id: tt || null,
      });

      if (insErr) {
        const code = (insErr as any)?.code ? String((insErr as any).code) : '';
        // unique violation (e.g. user_id unique)
        if (code === '23505') {
          setAlreadySubmitted(true);
          Alert.alert('안내', '이미 참여했습니다');
          return;
        }
        throw insErr;
      }

      setAlreadySubmitted(true);
      Alert.alert('제출 완료', '이벤트 참여가 완료됐어요.');
    } catch (e: any) {
      Alert.alert('제출 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [instagramId, submitting, tiktokId, userId]);

  const openOfficialInstagram = useCallback(async () => {
    try {
      const canOpen = await Linking.canOpenURL(OFFICIAL_INSTAGRAM_URL);
      if (!canOpen) {
        Alert.alert('이동 실패', '인스타그램을 열 수 없습니다.');
        return;
      }
      await Linking.openURL(OFFICIAL_INSTAGRAM_URL);
    } catch (e: any) {
      Alert.alert('이동 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.headerBackBtn, pressed && styles.headerBackBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
            >
              <Text style={styles.headerBackText}>뒤로</Text>
            </Pressable>
            <Text style={styles.headerTitle}>이벤트 참여</Text>
            <View style={styles.headerRightSpacer} />
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={MAIN} />
            </View>
          ) : !userId ? (
            <View style={styles.centered}>
              <Text style={styles.muted}>로그인 후 이용할 수 있어요.</Text>
            </View>
          ) : (
            <View style={styles.body}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>핏팅 챌린지</Text>
                <Text style={styles.cardDesc}>
                  핏팅 앱을 소개하는 영상을 올리고 상금을 받아보세요!
                </Text>

                <View style={styles.prizeBox}>
                  <Text style={styles.prizeLine}>🥇 1등 100만원 × 1명</Text>
                  <Text style={styles.prizeLine}>🥈 2등 30만원 × 1명</Text>
                  <Text style={styles.prizeLine}>🥉 3등 5만원 × 5명</Text>
                  <Text style={[styles.prizeLine, styles.prizeLineSpacing]}>🔥 추가 성과 보상:</Text>
                  <Text style={styles.prizeSubLine}>· 조회수 1만 이상: 매칭권 10개</Text>
                  <Text style={styles.prizeSubLine}>· 좋아요 500 이상: 500P</Text>
                </View>

                <View style={styles.conditionsBox}>
                  <Text style={styles.conditionsTitle}>참여 조건</Text>
                  <Text style={styles.conditionLine}>• 게시글 1개 이상 등록</Text>
                  <Text style={styles.conditionLine}>• #핏팅 #핏팅챌린지 포함</Text>
                  <Text style={styles.conditionLine}>• 공식 계정 태그</Text>
                  <Text style={styles.conditionLine}>• 이벤트 종료일까지 영상 공개 유지</Text>
                </View>

                <Text style={styles.instagramFooterNotice}>
                  자세한 내용은 공식 인스타그램{' '}
                  <Text
                    style={styles.officialTagLink}
                    onPress={() => void openOfficialInstagram()}
                    accessibilityRole="link"
                    accessibilityLabel="핏팅 공식 인스타그램 열기"
                  >
                    @fitting_official.kr
                  </Text>
                  을 참고하세요.
                </Text>

                {alreadySubmitted ? (
                  <View style={styles.submittedBox} accessibilityLabel="이벤트 참여 완료 안내">
                    <Text style={styles.submittedTitle}>이미 참여했습니다</Text>
                    <Text style={styles.submittedDesc}>제출한 ID는 수정할 수 없어요.</Text>
                  </View>
                ) : null}

                <Text style={styles.inputLabel}>인스타그램 ID (선택)</Text>
                <TextInput
                  value={instagramId}
                  onChangeText={setInstagramId}
                  placeholder="예) fitting_official.kr"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!alreadySubmitted && !submitting}
                  style={[styles.input, alreadySubmitted && styles.inputDisabled]}
                  returnKeyType="next"
                />

                <Text style={styles.inputLabel}>틱톡 ID (선택)</Text>
                <TextInput
                  value={tiktokId}
                  onChangeText={setTiktokId}
                  placeholder="예) fitting_official.kr"
                  placeholderTextColor={INPUT_PLACEHOLDER_COLOR}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!alreadySubmitted && !submitting}
                  style={[styles.input, alreadySubmitted && styles.inputDisabled]}
                  returnKeyType="done"
                />

                <Pressable
                  onPress={submit}
                  disabled={!canSubmit}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    !canSubmit && styles.btnDisabled,
                    pressed && canSubmit && styles.primaryBtnPressed,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {alreadySubmitted ? '참여 완료' : '제출하기'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackBtn: {
    width: 56,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  headerBackBtnPressed: {
    opacity: 0.9,
  },
  headerBackText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  headerRightSpacer: {
    width: 56,
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
  },
  body: {
    padding: 16,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  cardDesc: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  prizeBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
  },
  prizeLine: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
    fontWeight: '600',
  },
  prizeLineSpacing: {
    marginTop: 6,
  },
  prizeSubLine: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    paddingLeft: 8,
  },
  conditionsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
  },
  conditionsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  conditionLine: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },
  instagramFooterNotice: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 14,
  },
  officialTagLink: {
    fontWeight: '800',
    color: MAIN,
    textDecorationLine: 'underline',
  },
  submittedBox: {
    backgroundColor: 'rgba(108, 71, 255, 0.10)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 71, 255, 0.18)',
  },
  submittedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: MAIN,
    marginBottom: 4,
  },
  submittedDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 14,
    color: '#111111',
  },
  inputDisabled: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  primaryBtn: {
    backgroundColor: MAIN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: 16,
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

