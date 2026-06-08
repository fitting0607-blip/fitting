import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND = '#3B3BF9';

type AlertPayload = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm?: () => void;
} | null;

let emitAlert: ((payload: AlertPayload) => void) | null = null;

export function showMatchBrandedAlert(
  title: string,
  options?: {
    message?: string;
    confirmLabel?: string;
    onConfirm?: () => void;
  }
): void {
  const { message = '', confirmLabel = '확인', onConfirm } = options ?? {};
  if (emitAlert) {
    emitAlert({ title, message, confirmLabel, onConfirm });
    return;
  }
  const { Alert } = require('react-native') as typeof import('react-native');
  Alert.alert(title, message || undefined, [{ text: confirmLabel, onPress: onConfirm }]);
}

export function showMatchCompleteAlert(title: string, message: string, onConfirm: () => void): void {
  showMatchBrandedAlert(title, { message, confirmLabel: '확인', onConfirm });
}

export function MatchCompleteAlertHost() {
  const [payload, setPayload] = useState<AlertPayload>(null);

  useEffect(() => {
    emitAlert = setPayload;
    return () => {
      emitAlert = null;
    };
  }, []);

  const dismiss = () => setPayload(null);

  const onConfirm = () => {
    const confirm = payload?.onConfirm;
    dismiss();
    confirm?.();
  };

  const hasMessage = !!payload?.message;

  return (
    <Modal visible={!!payload} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.title, !hasMessage && styles.titleOnly]}>{payload?.title ?? ''}</Text>
          {hasMessage ? <Text style={styles.message}>{payload?.message ?? ''}</Text> : null}
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel={payload?.confirmLabel ?? '확인'}
          >
            <Text style={styles.buttonText}>{payload?.confirmLabel ?? '확인'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleOnly: {
    marginBottom: 16,
  },
  message: {
    fontSize: 15,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  button: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: BRAND,
    fontSize: 17,
    fontWeight: '600',
  },
});
