import { Alert, ScrollView, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { OptionButton, PrimaryButton, WrapRow } from './components';
import { layoutStyles } from './ui';

const SPORTS: { category: string; items: string[] }[] = [
  { category: '근력 운동', items: ['크로스핏', '헬스', '맨몸운동'] },
  { category: '유산소', items: ['러닝/조깅', '자전거', '등산/트래킹'] },
  { category: '격투', items: ['복싱/킥복싱', '주짓수', '태권도', '유도', '합기도'] },
  { category: '구기 종목', items: ['농구', '축구/풋살', '배드민턴', '탁구', '야구'] },
  { category: '레저 스포츠', items: ['클라이밍', '서핑', '스키', '낚시', '캠핑'] },
];

export function SportsStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const toggle = (sport: string) => {
    setDraft((prev) => {
      const exists = prev.sports.includes(sport);
      const sports = exists ? prev.sports.filter((s) => s !== sport) : [...prev.sports, sport];
      return { ...prev, sports };
    });
  };

  const canNext = draft.sports.length >= 1;

  return (
    <View style={layoutStyles.body}>
      <Text style={layoutStyles.title}>즐겨 하는 운동을 알려주세요</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {SPORTS.map((section) => (
          <View key={section.category} style={{ marginBottom: 10 }}>
            <Text style={layoutStyles.subLabel}>{section.category}</Text>
            <WrapRow>
              {section.items.map((item) => (
                <OptionButton
                  key={item}
                  label={item}
                  selected={draft.sports.includes(item)}
                  onPress={() => toggle(item)}
                  containerStyle={{ height: 48, borderRadius: 12 }}
                />
              ))}
            </WrapRow>
          </View>
        ))}
      </ScrollView>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다 골랐어요"
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

