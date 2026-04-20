import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import Feather from '@expo/vector-icons/Feather';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TrainerProfileRow } from '@/app/trainer-types';
import { supabase } from '@/supabase';

const MAIN = '#3B3BF9';
const BTN_SOFT_BG = '#E8EAFF';

const GOOGLE_PLACES_API_KEY = 'AIzaSyBqxzxKz4mwHfLtMJkszpoNuJnrGne-OAo';

const SEOUL_REGION: Region = {
  latitude: 37.5665,
  longitude: 126.978,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function parseCoord(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function formatAreaLabel(p: Location.LocationGeocodedAddress | undefined): string {
  if (!p) return '지도';
  const city = (p.city ?? p.region ?? '')
    .replace(/^서울특별시$/u, '서울')
    .replace(/특별시$/u, '')
    .replace(/^대한민국$/u, '')
    .trim();
  const district = (p.district ?? p.subregion ?? '').trim();
  const dong = (p.name ?? p.street ?? '').trim();
  const parts = [city, district, dong].filter((s) => s.length > 0);
  const line = parts.join(' ');
  return line.length > 0 ? line : '지도';
}

type PlacePrediction = {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type MyTrainerStatus = 'pending' | 'approved' | 'paid';

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const [initialRegion] = useState<Region>(SEOUL_REGION);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'denied' | 'ready'>('loading');
  const [trainers, setTrainers] = useState<TrainerProfileRow[]>([]);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [listLoading, setListLoading] = useState(true);
  const [areaLabel, setAreaLabel] = useState('위치 확인 중');

  const [myTrainer, setMyTrainer] = useState<{ id: string; status: MyTrainerStatus } | null>(null);
  const [myTrainerLoading, setMyTrainerLoading] = useState(true);
  const [myTrainerBusy, setMyTrainerBusy] = useState(false);

  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [regionQuery, setRegionQuery] = useState('');
  const [predLoading, setPredLoading] = useState(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);

  const snapPoints = useMemo(() => ['15%', '88%'], []);

  const loadLocation = useCallback(async () => {
    setLocationStatus('loading');
    setAreaLabel('위치 확인 중');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        setAreaLabel('위치를 알 수 없어요');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;

      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        setAreaLabel(formatAreaLabel(geo[0]));
      } catch {
        setAreaLabel('내 주변');
      }

      setLocationStatus('ready');
      requestAnimationFrame(() => {
        mapRef.current?.animateToRegion(
          {
            latitude,
            longitude,
            latitudeDelta: 0.06,
            longitudeDelta: 0.06,
          },
          400
        );
      });
    } catch {
      setLocationStatus('denied');
      setAreaLabel('위치를 알 수 없어요');
    }
  }, []);

  const animateToLatLng = useCallback((latitude: number, longitude: number) => {
    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(
        {
          latitude,
          longitude,
          latitudeDelta: 0.06,
          longitudeDelta: 0.06,
        },
        420
      );
    });
  }, []);

  const loadTrainers = useCallback(async () => {
    setListLoading(true);
    try {
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select(
          'id, user_id, facility_name, facility_addr, facility_addr_detail, intro, latitude, longitude, status, is_approved, facility_images, cert_images, profile_images'
        )
        // paid(노출) 우선. 기존 데이터 호환을 위해 is_approved=true도 허용.
        .or('status.eq.paid,is_approved.eq.true');

      if (error) throw error;

      const rows = (data ?? []) as TrainerProfileRow[];
      setTrainers(rows);

      const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
      if (userIds.length === 0) {
        setNicknames({});
        return;
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, nickname')
        .in('id', userIds);

      if (usersError) throw usersError;

      const map: Record<string, string> = {};
      for (const u of usersData ?? []) {
        const id = (u as { id: string }).id;
        const nickname = (u as { nickname: string | null }).nickname;
        map[id] = nickname?.trim() ? nickname : '트레이너';
      }
      setNicknames(map);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '목록을 불러오지 못했어요.';
      Alert.alert('오류', msg);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadMyTrainer = useCallback(async () => {
    setMyTrainerLoading(true);
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user?.id) {
        setMyTrainer(null);
        return;
      }

      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('id, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data?.id) {
        setMyTrainer(null);
        return;
      }

      const raw = String((data as any).status ?? '').trim();
      const status: MyTrainerStatus | null =
        raw === 'pending' || raw === 'approved' || raw === 'paid' ? (raw as MyTrainerStatus) : null;

      if (!status) {
        setMyTrainer(null);
        return;
      }
      setMyTrainer({ id: String((data as any).id), status });
    } catch {
      setMyTrainer(null);
    } finally {
      setMyTrainerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocation();
    void loadTrainers();
    void loadMyTrainer();
  }, [loadLocation, loadMyTrainer, loadTrainers]);

  useEffect(() => {
    if (!regionModalOpen) return;
    const q = regionQuery.trim();
    if (q.length < 1) {
      setPredictions([]);
      setPredLoading(false);
      return;
    }

    setPredLoading(true);
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url =
          `https://maps.googleapis.com/maps/api/place/autocomplete/json` +
          `?input=${encodeURIComponent(q)}` +
          `&key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}` +
          `&language=ko` +
          `&components=country:kr` +
          `&types=geocode`;

        console.log('[places][autocomplete] url:', url);
        const res = await fetch(url, { signal: controller.signal });
        console.log('[places][autocomplete] status:', res.status, 'ok:', res.ok);
        const json = (await res.json()) as any;
        console.log('[places][autocomplete] data:', json);
        const list = Array.isArray(json?.predictions) ? (json.predictions as PlacePrediction[]) : [];
        setPredictions(list);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setPredictions([]);
      } finally {
        setPredLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [regionModalOpen, regionQuery]);

  const pickPrediction = useCallback(
    async (p: PlacePrediction) => {
      setPredLoading(true);
      try {
        const url =
          `https://maps.googleapis.com/maps/api/place/details/json` +
          `?place_id=${encodeURIComponent(p.place_id)}` +
          `&fields=geometry,name,formatted_address` +
          `&key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}` +
          `&language=ko`;
        console.log('[places][details] url:', url);
        const res = await fetch(url);
        console.log('[places][details] status:', res.status, 'ok:', res.ok);
        const json = (await res.json()) as any;
        console.log('[places][details] data:', json);
        const loc = json?.result?.geometry?.location;
        const lat = typeof loc?.lat === 'number' ? loc.lat : parseFloat(String(loc?.lat));
        const lng = typeof loc?.lng === 'number' ? loc.lng : parseFloat(String(loc?.lng));
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          throw new Error('좌표를 가져오지 못했어요.');
        }

        const label =
          p.structured_formatting?.main_text?.trim() ||
          (typeof json?.result?.name === 'string' ? json.result.name.trim() : '') ||
          p.description;
        setAreaLabel(label);
        setRegionModalOpen(false);
        setRegionQuery('');
        setPredictions([]);
        animateToLatLng(lat, lng);
      } catch (e: unknown) {
        Alert.alert('검색 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.');
      } finally {
        setPredLoading(false);
      }
    },
    [animateToLatLng]
  );

  const trainersWithMarkers = useMemo(() => {
    return trainers.filter((t) => {
      const lat = parseCoord(t.latitude);
      const lng = parseCoord(t.longitude);
      return lat != null && lng != null;
    });
  }, [trainers]);

  const addressLine = useCallback((t: TrainerProfileRow) => {
    const main = (t.facility_addr ?? '').trim();
    const detail = (t.facility_addr_detail ?? '').trim();
    if (main && detail) return `${main} ${detail}`;
    return main || detail || '주소 미등록';
  }, []);

  const renderTrainerCard = useCallback(
    ({ item }: { item: TrainerProfileRow }) => {
      const rawName = nicknames[item.user_id] ?? '트레이너';
      const displayName = rawName.endsWith('피티') ? rawName : `${rawName} 피티`;
      const thumb = item.profile_images?.[0] ?? item.facility_images?.[0] ?? null;
      const addr = addressLine(item);
      const facility = item.facility_name?.trim() || '시설명 미등록';

      return (
        <Pressable
          style={styles.sheetCard}
          onPress={() =>
            router.push({ pathname: '/trainer-detail', params: { id: item.id } } as unknown as Href)
          }
          accessibilityRole="button"
          accessibilityLabel={`${displayName} 상세`}
        >
          {thumb ? (
            <Image source={{ uri: thumb }} style={styles.sheetCardThumb} contentFit="cover" />
          ) : (
            <View style={[styles.sheetCardThumb, styles.sheetCardThumbPh]}>
              <Feather name="user" size={26} color="#9CA3AF" />
            </View>
          )}
          <View style={styles.sheetCardBody}>
            <Text style={styles.sheetCardName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.sheetCardAddr} numberOfLines={1}>
              {addr}
            </Text>
            <Text style={styles.sheetCardFacility} numberOfLines={1}>
              {facility}
            </Text>
          </View>
        </Pressable>
      );
    },
    [addressLine, nicknames, router]
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.sheetListHeader}>
        <Text style={styles.sheetListTitle}>피티 목록 보기</Text>
        {listLoading ? <ActivityIndicator size="small" color={MAIN} /> : null}
      </View>
    ),
    [listLoading]
  );

  const listEmpty = useMemo(
    () =>
      !listLoading ? (
        <View style={styles.sheetEmptyWrap}>
          <Text style={styles.sheetEmpty}>등록된 트레이너가 없어요.</Text>
        </View>
      ) : null,
    [listLoading]
  );

  const mapReady = Platform.OS !== 'web';
  const { height: winH } = Dimensions.get('window');
  const webListMaxH = Math.round(winH * 0.38);

  const cancelRegistration = useCallback(() => {
    if (!myTrainer?.id || myTrainerBusy) return;
    Alert.alert('등록 취소', '정말로 등록을 취소할까요?', [
      { text: '아니오', style: 'cancel' },
      {
        text: '취소하기',
        style: 'destructive',
        onPress: async () => {
          setMyTrainerBusy(true);
          try {
            const { error } = await supabase.from('trainer_profiles').delete().eq('id', myTrainer.id);
            if (error) throw error;
            setMyTrainer(null);
            await loadTrainers();
          } catch (e: unknown) {
            Alert.alert('실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.');
          } finally {
            setMyTrainerBusy(false);
          }
        },
      },
    ]);
  }, [loadTrainers, myTrainer?.id, myTrainerBusy]);

  const floatingHeader = (
    <View
      pointerEvents="box-none"
      style={[styles.floatingHeader, { paddingTop: insets.top + 6 }]}
    >
      <Pressable
        style={styles.locationChip}
        onPress={() => setRegionModalOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="지역"
      >
        <Text style={styles.locationChipText} numberOfLines={1}>
          {areaLabel}
        </Text>
        <Feather name="chevron-down" size={18} color="#374151" />
      </Pressable>
      {myTrainerLoading ? (
        <View style={styles.headerRightLoading}>
          <ActivityIndicator size="small" color={MAIN} />
        </View>
      ) : myTrainer?.status === 'pending' ? (
        <View style={styles.headerRightRow}>
          <View style={styles.statePill}>
            <Text style={styles.statePillText}>승인 대기 중</Text>
          </View>
          <Pressable
            style={[styles.cancelBtn, myTrainerBusy && styles.btnDisabled]}
            onPress={cancelRegistration}
            accessibilityRole="button"
            accessibilityLabel="등록 취소"
            disabled={myTrainerBusy}
          >
            <Text style={styles.cancelBtnText}>등록 취소</Text>
          </Pressable>
        </View>
      ) : myTrainer?.status === 'approved' ? (
        <Pressable
          style={styles.registerBtn}
          onPress={() => Alert.alert('안내', '결제 기능은 준비 중입니다.')}
          accessibilityRole="button"
          accessibilityLabel="결제 대기 중"
        >
          <Text style={styles.registerBtnText}>결제 대기 중</Text>
        </Pressable>
      ) : myTrainer?.status === 'paid' ? null : (
        <Pressable
          style={styles.registerBtn}
          onPress={() => router.push('/trainer-apply' as Href)}
          accessibilityRole="button"
          accessibilityLabel="피티 등록"
        >
          <Text style={styles.registerBtnText}>피티 등록</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.mapLayer}>
        {!mapReady ? (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackText}>지도는 iOS·Android 앱에서 이용할 수 있어요.</Text>
          </View>
        ) : locationStatus === 'loading' ? (
          <View style={styles.mapFallback}>
            <ActivityIndicator size="large" color={MAIN} />
            <Text style={styles.mapHint}>위치를 불러오는 중이에요…</Text>
          </View>
        ) : (
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_GOOGLE}
            initialRegion={initialRegion}
            showsUserLocation={locationStatus === 'ready'}
            showsMyLocationButton={false}
          >
            {trainersWithMarkers.map((t) => {
              const lat = parseCoord(t.latitude)!;
              const lng = parseCoord(t.longitude)!;
              const title = nicknames[t.user_id] ?? '트레이너';
              return (
                <Marker
                  key={t.id}
                  coordinate={{ latitude: lat, longitude: lng }}
                  title={title}
                  description={t.facility_name ?? undefined}
                  onCalloutPress={() =>
                    router.push({ pathname: '/trainer-detail', params: { id: t.id } } as unknown as Href)
                  }
                />
              );
            })}
          </MapView>
        )}

        {locationStatus === 'denied' && mapReady ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>위치 권한이 꺼져 있어 기본 지역만 표시돼요.</Text>
            <Pressable onPress={() => void loadLocation()} hitSlop={8}>
              <Text style={styles.bannerLink}>다시 시도</Text>
            </Pressable>
          </View>
        ) : null}

        {floatingHeader}
      </View>

      {mapReady ? (
        <BottomSheet
          index={0}
          snapPoints={snapPoints}
          enablePanDownToClose={false}
          enableDynamicSizing={false}
          handleIndicatorStyle={styles.sheetHandle}
          backgroundStyle={styles.sheetBg}
          bottomInset={0}
        >
          <BottomSheetFlatList
            data={trainers}
            keyExtractor={(item) => item.id}
            renderItem={renderTrainerCard}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={listEmpty}
            contentContainerStyle={[
              styles.sheetListContent,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            ItemSeparatorComponent={() => <View style={styles.sheetSep} />}
            style={styles.sheetList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          />
        </BottomSheet>
      ) : (
        <View style={[styles.webSheet, { maxHeight: webListMaxH }]}>
          <View style={styles.sheetHandleOuter}>
            <View style={[styles.sheetHandle, styles.sheetHandleStandalone]} />
          </View>
          {listHeader}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.sheetListContent,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {trainers.length === 0 && listEmpty}
            {trainers.map((item, index) => (
              <View key={item.id}>
                {renderTrainerCard({ item })}
                {index < trainers.length - 1 ? <View style={styles.sheetSep} /> : null}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={regionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRegionModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRegionModalOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>지역 선택</Text>
              <Pressable onPress={() => setRegionModalOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color="#111111" />
              </Pressable>
            </View>

            <View style={styles.searchRow}>
              <Feather name="search" size={18} color="#6B7280" />
              <TextInput
                value={regionQuery}
                onChangeText={setRegionQuery}
                placeholder="동/구/시를 검색하세요"
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
                autoFocus
                returnKeyType="search"
              />
              {predLoading ? <ActivityIndicator size="small" color={MAIN} /> : null}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.predList}
            >
              {predictions.map((p) => {
                const main = p.structured_formatting?.main_text ?? p.description;
                const secondary = p.structured_formatting?.secondary_text ?? '';
                return (
                  <Pressable
                    key={p.place_id}
                    style={styles.predRow}
                    onPress={() => void pickPrediction(p)}
                  >
                    <View style={styles.predTexts}>
                      <Text style={styles.predMain} numberOfLines={1}>
                        {main}
                      </Text>
                      {secondary ? (
                        <Text style={styles.predSub} numberOfLines={1}>
                          {secondary}
                        </Text>
                      ) : null}
                    </View>
                    <Feather name="chevron-right" size={18} color="#9CA3AF" />
                  </Pressable>
                );
              })}
              {regionQuery.trim().length > 0 && !predLoading && predictions.length === 0 ? (
                <Text style={styles.predEmpty}>검색 결과가 없어요.</Text>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  mapLayer: {
    flex: 1,
    position: 'relative',
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#E5E7EB',
  },
  mapFallbackText: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
  },
  mapHint: {
    marginTop: 10,
    fontSize: 14,
    color: '#6B7280',
  },
  banner: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
  },
  bannerLink: {
    fontSize: 13,
    fontWeight: '600',
    color: MAIN,
  },
  floatingHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 20,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '62%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  locationChipText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
  },
  registerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: BTN_SOFT_BG,
  },
  registerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: MAIN,
  },
  headerRightLoading: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statePill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  statePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  sheetBg: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
  },
  sheetHandleOuter: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  sheetHandleStandalone: {
    marginBottom: 0,
  },
  webSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  sheetListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  sheetListTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
  },
  sheetListContent: {
    paddingHorizontal: 16,
  },
  sheetList: {
    flex: 1,
  },
  sheetSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  sheetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 14,
  },
  sheetCardThumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  sheetCardThumbPh: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCardBody: {
    flex: 1,
    minWidth: 0,
  },
  sheetCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  sheetCardAddr: {
    marginTop: 4,
    fontSize: 13,
    color: '#9CA3AF',
  },
  sheetCardFacility: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  sheetEmptyWrap: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  sheetEmpty: {
    fontSize: 14,
    color: '#6B7280',
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalWrap: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 80,
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111111',
    paddingVertical: 0,
  },
  predList: {
    paddingVertical: 6,
  },
  predRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  predTexts: {
    flex: 1,
    minWidth: 0,
  },
  predMain: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111111',
  },
  predSub: {
    marginTop: 3,
    fontSize: 12,
    color: '#6B7280',
  },
  predEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 13,
    color: '#6B7280',
  },
});
