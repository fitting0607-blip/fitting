import { Alert, ScrollView, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { OptionButton, PrimaryButton, WrapRow } from './components';
import { layoutStyles } from './ui';

const GOALS = ['다이어트', '근육증가', '체력향상', '스트레스해소', '건강관리', '사교/친목'] as const;

export function WorkoutGoalsStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const toggle = (goal: string) => {
    setDraft((prev) => {
      const exists = prev.workout_goals.includes(goal);
      const workout_goals = exists
        ? prev.workout_goals.filter((g) => g !== goal)
        : [...prev.workout_goals, goal];
      return { ...prev, workout_goals };
    });
  };

  const canNext = draft.workout_goals.length >= 1;

  return (
    <View style={layoutStyles.body}>
      <Text style={layoutStyles.title}>운동 목적을 알려주세요</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        <WrapRow>
          {GOALS.map((goal) => (
            <OptionButton
              key={goal}
              label={goal}
              selected={draft.workout_goals.includes(goal)}
              onPress={() => toggle(goal)}
              containerStyle={{ height: 48, borderRadius: 12 }}
            />
          ))}
        </WrapRow>
      </ScrollView>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              Alert.alert('선택 필요', '최소 1개 이상 선택해 주세요.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

