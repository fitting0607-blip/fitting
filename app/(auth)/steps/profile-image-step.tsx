import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { COLORS, layoutStyles } from './ui';

export function ProfileImageStep({
  draft,
  setDraft,
  onNext,
  onLoadingChange,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
  onLoadingChange: (loading: boolean) => void;
}) {
  const pick = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('권한 필요', '사진 접근 권한을 허용해 주세요.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
      base64: true,
    });

    if (result.canceled) return;
    const base64 = result.assets?.[0]?.base64;
    if (!base64) {
      Alert.alert('오류', '사진 데이터를 읽을 수 없습니다. 다시 선택해 주세요.');
      return;
    }

    onLoadingChange(true);
    try {
      // Storage 업로드는 가입 완료(세션 확보) 후 age-step에서 수행
      setDraft((prev) => ({
        ...prev,
        profile_image_base64: base64,
        profile_image_url: null,
      }));
    } finally {
      onLoadingChange(false);
    }
  };

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>프로필 사진을 선택해주세요</Text>

        <Pressable
          onPress={pick}
          style={{
            borderWidth: 1,
            borderColor: '#E5E7EB',
            borderRadius: 16,
            padding: 16,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
            {draft.profile_image_base64 ? '사진이 선택되었습니다 (다시 선택)' : '사진 선택하기'}
          </Text>
          {draft.profile_image_base64 ? (
            <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtext }}>
              가입 완료 시 프로필에 반영돼요
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => {
            setDraft((prev) => ({ ...prev, profile_image_url: null, profile_image_base64: null }));
            onNext();
          }}
          style={layoutStyles.secondaryLink}
        >
          <Text style={layoutStyles.secondaryLinkText}>건너뛰기</Text>
        </Pressable>
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton label="다음으로" disabled={false} onPress={onNext} />
      </View>
    </View>
  );
}

