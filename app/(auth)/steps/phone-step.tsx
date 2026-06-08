import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { RegisterDraft } from './types';
import { PrimaryButton } from './components';
import { layoutStyles } from './ui';

function onlyDigits(input: string) {
  return input.replace(/\D/g, '');
}

function formatKoreanMobile010(raw: string) {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function isValid010Phone(formatted: string) {
  const digits = onlyDigits(formatted);
  return digits.length === 11 && digits.startsWith('010');
}

export function PhoneStep({
  draft,
  setDraft,
  onNext,
}: {
  draft: RegisterDraft;
  setDraft: React.Dispatch<React.SetStateAction<RegisterDraft>>;
  onNext: () => void;
}) {
  const value = draft.phone ?? '';
  const showError = value.length > 0 && !isValid010Phone(value);
  const canProceed = isValid010Phone(value);

  return (
    <View style={layoutStyles.body}>
      <View style={{ flex: 1 }}>
        <Text style={layoutStyles.title}>전화번호를 입력해 주세요</Text>
        <Text style={layoutStyles.label}>휴대폰 번호</Text>
        <TextInput
          value={value}
          onChangeText={(text) => {
            const formatted = formatKoreanMobile010(text);
            setDraft((prev) => ({ ...prev, phone: formatted }));
          }}
          placeholder="010-1234-5678"
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          maxLength={13}
          style={[layoutStyles.input, showError ? styles.inputError : null]}
        />
        {showError ? <Text style={styles.fieldError}>010-XXXX-XXXX 형식으로 입력해 주세요</Text> : null}
      </View>

      <View style={layoutStyles.bottomArea}>
        <PrimaryButton label="다음으로" disabled={!canProceed} onPress={onNext} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputError: {
    borderColor: '#EF4444',
  },
  fieldError: {
    fontSize: 13,
    color: '#EF4444',
    marginTop: 6,
    marginBottom: 2,
  },
});

