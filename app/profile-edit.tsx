import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

type PublicUser = {
  id: string;
  mbti: string | null;
  profile_image_url: string | null;
  sports: string[] | null;
  workout_goals: string[] | null;
  workout_frequency: string | null;
};

async function uploadAvatarToSupabase({
  userId,
  uri,
}: {
  userId: string;
  uri: string;
}): Promise<string> {
  // 버킷 `avatars` 안의 객체 키: `${userId}/${fileName}` (예: avatars 버킷 → "abc-uuid/1730000000.jpg")
  const fileName = `${Date.now()}.jpg`;
  const storagePath = `${userId}/${fileName}`;

  const res = await fetch(uri);
  const blob = await res.blob();

  const { error: uploadError } = await supabase.storage.from('avatars').upload(storagePath, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('프로필 이미지 URL 생성에 실패했습니다.');
  return data.publicUrl;
}

function Row({
  label,
  value,
  onPress,
  leftSlot,
}: {
  label: string;
  value?: string | null;
  onPress: () => void;
  leftSlot?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} hitSlop={6} accessibilityRole="button">
      <View style={styles.rowLeft}>
        {leftSlot}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : (
          <Text style={[styles.rowValue, styles.rowValuePlaceholder]} numberOfLines={1}>
            미설정
          </Text>
        )}
        <Feather name="chevron-right" size={18} color="#9CA3AF" />
      </View>
    </Pressable>
  );
}

export default function ProfileEditScreen() {
  const router = useRouter();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(false);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const { data, error } = await supabase
        .from('users')
        .select('id,mbti,profile_image_url,sports,workout_goals,workout_frequency')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;

      setMe((data ?? null) as PublicUser | null);
    } catch (e) {
      Alert.alert('불러오기 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadMe();
    }, [loadMe])
  );

  const sportsLabel = useMemo(() => {
    const list = me?.sports ?? [];
    if (!list.length) return null;
    return list.join(', ');
  }, [me?.sports]);

  const goalsLabel = useMemo(() => {
    const list = me?.workout_goals ?? [];
    if (!list.length) return null;
    return list.join(', ');
  }, [me?.workout_goals]);

  const pickAndUpload = useCallback(async () => {
    if (loading) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 접근 권한을 허용해 주세요.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) return;

      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const url = await uploadAvatarToSupabase({ userId: user.id, uri });
      console.log('[profile-edit] avatar upload public URL:', url);

      const { error } = await supabase.from('users').update({ profile_image_url: url }).eq('id', user.id);
      if (error) throw error;

      setMe((prev) => {
        const next: PublicUser =
          prev != null
            ? { ...prev, profile_image_url: url }
            : {
                id: user.id,
                mbti: null,
                profile_image_url: url,
                sports: null,
                workout_goals: null,
                workout_frequency: null,
              };
        console.log('[profile-edit] setMe after upload, profile_image_url:', next.profile_image_url);
        return next;
      });
    } catch (e) {
      Alert.alert('프로필 사진 변경 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
        <Text style={styles.headerTitle}>프로필 수정</Text>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.sectionBox}>
        <Row
          label="프로필 사진"
          value={loading ? '처리 중…' : null}
          onPress={pickAndUpload}
          leftSlot={
            <View style={styles.avatarWrap}>
              {me?.profile_image_url ? (
                <Image
                  key={me.profile_image_url}
                  source={{ uri: me.profile_image_url }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Feather name="user" size={18} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Feather name="camera" size={12} color="#FFFFFF" />
              </View>
            </View>
          }
        />
        <View style={styles.divider} />

        <Row label="MBTI" value={me?.mbti ?? null} onPress={() => router.push('/profile-edit/mbti')} />
        <View style={styles.divider} />
        <Row label="즐겨하는 운동" value={sportsLabel} onPress={() => router.push('/profile-edit/sports')} />
        <View style={styles.divider} />
        <Row
          label="운동 빈도"
          value={me?.workout_frequency ?? null}
          onPress={() => router.push('/profile-edit/workout-frequency')}
        />
        <View style={styles.divider} />
        <Row label="운동 목적" value={goalsLabel} onPress={() => router.push('/profile-edit/workout-goals')} />
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

  sectionBox: {
    marginTop: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    paddingHorizontal: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    maxWidth: '55%',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    flexShrink: 1,
  },
  rowValuePlaceholder: {
    color: '#9CA3AF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 14,
  },

  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3B3BF9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
});

