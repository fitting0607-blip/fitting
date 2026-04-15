import { Alert, StyleSheet, Text, View } from 'react-native';

import type { RegisterDraft, Gender } from './types';
import { OptionButton, PrimaryButton } from './components';
import { layoutStyles } from './ui';

const OPTIONS: Array<{ label: '남성' | '여성'; value: Gender }> = [
  { label: '남성', value: 'male' },
  { label: '여성', value: 'female' },
];

export function GenderStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const canNext = Boolean(draft.gender);

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>성별을 알려주세요</Text>
        <View style={styles.row}>
          {OPTIONS.map((opt) => (
            <OptionButton
              key={opt.value}
              label={opt.label}
              selected={draft.gender === opt.value}
              onPress={() => setDraft((prev) => ({ ...prev, gender: opt.value }))}
              containerStyle={styles.half}
            />
          ))}
        </View>
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              Alert.alert('선택 필요', '성별을 선택해 주세요.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  half: {
    width: '48%',
    height: 56,
    borderRadius: 12,
    marginRight: 0,
    marginBottom: 0,
  },
});

