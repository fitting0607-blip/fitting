import { supabase } from '../../../supabase';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { layoutStyles } from './ui';

type NicknameCheckStatus = 'idle' | 'checking' | 'available' | 'duplicate' | 'error';

export function NicknameStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const nicknameTrimmed = useMemo(() => draft.nickname.trim(), [draft.nickname]);
  const [status, setStatus] = useState<NicknameCheckStatus>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const lastCheckedNicknameRef = useRef<string>('');

  useEffect(() => {
    const n = nicknameTrimmed;

    if (n.length === 0) {
      setStatus('idle');
      setErrorText(null);
      lastCheckedNicknameRef.current = '';
      return;
    }

    if (n.length < 2) {
      setStatus('idle');
      setErrorText(null);
      lastCheckedNicknameRef.current = '';
      return;
    }

    setStatus('checking');
    setErrorText(null);

    const handle = setTimeout(async () => {
      // same nickname already checked and still current
      if (lastCheckedNicknameRef.current === n) return;

      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('nickname', n);

      // nickname changed while request in-flight; ignore stale result
      if (nicknameTrimmed !== n) return;

      if (error) {
        setStatus('error');
        setErrorText(error.message);
        return;
      }

      lastCheckedNicknameRef.current = n;
      if ((count ?? 0) >= 1) setStatus('duplicate');
      else setStatus('available');
    }, 500);

    return () => clearTimeout(handle);
  }, [nicknameTrimmed]);

  const canNext = nicknameTrimmed.length >= 2 && status === 'available';

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>닉네임을 입력해주세요</Text>
        <TextInput
          value={draft.nickname}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, nickname: text }))}
          placeholder="닉네임"
          style={layoutStyles.input}
          autoCapitalize="none"
        />
        {nicknameTrimmed.length >= 2 ? (
          <Text
            style={[
              styles.helperText,
              status === 'duplicate'
                ? styles.helperTextError
                : status === 'available'
                  ? styles.helperTextSuccess
                  : styles.helperTextMuted,
            ]}
          >
            {status === 'checking'
              ? '확인 중...'
              : status === 'duplicate'
                ? '이미 사용 중인 닉네임이에요'
                : status === 'available'
                  ? '사용 가능한 닉네임이에요'
                  : status === 'error'
                    ? errorText ?? '확인에 실패했어요'
                    : ' '}
          </Text>
        ) : null}
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              if (nicknameTrimmed.length < 2) {
                Alert.alert('입력 필요', '닉네임은 최소 2자 이상이어야 합니다.');
                return;
              }
              if (status === 'duplicate') {
                Alert.alert('확인 필요', '이미 사용 중인 닉네임이에요');
                return;
              }
              if (status === 'checking') {
                Alert.alert('확인 중', '닉네임을 확인 중이에요. 잠시만 기다려주세요.');
                return;
              }
              Alert.alert('확인 필요', '닉네임을 확인해주세요.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  helperText: {
    marginTop: 8,
    fontSize: 13,
  },
  helperTextMuted: {
    color: '#6B7280',
  },
  helperTextError: {
    color: '#EF4444',
  },
  helperTextSuccess: {
    color: '#16A34A',
  },
});

