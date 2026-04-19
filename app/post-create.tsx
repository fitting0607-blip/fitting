import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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

type FeedType = '일반' | '바디';

const MAIN = '#3B3BF9';

export default function PostCreateScreen() {
  const router = useRouter();
  const [feedType, setFeedType] = useState<FeedType>('일반');
  const [content, setContent] = useState('');
  const [imageAsset, setImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = imageAsset != null && !submitting;

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
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled) return;

    const picked = result.assets?.[0];
    if (picked) setImageAsset(picked);
  }, []);

  const clearImage = useCallback(() => {
    setImageAsset(null);
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

      const { error: uploadError } = await supabase.storage.from(PUBLIC_UPLOAD_BUCKET).upload(storagePath, byteArray, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(PUBLIC_UPLOAD_BUCKET).getPublicUrl(storagePath);
      const imageUrls = [data.publicUrl];

      const { error: insertError } = await supabase.from('posts').insert({
        user_id: user.id,
        content: content.trim(),
        post_type: feedType,
        image_urls: imageUrls,
      });
      if (insertError) throw insertError;

      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('작성 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }, [imageAsset, canSubmit, content, feedType, router]);

  const nextTextStyle = useMemo(
    () => [styles.nextText, canSubmit ? styles.nextTextActive : styles.nextTextDisabled],
    [canSubmit]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
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
});

