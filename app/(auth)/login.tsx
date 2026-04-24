import { grantAttendanceIfNeededOnLogin } from '@/attendance-helpers';
import { enqueueLoginAttendanceModal } from '@/login-attendance-pending';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Link, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { supabase } from '../../supabase';

function bytesToHex(bytes: number[]) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function createNonce() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return bytesToHex(bytes);
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!mounted) return;
        setAppleAvailable(Boolean(ok));
      })
      .catch(() => {
        if (!mounted) return;
        setAppleAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const showApple = useMemo(() => Platform.OS === 'ios' && appleAvailable, [appleAvailable]);

  const onLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('입력 필요', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        Alert.alert('로그인 실패', error.message);
        return;
      }

      if (data.user?.id) {
        const attendance = await grantAttendanceIfNeededOnLogin(data.user.id);
        if (attendance.granted) {
          enqueueLoginAttendanceModal(attendance.pointsAwarded);
        }
      }

      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const onAppleLogin = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const rawNonce = await createNonce();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        Alert.alert('로그인 실패', 'Apple 인증 토큰을 가져오지 못했어요. 다시 시도해 주세요.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) {
        Alert.alert('로그인 실패', error.message);
        return;
      }

      if (data.user?.id) {
        const attendance = await grantAttendanceIfNeededOnLogin(data.user.id);
        if (attendance.granted) {
          enqueueLoginAttendanceModal(attendance.pointsAwarded);
        }
      }

      router.replace('/(tabs)');
    } catch (e) {
      const anyErr = e as any;
      if (anyErr?.code === 'ERR_CANCELED') {
        return;
      }
      Alert.alert('오류', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <Text style={styles.title}>fitting</Text>

        <Text style={styles.label}>이메일</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          style={styles.input}
        />

        <Text style={styles.label}>비밀번호</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="비밀번호"
          secureTextEntry
          textContentType="password"
          style={styles.input}
        />

        <Pressable
          onPress={onLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && !loading ? styles.primaryButtonPressed : null,
            loading ? styles.primaryButtonDisabled : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>{loading ? '로그인 중...' : '로그인'}</Text>
        </Pressable>

        {showApple ? (
          <>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>또는</Text>
              <View style={styles.orLine} />
            </View>

            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={12}
              style={styles.appleButton}
              onPress={onAppleLogin}
            />
          </>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.footerText}>계정이 없으신가요?</Text>
          <Link href="/register" style={styles.linkText}>
            회원가입
          </Link>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 28,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#3B3BF9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    marginBottom: 12,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  orText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  appleButton: {
    height: 44,
    width: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  footerText: {
    color: '#374151',
  },
  linkText: {
    color: '#3B3BF9',
    fontWeight: '700',
  },
});

