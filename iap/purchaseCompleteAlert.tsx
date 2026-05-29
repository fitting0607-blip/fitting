import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

const BRAND = '#3B3BF9';

type AlertPayload = { title: string; message: string } | null;

let emitAlert: ((payload: AlertPayload) => void) | null = null;

/** IAP 결제 완료 전용 — 확인 버튼 브랜드 컬러(#3B3BF9) */
export function showPurchaseCompleteAlert(title: string, message: string): void {
  if (emitAlert) {
    emitAlert({ title, message });
    return;
  }
  // Host 미마운트 시 fallback (Expo Go 등)
  const { Alert } = require('react-native') as typeof import('react-native');
  Alert.alert(title, message);
}

export function PurchaseCompleteAlertHost() {
  const [payload, setPayload] = useState<AlertPayload>(null);

  useEffect(() => {
    emitAlert = setPayload;
    return () => {
      emitAlert = null;
    };
  }, []);

  const dismiss = () => setPayload(null);

  return (
    <Modal visible={!!payload} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{payload?.title ?? ''}</Text>
          <Text style={styles.message}>{payload?.message ?? ''}</Text>
          <Pressable
            onPress={dismiss}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="확인"
          >
            <Text style={styles.buttonText}>확인</Text>
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
    paddingBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    color: '#444444',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
