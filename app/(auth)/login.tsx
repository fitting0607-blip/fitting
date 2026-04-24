import { grantAttendanceIfNeededOnLogin } from '@/attendance-helpers';
import { enqueueLoginAttendanceModal } from '@/login-attendance-pending';
import * as WebBrowser from 'expo-web-browser';
import { Link, useRouter } from 'expo-router';
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
import * as Linking from 'expo-linking';

import { supabase } from '../../supabase';
import { AppleSignInButton, isAppleAuthAvailable, signInWithApple } from '../utils/appleAuth';

WebBrowser.maybeCompleteAuthSession();

function bytesToHex(bytes: number[]) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomBytes(length: number) {
  const g: any = globalThis as any;
  const cryptoObj = g?.crypto;
  if (cryptoObj?.getRandomValues && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes);
  }

  // Fallback for Expo Go / RN environments where Web Crypto isn't available.
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    out.push(Math.floor(Math.random() * 256));
  }
  return out;
}

function createNonce() {
  return bytesToHex(randomBytes(16));
}

// Small, dependency-free SHA-256 for Apple nonce hashing.
// Output: lowercase hex string.
function sha256Hex(input: string) {
  const utf8 = new TextEncoder().encode(input);

  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const toU32 = (x: number) => x >>> 0;

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const l = utf8.length;
  const bitLenHi = Math.floor((l * 8) / 0x100000000);
  const bitLenLo = (l * 8) >>> 0;

  // Pre-processing: padding
  const withOne = l + 1;
  const padLen = (withOne % 64 <= 56 ? 56 - (withOne % 64) : 56 + (64 - (withOne % 64)));
  const totalLen = withOne + padLen + 8;
  const buf = new Uint8Array(totalLen);
  buf.set(utf8);
  buf[l] = 0x80;
  // Append length (64-bit big-endian)
  buf[totalLen - 8] = (bitLenHi >>> 24) & 0xff;
  buf[totalLen - 7] = (bitLenHi >>> 16) & 0xff;
  buf[totalLen - 6] = (bitLenHi >>> 8) & 0xff;
  buf[totalLen - 5] = bitLenHi & 0xff;
  buf[totalLen - 4] = (bitLenLo >>> 24) & 0xff;
  buf[totalLen - 3] = (bitLenLo >>> 16) & 0xff;
  buf[totalLen - 2] = (bitLenLo >>> 8) & 0xff;
  buf[totalLen - 1] = bitLenLo & 0xff;

  // Initial hash values
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < buf.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      w[i] = ((buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = toU32(w[i - 16] + s0 + w[i - 7] + s1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = toU32(h + S1 + ch + K[i] + w[i]);
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = toU32(S0 + maj);

      h = g;
      g = f;
      f = e;
      e = toU32(d + temp1);
      d = c;
      c = b;
      b = a;
      a = toU32(temp1 + temp2);
    }

    h0 = toU32(h0 + a);
    h1 = toU32(h1 + b);
    h2 = toU32(h2 + c);
    h3 = toU32(h3 + d);
    h4 = toU32(h4 + e);
    h5 = toU32(h5 + f);
    h6 = toU32(h6 + g);
    h7 = toU32(h7 + h);
  }

  const out = [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('');
  return out;
}

function extractSupabaseSessionTokensFromUrl(url: string) {
  try {
    const u = new URL(url);
    const fragment = u.hash?.startsWith('#') ? u.hash.slice(1) : u.hash;
    const params = new URLSearchParams(fragment);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return null;
    return { access_token, refresh_token };
  } catch {
    return null;
  }
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
    isAppleAuthAvailable()
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

  const onKakaoLogin = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
      const redirectTo = supabaseUrl ? `${supabaseUrl.replace(/\/+$/u, '')}/auth/v1/callback` : '';
      if (!redirectTo) {
        Alert.alert('로그인 실패', 'Supabase 설정이 비어있어요. EXPO_PUBLIC_SUPABASE_URL을 설정해 주세요.');
        return;
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        Alert.alert('로그인 실패', error.message);
        return;
      }
      if (!data?.url) {
        Alert.alert('로그인 실패', '인증 URL을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        return;
      }

      const tokens = extractSupabaseSessionTokensFromUrl(result.url);
      if (!tokens) {
        Alert.alert('로그인 실패', '인증 토큰을 확인하지 못했어요. 다시 시도해 주세요.');
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession(tokens);
      if (sessionError) {
        Alert.alert('로그인 실패', sessionError.message);
        return;
      }

      const userId = sessionData?.user?.id ?? sessionData?.session?.user?.id;
      if (userId) {
        const attendance = await grantAttendanceIfNeededOnLogin(userId);
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
      const rawNonce = createNonce();
      const hashedNonce = sha256Hex(rawNonce);

      const credential = await signInWithApple({ nonce: hashedNonce });

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

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>또는</Text>
          <View style={styles.orLine} />
        </View>

        <Pressable
          onPress={onKakaoLogin}
          disabled={loading}
          style={({ pressed }) => [
            styles.kakaoButton,
            pressed && !loading ? styles.kakaoButtonPressed : null,
            loading ? styles.kakaoButtonDisabled : null,
          ]}
        >
          <Text style={styles.kakaoButtonText}>카카오로 계속하기</Text>
        </Pressable>

        {showApple ? (
          <AppleSignInButton
            style={[styles.appleButton, styles.appleButtonSpacing]}
            onPress={onAppleLogin}
          />
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
  kakaoButton: {
    height: 44,
    width: '100%',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
  },
  kakaoButtonPressed: {
    opacity: 0.92,
  },
  kakaoButtonDisabled: {
    opacity: 0.6,
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '700',
  },
  appleButton: {
    height: 44,
    width: '100%',
  },
  appleButtonSpacing: {
    marginTop: 10,
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

