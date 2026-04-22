import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';

const MAIN = '#6C47FF';

type StoreItem = {
  id: string;
  title: string;
  ticket_count: number;
  price: number;
  original_price: number;
  discount_rate: number;
  bonus_points: number;
};

export default function StoreScreen() {
  const router = useRouter();
  const [points, setPoints] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<StoreItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [tab, setTab] = useState<'matching' | 'pt'>('matching');

  const [myPtEligible, setMyPtEligible] = useState(false);
  const [myPtLoading, setMyPtLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setPoints(null);
        setMatchingTickets(null);
        return;
      }

      const { data: me, error: meError } = await supabase
        .from('users')
        .select('points,matching_tickets')
        .eq('id', user.id)
        .maybeSingle();
      if (meError) throw meError;
      const row = me as { points?: number; matching_tickets?: number } | null;
      setPoints(typeof row?.points === 'number' ? row.points : 0);
      setMatchingTickets(typeof row?.matching_tickets === 'number' ? row.matching_tickets : 0);
    } catch (e: any) {
      Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      setPoints(null);
      setMatchingTickets(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async (category: 'matching_ticket' | 'pt_ticket') => {
    setProductsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id,title,ticket_count,original_price,price,discount_rate,bonus_points')
        .eq('category', category)
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as {
        id: string;
        title: string | null;
        ticket_count: number | null;
        original_price: number | null;
        price: number | null;
        discount_rate: number | null;
        bonus_points: number | null;
      }[];

      setProducts(
        rows
          .filter((r) => !!r?.id)
          .map((r) => ({
            id: r.id,
            title: r.title ?? (category === 'pt_ticket' ? '피티권' : '매칭권'),
            ticket_count: typeof r.ticket_count === 'number' ? r.ticket_count : 0,
            original_price: typeof r.original_price === 'number' ? r.original_price : 0,
            price: typeof r.price === 'number' ? r.price : 0,
            discount_rate: typeof r.discount_rate === 'number' ? r.discount_rate : 0,
            bonus_points: typeof r.bonus_points === 'number' ? r.bonus_points : 0,
          }))
      );
    } catch (e: any) {
      Alert.alert('상품 불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const loadMyPt = useCallback(async () => {
    setMyPtLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setMyPtEligible(false);
        return;
      }

      const { data, error } = await supabase
        .from('trainer_profiles')
        .select('status,is_approved,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      const status = String((data as any)?.status ?? '').trim();
      const isApproved = (data as any)?.is_approved;
      const eligible = status === 'approved' && isApproved === false;
      setMyPtEligible(eligible);
    } catch {
      setMyPtEligible(false);
    } finally {
      setMyPtLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadMyPt();
      void loadProducts(tab === 'pt' ? 'pt_ticket' : 'matching_ticket');
    }, [load, loadMyPt, loadProducts, tab])
  );

  const goBack = useCallback(() => router.back(), [router]);

  const onItemPress = useCallback(() => {
    Alert.alert('준비 중입니다');
  }, []);

  const buyPt = useCallback(() => {
    Alert.alert('결제 기능은 준비 중입니다.');
  }, []);

  const formatKRW = useCallback((value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    try {
      return new Intl.NumberFormat('ko-KR').format(Math.round(safe));
    } catch {
      return String(Math.round(safe));
    }
  }, []);

  const hasAnyProducts = products.length > 0;
  const productsEmpty = useMemo(() => !productsLoading && !hasAnyProducts, [productsLoading, hasAnyProducts]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          hitSlop={10}
          style={styles.headerBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로가기"
        >
          <Feather name="chevron-left" size={24} color="#111111" />
        </Pressable>
        <Text style={styles.headerTitle}>상점</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.topCardLoading}>
            <ActivityIndicator size="small" color="#FFFFFF" />
          </View>
        ) : (
          <View style={styles.topCard}>
            <View style={styles.topCardCol}>
              <Text style={styles.topCardLabel}>보유 매칭권</Text>
              <Text style={styles.topCardValue}>{matchingTickets ?? 0}개</Text>
            </View>
            <View style={styles.topCardDivider} />
            <View style={styles.topCardCol}>
              <Text style={styles.topCardLabel}>보유 포인트</Text>
              <Text style={styles.topCardValue}>{points ?? 0}p</Text>
            </View>
          </View>
        )}

        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setTab('matching')}
            style={[styles.tabBtn, tab === 'matching' && styles.tabBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="매칭권 탭"
          >
            <Text style={[styles.tabText, tab === 'matching' && styles.tabTextActive]}>매칭권</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('pt')}
            style={[styles.tabBtn, tab === 'pt' && styles.tabBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="피티권 탭"
          >
            <Text style={[styles.tabText, tab === 'pt' && styles.tabTextActive]}>피티권</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>{tab === 'pt' ? '피티권 구매' : '매칭권 구매'}</Text>

        {tab === 'pt' && !myPtLoading && !myPtEligible ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>승인된 트레이너만 구매 가능합니다</Text>
          </View>
        ) : null}

        {productsLoading ? (
          <View style={styles.productsLoading}>
            <ActivityIndicator size="small" color={MAIN} />
            <Text style={styles.productsLoadingText}>상품 불러오는 중…</Text>
          </View>
        ) : productsEmpty ? (
          <View style={styles.productsEmpty}>
            <Text style={styles.productsEmptyText}>현재 구매 가능한 상품이 없습니다.</Text>
          </View>
        ) : (
          products.map((item) => {
            const RowWrap = tab === 'pt' ? View : Pressable;
            const wrapProps =
              tab === 'pt'
                ? {
                    style: styles.row,
                  }
                : {
                    onPress: onItemPress,
                    style: ({ pressed }: { pressed: boolean }) =>
                      [styles.row, pressed && styles.rowPressed] as any,
                    accessibilityRole: 'button' as const,
                    accessibilityLabel: item.title,
                  };

            const hasDiscount =
              item.original_price > 0 &&
              item.price > 0 &&
              item.original_price > item.price &&
              item.discount_rate > 0;

            return (
              <RowWrap key={item.id} {...(wrapProps as any)}>
              <View style={styles.rowLeft}>
                <View style={styles.iconWrap}>
                  <Text style={styles.dumbbellIcon} accessibilityLabel="매칭권">
                    🏋️
                  </Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    {tab === 'matching' && hasDiscount ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{item.discount_rate}%</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.metaLine}>
                    {tab === 'matching' && hasDiscount ? (
                      <>
                        <Text style={styles.originalPriceText}>
                          ₩{formatKRW(item.original_price)}
                        </Text>
                        <Text style={styles.priceText}>₩{formatKRW(item.price)}</Text>
                      </>
                    ) : (
                      <Text style={styles.priceText}>₩{formatKRW(item.price)}</Text>
                    )}
                    {item.bonus_points > 0 ? (
                      <Text style={styles.bonusText}>+{formatKRW(item.bonus_points)}포인트 적립</Text>
                    ) : null}
                  </View>
                </View>
              </View>
              {tab === 'pt' ? (
                <Pressable
                  onPress={buyPt}
                  disabled={!myPtEligible}
                  style={[styles.buyBtn, !myPtEligible && styles.buyBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="구매"
                >
                  <Text style={[styles.buyBtnText, !myPtEligible && styles.buyBtnTextDisabled]}>
                    구매
                  </Text>
                </Pressable>
              ) : (
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              )}
              </RowWrap>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111111',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  topCard: {
    flexDirection: 'row',
    backgroundColor: MAIN,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 8,
    marginBottom: 24,
    alignItems: 'stretch',
  },
  topCardLoading: {
    backgroundColor: MAIN,
    borderRadius: 16,
    paddingVertical: 28,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  topCardCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  topCardDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginVertical: 4,
  },
  topCardLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  topCardValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    padding: 4,
    gap: 6,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: MAIN,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  noticeCard: {
    backgroundColor: 'rgba(108, 71, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(108, 71, 255, 0.18)',
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: '700',
    color: MAIN,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 71, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dumbbellIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
  },
  originalPriceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  bonusText: {
    fontSize: 13,
    color: MAIN,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: MAIN,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  buyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: MAIN,
  },
  buyBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  buyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buyBtnTextDisabled: {
    color: '#6B7280',
  },
  productsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  productsLoadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },
  productsEmpty: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productsEmptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
});
