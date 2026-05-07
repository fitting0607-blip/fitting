import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as InAppPurchases from 'expo-in-app-purchases';
import { IAPResponseCode } from 'expo-in-app-purchases';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

function isTimeoutError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? '');
  return msg.includes('timeout after');
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
  const iapConnectPromiseRef = useRef<Promise<boolean> | null>(null);

  const [myPtEligible, setMyPtEligible] = useState(false);
  const [myPtLoading, setMyPtLoading] = useState(true);

  const fetchProductBySku = useCallback(async (sku: string) => {
    const trimmed = String(sku ?? '').trim();
    if (!trimmed) return null;
    const { data, error } = await supabase
      .from('products')
      .select('id,category,title,ticket_count,price,bonus_points,apple_product_id')
      .eq('apple_product_id', trimmed)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: String((data as any).id),
      category: String((data as any).category) as StoreItem['category'],
      apple_product_id: String((data as any).apple_product_id ?? trimmed).trim(),
      title: (data as any).title ?? '상품',
      ticket_count: typeof (data as any).ticket_count === 'number' ? (data as any).ticket_count : 0,
      price: typeof (data as any).price === 'number' ? (data as any).price : 0,
      original_price: 0,
      discount_rate: 0,
      bonus_points: typeof (data as any).bonus_points === 'number' ? (data as any).bonus_points : 0,
    } satisfies StoreItem;
  }, []);

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

  const ensureIap = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') return false;
    if (iapReady) return true;
    if (iapConnectPromiseRef.current) return await iapConnectPromiseRef.current;

    const p = (async (): Promise<boolean> => {
      setIapLoading(true);
      try {
        console.log('[IAP] connectAsync start');
        await withTimeout(InAppPurchases.connectAsync(), 8000, 'connectAsync');
        console.log('[IAP] connectAsync success');
        setIapReady(true);
        return true;
      } catch (e: unknown) {
        const msg = String((e as { message?: string })?.message ?? e ?? '');
        console.log('[IAP] connectAsync error', msg);
        if (msg.includes('Already connected')) {
          setIapReady(true);
          return true;
        }
        setIapReady(false);
        iapConnectPromiseRef.current = null;
        Alert.alert('[IAP] connectAsync error', String(e));
        throw e;
      } finally {
        setIapLoading(false);
        iapConnectPromiseRef.current = null;
        console.log('[IAP] connectAsync done');
      }
    })();

    iapConnectPromiseRef.current = p;
    return await p;
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

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void withTimeout(ensureIap(), 8000, 'ensureIap');
  }, [ensureIap]);

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
      if (purchasingSku) {
        console.log('[IAP] stale purchasingSku reset', purchasingSku);
        setPurchasingSku(null);
      }
      setPurchasingSku(sku);
      try {
        if (sku === 'com.hywoo.fitting.ticket_unlimited') {
          Alert.alert('안내', '프리미엄 상품은 준비 중입니다.');
          return;
        }

        console.log('[IAP] before ensureIap');
        const ok = await withTimeout(ensureIap(), 8000, 'ensureIap');
        console.log('[IAP] after ensureIap', ok);
        if (!ok) {
          Alert.alert('안내', '결제를 준비 중입니다. 잠시 후 다시 시도해주세요.');
          return;
        }

        console.log('[IAP] getProductsAsync([sku]) start', sku);

        const productRes = await withTimeout(
          InAppPurchases.getProductsAsync([sku]),
          8000,
          'getProductsAsync'
        );

        console.log('[IAP] getProductsAsync result', JSON.stringify(productRes));

        const productResults = productRes?.results ?? [];
        console.log('[IAP] responseCode', productRes?.responseCode);

        if (!productResults.length) {
          Alert.alert(
            '상품 조회 실패',
            `App Store에서 상품을 찾지 못했습니다.\nsku: ${sku}\nresponseCode: ${productRes?.responseCode}`
          );
          return;
        }

        console.log('[IAP] purchaseItemAsync start', sku);

        const purchaseRes = await withTimeout(
          InAppPurchases.purchaseItemAsync(sku),
          15000,
          'purchaseItemAsync'
        );

        console.log('[IAP] purchaseItemAsync result', JSON.stringify(purchaseRes));
        Alert.alert('[IAP] purchase result', JSON.stringify(purchaseRes));
      } catch (e: any) {
        console.log('[IAP] error raw', e);
        if (isTimeoutError(e)) {
          Alert.alert(
            '구매 지연',
            '인앱결제 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          );
        } else {
          Alert.alert('[IAP] error', typeof e === 'object' ? JSON.stringify(e, null, 2) : String(e));
        }
      } finally {
        setPurchasingSku(null);
      }
    },
    [tab, purchasingSku, ensureIap]
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
      setPurchasingSku(sku);
      try {
        if (sku === 'com.hywoo.fitting.ticket_unlimited') {
          Alert.alert('안내', '프리미엄 상품은 준비 중입니다.');
          return;
        }

        const ok = await withTimeout(ensureIap(), 8000, 'ensureIap');
        if (!ok) {
          Alert.alert('안내', '결제를 준비 중입니다. 잠시 후 다시 시도해주세요.');
          return;
        }

        console.log('[IAP] getProductsAsync([sku]) start', sku);

        const productRes = await withTimeout(
          InAppPurchases.getProductsAsync([sku]),
          8000,
          'getProductsAsync'
        );

        console.log('[IAP] getProductsAsync result', JSON.stringify(productRes));

        const productResults = productRes?.results ?? [];

        if (!productResults.length) {
          Alert.alert(
            '상품 조회 실패',
            `App Store에서 상품을 찾지 못했습니다.\nsku: ${sku}\nresponseCode: ${productRes?.responseCode}`
          );
          return;
        }

        console.log('[IAP] purchaseItemAsync start', sku);

        const purchaseRes = await withTimeout(
          InAppPurchases.purchaseItemAsync(sku),
          15000,
          'purchaseItemAsync'
        );

        console.log('[IAP] purchaseItemAsync result', JSON.stringify(purchaseRes));
      } catch (e: any) {
        if (isTimeoutError(e)) {
          Alert.alert(
            '구매 지연',
            '인앱결제 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
          );
        }
        Alert.alert('[IAP] error', String(e));
      } finally {
        setPurchasingSku(null);
      }
    },
    [tab, myPtEligible, purchasingSku, ensureIap]
  );

  const clearPendingTransactionsForDebug = useCallback(async () => {
    try {
      console.log('[IAP] pending cleanup start');

      if (Platform.OS !== 'ios') {
        console.log('[IAP] pending cleanup skipped - not ios');
        return;
      }

      const ok = await ensureIap();

      if (!ok) {
        console.log('[IAP] pending cleanup skipped - ensureIap false');
        return;
      }

      const history = await InAppPurchases.getPurchaseHistoryAsync();

      console.log('[IAP] purchase history', JSON.stringify(history));

      const results = history?.results ?? [];

      for (const purchase of results) {
        try {
          console.log('[IAP] finishing pending purchase', JSON.stringify(purchase));

          await InAppPurchases.finishTransactionAsync(purchase, false);
        } catch (e) {
          console.log('[IAP] finishTransaction ignored error', e);
        }
      }

      console.log('[IAP] pending transactions cleared');

      Alert.alert('완료', 'Pending transaction cleanup 완료');
    } catch (e) {
      console.log('[IAP] pending cleanup error', e);

      Alert.alert(
        'cleanup error',
        typeof e === 'object' ? JSON.stringify(e, null, 2) : String(e)
      );
    }
  }, [ensureIap]);

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
  const showIapProductList = Platform.OS !== 'ios' || iapReady;

  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // connectAsync 완료(iapReady=true) 이후에만 listener 등록
    if (!iapReady) return;
    let mounted = true;

    const TICKET_QTY_BY_PRODUCT_ID: Record<string, number> = {
      'com.hywoo.fitting.ticket_3': 3,
      'com.hywoo.fitting.ticket_5': 5,
      'com.hywoo.fitting.ticket_10': 10,
      'com.hywoo.fitting.ticket_30': 30,
      'com.hywoo.fitting.ticket_50': 50,
    };

    InAppPurchases.setPurchaseListener(async ({ responseCode, results, errorCode }: any) => {
      if (!mounted) return;
      console.log('[IAP LISTENER]', { responseCode, results, errorCode });

      const insertPayment = async (
        payload: {
          user_id: string;
          product_id: string | null;
          product_title: string | null;
          amount: number | null;
          status: string;
          transaction_id: string | null;
        },
        debug?: { state?: unknown }
      ) => {
        if (!payload.transaction_id) {
          Alert.alert('transactionId is null', `state=${String(debug?.state ?? '')}`);
        }
        console.log('[payments] insert payload', payload);
        const { error } = await supabase.from('payments').insert(payload);
        if (error) {
          Alert.alert(JSON.stringify(error));
          return { ok: false as const, error };
        }
        Alert.alert('payment insert success');
        return { ok: true as const, error: null };
      };

      // cancelled
      if (responseCode === (InAppPurchases as any).IAPResponseCode?.USER_CANCELED) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const skuRef = (purchasingSku ?? '').trim();
            const item =
              products.find((p) => p.apple_product_id.trim() === skuRef) ?? null;
            await insertPayment({
              user_id: user.id,
              product_id: item?.id ?? null,
              product_title: (item?.title ?? skuRef) || 'IAP',
              amount: typeof item?.price === 'number' ? item.price : null,
              status: 'cancelled',
              transaction_id: null,
            }, { state: 'USER_CANCELED' });
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
        responseCode !== (InAppPurchases as any).IAPResponseCode?.OK
      ) {
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user?.id) {
            const skuRef = (purchasingSku ?? '').trim();
            const item =
              products.find((p) => p.apple_product_id.trim() === skuRef) ?? null;
            await insertPayment({
              user_id: user.id,
              product_id: item?.id ?? null,
              product_title: (item?.title ?? skuRef) || 'IAP',
              amount: typeof item?.price === 'number' ? item.price : null,
              status: 'failed',
              transaction_id: null,
            }, { state: `IAPResponseCode=${String(responseCode)}` });
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
          const sku = String((purchase as any)?.productId ?? '').trim();
          const transactionId = String(
            (purchase as any)?.transactionId ??
              (purchase as any)?.transactionID ??
              (purchase as any)?.orderId ??
              ''
          ).trim();
          console.log('[IAP] purchase', { productId: sku, transactionId });
          console.log('purchase.productId', sku, 'purchase.transactionId', transactionId);
          Alert.alert('IAP purchase', `state=${String(state)}\nproductId=${sku}\ntransactionId=${transactionId}`);

          const purchaseState = (InAppPurchases as any).IAPPurchaseState;
          const purchased =
            state === purchaseState?.PURCHASED ||
            state === purchaseState?.RESTORED ||
            state === 0 ||
            state === 1 ||
            state == null;

          // productId가 매핑된 상품일 때만 지급 처리
          const isKnownProductId =
            sku in TICKET_QTY_BY_PRODUCT_ID ||
            sku === 'com.hywoo.fitting.ticket_unlimited' ||
            sku === 'com.hywoo.fitting.trainer_30';

          if (!sku || !isKnownProductId) {
            console.log('[IAP] unknown/empty productId, skip grant', { sku, state });
            setPurchasingSku(null);
            continue;
          }

          // pending transaction도 처리되도록 purchased 판별을 완화
          if (!purchased) {
            console.log('[IAP] not purchased/restored, skip grant', { sku, state });
            setPurchasingSku(null);
            continue;
          }

          const item =
            products.find((p) => p.apple_product_id.trim() === sku) ??
            products.find((p) => p.id === sku) ??
            (await fetchProductBySku(sku));

          const {
            data: { user },
            error: authError,
          } = await supabase.auth.getUser();
          if (authError) throw authError;
          if (!user?.id) throw new Error('로그인이 필요합니다.');

          if (!item) {
            setPurchasingSku(null);
            Alert.alert(
              '안내',
              '상품 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.'
            );
            continue;
          }

          const category = item.category;
          if (sku === 'com.hywoo.fitting.ticket_unlimited') {
            // premium (별도 처리)
            console.log('[IAP] premium product detected, handled separately', sku);
            console.error('[IAP] premium grant not implemented yet');
            Alert.alert('안내', '프리미엄 상품은 준비 중입니다.');
            console.log('finishTransaction called');
            await InAppPurchases.finishTransactionAsync(purchase, false);
            setPurchasingSku(null);
            continue;
          }

          // 중복 transactionId 방지: payments에 동일 transaction_id가 있으면 지급 스킵
          if (transactionId) {
            const { data: existing, error: dupErr } = await supabase
              .from('payments')
              .select('id')
              // @ts-ignore: DB 컬럼이 실제로 존재해야 함 (transaction_id)
              .eq('transaction_id', transactionId)
              .limit(1);
            if (dupErr) throw dupErr;
            if ((existing?.length ?? 0) > 0) {
              console.log('[IAP] duplicate transactionId, skip grant', transactionId);
              console.log('finishTransaction called');
              await InAppPurchases.finishTransactionAsync(purchase, false);
              setPurchasingSku(null);
              continue;
            }
          }

          // 1) payments INSERT
          {
            const payload = {
              user_id: user.id,
              product_id: item?.id ?? null,
              product_title: item?.title ?? sku,
              amount: typeof item?.price === 'number' ? item.price : null,
              status: 'succeeded',
              transaction_id: transactionId || null,
            };
            const res = await insertPayment(payload, { state });
            if (!res.ok) {
              console.log('payment insert error');
              console.error(res.error);
              setPurchasingSku(null);
              continue;
            }
            console.log('payment insert success');
          }

          if (sku === 'com.hywoo.fitting.trainer_30' || category === 'pt_ticket') {
            // 피티권(별도 처리): trainer_profiles 최신 1건 is_approved=true
            const { data: latestProfile, error: profErr } = await supabase
              .from('trainer_profiles')
              .select('id')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (profErr) throw profErr;
            const profileId = (latestProfile as any)?.id;
            if (!profileId) throw new Error('트레이너 신청 정보를 찾을 수 없습니다.');

            const { error: upErr } = await supabase
              .from('trainer_profiles')
              .update({ is_approved: true })
              .eq('id', profileId);
            if (upErr) {
              console.log('user update error');
              console.error(upErr);
              setPurchasingSku(null);
              continue;
            }
            console.log('user update success');

            console.log('finishTransaction called');
            await InAppPurchases.finishTransactionAsync(purchase, false);

            void loadMyPt();
            setPurchasingSku(null);
            Alert.alert('결제 완료', '피티권 결제가 완료됐어요.');
            continue;
          }

          // 매칭권: productId별 수량 매핑 우선
          const addTicketsFromMap = TICKET_QTY_BY_PRODUCT_ID[sku];
          const addTickets = Math.max(0, typeof addTicketsFromMap === 'number' ? addTicketsFromMap : (item?.ticket_count ?? 0));
          const addPoints = Math.max(0, item?.bonus_points ?? 0);

          // 2) point_logs INSERT (보너스 포인트가 있을 때만)
          if (addPoints > 0) {
            const { error: logErr } = await supabase.from('point_logs').insert({
              user_id: user.id,
              amount: addPoints,
              reason: 'ticket_purchase_bonus',
            });
            if (logErr) {
              console.log('user update error');
              console.error(logErr);
              setPurchasingSku(null);
              continue;
            }
          }

          // 3) users.matching_tickets UPDATE (+ bonus points if any)
          const { data: me, error: meError } = await supabase
            .from('users')
            .select('points,matching_tickets')
            .eq('id', user.id)
            .maybeSingle();
          if (meError) throw meError;

          const curTickets =
            typeof (me as any)?.matching_tickets === 'number' ? (me as any).matching_tickets : 0;
          const curPoints = typeof (me as any)?.points === 'number' ? (me as any).points : 0;

          const { error: upErr } = await supabase
            .from('users')
            .update({
              matching_tickets: curTickets + addTickets,
              ...(addPoints > 0 ? { points: curPoints + addPoints } : {}),
            })
            .eq('id', user.id);
          if (upErr) {
            console.log('user update error');
            console.error(upErr);
            setPurchasingSku(null);
            continue;
          }
          console.log('user update success');

          console.log('finishTransaction called');
          await InAppPurchases.finishTransactionAsync(purchase, false);

          setPoints(curPoints + addPoints);
          setMatchingTickets(curTickets + addTickets);
          setPurchasingSku(null);
          Alert.alert('결제 완료', '매칭권이 지급됐어요.');
        } catch (e: any) {
          setPurchasingSku(null);
          console.error(e);
          Alert.alert('결제 처리 실패', e?.message ?? '잠시 후 다시 시도해주세요.');
        }
      }
    });

    return () => {
      mounted = false;
      try {
        // expo-in-app-purchases는 remove API가 없어서 listener를 빈 함수로 덮어씌움
        InAppPurchases.setPurchaseListener(() => {});
      } catch {
        // ignore
      }
    };
  }, [iapReady, products, purchasingSku, loadMyPt]);

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

        {Platform.OS === 'ios' ? (
          <Pressable
            onPress={() => void clearPendingTransactionsForDebug()}
            style={({ pressed }) => [styles.debugBtn, pressed && styles.debugBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Pending Cleanup"
          >
            <Text style={styles.debugBtnText}>Pending Cleanup</Text>
          </Pressable>
        ) : null}

        <Text style={styles.sectionLabel}>{tab === 'pt' ? '피티권 구매' : '매칭권 구매'}</Text>

        {tab === 'pt' && !myPtLoading && !myPtEligible ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>승인된 트레이너만 구매 가능합니다</Text>
          </View>
        ) : null}

        {Platform.OS === 'ios' && !showIapProductList ? (
          <View style={styles.productsLoading}>
            <ActivityIndicator size="small" color={MAIN} />
            <Text style={styles.productsLoadingText}>결제 준비 중…</Text>
          </View>
        ) : productsLoading ? (
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
  debugBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  debugBtnPressed: {
    opacity: 0.9,
  },
  debugBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
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
