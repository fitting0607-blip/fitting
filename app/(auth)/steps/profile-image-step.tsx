import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { COLORS, layoutStyles } from './ui';

async function uploadAvatarToSupabase({
  supabase,
  uri,
}: {
  supabase: any;
  uri: string;
}): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
  const filename = `draft_${Date.now()}.${ext}`;

  const res = await fetch(uri);
  const blob = await res.blob();

  const { error: uploadError } = await supabase.storage.from('avatars').upload(filename, blob, {
    contentType: blob.type || `image/${ext}`,
    upsert: true,
  });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
  if (!data?.publicUrl) throw new Error('프로필 이미지 URL 생성에 실패했습니다.');
  return data.publicUrl;
}

export function ProfileImageStep({
  draft,
  setDraft,
  supabase,
  onNext,
  onLoadingChange,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  supabase: any;
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
    });

    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;

    onLoadingChange(true);
    try {
      const url = await uploadAvatarToSupabase({ supabase, uri });
      setDraft((prev) => ({ ...prev, profile_image_url: url }));
    } catch (e) {
      Alert.alert('업로드 실패', e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.');
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
            {draft.profile_image_url ? '사진이 선택되었습니다 (다시 선택)' : '사진 선택하기'}
          </Text>
          {draft.profile_image_url ? (
            <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtext }} numberOfLines={2}>
              {draft.profile_image_url}
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => {
            setDraft((prev) => ({ ...prev, profile_image_url: null }));
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

