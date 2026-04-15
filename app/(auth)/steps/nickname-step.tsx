import { Alert, Text, TextInput, View } from 'react-native';

import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { layoutStyles } from './ui';

export function NicknameStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const canNext = draft.nickname.trim().length >= 2;

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>닉네임을 입력해주세요</Text>
        <TextInput
          value={draft.nickname}
          onChangeText={(text) => setDraft((prev) => ({ ...prev, nickname: text }))}
          placeholder="닉네임"
          style={layoutStyles.input}
          autoCapitalize="none"
        />
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              Alert.alert('입력 필요', '닉네임은 최소 2자 이상이어야 합니다.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

