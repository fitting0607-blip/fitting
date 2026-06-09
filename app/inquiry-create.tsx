import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
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

const MAIN = '#3B3BF9';

export default function InquiryCreateScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    return title.trim().length > 0 && content.trim().length > 0;
  }, [content, submitting, title]);

  const submit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedContent = content.trim();

    if (!trimmedTitle) {
      Alert.alert('제목 입력', '제목을 입력해주세요.');
      return;
    }
    if (!trimmedContent) {
      Alert.alert('내용 입력', '내용을 입력해주세요.');
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

      const { error } = await supabase.from('inquiries').insert({
        user_id: user.id,
        title: trimmedTitle,
        content: trimmedContent,
        status: 'pending',
      } as any);
      if (error) throw error;

      Alert.alert('완료', '문의가 접수됐어요', [
        {
          text: '확인',
          onPress: () => router.replace('/customer-support' as any),
        },
      ]);
    } catch (e: any) {
      Alert.alert('문의 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [content, router, submitting, title]);

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
                <Text style={styles.headerTitle}>문의하기</Text>
                <View style={styles.headerBtn} />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>제목</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder="제목을 입력해주세요"
                  placeholderTextColor="#9CA3AF"
                  style={styles.titleInput}
                  maxLength={100}
                />
                <Text style={styles.hint}>{title.length}/100</Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>내용</Text>
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  placeholder="문의 내용을 입력해주세요"
                  placeholderTextColor="#9CA3AF"
                  style={styles.contentInput}
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />
                <Text style={styles.hint}>{content.length}/2000</Text>
              </View>

              <View style={styles.bottom}>
                <Pressable
                  onPress={() => void submit()}
                  disabled={!canSubmit}
                  style={[styles.submitBtn, !canSubmit ? styles.submitBtnDisabled : null]}
                  accessibilityRole="button"
                  accessibilityLabel="제출"
                >
                  <Text style={styles.submitText}>{submitting ? '제출 중…' : '제출'}</Text>
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
  titleInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  contentInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    minHeight: 180,
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
