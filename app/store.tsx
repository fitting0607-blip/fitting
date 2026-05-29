import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/supabase';
import {
  requestPurchase,
  isDuplicateLikeError,
  setPendingGatheringApplicationId,
  subscribePurchaseUiIdle,
  subscribeIapGrantSuccess,
  ensureIapReady,
  IAP_PURCHASE_USER_MESSAGE,
} from '@/iap/rniap';

const MAIN = '#6C47FF';
const GATHERING_FEE_PRODUCT_ID = 'com.hywoo.fitting.gathering_fee';
const UNLIMITED_MATCHING_TICKET_SKU = 'com.hywoo.fitting.ticket_unlimited';

function isUnlimitedMatchingTicketBlocked(item: StoreItem): boolean {
  return item.apple_product_id?.trim() === UNLIMITED_MATCHING_TICKET_SKU;
}

function purchaseAlertMessage(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? '').trim();
  return msg === IAP_PURCHASE_USER_MESSAGE ? msg : IAP_PURCHASE_USER_MESSAGE;
}

/** requestPurchase 프로미스가 해결되지 않을 때 purchasingSku 고착 방지 (이벤트 기반 IAP) */
const PURCHASE_SKU_STUCK_TIMEOUT_MS = 120_000;

function genderBucket(g: string | null | undefined): 'male' | 'female' | null {
  const s = String(g ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'male' || s === 'm' || s.includes('남')) return 'male';
  if (s === 'female' || s === 'f' || s.includes('여')) return 'female';
  return null;
}

function formatDisplayDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  return raw;
}

type StoreItem = {
  id: string;
  category: 'ticket' | 'matching_ticket' | 'pt_ticket';
  apple_product_id: string;
  title: string;
  ticket_count: number;
  price: number;
  original_price: number;
  discount_rate: number;
  bonus_points: number;
};

type MyGatheringApplication = {
  id: string;
  status: string | null;
  gathering_id: string | null;
};

type GatheringDetail = {
  id: string;
  title: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  address: string | null;
  max_male: number | null;
  max_female: number | null;
  price: number | null;
};

export default function StoreScreen() {
  const router = useRouter();
  const [points, setPoints] = useState<number | null>(null);
  const [matchingTickets, setMatchingTickets] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<StoreItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [tab, setTab] = useState<'matching' | 'pt' | 'gathering'>('matching');
  const [purchasingSku, setPurchasingSku] = useState<string | null>(null);

  const [myPtEligible, setMyPtEligible] = useState(false);
  const [myPtLoading, setMyPtLoading] = useState(true);
  const [myGathering, setMyGathering] = useState<MyGatheringApplication | null>(null);
  const [myGatheringLoading, setMyGatheringLoading] = useState(true);
  const [myGatheringDetail, setMyGatheringDetail] = useState<GatheringDetail | null>(null);
  const [myGatheringMaleCount, setMyGatheringMaleCount] = useState(0);
  const [myGatheringFemaleCount, setMyGatheringFemaleCount] = useState(0);

  const purchasingWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPurchasingWatchdog = useCallback(() => {
    if (purchasingWatchdogRef.current) {
      clearTimeout(purchasingWatchdogRef.current);
      purchasingWatchdogRef.current = null;
    }
  }, []);

  const startPurchasingWatchdog = useCallback(
    (sku: string) => {
      clearPurchasingWatchdog();
      purchasingWatchdogRef.current = setTimeout(() => {
        clearPurchasingWatchdog();
        setPurchasingSku(null);
        Alert.alert(
          '구매 확인 중',
          '결제 처리가 지연되고 있습니다. 잠시 후 상점 화면을 다시 확인해주세요.'
        );
      }, PURCHASE_SKU_STUCK_TIMEOUT_MS);
    },
    [clearPurchasingWatchdog]
  );

  useEffect(() => {
    return subscribePurchaseUiIdle(() => {
      clearPurchasingWatchdog();
      setPurchasingSku(null);
    });
  }, [clearPurchasingWatchdog]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
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
      if (opts?.silent) {
        console.warn('[STORE] load failed after IAP grant refetch', e);
      } else {
        Alert.alert('불러오기 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
        setPoints(null);
        setMatchingTickets(null);
      }
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

      const rows = (data ?? []) as unknown as {
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
            category,
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
            ? 'id,title,ticket_count,original_price,price,discount_rate,bonus_points,apple_product_id,is_active,category'
            : 'id,title,ticket_count,original_price,price,discount_rate,bonus_points,is_active,category';
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
            category,
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
      const finalProducts = primary.length > 0 ? primary : await run('matching_ticket');
      setProducts(finalProducts);
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

  const loadMyGathering = useCallback(async () => {
    setMyGatheringLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        setMyGathering(null);
        setMyGatheringDetail(null);
        setMyGatheringMaleCount(0);
        setMyGatheringFemaleCount(0);
        return;
      }

      const { data, error } = await supabase
        .from('gathering_applications')
        .select('id,status,gathering_id,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        setMyGathering(null);
        setMyGatheringDetail(null);
        setMyGatheringMaleCount(0);
        setMyGatheringFemaleCount(0);
        return;
      }
      setMyGathering(data as unknown as MyGatheringApplication);

      const gatheringId = String((data as any)?.gathering_id ?? '').trim();
      if (!gatheringId) {
        setMyGatheringDetail(null);
        setMyGatheringMaleCount(0);
        setMyGatheringFemaleCount(0);
        return;
      }

      const [{ data: g, error: gErr }, { data: apps, error: appsErr }] = await Promise.all([
        supabase
          .from('gatherings')
          .select('id,title,date,time,location,address,max_male,max_female,price')
          .eq('id', gatheringId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('gathering_applications')
          .select('gender,status')
          .eq('gathering_id', gatheringId)
          .not('status', 'eq', 'rejected'),
      ]);
      if (gErr) throw gErr;
      if (appsErr) throw appsErr;

      const gr = g as any;
      setMyGatheringDetail(
        gr?.id
          ? {
              id: String(gr.id),
              title: gr.title ?? null,
              date: gr.date ?? null,
              time: gr.time ?? null,
              location: gr.location ?? null,
              address: gr.address ?? null,
              max_male: typeof gr.max_male === 'number' ? gr.max_male : null,
              max_female: typeof gr.max_female === 'number' ? gr.max_female : null,
              price: typeof gr.price === 'number' ? gr.price : null,
            }
          : null
      );

      let m = 0;
      let f = 0;
      for (const r of apps ?? []) {
        const b = genderBucket((r as any)?.gender);
        if (b === 'male') m += 1;
        else if (b === 'female') f += 1;
      }
      setMyGatheringMaleCount(m);
      setMyGatheringFemaleCount(f);
    } catch {
      setMyGathering(null);
      setMyGatheringDetail(null);
      setMyGatheringMaleCount(0);
      setMyGatheringFemaleCount(0);
    } finally {
      setMyGatheringLoading(false);
    }
  }, []);

  useEffect(() => {
    return subscribeIapGrantSuccess(() => {
      clearPurchasingWatchdog();
      setPurchasingSku(null);
      void load({ silent: true });
      void loadMyGathering();
    });
  }, [load, loadMyGathering, clearPurchasingWatchdog]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'ios') {
        void ensureIapReady().then((ok) => {
          if (ok) {
            console.log('[STORE] IAP pre-init ok');
          } else {
            console.warn('[STORE] IAP pre-init failed (non-blocking)');
          }
        });
      }
      void load();
      void loadMyPt();
      void loadMyGathering();
      void (async () => {
        if (tab === 'gathering') {
          setProducts([]);
          setProductsLoading(false);
          return;
        }
        if (tab === 'pt') {
          await loadProducts('pt_ticket');
          return;
        }
        await loadMatchingProducts();
      })();
    }, [load, loadMyPt, loadMyGathering, loadProducts, loadMatchingProducts, tab])
  );

  const goBack = useCallback(() => router.back(), [router]);

  const onBuyMatchingTicket = useCallback(
    async (item: StoreItem) => {
      if (tab !== 'matching') {
        Alert.alert('구매 불가', '다시 시도해주세요.');
        return;
      }
      if (Platform.OS !== 'ios') {
        Alert.alert('안내', '현재 iOS에서만 인앱결제를 지원합니다.');
        return;
      }
      const sku = item.apple_product_id?.trim();
      if (!sku) {
        Alert.alert('구매 불가', '상품 정보가 올바르지 않습니다.');
        return;
      }
      if (isUnlimitedMatchingTicketBlocked(item)) {
        return;
      }
      if (purchasingSku) {
        Alert.alert('안내', '결제 처리 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      clearPurchasingWatchdog();
      setPurchasingSku(sku);
      startPurchasingWatchdog(sku);
      try {
        console.log('[STORE] matching requestPurchase start', { sku });
        await requestPurchase(sku);
        console.log('[STORE] matching requestPurchase returned', { sku });
      } catch (e: any) {
        console.error('[STORE] matching requestPurchase catch', e);
        const msg = String(e?.message ?? e ?? '');
        if (isDuplicateLikeError({ code: e?.code, message: msg })) {
          console.log('[RNIAP] duplicate skipped', { from: 'store onBuyMatchingTicket', sku, msg });
          clearPurchasingWatchdog();
          setPurchasingSku(null);
          return;
        }
        clearPurchasingWatchdog();
        setPurchasingSku(null);
        Alert.alert('구매 실패', purchaseAlertMessage(e));
      }
    },
    [tab, purchasingSku, clearPurchasingWatchdog, startPurchasingWatchdog]
  );

  const onBuyPtTicket = useCallback(
    async (item: StoreItem) => {
      if (tab !== 'pt') return;
      if (!myPtEligible) {
        Alert.alert('구매 불가', '승인된 트레이너만 구매 가능합니다.');
        return;
      }
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
      clearPurchasingWatchdog();
      setPurchasingSku(sku);
      startPurchasingWatchdog(sku);
      try {
        console.log('[STORE] pt requestPurchase start', { sku });
        await requestPurchase(sku);
        console.log('[STORE] pt requestPurchase returned', { sku });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? '');
        if (isDuplicateLikeError({ code: e?.code, message: msg })) {
          console.log('[RNIAP] duplicate skipped', { from: 'store onBuyPtTicket', sku, msg });
          clearPurchasingWatchdog();
          setPurchasingSku(null);
          return;
        }
        console.error('[STORE] pt requestPurchase catch', e);
        clearPurchasingWatchdog();
        setPurchasingSku(null);
        Alert.alert('구매 실패', purchaseAlertMessage(e));
      }
    },
    [tab, myPtEligible, purchasingSku, clearPurchasingWatchdog, startPurchasingWatchdog]
  );

  const onPayGathering = useCallback(async () => {
    const status = String(myGathering?.status ?? '').trim();
    if (status !== 'approved') return;
    if (Platform.OS !== 'ios') {
      Alert.alert('안내', '현재 iOS에서만 인앱결제를 지원합니다.');
      return;
    }
    if (!myGathering?.id) return;
    if (purchasingSku) {
      Alert.alert('안내', '결제 처리 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const sku = GATHERING_FEE_PRODUCT_ID;
    setPendingGatheringApplicationId(myGathering.id);
    clearPurchasingWatchdog();
    setPurchasingSku(sku);
    startPurchasingWatchdog(sku);
    try {
      console.log('[STORE] gathering requestPurchase start', {
        sku,
        gatheringApplicationId: myGathering.id,
      });
      await requestPurchase(sku);
      console.log('[STORE] gathering requestPurchase returned', { sku });
    } catch (e: any) {
      console.error('[STORE] gathering requestPurchase catch', e);
      const msg = String(e?.message ?? e ?? '');
      if (isDuplicateLikeError({ code: e?.code, message: msg })) {
        console.log('[RNIAP] duplicate skipped', { from: 'store onPayGathering', sku, msg });
        clearPurchasingWatchdog();
        setPurchasingSku(null);
        return;
      }
      setPendingGatheringApplicationId(null);
      clearPurchasingWatchdog();
      setPurchasingSku(null);
      Alert.alert('구매 실패', purchaseAlertMessage(e));
    }
  }, [myGathering, purchasingSku, clearPurchasingWatchdog, startPurchasingWatchdog]);

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
  // react-native-iap purchaseUpdatedListener는 app/_layout.tsx에서 앱 루트 레벨에 등록됨

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
          <Pressable
            onPress={() => setTab('gathering')}
            style={[styles.tabBtn, tab === 'gathering' && styles.tabBtnActive]}
            accessibilityRole="button"
            accessibilityLabel="소모임 탭"
          >
            <Text style={[styles.tabText, tab === 'gathering' && styles.tabTextActive]}>소모임</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>
          {tab === 'gathering' ? '소모임 결제' : tab === 'pt' ? '피티권 구매' : '매칭권 구매'}
        </Text>

        {tab === 'gathering' ? (
          myGatheringLoading ? (
            <View style={styles.productsLoading}>
              <ActivityIndicator size="small" color={MAIN} />
              <Text style={styles.productsLoadingText}>불러오는 중…</Text>
            </View>
          ) : !myGathering ? (
            <View style={styles.productsEmpty}>
              <Text style={styles.productsEmptyText}>신청 내역이 없습니다.</Text>
            </View>
          ) : (
            <>
              {String(myGathering.status ?? '') === 'pending' ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>승인 대기 중입니다. 승인 후 결제할 수 있어요.</Text>
                </View>
              ) : null}

              {String(myGathering.status ?? '') === 'approved' ? (
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <View style={styles.iconWrap}>
                      <Feather name="users" size={20} color={MAIN} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{myGatheringDetail?.title ?? '소모임'}</Text>
                      <View style={styles.metaLine}>
                        <Text style={styles.priceText}>
                          {typeof myGatheringDetail?.price === 'number'
                            ? `₩${formatKRW(myGatheringDetail.price)}`
                            : '가격: -'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Pressable
                    onPress={onPayGathering}
                    disabled={!!purchasingSku}
                    style={({ pressed }) => [
                      styles.buyBtn,
                      !!purchasingSku && styles.buyBtnDisabled,
                      pressed && !purchasingSku && styles.rowPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="소모임 결제하기"
                  >
                    {purchasingSku ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.buyBtnText}>구매</Text>
                    )}
                  </Pressable>
                </View>
              ) : null}

              {String(myGathering.status ?? '') === 'paid' ? (
                <View style={styles.paidCard}>
                  <View style={styles.paidHeaderLine}>
                    <Text style={styles.paidTitle}>{myGatheringDetail?.title ?? '소모임'}</Text>
                    <View style={styles.paidBadge} accessibilityLabel="결제 완료">
                      <Text style={styles.paidBadgeText}>결제 완료</Text>
                    </View>
                  </View>

                  <View style={styles.paidRows}>
                    <View style={styles.paidRow}>
                      <Text style={styles.paidLabel}>날짜</Text>
                      <Text style={styles.paidValue}>{formatDisplayDate(myGatheringDetail?.date)}</Text>
                    </View>
                    <View style={styles.paidRow}>
                      <Text style={styles.paidLabel}>시간</Text>
                      <Text style={styles.paidValue}>{String(myGatheringDetail?.time ?? '').trim() || '-'}</Text>
                    </View>
                    <View style={styles.paidRow}>
                      <Text style={styles.paidLabel}>장소</Text>
                      <Text style={styles.paidValue}>{String(myGatheringDetail?.location ?? '').trim() || '-'}</Text>
                    </View>
                    <View style={styles.paidRow}>
                      <Text style={styles.paidLabel}>상세주소</Text>
                      <Text style={styles.paidValue}>{String(myGatheringDetail?.address ?? '').trim() || '-'}</Text>
                    </View>
                    <View style={[styles.paidRow, styles.paidRowLast]}>
                      <Text style={styles.paidLabel}>현재 신청 인원</Text>
                      <Text style={styles.paidValue}>
                        남자 {myGatheringMaleCount}명 / 여자 {myGatheringFemaleCount}명
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {String(myGathering.status ?? '') &&
              String(myGathering.status ?? '') !== 'pending' &&
              String(myGathering.status ?? '') !== 'approved' &&
              String(myGathering.status ?? '') !== 'paid' ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>상태: {String(myGathering.status ?? 'pending')}</Text>
                </View>
              ) : null}
            </>
          )
        ) : null}

        {tab === 'pt' && !myPtLoading && !myPtEligible ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>승인된 트레이너만 구매 가능합니다</Text>
          </View>
        ) : null}

        {tab !== 'gathering' && productsLoading ? (
          <View style={styles.productsLoading}>
            <ActivityIndicator size="small" color={MAIN} />
            <Text style={styles.productsLoadingText}>상품 불러오는 중…</Text>
          </View>
        ) : tab !== 'gathering' && productsEmpty ? (
          <View style={styles.productsEmpty}>
            <Text style={styles.productsEmptyText}>현재 구매 가능한 상품이 없습니다.</Text>
          </View>
        ) : tab !== 'gathering' ? (
          products.map((item) => {
            const unlimitedBlocked =
              tab === 'matching' && isUnlimitedMatchingTicketBlocked(item);
            const RowWrap = tab === 'pt' || unlimitedBlocked ? View : Pressable;
            const wrapProps =
              tab === 'pt' || unlimitedBlocked
                ? {
                    style: styles.row,
                  }
                : {
                    onPress: () => {
                      void onBuyMatchingTicket(item);
                    },
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
                  {tab === 'matching' ? (
                    <Image
                      source={require('../assets/images/matching-ticket.png')}
                      style={styles.matchingTicketIcon}
                      resizeMode="contain"
                      accessibilityLabel="매칭권"
                    />
                  ) : (
                    <Text style={styles.dumbbellIcon} accessibilityLabel="피티권">
                      🏋️
                    </Text>
                  )}
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
                  onPress={() => void onBuyPtTicket(item)}
                  disabled={!myPtEligible || !!purchasingSku}
                  style={[styles.buyBtn, !myPtEligible && styles.buyBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="구매"
                >
                  {purchasingSku && purchasingSku === item.apple_product_id.trim() ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={[styles.buyBtnText, !myPtEligible && styles.buyBtnTextDisabled]}>
                      구매
                    </Text>
                  )}
                </Pressable>
              ) : unlimitedBlocked ? (
                <View
                  style={[styles.buyBtn, styles.buyBtnDisabled]}
                  accessibilityRole="text"
                  accessibilityLabel="준비 중"
                >
                  <Text style={[styles.buyBtnText, styles.buyBtnTextDisabled]}>준비 중</Text>
                </View>
              ) : purchasingSku && purchasingSku === item.apple_product_id.trim() ? (
                <ActivityIndicator size="small" color={MAIN} />
              ) : (
                <Feather name="chevron-right" size={20} color="#9CA3AF" />
              )}
              </RowWrap>
            );
          })
        ) : null}
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
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  noticeSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
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
  matchingTicketIcon: {
    width: 48,
    height: 48,
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
  paidCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEF0F4',
  },
  paidHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  paidTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  paidBadge: {
    backgroundColor: MAIN,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  paidBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  paidRows: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEF0F4',
    overflow: 'hidden',
  },
  paidRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  paidRowLast: {
    borderBottomWidth: 0,
  },
  paidLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
  },
  paidValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 20,
  },
});
