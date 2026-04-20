import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrainerProfileRow } from '@/app/trainer-types';
import { supabase } from '@/supabase';

const MAIN = '#3B3BF9';
const { width: SCREEN_W } = Dimensions.get('window');
const GALLERY_H = 220;

export default function TrainerDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = useMemo(() => String(params.id ?? '').trim(), [params.id]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<TrainerProfileRow | null>(null);
  const [nickname, setNickname] = useState<string>('');

  const load = useCallback(async () => {
    if (!id) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select(
          'id, user_id, facility_name, facility_addr, facility_addr_detail, intro, latitude, longitude, status, is_approved, facility_images, cert_images, profile_images'
        )
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setProfile(null);
        return;
      }

      const row = data as TrainerProfileRow;
      setProfile(row);

      const { data: userRow } = await supabase.from('users').select('nickname').eq('id', row.user_id).maybeSingle();
      const n = (userRow as { nickname?: string | null } | null)?.nickname?.trim();
      setNickname(n || '트레이너');
    } catch (e: unknown) {
      Alert.alert('오류', e instanceof Error ? e.message : '불러오지 못했어요.');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const facilityUrls = useMemo(() => (profile?.facility_images ?? []).filter(Boolean), [profile]);

  const fullAddress = useMemo(() => {
    if (!profile) return '';
    const a = (profile.facility_addr ?? '').trim();
    const b = (profile.facility_addr_detail ?? '').trim();
    if (a && b) return `${a} ${b}`;
    return a || b || '';
  }, [profile]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <ActivityIndicator size="large" color={MAIN} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.centered} edges={['top']}>
        <Text style={styles.muted}>트레이너 정보를 찾을 수 없어요.</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>돌아가기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn} accessibilityLabel="뒤로">
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {nickname}
        </Text>
        <Pressable
          onPress={() => router.push({ pathname: '/report', params: { targetId: profile.user_id } })}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityLabel="신고"
        >
          <Feather name="flag" size={20} color="#EF4444" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {facilityUrls.length > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
          >
            {facilityUrls.map((uri) => (
              <Image
                key={uri}
                source={{ uri }}
                style={{ width: SCREEN_W, height: GALLERY_H }}
                contentFit="cover"
              />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.galleryPlaceholder, { width: SCREEN_W, height: GALLERY_H }]}>
            <Feather name="image" size={40} color="#9CA3AF" />
            <Text style={styles.placeholderText}>등록된 시설 사진이 없어요</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.facilityName}>{profile.facility_name?.trim() || '시설명 미등록'}</Text>
          {fullAddress ? (
            <View style={styles.addrRow}>
              <Feather name="map-pin" size={16} color="#6B7280" />
              <Text style={styles.addrText}>{fullAddress}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>소개</Text>
          <Text style={styles.intro}>{(profile.intro ?? '').trim() || '등록된 소개글이 없어요.'}</Text>
        </View>

        <Pressable
          style={styles.primaryBtn}
          onPress={() => Alert.alert('안내', '준비 중입니다')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>피티 매칭하기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  muted: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  backLink: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  backLinkText: {
    color: MAIN,
    fontWeight: '600',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  scroll: {
    paddingBottom: 32,
  },
  gallery: {
    maxHeight: GALLERY_H,
  },
  galleryPlaceholder: {
    alignSelf: 'center',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  facilityName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
  },
  addrText: {
    flex: 1,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  intro: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  primaryBtn: {
    marginHorizontal: 16,
    marginTop: 28,
    backgroundColor: MAIN,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
