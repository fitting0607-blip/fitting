import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type ReportReason = '스팸' | '욕설/비하' | '음란물' | '사기' | '개인정보 노출' | '기타';

const MAIN = '#3B3BF9';

const REASONS: ReportReason[] = ['스팸', '욕설/비하', '음란물', '사기', '개인정보 노출', '기타'];

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ targetId?: string; postId?: string }>();
  const targetId = useMemo(() => String(params.targetId ?? ''), [params.targetId]);
  const postId = useMemo(() => {
    const v = String(params.postId ?? '').trim();
    return v.length > 0 ? v : null;
  }, [params.postId]);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = Boolean(targetId && reason && !submitting);

  const submit = useCallback(async () => {
    if (!targetId) {
      Alert.alert('신고 대상 없음', '잠시 후 다시 시도해주세요.');
      return;
    }
    if (!reason) {
      Alert.alert('신고 사유 선택', '신고 사유를 선택해주세요.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const payload = {
        reporter_id: user.id,
        target_id: targetId,
        post_id: postId,
        reason,
        detail: detail.trim() ? detail.trim() : null,
      };

      const { error } = await supabase.from('reports').insert(payload as any);
      if (error) throw error;

      Alert.alert('완료', '신고가 접수됐어요', [{ text: '확인', onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert('신고 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [detail, postId, reason, router, submitting, targetId]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.flex}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
            >
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
                <Text style={styles.headerTitle}>신고</Text>
                <View style={styles.headerBtn} />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>신고 사유</Text>
                <View style={styles.reasonBox}>
                  {REASONS.map((r) => {
                    const selected = reason === r;
                    return (
                      <Pressable
                        key={r}
                        onPress={() => setReason(r)}
                        style={styles.reasonRow}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`신고 사유 ${r}`}
                      >
                        <View
                          style={[
                            styles.radio,
                            selected ? styles.radioOn : styles.radioOff,
                          ]}
                        >
                          {selected ? <View style={styles.radioDot} /> : null}
                        </View>
                        <Text style={styles.reasonLabel}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>상세 내용 (선택)</Text>
                <TextInput
                  value={detail}
                  onChangeText={setDetail}
                  placeholder="추가로 설명할 내용이 있으면 입력해주세요."
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                  multiline
                  textAlignVertical="top"
                  maxLength={500}
                />
                <Text style={styles.hint}>{detail.length}/500</Text>
              </View>

              <View style={styles.bottom}>
                <Pressable
                  onPress={() => void submit()}
                  disabled={!canSubmit}
                  style={[
                    styles.submitBtn,
                    !canSubmit ? styles.submitBtnDisabled : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="신고하기"
                >
                  <Text style={styles.submitText}>
                    {submitting ? '신고 중…' : '신고하기'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
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

  reasonBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    overflow: 'hidden',
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 52,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOff: {
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  radioOn: {
    borderWidth: 2,
    borderColor: MAIN,
    backgroundColor: '#FFFFFF',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MAIN,
  },
  reasonLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },

  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    minHeight: 120,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textAlign: 'right',
  },

  bottom: {
    marginTop: 'auto',
    paddingTop: 14,
    paddingBottom: 16,
  },
  submitBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: '#C7C7FF',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});

