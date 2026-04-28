import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as InAppPurchases from 'expo-in-app-purchases';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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
  apple_product_id: string;
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
  const [iapReady, setIapReady] = useState(false);
  const [iapLoading, setIapLoading] = useState(false);
  const [purchasingSku, setPurchasingSku] = useState<string | null>(null);

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

  const loadProducts = useCallback(async (category: 'ticket' | 'matching_ticket' | 'pt_ticket') => {
    setProductsLoading(true);
    try {
      const run = async (withIapCols: boolean) => {
        const selectCols = withIapCols
          ? 'id,title,ticket_count,original_price,price,discount_rate,bonus_points,apple_product_id'
          : 'id,title,ticket_count,original_price,price,discount_rate,bonus_points';
        const { data, error } = await supabase
          .from('products')
          .select(selectCols)
          .eq('category', category)
          .eq('is_active', true)
          .order('price', { ascending: true });
        return { data, error };
      };

      let { data, error } = await run(true);
      if (error) {
        const msg = String((error as any)?.message ?? '');
        if (msg.includes('apple_product_id')) {
          ({ data, error } = await run(false));
        }
      }
      if (error) throw error;

      const rows = (data ?? []) as {
        id: string;
        title: string | null;
        ticket_count: number | null;
        original_price: number | null;
        price: number | null;
        discount_rate: number | null;
        bonus_points: number | null;
        apple_product_id?: string | null;
      }[];

      setProducts(
        rows
          .filter((r) => !!r?.id)
          .map((r) => ({
            id: r.id,
            apple_product_id: String(r.apple_product_id ?? '').trim(),
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

  const loadMatchingProducts = useCallback(async () => {
    // 요구사항: category='ticket' 우선. 기존 데이터 호환을 위해 matching_ticket fallback.
    setProductsLoading(true);
    try {
      const run = async (category: 'ticket' | 'matching_ticket') => {
        const runQuery = async (withIapCols: boolean) => {
          const selectCols = withIapCols
            ? 'id,title,ticket_count,original_price,price,discount_rate,bonus_points,apple_product_id'
            : 'id,title,ticket_count,original_price,price,discount_rate,bonus_points';
          const { data, error } = await supabase
            .from('products')
            .select(selectCols)
            .eq('category', category)
            .eq('is_active', true)
            .order('price', { ascending: true });
          return { data, error };
        };

        let { data, error } = await runQuery(true);
        if (error) {
          const msg = String((error as any)?.message ?? '');
          if (msg.includes('apple_product_id')) {
            ({ data, error } = await runQuery(false));
          }
        }
        if (error) throw error;

        const rows = (data ?? []) as any[];
        const mapped: StoreItem[] = rows
          .filter((r) => !!r?.id)
          .map((r) => ({
            id: String(r.id),
            apple_product_id: String(r.apple_product_id ?? '').trim(),
            title: r.title ?? '매칭권',
            ticket_count: typeof r.ticket_count === 'number' ? r.ticket_count : 0,
            original_price: typeof r.original_price === 'number' ? r.original_price : 0,
            price: typeof r.price === 'number' ? r.price : 0,
            discount_rate: typeof r.discount_rate === 'number' ? r.discount_rate : 0,
            bonus_points: typeof r.bonus_points === 'number' ? r.bonus_points : 0,
          }));
        return mapped;
      };

      const primary = await run('ticket');
      if (primary.length > 0) {
        setProducts(primary);
        return;
      }
      const fallback = await run('matching_ticket');
      setProducts(fallback);
    } catch (e: any) {
      Alert.alert('상품 불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const ensureIap = useCallback(async () => {
    if (Platform.OS !== 'ios') return false;
    if (iapReady) return true;
    if (iapLoading) return false;
    setIapLoading(true);
    try {
      const res = await InAppPurchases.connectAsync();
      const ok = Boolean((res as any)?.connected ?? true);
      setIapReady(ok);
      return ok;
    } catch {
      setIapReady(false);
      return false;
    } finally {
      setIapLoading(false);
    }
  }, [iapReady, iapLoading]);

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
      void (async () => {
        if (tab === 'pt') {
          await loadProducts('pt_ticket');
          return;
        }
        await loadMatchingProducts();
      })();
    }, [load, loadMyPt, loadProducts, loadMatchingProducts, tab])
  );

  const goBack = useCallback(() => router.back(), [router]);

  const onBuyMatchingTicket = useCallback(
    async (item: StoreItem) => {
      if (tab !== 'matching') return;
      if (Platform.OS !== 'ios') {
        Alert.alert('안내', '현재 iOS에서만 인앱결제를 지원합니다.');
        return;
      }
      const sku = item.apple_product_id?.trim();
      if (!sku) {
        Alert.alert('구매 불가', '상품 정보가 올바르지 않습니다.');
        return;
      }
      if (purchasingSku) return;

      const ok = await ensureIap();
      if (!ok) {
        Alert.alert('결제 준비 실패', '인앱결제 초기화에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      setPurchasingSku(sku);
      try {
        // SKU 유효성 확인(스토어에 등록되지 않은 SKU면 여기서 실패 가능)
        await InAppPurchases.getProductsAsync([sku]);
        await InAppPurchases.purchaseItemAsync(sku);
      } catch (e: any) {
        Alert.alert('결제 요청 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
        setPurchasingSku(null);
      }
    },
    [tab, purchasingSku, ensureIap]
  );

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

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;

    const sub = InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }: any) => {
      if (!mounted) return;

      // cancelled
      if (responseCode === (InAppPurchases as any).IAPResponseCode?.USER_CANCELED) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const item =
              products.find((p) => p.apple_product_id.trim() === (purchasingSku ?? '').trim()) ?? null;
            await supabase.from('payments').insert({
              user_id: user.id,
              product_id: item?.id ?? null,
              product_title: item?.title ?? purchasingSku ?? 'IAP',
              amount: typeof item?.price === 'number' ? item.price : null,
              status: 'cancelled',
            });
          }
        } catch {
          // ignore
        }
        setPurchasingSku(null);
        Alert.alert('결제 취소', '결제가 취소되었습니다.');
        return;
      }

      // generic error
      if (
        responseCode !== (InAppPurchases as any).IAPResponseCode?.OK &&
        responseCode !== 0 // 일부 환경에서 OK=0
      ) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const item =
              products.find((p) => p.apple_product_id.trim() === (purchasingSku ?? '').trim()) ?? null;
            await supabase.from('payments').insert({
              user_id: user.id,
              product_id: item?.id ?? null,
              product_title: item?.title ?? purchasingSku ?? 'IAP',
              amount: typeof item?.price === 'number' ? item.price : null,
              status: 'failed',
            });
          }
        } catch {
          // ignore
        }
        setPurchasingSku(null);
        Alert.alert('결제 실패', errorCode ? String(errorCode) : '결제 처리 중 오류가 발생했습니다.');
        return;
      }

      const purchases = Array.isArray(results) ? results : [];
      if (purchases.length === 0) {
        setPurchasingSku(null);
        return;
      }

      for (const purchase of purchases) {
        try {
          const state = (purchase as any)?.purchaseState;
          const purchased =
            state === (InAppPurchases as any).IAPPurchaseState?.PURCHASED || state === 1;
          if (!purchased) continue;

          const sku = String((purchase as any)?.productId ?? '').trim();
          const item =
            products.find((p) => p.apple_product_id.trim() === sku) ??
            products.find((p) => p.id === sku) ??
            null;

          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user?.id) throw new Error('로그인이 필요합니다.');

          const { data: me, error: meError } = await supabase
            .from('users')
            .select('points,matching_tickets')
            .eq('id', user.id)
            .maybeSingle();
          if (meError) throw meError;
          const curTickets = typeof (me as any)?.matching_tickets === 'number' ? (me as any).matching_tickets : 0;
          const curPoints = typeof (me as any)?.points === 'number' ? (me as any).points : 0;

          const addTickets = Math.max(0, item?.ticket_count ?? 0);
          const addPoints = Math.max(0, item?.bonus_points ?? 0);

          const { error: upErr } = await supabase
            .from('users')
            .update({
              matching_tickets: curTickets + addTickets,
              ...(addPoints > 0 ? { points: curPoints + addPoints } : {}),
            })
            .eq('id', user.id);
          if (upErr) throw upErr;

          // point_logs 기록(요구사항)
          await supabase.from('point_logs').insert({
            user_id: user.id,
            amount: addPoints > 0 ? addPoints : 0,
            reason: addPoints > 0 ? 'ticket_purchase_bonus' : 'ticket_purchase',
          });

          // payments 저장(요구사항)
          await supabase.from('payments').insert({
            user_id: user.id,
            product_id: item?.id ?? null,
            product_title: item?.title ?? sku,
            amount: typeof item?.price === 'number' ? item.price : null,
            status: 'succeeded',
          });

          await InAppPurchases.finishTransactionAsync(purchase, false);

          setPoints(curPoints + addPoints);
          setMatchingTickets(curTickets + addTickets);
          Alert.alert('결제 완료', '매칭권이 지급됐어요.');
        } catch (e: any) {
          Alert.alert('결제 처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
        } finally {
          setPurchasingSku(null);
        }
      }
    });

    // 초기 연결은 best-effort
    void ensureIap();

    return () => {
      mounted = false;
      try {
        // expo-in-app-purchases는 remove API가 없어서 listener를 빈 함수로 덮어씌움
        if (typeof sub === 'function') sub();
        InAppPurchases.setPurchaseListener(() => {});
      } catch {
        // ignore
      }
      void InAppPurchases.disconnectAsync();
    };
  }, [ensureIap, products]);

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
                    onPress: () => void onBuyMatchingTicket(item),
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
                purchasingSku && purchasingSku === item.apple_product_id.trim() ? (
                  <ActivityIndicator size="small" color={MAIN} />
                ) : (
                  <Feather name="chevron-right" size={20} color="#9CA3AF" />
                )
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
