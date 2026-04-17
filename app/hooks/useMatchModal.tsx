import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { getMatchDailyFreeRemaining, runMatchRequest } from '../matching';

const MAIN = '#3B3BF9';

export function useMatchModal() {
  const [visible, setVisible] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [freeRemaining, setFreeRemaining] = useState<number>(0);
  const [prefetched, setPrefetched] = useState<{ myId: string; todaySentCount: number } | null>(null);
  const [opening, setOpening] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const desc = useMemo(() => `(일일 무료 ${freeRemaining}회 남음)`, [freeRemaining]);

  const close = useCallback(() => {
    if (confirming) return;
    setVisible(false);
  }, [confirming]);

  const openMatchModal = useCallback((nextTargetUserId: string) => {
    if (!nextTargetUserId) return;
    if (opening || confirming) return;
    setTargetUserId(nextTargetUserId);

    void (async () => {
      setOpening(true);
      try {
        const info = await getMatchDailyFreeRemaining();
        setFreeRemaining(info.freeRemaining);
        setPrefetched({ myId: info.myId, todaySentCount: info.todaySentCount });
      } catch {
        setFreeRemaining(0);
        setPrefetched(null);
      } finally {
        setOpening(false);
        setVisible(true);
      }
    })();
  }, [opening, confirming]);

  const onConfirm = useCallback(() => {
    if (!targetUserId) return;
    if (confirming) return;
    setConfirming(true);
    setVisible(false);
    void (async () => {
      try {
        await runMatchRequest(targetUserId, prefetched ?? undefined);
      } finally {
        setConfirming(false);
      }
    })();
  }, [confirming, prefetched, targetUserId]);

  const MatchModal = useCallback(() => {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>매칭권을 사용하시겠어요?</Text>
            <Text style={styles.desc}>{desc}</Text>

            <Pressable
              style={[styles.primaryBtn, opening ? styles.primaryBtnDisabled : null]}
              onPress={onConfirm}
              disabled={opening || confirming}
              accessibilityRole="button"
              accessibilityLabel="사용할게요"
            >
              <Text style={styles.primaryBtnText}>사용할게요</Text>
            </Pressable>

            <Pressable
              style={styles.textBtn}
              onPress={close}
              disabled={confirming}
              accessibilityRole="button"
              accessibilityLabel="안할래요"
            >
              <Text style={styles.textBtnText}>안할래요</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }, [close, confirming, desc, onConfirm, opening, visible]);

  return { MatchModal, openMatchModal };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  desc: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: MAIN,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  textBtn: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  textBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '700',
  },
});

