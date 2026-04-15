import type { Dispatch, SetStateAction } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { layoutStyles } from './ui';

function isValidAge(age: number) {
  return Number.isFinite(age) && age >= 1 && age <= 120;
}

export function AgeStep({
  draft,
  setDraft,
  supabase,
  onDone,
  onLoadingChange,
}: {
  draft: RegisterDraft;
  setDraft: Dispatch<SetStateAction<RegisterDraft>>;
  supabase: SupabaseClient;
  onDone: () => void;
  onLoadingChange: (v: boolean) => void;
}) {
  const age = draft.age ?? '';

  const submit = async () => {
    const ageNum = Number(age);
    if (!isValidAge(ageNum)) {
      Alert.alert('오류', '올바른 나이를 입력해주세요.');
      return;
    }

    onLoadingChange(true);

    try {
      // 1. 회원가입
      console.log('[age] signUp 시작');
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: draft.email,
        password: draft.password,
      });
      if (signUpError) {
        console.log('[age] signUp 에러:', signUpError.message);
        Alert.alert('회원가입 실패', signUpError.message);
        return;
      }
      console.log('[age] signUp 성공, user:', data.user?.id);

      // 2. 세션 없으면 로그인
      let userId = data.user?.id;
      if (!data.session) {
        console.log('[age] 세션 없음, signIn 시도');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: draft.email,
          password: draft.password,
        });
        if (signInError) {
          console.log('[age] signIn 에러:', signInError.message);
          Alert.alert('로그인 실패', signInError.message);
          return;
        }
        userId = signInData.user?.id;
        console.log('[age] signIn 성공, user:', userId);
      }

      if (!userId) {
        Alert.alert('오류', '유저 ID를 가져올 수 없습니다.');
        return;
      }

      // 3. public.users 업데이트
      console.log('[age] users update 시작');
      const { error: updateError } = await supabase
        .from('users')
        .update({
          nickname: draft.nickname,
          gender: draft.gender,
          age: ageNum,
          mbti: draft.mbti,
          sports: draft.sports,
          workout_goals: draft.workout_goals,
          workout_frequency: draft.workout_frequency,
          profile_image_url: draft.profile_image_url ?? null,
        })
        .eq('id', userId);

      if (updateError) {
        console.log('[age] update 에러:', updateError.message);
        Alert.alert('저장 실패', updateError.message);
        return;
      }
      console.log('[age] update 성공');

      // 4. 완료
      console.log('[age] onDone 호출');
      onDone();
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <View style={layoutStyles.body}>
      <Text style={layoutStyles.title}>나이를 입력해주세요</Text>
      <TextInput
        style={styles.input}
        value={String(age)}
        onChangeText={(v) => setDraft((p) => ({ ...p, age: Number(v) }))}
        keyboardType="number-pad"
        placeholder="나이 입력"
        maxLength={3}
      />
      <PrimaryButton label="완료" disabled={!isValidAge(Number(age))} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
});
