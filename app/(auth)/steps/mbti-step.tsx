import { Alert, Text, View } from 'react-native';

import type { RegisterDraft } from './types';
import { OptionButton, PrimaryButton, WrapRow } from './components';
import { layoutStyles } from './ui';

type MbtiKey = keyof RegisterDraft['mbtiParts'];

export function MbtiStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const selection = draft.mbtiParts;

  const setOne = (key: MbtiKey, value: RegisterDraft['mbtiParts'][MbtiKey]) => {
    setDraft((prev) => {
      const nextParts = { ...prev.mbtiParts, [key]: value } as RegisterDraft['mbtiParts'];
      const canBuild = Boolean(nextParts.EI && nextParts.SN && nextParts.TF && nextParts.JP);
      const mbti = canBuild ? `${nextParts.EI}${nextParts.SN}${nextParts.TF}${nextParts.JP}` : null;
      return { ...prev, mbtiParts: nextParts, mbti };
    });
  };

  const canNext = Boolean(draft.mbti);

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>MBTI를 알려주세요</Text>

        <View style={{ marginBottom: 8 }}>
          <WrapRow>
            <OptionButton label="E" selected={selection.EI === 'E'} onPress={() => setOne('EI', 'E')} />
            <OptionButton label="I" selected={selection.EI === 'I'} onPress={() => setOne('EI', 'I')} />
          </WrapRow>
        </View>
        <View style={{ marginBottom: 8 }}>
          <WrapRow>
            <OptionButton label="S" selected={selection.SN === 'S'} onPress={() => setOne('SN', 'S')} />
            <OptionButton label="N" selected={selection.SN === 'N'} onPress={() => setOne('SN', 'N')} />
          </WrapRow>
        </View>
        <View style={{ marginBottom: 8 }}>
          <WrapRow>
            <OptionButton label="T" selected={selection.TF === 'T'} onPress={() => setOne('TF', 'T')} />
            <OptionButton label="F" selected={selection.TF === 'F'} onPress={() => setOne('TF', 'F')} />
          </WrapRow>
        </View>
        <View style={{ marginBottom: 8 }}>
          <WrapRow>
            <OptionButton label="J" selected={selection.JP === 'J'} onPress={() => setOne('JP', 'J')} />
            <OptionButton label="P" selected={selection.JP === 'P'} onPress={() => setOne('JP', 'P')} />
          </WrapRow>
        </View>
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton
          label="다음으로"
          disabled={!canNext}
          onPress={() => {
            if (!canNext) {
              Alert.alert('선택 필요', '4개 항목을 모두 선택해 주세요.');
              return;
            }
            onNext();
          }}
        />
      </View>
    </View>
  );
}

