import { Alert, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { OptionButton, PrimaryButton } from './components';
import { layoutStyles } from './ui';

const OPTIONS = ['거의안함', '주1회', '주2~3회', '주4~5회', '매일'] as const;

export function WorkoutFrequencyStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const canNext = Boolean(draft.workout_frequency);

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>평균 운동 빈도를 알려주세요</Text>
        {OPTIONS.map((opt) => (
          <OptionButton
            key={opt}
            label={opt}
            selected={draft.workout_frequency === opt}
            onPress={() => setDraft((prev) => ({ ...prev, workout_frequency: opt }))}
            fullWidth
          />
        ))}
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              Alert.alert('선택 필요', '운동 빈도를 선택해 주세요.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

