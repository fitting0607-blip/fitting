import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { layoutStyles, optionButtonStyles } from './ui';

export function OptionButton({
  label,
  selected,
  onPress,
  fullWidth,
  containerStyle,
  textStyle,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  fullWidth?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        optionButtonStyles.buttonBase,
        selected ? optionButtonStyles.buttonSelected : null,
        fullWidth ? { width: '100%', marginRight: 0 } : null,
        containerStyle,
      ]}
    >
      <Text
        style={[
          optionButtonStyles.textBase,
          selected ? optionButtonStyles.textSelected : null,
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  disabled: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        layoutStyles.primaryButton,
        pressed && !disabled ? layoutStyles.primaryButtonPressed : null,
        disabled ? layoutStyles.primaryButtonDisabled : null,
      ]}
    >
      <Text style={layoutStyles.primaryButtonText}>{loading ? '처리 중...' : label}</Text>
    </Pressable>
  );
}

export function WrapRow({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }}>{children}</View>
  );
}

