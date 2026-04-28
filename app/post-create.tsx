import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '../supabase';
import { decodeBase64ToBytes, PUBLIC_UPLOAD_BUCKET } from './utils/imageBytes';
import {
  clampTranslate,
  coverBaseScale,
  isImageTransformV1,
  type ImageTransformV1,
} from './utils/imageTransform';

type FeedType = '일반' | '바디';

const MAIN = '#3B3BF9';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CROP_ASPECT = 4 / 5;

export default function PostCreateScreen() {
  const router = useRouter();
  const [feedType, setFeedType] = useState<FeedType>('일반');
  const [content, setContent] = useState('');
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageTransform, setImageTransform] = useState<ImageTransformV1 | null>(null);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = imageAsset != null && !submitting;
  const canGoNext = imageAsset != null;

  const pickImages = useCallback(async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('권한 필요', '사진을 선택하려면 사진 접근 권한이 필요해요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      base64: true,
      allowsMultipleSelection: false,
    });

    if (result.canceled) return;

    const picked = result.assets?.[0];
    if (picked) {
      setImageAsset(picked);
      setImageTransform(null);
      setCropModalVisible(true);
    }
  }, []);

  const clearImage = useCallback(() => {
    setImageAsset(null);
    setImageTransform(null);
    setCropModalVisible(false);
  }, []);

  const uploadAndCreate = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const ts = Date.now();

      if (!imageAsset?.uri) throw new Error('사진을 선택해주세요.');

      const storagePath = `${user.id}/${ts}_0.jpg`;
      const base64 = imageAsset.base64;
      if (!base64) throw new Error('사진 데이터를 읽을 수 없습니다. 다시 선택해주세요.');

      const byteArray = decodeBase64ToBytes(base64);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(PUBLIC_UPLOAD_BUCKET)
        .upload(storagePath, byteArray, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      console.log('[PostCreate] upload result', {
        bucket: PUBLIC_UPLOAD_BUCKET,
        storagePath,
        ok: !uploadError,
        data: uploadData ?? null,
        error: uploadError ? { message: uploadError.message, name: (uploadError as any).name } : null,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(PUBLIC_UPLOAD_BUCKET).getPublicUrl(storagePath);
      const imageUrls = [data.publicUrl];
      console.log('[PostCreate] getPublicUrl', {
        bucket: PUBLIC_UPLOAD_BUCKET,
        storagePath,
        publicUrl: data.publicUrl,
      });

      // Store original image, and store only transform metadata for display crop.
      // If the DB column doesn't exist yet, fall back to legacy insert (but crop won't persist).
      const payload: any = {
        user_id: user.id,
        content: content.trim(),
        post_type: feedType,
        image_urls: imageUrls,
      };
      if (imageTransform && isImageTransformV1(imageTransform)) {
        payload.image_transform = imageTransform;
      }

      let insertError: any = null;
      {
        const res = await supabase.from('posts').insert(payload);
        insertError = res.error ?? null;
      }

      if (insertError && String(insertError.message ?? '').includes('image_transform')) {
        const legacyRes = await supabase.from('posts').insert({
          user_id: user.id,
          content: content.trim(),
          post_type: feedType,
          image_urls: imageUrls,
        });
        insertError = legacyRes.error ?? null;
      }

      console.log('[PostCreate] insert posts', {
        ok: !insertError,
        image_urls: imageUrls,
        has_transform: !!imageTransform,
        error: insertError?.message ?? null,
      });
      if (insertError) throw insertError;

      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('작성 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [imageAsset, canSubmit, content, feedType, imageTransform, router]);

  const nextTextStyle = useMemo(
    () => [styles.nextText, canSubmit ? styles.nextTextActive : styles.nextTextDisabled],
    [canSubmit]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.topIconBtn}
            accessibilityRole="button"
            accessibilityLabel="뒤로가기"
          >
            <Feather name="chevron-left" size={24} color="#111111" />
          </Pressable>

          <Text style={styles.topTitle}>게시물 작성</Text>

          <Pressable
            onPress={uploadAndCreate}
            disabled={!canSubmit}
            hitSlop={10}
            style={styles.nextBtn}
            accessibilityRole="button"
            accessibilityLabel="다음"
          >
            <Text style={nextTextStyle}>{submitting ? '업로드 중…' : '다음'}</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.imageRow}>
            <Pressable
              onPress={pickImages}
              style={styles.cameraBox}
              accessibilityRole="button"
              accessibilityLabel="사진 선택"
            >
              <Feather name="camera" size={20} color="#111111" />
              <Text style={styles.countText}>사진 선택</Text>
            </Pressable>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbScroll}>
              {imageAsset ? (
                <View key={imageAsset.uri} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: imageAsset.uri }}
                    style={styles.thumbImage}
                    contentFit="cover"
                    transition={120}
                  />
                  <Pressable
                    onPress={() => setCropModalVisible(true)}
                    style={styles.editBtn}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="사진 구도 조절"
                  >
                    <Feather name="move" size={14} color="#FFFFFF" />
                  </Pressable>
                  <Pressable
                    onPress={clearImage}
                    style={styles.removeBtn}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="사진 제거"
                  >
                    <Feather name="x" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>

          <View style={styles.typeTabs}>
            <Pressable
              onPress={() => setFeedType('일반')}
              style={[styles.typeTab, feedType === '일반' && styles.typeTabActive]}
            >
              <Text style={[styles.typeTabText, feedType === '일반' && styles.typeTabTextActive]}>
                일반
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFeedType('바디')}
              style={[styles.typeTab, feedType === '바디' && styles.typeTabActive]}
            >
              <Text style={[styles.typeTabText, feedType === '바디' && styles.typeTabTextActive]}>
                바디
              </Text>
            </Pressable>
          </View>

          <View style={styles.inputWrap}>
            <TextInput
              value={content}
              onChangeText={setContent}
              placeholder="오늘의 운동을 공유해보세요!"
              placeholderTextColor="#9CA3AF"
              multiline
              style={styles.input}
              textAlignVertical="top"
              maxLength={2000}
            />
          </View>
        </View>

        {imageAsset && cropModalVisible ? (
          <CropModal
            uri={imageAsset.uri}
            imgW={typeof imageAsset.width === 'number' ? imageAsset.width : 0}
            imgH={typeof imageAsset.height === 'number' ? imageAsset.height : 0}
            initial={imageTransform}
            onCancel={() => setCropModalVisible(false)}
            onDone={(t) => {
              setImageTransform(t);
              setCropModalVisible(false);
            }}
          />
        ) : null}

        <View style={styles.bottomArea}>
          <Pressable
            onPress={uploadAndCreate}
            disabled={!canSubmit}
            style={[
              styles.bottomPrimaryBtn,
              !canGoNext && styles.bottomPrimaryBtnHidden, // 사진 선택 전엔 버튼 자체를 숨겨 “선택 후 다음” 흐름을 명확히
              canSubmit ? styles.bottomPrimaryBtnActive : styles.bottomPrimaryBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="다음 단계로"
          >
            <Text style={styles.bottomPrimaryBtnText}>{submitting ? '업로드 중…' : '다음'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CropModal({
  uri,
  imgW,
  imgH,
  initial,
  onCancel,
  onDone,
}: {
  uri: string;
  imgW: number;
  imgH: number;
  initial: ImageTransformV1 | null;
  onCancel: () => void;
  onDone: (t: ImageTransformV1) => void;
}) {
  const viewportW = SCREEN_WIDTH;
  const viewportH = Math.round(SCREEN_WIDTH / CROP_ASPECT);

  const safeImgW = imgW > 0 ? imgW : 1080;
  const safeImgH = imgH > 0 ? imgH : 1350;

  const baseScale = coverBaseScale({
    viewportW,
    viewportH,
    imgW: safeImgW,
    imgH: safeImgH,
  });

  const initTx = initial ? initial.ox * viewportW : 0;
  const initTy = initial ? initial.oy * viewportH : 0;

  // Simplified: drag only (no pinch-zoom) to avoid gesture-handler/reanimated crashes.
  // Always render as cover-fit baseline scale, and clamp translation.
  const scale = baseScale;
  const translate = React.useRef(new Animated.ValueXY({ x: initTx, y: initTy })).current;
  const start = React.useRef({ x: initTx, y: initTy });

  const clampAndSet = useCallback(
    (x: number, y: number) => {
      const clamped = clampTranslate({
        viewportW,
        viewportH,
        imgW: safeImgW,
        imgH: safeImgH,
        scale,
        tx: x,
        ty: y,
      });
      translate.setValue({ x: clamped.tx, y: clamped.ty });
      start.current = { x: clamped.tx, y: clamped.ty };
    },
    [imgW, imgH, safeImgH, safeImgW, scale, translate, viewportH, viewportW]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          translate.stopAnimation((v: any) => {
            start.current = { x: typeof v?.x === 'number' ? v.x : start.current.x, y: typeof v?.y === 'number' ? v.y : start.current.y };
          });
        },
        onPanResponderMove: (_evt, gestureState) => {
          const nextX = start.current.x + gestureState.dx;
          const nextY = start.current.y + gestureState.dy;
          // clamp live to prevent revealing empty space
          const clamped = clampTranslate({
            viewportW,
            viewportH,
            imgW: safeImgW,
            imgH: safeImgH,
            scale,
            tx: nextX,
            ty: nextY,
          });
          translate.setValue({ x: clamped.tx, y: clamped.ty });
        },
        onPanResponderRelease: () => {
          translate.stopAnimation((v: any) => {
            const x = typeof v?.x === 'number' ? v.x : 0;
            const y = typeof v?.y === 'number' ? v.y : 0;
            clampAndSet(x, y);
          });
        },
        onPanResponderTerminate: () => {
          translate.stopAnimation((v: any) => {
            const x = typeof v?.x === 'number' ? v.x : 0;
            const y = typeof v?.y === 'number' ? v.y : 0;
            clampAndSet(x, y);
          });
        },
      }),
    [clampAndSet, safeImgH, safeImgW, scale, translate, viewportH, viewportW]
  );

  return (
    <View style={styles.cropOverlay}>
      <View style={styles.cropTopBar}>
        <Pressable
          onPress={onCancel}
          hitSlop={10}
          style={styles.cropTopBtn}
          accessibilityRole="button"
          accessibilityLabel="취소"
        >
          <Text style={styles.cropTopBtnText}>취소</Text>
        </Pressable>
        <Text style={styles.cropTitle}>미리보기</Text>
        <Pressable
          onPress={() => {
            // Zoom disabled in simplified mode.
            const zoom = 1;
            // Read final translation from Animated.ValueXY
            const x = (translate.x as any).__getValue?.() ?? 0;
            const y = (translate.y as any).__getValue?.() ?? 0;
            onDone({
              v: 1,
              imgW: safeImgW,
              imgH: safeImgH,
              zoom,
              ox: x / viewportW,
              oy: y / viewportH,
            });
          }}
          hitSlop={10}
          style={styles.cropTopBtn}
          accessibilityRole="button"
          accessibilityLabel="완료"
        >
          <Text style={[styles.cropTopBtnText, styles.cropTopBtnTextDone]}>완료</Text>
        </Pressable>
      </View>

      <View style={styles.cropHintRow}>
        <Text style={styles.cropHintText}>드래그로 위치 조절</Text>
      </View>

      <View style={[styles.cropViewport, { width: viewportW, height: viewportH }]}>
        <View style={styles.cropViewportInner} {...panResponder.panHandlers}>
          <Animated.Image
            source={{ uri }}
            style={[
              {
                width: safeImgW,
                height: safeImgH,
              },
              {
                transform: [{ translateX: translate.x }, { translateY: translate.y }, { scale }],
              },
            ]}
            resizeMode="cover"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  topBar: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  topIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  nextBtn: {
    minWidth: 64,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  nextText: {
    fontSize: 15,
    fontWeight: '800',
  },
  nextTextActive: {
    color: MAIN,
  },
  nextTextDisabled: {
    color: '#9CA3AF',
  },

  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 14,
  },

  bottomArea: {
    marginTop: 'auto',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  bottomPrimaryBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomPrimaryBtnHidden: {
    opacity: 0,
  },
  bottomPrimaryBtnActive: {
    backgroundColor: MAIN,
  },
  bottomPrimaryBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  bottomPrimaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraBox: {
    width: 84,
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  thumbScroll: {
    alignItems: 'center',
    gap: 10,
    paddingRight: 8,
  },
  thumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
  },
  thumbImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  editBtn: {
    position: 'absolute',
    right: 34,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  typeTabs: {
    flexDirection: 'row',
    gap: 10,
  },
  typeTab: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  typeTabActive: {
    borderColor: MAIN,
    backgroundColor: 'rgba(59,59,249,0.08)',
  },
  typeTabText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6B7280',
  },
  typeTabTextActive: {
    color: MAIN,
  },

  inputWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 170,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    lineHeight: 20,
  },

  cropOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  cropTopBar: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
  },
  cropTopBtn: {
    minWidth: 64,
    height: 44,
    justifyContent: 'center',
  },
  cropTopBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cropTopBtnTextDone: {
    color: MAIN,
  },
  cropTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  cropHintRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  cropHintText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '700',
  },
  cropViewport: {
    alignSelf: 'center',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  cropViewportInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

