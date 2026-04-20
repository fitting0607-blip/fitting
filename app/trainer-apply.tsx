import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';
import { decodeBase64ToBytes, PUBLIC_UPLOAD_BUCKET } from '@/app/utils/imageBytes';

const MAIN = '#3B3BF9';
const MAX_FACILITY = 5;
const MAX_CERT = 5;
const MAX_PROFILE = 5;

type Picked = ImagePicker.ImagePickerAsset;

async function uploadAsset(userId: string, asset: Picked, folder: string, index: number): Promise<string> {
  const base64 = asset.base64;
  if (!base64) throw new Error('사진 데이터를 읽을 수 없습니다. 다시 선택해 주세요.');

  const storagePath = `${userId}/trainer/${folder}_${Date.now()}_${index}.jpg`;
  const byteArray = decodeBase64ToBytes(base64);

  const { error: uploadError } = await supabase.storage.from(PUBLIC_UPLOAD_BUCKET).upload(storagePath, byteArray, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PUBLIC_UPLOAD_BUCKET).getPublicUrl(storagePath);
  if (!data?.publicUrl) throw new Error('업로드 URL을 가져오지 못했어요.');
  return data.publicUrl;
}

export default function TrainerApplyScreen() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [facilityImages, setFacilityImages] = useState<Picked[]>([]);
  const [certImages, setCertImages] = useState<Picked[]>([]);
  const [facilityName, setFacilityName] = useState('');
  const [facilityAddr, setFacilityAddr] = useState('');
  const [facilityAddrDetail, setFacilityAddrDetail] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const [profileImages, setProfileImages] = useState<Picked[]>([]);
  const [intro, setIntro] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  const pickFacility = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('권한 필요', '사진 접근을 허용해 주세요.');
      return;
    }
    const remain = MAX_FACILITY - facilityImages.length;
    if (remain <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const next = [...facilityImages, ...result.assets].slice(0, MAX_FACILITY);
    setFacilityImages(next);
  }, [facilityImages]);

  const pickCert = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('권한 필요', '사진 접근을 허용해 주세요.');
      return;
    }
    const remain = MAX_CERT - certImages.length;
    if (remain <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    setCertImages([...certImages, ...result.assets].slice(0, MAX_CERT));
  }, [certImages]);

  const pickProfile = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('권한 필요', '사진 접근을 허용해 주세요.');
      return;
    }
    const remain = MAX_PROFILE - profileImages.length;
    if (remain <= 0) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remain,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    setProfileImages([...profileImages, ...result.assets].slice(0, MAX_PROFILE));
  }, [profileImages]);

  const fillLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '시설 좌표를 찍으려면 위치 권한이 필요해요.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      Alert.alert('완료', '현재 위치를 시설 좌표로 저장했어요. (지도 마커 표시에 사용돼요)');
    } catch (e: unknown) {
      Alert.alert('오류', e instanceof Error ? e.message : '위치를 가져오지 못했어요.');
    } finally {
      setLocating(false);
    }
  }, []);

  const goNextFrom1 = useCallback(() => {
    if (facilityImages.length === 0) {
      Alert.alert('입력 확인', '시설 사진을 1장 이상 추가해 주세요.');
      return;
    }
    if (!facilityName.trim()) {
      Alert.alert('입력 확인', '시설명을 입력해 주세요.');
      return;
    }
    if (!facilityAddr.trim()) {
      Alert.alert('입력 확인', '시설 주소를 입력해 주세요.');
      return;
    }
    setStep(2);
  }, [facilityAddr, facilityImages.length, facilityName]);

  const goNextFrom2 = useCallback(() => {
    if (profileImages.length === 0) {
      Alert.alert('입력 확인', '프로필 사진을 1장 이상 추가해 주세요.');
      return;
    }
    setStep(3);
  }, [profileImages.length]);

  const submit = useCallback(async () => {
    const introTrim = intro.trim();
    if (!introTrim) {
      Alert.alert('입력 확인', '소개글을 입력해 주세요.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const facilityUrls: string[] = [];
      for (let i = 0; i < facilityImages.length; i++) {
        facilityUrls.push(await uploadAsset(user.id, facilityImages[i]!, 'facility', i));
      }
      const certUrls: string[] = [];
      for (let i = 0; i < certImages.length; i++) {
        certUrls.push(await uploadAsset(user.id, certImages[i]!, 'cert', i));
      }
      const profileUrls: string[] = [];
      for (let i = 0; i < profileImages.length; i++) {
        profileUrls.push(await uploadAsset(user.id, profileImages[i]!, 'profile', i));
      }

      const { error: insertErr } = await supabase.from('trainer_profiles').insert({
        user_id: user.id,
        facility_name: facilityName.trim(),
        facility_addr: facilityAddr.trim(),
        facility_addr_detail: facilityAddrDetail.trim() || null,
        intro: introTrim,
        latitude,
        longitude,
        status: 'pending',
        is_approved: false,
        facility_images: facilityUrls,
        cert_images: certUrls,
        profile_images: profileUrls,
      });

      if (insertErr) throw insertErr;

      setStep(4);
    } catch (e: unknown) {
      Alert.alert('제출 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [
    certImages,
    facilityAddr,
    facilityAddrDetail,
    facilityImages,
    facilityName,
    intro,
    latitude,
    longitude,
    profileImages,
    submitting,
  ]);

  const thumbGrid = (items: Picked[], onRemove: (i: number) => void) => (
    <View style={styles.thumbRow}>
      {items.map((a, i) => (
        <View key={`${a.uri ?? i}-${i}`} style={styles.thumbWrap}>
          <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" />
          <Pressable style={styles.thumbRemove} onPress={() => onRemove(i)} hitSlop={6}>
            <Feather name="x" size={16} color="#FFFFFF" />
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => (step === 4 ? router.replace('/(tabs)/map') : router.back())} style={styles.headerBtn}>
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>피티 등록</Text>
        <View style={styles.headerBtn} />
      </View>

      {step === 4 ? (
        <View style={styles.doneBox}>
          <Feather name="check-circle" size={56} color={MAIN} />
          <Text style={styles.doneTitle}>등록이 완료됐어요</Text>
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>승인 대기 중</Text>
          </View>
          <Text style={styles.doneDesc}>검토 후 승인되면 지도에 노출돼요.</Text>
          <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/map')}>
            <Text style={styles.primaryBtnText}>지도로 이동</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.steps}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={styles.stepDotWrap}>
                <View style={[styles.stepDot, step >= n ? styles.stepDotOn : styles.stepDotOff]} />
                <Text style={[styles.stepLabel, step >= n ? styles.stepLabelOn : styles.stepLabelOff]}>
                  {n}단계
                </Text>
              </View>
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text style={styles.label}>시설 사진 (최대 {MAX_FACILITY}장)</Text>
              {thumbGrid(facilityImages, (i) =>
                setFacilityImages((prev) => prev.filter((_, idx) => idx !== i))
              )}
              {facilityImages.length < MAX_FACILITY ? (
                <Pressable style={styles.addBtn} onPress={() => void pickFacility()}>
                  <Feather name="plus" size={20} color={MAIN} />
                  <Text style={styles.addBtnText}>사진 추가</Text>
                </Pressable>
              ) : null}

              <Text style={[styles.label, styles.mt]}>시설명</Text>
              <TextInput
                value={facilityName}
                onChangeText={setFacilityName}
                placeholder="예: OO 피트니스"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />

              <Text style={[styles.label, styles.mt]}>시설 주소</Text>
              <TextInput
                value={facilityAddr}
                onChangeText={setFacilityAddr}
                placeholder="도로명 / 지번 주소"
                placeholderTextColor="#9CA3AF"
                style={styles.input}
              />
              <TextInput
                value={facilityAddrDetail}
                onChangeText={setFacilityAddrDetail}
                placeholder="상세 주소 (동·호 등, 선택)"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.inputMt]}
              />

              <Pressable
                style={[styles.secondaryBtn, styles.mt]}
                onPress={() => void fillLocation()}
                disabled={locating}
              >
                {locating ? (
                  <ActivityIndicator color={MAIN} />
                ) : (
                  <Text style={styles.secondaryBtnText}>현재 위치를 시설 좌표로 저장 (지도 마커용)</Text>
                )}
              </Pressable>
              {latitude != null && longitude != null ? (
                <Text style={styles.coordHint}>
                  좌표: {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </Text>
              ) : null}

              <Text style={[styles.label, styles.mt]}>자격증 사진 (최대 {MAX_CERT}장) (선택)</Text>
              {thumbGrid(certImages, (i) => setCertImages((prev) => prev.filter((_, idx) => idx !== i)))}
              {certImages.length < MAX_CERT ? (
                <Pressable style={styles.addBtn} onPress={() => void pickCert()}>
                  <Feather name="plus" size={20} color={MAIN} />
                  <Text style={styles.addBtnText}>자격증 사진 추가</Text>
                </Pressable>
              ) : null}

              <Pressable style={[styles.primaryBtn, styles.mtLg]} onPress={goNextFrom1}>
                <Text style={styles.primaryBtnText}>다음</Text>
              </Pressable>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.label}>프로필 사진 (최대 {MAX_PROFILE}장)</Text>
              {thumbGrid(profileImages, (i) =>
                setProfileImages((prev) => prev.filter((_, idx) => idx !== i))
              )}
              {profileImages.length < MAX_PROFILE ? (
                <Pressable style={styles.addBtn} onPress={() => void pickProfile()}>
                  <Feather name="plus" size={20} color={MAIN} />
                  <Text style={styles.addBtnText}>사진 추가</Text>
                </Pressable>
              ) : null}

              <View style={styles.rowBtns}>
                <Pressable style={styles.outlineBtn} onPress={() => setStep(1)}>
                  <Text style={styles.outlineBtnText}>이전</Text>
                </Pressable>
                <Pressable style={styles.primaryBtnFlex} onPress={goNextFrom2}>
                  <Text style={styles.primaryBtnText}>다음</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <Text style={styles.label}>소개글 (최대 300자)</Text>
              <TextInput
                value={intro}
                onChangeText={(t) => setIntro(t.slice(0, 300))}
                placeholder="트레이닝 경력, 프로그램 소개 등을 적어 주세요."
                placeholderTextColor="#9CA3AF"
                style={styles.textarea}
                multiline
                textAlignVertical="top"
                maxLength={300}
              />
              <Text style={styles.counter}>{intro.length}/300</Text>

              <View style={styles.rowBtns}>
                <Pressable style={styles.outlineBtn} onPress={() => setStep(2)} disabled={submitting}>
                  <Text style={styles.outlineBtnText}>이전</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtnFlex, submitting && styles.btnDisabled]}
                  onPress={() => void submit()}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.primaryBtnText}>제출하기</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
        </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 48,
    height: 48,
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
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  stepDotWrap: {
    alignItems: 'center',
    gap: 6,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepDotOn: {
    backgroundColor: MAIN,
  },
  stepDotOff: {
    backgroundColor: '#E5E7EB',
  },
  stepLabel: {
    fontSize: 11,
  },
  stepLabelOn: {
    color: MAIN,
    fontWeight: '600',
  },
  stepLabelOff: {
    color: '#9CA3AF',
  },
  body: {
    padding: 16,
    paddingBottom: 40,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 8,
  },
  mt: {
    marginTop: 18,
  },
  mtLg: {
    marginTop: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
  },
  inputMt: {
    marginTop: 8,
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111111',
    minHeight: 140,
  },
  counter: {
    alignSelf: 'flex-end',
    marginTop: 6,
    fontSize: 12,
    color: '#9CA3AF',
  },
  thumbRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  thumbWrap: {
    width: 76,
    height: 76,
    borderRadius: 10,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MAIN,
    borderStyle: 'dashed',
  },
  addBtnText: {
    color: MAIN,
    fontWeight: '600',
    fontSize: 15,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: MAIN,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  coordHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
  },
  primaryBtn: {
    backgroundColor: MAIN,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnFlex: {
    flex: 1,
    backgroundColor: MAIN,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  outlineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  rowBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  doneBox: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  doneTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111111',
    marginTop: 8,
  },
  doneDesc: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  pendingPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    marginTop: 6,
    marginBottom: 2,
  },
  pendingPillText: {
    color: MAIN,
    fontWeight: '700',
    fontSize: 13,
  },
});
