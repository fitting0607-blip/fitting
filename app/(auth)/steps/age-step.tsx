import { grantAttendanceIfNeededOnLogin } from '@/attendance-helpers';
import { enqueueLoginAttendanceModal } from '@/login-attendance-pending';
import type { Dispatch, SetStateAction } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeBase64ToBytes, PUBLIC_UPLOAD_BUCKET } from '../../utils/imageBytes';
import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { layoutStyles } from './ui';

function isValidAge(age: number) {
  return Number.isFinite(age) && age >= 1 && age <= 120;
}

function isUserAlreadyRegisteredError(message?: string) {
  const m = (message ?? '').toLowerCase();
  return m.includes('user already registered') || m.includes('already registered');
}

function isUniqueViolationError(err: unknown): err is { code?: string; message?: string } {
  if (!err || typeof err !== 'object') return false;
  return 'code' in err || 'message' in err;
}

export function AgeStep({
  draft,
  setDraft,
  supabase,
  isSocialProvider,
  provider,
  onDone,
  onLoadingChange,
}: {
  draft: RegisterDraft;
  setDraft: Dispatch<SetStateAction<RegisterDraft>>;
  supabase: SupabaseClient;
  isSocialProvider: boolean;
  provider?: string;
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
      let userId: string | undefined;
      if (isSocialProvider) {
        // 소셜 로그인 유저는 이미 auth.users에 계정/세션이 있으므로 추가 auth 가입/익명 로그인 시도를 하면 안 됨
        const { data, error } = await supabase.auth.getUser();
        if (error) {
          Alert.alert('오류', error.message);
          return;
        }
        userId = data.user?.id;
      } else {
        // 1. 회원가입 (이메일/비밀번호)
        console.log('[age] signUp 시작');
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: draft.email,
          password: draft.password,
        });

        if (signUpError) {
          console.log('[age] signUp 에러:', signUpError.message);

          // 이메일 중복(이미 가입된 계정)
          if (isUserAlreadyRegisteredError(signUpError.message)) {
            Alert.alert('회원가입 실패', '이미 사용 중인 이메일이에요');
            return;
          } else {
            Alert.alert('회원가입 실패', signUpError.message);
            return;
          }
        } else {
          console.log('[age] signUp 성공, user:', data.user?.id);

          // 2. 세션 없으면 로그인
          userId = data.user?.id;
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
        }
      }

      if (!userId) {
        Alert.alert('오류', '유저 ID를 가져올 수 없습니다.');
        return;
      }

      // 3. 프로필 사진: 가입 후 세션이 있을 때만 Storage 업로드 (posts 버킷)
      let profileImageUrl: string | null = draft.profile_image_url ?? null;
      if (draft.profile_image_base64) {
        const storagePath = `${userId}/profile_${Date.now()}.jpg`;
        const byteArray = decodeBase64ToBytes(draft.profile_image_base64);
        const { error: uploadError } = await supabase.storage.from(PUBLIC_UPLOAD_BUCKET).upload(storagePath, byteArray, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (uploadError) {
          console.log('[age] profile upload 에러:', uploadError.message);
          Alert.alert('프로필 사진 업로드 실패', uploadError.message);
          return;
        }
        const { data: pub } = supabase.storage.from(PUBLIC_UPLOAD_BUCKET).getPublicUrl(storagePath);
        profileImageUrl = pub?.publicUrl ?? null;
        if (!profileImageUrl) {
          Alert.alert('오류', '프로필 이미지 URL을 만들 수 없습니다.');
          return;
        }
      }

      // 4. public.users upsert (소셜은 INSERT/UPDATE만, 이메일은 upsert로 안전하게 처리)
      console.log('[age] users upsert 시작');
      const { data: authUserData } = await supabase.auth.getUser();
      const authEmail = authUserData.user?.email ?? null;
      const normalizedProvider =
        provider === 'apple' || provider === 'kakao' ? provider : isSocialProvider ? provider ?? null : 'email';

      const { error: upsertError } = await supabase
        .from('users')
        .upsert(
          {
            id: userId,
            email: isSocialProvider ? authEmail : (draft.email?.trim().toLowerCase() ?? null),
            provider: normalizedProvider,
            nickname: draft.nickname,
            gender: draft.gender,
            phone: draft.phone,
            age: ageNum,
            mbti: draft.mbti,
            sports: draft.sports,
            workout_goals: draft.workout_goals,
            workout_frequency: draft.workout_frequency,
            profile_image_url: profileImageUrl,
          },
          { onConflict: 'id' },
        );

      if (upsertError) {
        console.log('[age] upsert 에러:', upsertError.message);
        if (isUniqueViolationError(upsertError) && upsertError.code === '23505') {
          Alert.alert('저장 실패', '이미 사용 중인 닉네임이에요');
          return;
        }
        Alert.alert('저장 실패', upsertError.message);
        return;
      }
      console.log('[age] upsert 성공');

      const attendance = await grantAttendanceIfNeededOnLogin(userId);
      if (attendance.granted) {
        enqueueLoginAttendanceModal(attendance.pointsAwarded);
      }

      // 5. 완료
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
