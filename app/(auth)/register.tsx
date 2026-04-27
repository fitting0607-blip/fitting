import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../../supabase';
import { AgeStep } from './steps/age-step';
import { PrimaryButton } from './steps/components';
import { GenderStep } from './steps/gender-step';
import { MbtiStep } from './steps/mbti-step';
import { NicknameStep } from './steps/nickname-step';
import { PhoneStep } from './steps/phone-step';
import { ProfileImageStep } from './steps/profile-image-step';
import { SportsStep } from './steps/sports-step';
import { WorkoutFrequencyStep } from './steps/workout-frequency-step';
import { WorkoutGoalsStep } from './steps/workout-goals-step';
import type { RegisterDraft } from './steps/types';
import { COLORS, layoutStyles } from './steps/ui';

function isValidEmail(email: string): boolean {
  const t = email.trim();
  if (!t.includes('@')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

export default function RegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ provider?: string }>();
  const providerParam = typeof params.provider === 'string' ? params.provider : '';
  const isSocialProvider = providerParam === 'apple' || providerParam === 'kakao';
  const totalSteps = 10;
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10>(1);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<RegisterDraft>({
    email: '',
    password: '',
    agreements: {
      termsOfService: false,
      privacyPolicy: false,
      pointsPolicy: false,
    },
    mbtiParts: { EI: null, SN: null, TF: null, JP: null },
    mbti: null,
    sports: [],
    workout_frequency: null,
    workout_goals: [],
    nickname: '',
    gender: null,
    phone: '',
    profile_image_url: null,
    profile_image_base64: null,
    age: null,
  });

  const progressLabel = useMemo(() => `${step}/${totalSteps}`, [step]);

  const goBack = () => {
    if (step === 1) router.back();
    else setStep((prev) => ((prev - 1) as typeof step));
  };

  const goNext = () => {
    if (step === 10) return;
    setStep((prev) => ((prev + 1) as typeof step));
  };

  const setAgreementAll = (next: boolean) => {
    setDraft((prev) => ({
      ...prev,
      agreements: {
        termsOfService: next,
        privacyPolicy: next,
        pointsPolicy: next,
      },
    }));
  };

  const setAgreementOne = (key: keyof RegisterDraft['agreements'], next: boolean) => {
    setDraft((prev) => ({
      ...prev,
      agreements: {
        ...prev.agreements,
        [key]: next,
      },
    }));
  };

  const allAgreed =
    draft.agreements.termsOfService && draft.agreements.privacyPolicy && draft.agreements.pointsPolicy;

  const emailTrimmed = draft.email.trim();
  const showEmailError = emailTrimmed.length > 0 && !isValidEmail(emailTrimmed);
  const showPasswordError = draft.password.length > 0 && draft.password.length < 6;

  const step1CanProceed = isSocialProvider
    ? draft.agreements.termsOfService &&
      draft.agreements.privacyPolicy &&
      draft.agreements.pointsPolicy
    : isValidEmail(emailTrimmed) &&
      draft.password.length >= 6 &&
      draft.agreements.termsOfService &&
      draft.agreements.privacyPolicy &&
      draft.agreements.pointsPolicy;

  const onPressStep1Next = async () => {
    if (loading || !step1CanProceed) return;

    if (isSocialProvider) {
      goNext();
      return;
    }

    const emailToUse = emailTrimmed.toLowerCase();
    setLoading(true);
    try {
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('email', emailToUse);

      if (error) {
        Alert.alert('오류', error.message);
        return;
      }

      if ((count ?? 0) >= 1) {
        Alert.alert('이미 사용 중인 이메일이에요');
        return;
      }

      // Normalize email before proceeding to later steps.
      if (draft.email !== emailToUse) {
        setDraft((prev) => ({ ...prev, email: emailToUse }));
      }

      goNext();
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={layoutStyles.safeArea} edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={layoutStyles.screen}>
          <View style={layoutStyles.headerRow}>
            <Pressable
              onPress={goBack}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              style={layoutStyles.backButton}
            >
            <Ionicons name="chevron-back" size={24} color="#111827" />
            </Pressable>
            <Text style={layoutStyles.progressText}>{progressLabel}</Text>
            <View style={{ width: 44 }} />
          </View>

        {step === 1 ? (
          <View style={layoutStyles.body}>
            <Text style={layoutStyles.title}>
              {isSocialProvider ? '약관에 동의해 주세요' : '이메일과 비밀번호를 입력해 주세요'}
            </Text>

            {!isSocialProvider ? (
              <>
                <Text style={layoutStyles.label}>이메일</Text>
                <TextInput
                  value={draft.email}
                  onChangeText={(text) => setDraft((prev) => ({ ...prev, email: text }))}
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  style={[layoutStyles.input, showEmailError ? styles.inputError : null]}
                />
                {showEmailError ? <Text style={styles.fieldError}>올바른 이메일 형식을 입력해주세요</Text> : null}

                <Text style={layoutStyles.label}>비밀번호</Text>
                <TextInput
                  value={draft.password}
                  onChangeText={(text) => setDraft((prev) => ({ ...prev, password: text }))}
                  placeholder="비밀번호"
                  secureTextEntry
                  textContentType="newPassword"
                  style={[layoutStyles.input, showPasswordError ? styles.inputError : null]}
                />
                {showPasswordError ? <Text style={styles.fieldError}>비밀번호는 6자 이상이어야 해요</Text> : null}

                <View style={{ height: 8 }} />
              </>
            ) : null}

          <Text style={layoutStyles.label}>약관 동의</Text>

          <AgreementRow
            label="전체 동의"
            checked={allAgreed}
            onToggle={() => setAgreementAll(!allAgreed)}
          />
          <View style={styles.divider} />
          <AgreementRow
            label="서비스이용약관 동의 (필수)"
            checked={draft.agreements.termsOfService}
            onToggle={() => setAgreementOne('termsOfService', !draft.agreements.termsOfService)}
          />
          <AgreementRow
            label="개인정보처리방침 동의 (필수)"
            checked={draft.agreements.privacyPolicy}
            onToggle={() => setAgreementOne('privacyPolicy', !draft.agreements.privacyPolicy)}
          />
          <AgreementRow
            label="포인트정책 동의 (필수)"
            checked={draft.agreements.pointsPolicy}
            onToggle={() => setAgreementOne('pointsPolicy', !draft.agreements.pointsPolicy)}
          />

          <PrimaryButton
            label="다음으로"
            disabled={loading || !step1CanProceed}
            loading={loading}
            onPress={onPressStep1Next}
          />
          </View>
        ) : null}

        {step === 2 ? <MbtiStep draft={draft} setDraft={setDraft} onNext={goNext} /> : null}
        {step === 3 ? <SportsStep draft={draft} setDraft={setDraft} onNext={goNext} /> : null}
        {step === 4 ? (
          <WorkoutFrequencyStep draft={draft} setDraft={setDraft} onNext={goNext} />
        ) : null}
        {step === 5 ? <WorkoutGoalsStep draft={draft} setDraft={setDraft} onNext={goNext} /> : null}
        {step === 6 ? <NicknameStep draft={draft} setDraft={setDraft} onNext={goNext} /> : null}
        {step === 7 ? <GenderStep draft={draft} setDraft={setDraft} onNext={goNext} /> : null}
        {step === 8 ? (
          <PhoneStep draft={draft} setDraft={setDraft} onNext={goNext} />
        ) : null}
        {step === 9 ? (
          <ProfileImageStep draft={draft} setDraft={setDraft} onNext={goNext} onLoadingChange={setLoading} />
        ) : null}
        {step === 10 ? (
          <AgeStep
            draft={draft}
            setDraft={setDraft}
            supabase={supabase}
            onLoadingChange={setLoading}
            onDone={() => {
              console.log('[register] navigation:router.replace(\"/(tabs)\")');
              router.replace('/(tabs)');
            }}
          />
        ) : null}
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function AgreementRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.agreementRow} hitSlop={8}>
      <View style={[styles.checkbox, checked ? styles.checkboxChecked : null]}>
        {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </View>
      <Text style={styles.agreementText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inputError: {
    borderColor: '#EF4444',
  },
  fieldError: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  agreementText: {
    fontSize: 14,
    color: '#111827',
    flexShrink: 1,
  },
});

