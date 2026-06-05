import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { AppOwnership } from 'expo-constants';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/supabase';
import { grantAppleIapAndRecord } from '@/iap/grant';
import { showPurchaseCompleteAlert } from '@/iap/purchaseCompleteAlert';
import { APPLE_PRODUCT_IDS } from '@/iap/productIds';

const GATHERING_FEE_PRODUCT_ID = 'com.hywoo.fitting.gathering_fee';
const PENDING_GATHERING_APP_ID_STORAGE_KEY = 'fitting.iap.pendingGatheringApplicationId';

/** Store / listeners pass purchase objects shaped by react-native-iap — no static import of its types. */
export type IapPurchase = Record<string, unknown>;
export type IapProduct = Record<string, unknown>;

/**
 * Native IAP (App Store / Google Play) when not in Expo Go.
 * react-native-iap / NitroModules are unavailable in Expo Go.
 */
export const CAN_USE_NATIVE_IAP =
  (Platform.OS === 'ios' || Platform.OS === 'android') &&
  Constants.appOwnership !== AppOwnership.Expo;

/** Narrow native module surface — loaded only via dynamic import when CAN_USE_NATIVE_IAP. */
type ReactNativeIapModule = {
  initConnection: () => Promise<boolean>;
  endConnection: () => Promise<void>;
  fetchProducts: (args: unknown) => Promise<unknown>;
  getAvailablePurchases: () => Promise<unknown>;
  getPendingTransactionsIOS: () => Promise<unknown>;
  finishTransaction: (args: unknown) => Promise<void>;
  requestPurchase: (args: unknown) => Promise<void>;
  purchaseUpdatedListener: (cb: (purchase: unknown) => void) => { remove: () => void };
  purchaseErrorListener: (cb: (error: unknown) => void) => { remove: () => void };
};

let nativeModulePromise: Promise<ReactNativeIapModule | null> | null = null;

function loadNativeModuleOnce(): Promise<ReactNativeIapModule | null> {
  if (!CAN_USE_NATIVE_IAP) return Promise.resolve(null);
  if (!nativeModulePromise) {
    nativeModulePromise = import('react-native-iap')
      .then((m) => m as unknown as ReactNativeIapModule)
      .catch((e: unknown) => {
        console.error('[RNIAP] dynamic import react-native-iap failed', e);
        return null;
      });
  }
  return nativeModulePromise;
}

/** App Store Review: SKU/productId를 사용자 Alert에 노출하지 않음 */
export const IAP_PURCHASE_USER_MESSAGE = '구매를 진행할 수 없습니다. 잠시 후 다시 시도해주세요.';

let listenersStarted = false;
let purchaseUpdatedSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;
const alertedTransactionIds = new Set<string>();

let billingReady = false;
let connectingPromise: Promise<boolean> | null = null;

// 같은 세션에서 이미 처리한 transactionId를 추적해 중복 purchaseUpdated/replay 이벤트를 silent skip 한다.
const processedTransactionIds = new Set<string>();
const inflightTransactionIds = new Set<string>();

/** Gathering fee purchase needs application context to mark paid (memory + AsyncStorage). */
let pendingGatheringApplicationId: string | null = null;
let pendingGatheringStorageHydrated = false;
let pendingGatheringStorageHydratePromise: Promise<void> | null = null;

async function hydratePendingGatheringApplicationIdFromStorage(): Promise<void> {
  if (pendingGatheringStorageHydrated) return;
  if (pendingGatheringStorageHydratePromise) return pendingGatheringStorageHydratePromise;

  pendingGatheringStorageHydratePromise = (async () => {
    try {
      const stored = await AsyncStorage.getItem(PENDING_GATHERING_APP_ID_STORAGE_KEY);
      const trimmed = String(stored ?? '').trim();
      if (trimmed && !pendingGatheringApplicationId) {
        pendingGatheringApplicationId = trimmed;
      }
    } catch (e) {
      console.warn('[RNIAP] hydrate pending gathering application id failed', e);
    } finally {
      pendingGatheringStorageHydrated = true;
      pendingGatheringStorageHydratePromise = null;
    }
  })();

  return pendingGatheringStorageHydratePromise;
}

async function persistPendingGatheringApplicationId(id: string | null): Promise<void> {
  try {
    if (id) {
      await AsyncStorage.setItem(PENDING_GATHERING_APP_ID_STORAGE_KEY, id);
    } else {
      await AsyncStorage.removeItem(PENDING_GATHERING_APP_ID_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('[RNIAP] persist pending gathering application id failed', e);
  }
}

async function clearPendingGatheringApplicationId(): Promise<void> {
  pendingGatheringApplicationId = null;
  await persistPendingGatheringApplicationId(null);
}

async function resolvePendingGatheringApplicationIdForGrant(productId: string): Promise<string | null> {
  if (productId !== GATHERING_FEE_PRODUCT_ID) return null;
  await hydratePendingGatheringApplicationIdFromStorage();
  const trimmed = String(pendingGatheringApplicationId ?? '').trim();
  return trimmed || null;
}

function getIapPurchaseCompleteMessage(productId: string): string {
  if (productId === 'com.hywoo.fitting.trainer_30') return '피티권 지급 완료';
  if (productId === GATHERING_FEE_PRODUCT_ID) return '소모임 참가비 결제 완료';
  return '매칭권 지급 완료';
}

function shouldClearPendingGatheringAfterGrant(productId: string, grantOk: boolean, grantKind?: string): boolean {
  if (productId !== GATHERING_FEE_PRODUCT_ID) return false;
  if (!grantOk) return false;
  return grantKind === 'gathering_fee' || grantKind === 'duplicate';
}

/** purchaseErrorListener에 productId가 없을 때 store purchasingSku 해제용 */
let lastRequestPurchaseSku: string | null = null;

/** requestPurchase ~ purchaseUpdated/error 처리 완료까지 로그인 리다이렉트 차단용 */
let iapPurchaseFlowActive = false;

type IapPurchaseFlowListener = () => void;
const iapPurchaseFlowListeners = new Set<IapPurchaseFlowListener>();

function notifyIapPurchaseFlowChange(): void {
  iapPurchaseFlowListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore subscriber errors
    }
  });
}

/** IAP 결제/지급 처리 중 — RootLayout에서 로그인 replace 방지 */
export function isIapPurchaseFlowActive(): boolean {
  return iapPurchaseFlowActive || inflightTransactionIds.size > 0;
}

export function subscribeIapPurchaseFlowChange(cb: IapPurchaseFlowListener): () => void {
  iapPurchaseFlowListeners.add(cb);
  return () => {
    iapPurchaseFlowListeners.delete(cb);
  };
}

export function setPendingGatheringApplicationId(id: string | null): void {
  const trimmed = String(id ?? '').trim();
  pendingGatheringApplicationId = trimmed || null;
  void persistPendingGatheringApplicationId(pendingGatheringApplicationId);
}

/** store.tsx 등에서 purchasingSku 해제 — listener는 rniap에만 있으므로 여기서 UI 동기화 */
type PurchaseUiIdleListener = (info: { productId: string }) => void;
const purchaseUiIdleListeners = new Set<PurchaseUiIdleListener>();

function emitPurchaseUiIdle(productId?: string | null): void {
  const pid = String(productId ?? lastRequestPurchaseSku ?? '').trim();
  if (pid) {
    purchaseUiIdleListeners.forEach((cb) => {
      try {
        cb({ productId: pid });
      } catch {
        // ignore subscriber errors
      }
    });
  }
  iapPurchaseFlowActive = false;
  lastRequestPurchaseSku = null;
  notifyIapPurchaseFlowChange();
}

function emitPurchaseUiIdleFromError(error: unknown): void {
  const skuFromErr = String(
    (error as { productId?: string; sku?: string })?.productId ??
      (error as { productId?: string; sku?: string })?.sku ??
      ''
  ).trim();
  emitPurchaseUiIdle(skuFromErr || lastRequestPurchaseSku);
}

export function subscribePurchaseUiIdle(cb: PurchaseUiIdleListener): () => void {
  purchaseUiIdleListeners.add(cb);
  return () => {
    purchaseUiIdleListeners.delete(cb);
  };
}

/** DB grant(ok=true) 직후 상점 등에서 보유 재화만 가볍게 갱신할 때 사용 — 실패해도 지급/finish는 진행 */
type IapGrantSuccessListener = () => void | Promise<void>;
const iapGrantSuccessListeners = new Set<IapGrantSuccessListener>();

function emitIapGrantSuccessRefetch(): void {
  iapGrantSuccessListeners.forEach((cb) => {
    try {
      void Promise.resolve(cb()).catch((e) => {
        console.warn('[RNIAP] IAP grant success refetch listener failed', e);
      });
    } catch (e) {
      console.warn('[RNIAP] IAP grant success refetch listener threw', e);
    }
  });
}

export function subscribeIapGrantSuccess(cb: IapGrantSuccessListener): () => void {
  iapGrantSuccessListeners.add(cb);
  return () => {
    iapGrantSuccessListeners.delete(cb);
  };
}

// react-native-iap native(iOS)는 같은 purchaseUpdated 이벤트를 dedup 한 뒤
// "Duplicate purchase update skipped ..." 메시지의 purchaseError를 보낸다.
// 그런 케이스나, grant 단계에서 DB transactionId가 이미 있어 duplicate으로 떨어지는 케이스는
// 사용자 Alert 없이 조용히 skip 처리해야 한다.
export function isDuplicateLikeError(input: { code?: string | null; message?: string | null }): boolean {
  const code = String(input?.code ?? '').toLowerCase();
  if (code === 'duplicate-purchase') return true;
  const msg = String(input?.message ?? '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('duplicate purchase update') ||
    msg.includes('duplicate transaction') ||
    msg.includes('duplicate transactionid') ||
    msg.includes('already processed')
  );
}

function isAuthSessionMissingError(input: { code?: string | null; message?: string | null }): boolean {
  const code = String(input?.code ?? '').toLowerCase();
  if (code.includes('auth') && code.includes('session')) return true;
  const msg = String(input?.message ?? '').toLowerCase();
  if (!msg) return false;
  return msg.includes('auth session missing');
}

function isUserCancelLikeError(input: { code?: string | null; message?: string | null }): boolean {
  const code = String(input?.code ?? '').toLowerCase();
  const msg = String(input?.message ?? '').toLowerCase();
  if (code.includes('cancel') || code.includes('e_user_cancelled')) return true;
  if (!msg) return false;
  return (
    msg.includes('cancel') ||
    msg.includes('cancelled') ||
    msg.includes('user cancelled') ||
    msg.includes('e_user_cancelled')
  );
}

type ProcessResult =
  | { status: 'no_session'; transactionId: string; productId: string }
  | { status: 'grant_failed'; transactionId: string; productId: string; message: string; kind?: string }
  | { status: 'duplicate_finished'; transactionId: string; productId: string }
  | { status: 'finished'; transactionId: string; productId: string };

async function processPurchaseLikeListener(purchase: IapPurchase, source: string): Promise<ProcessResult> {
  const productId = String((purchase as any)?.productId ?? '').trim();
  const transactionId = extractPurchaseTransactionId(purchase);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    console.log('[RNIAP] skip purchase update without auth session', {
      transactionId,
      productId,
      source,
      authErrorMessage: String((authError as any)?.message ?? ''),
    });
    emitPurchaseUiIdle(productId);
    return { status: 'no_session', transactionId, productId };
  }

  const gatheringApplicationId = await resolvePendingGatheringApplicationIdForGrant(productId);

  const grantRes = await grantAppleIapAndRecord({
    userId: user.id,
    productId,
    transactionId,
    productRow: null,
    context:
      productId === GATHERING_FEE_PRODUCT_ID
        ? { gatheringApplicationId }
        : undefined,
  });

  if (!grantRes.ok) {
    // duplicate 결과는 지급 스킵 + finishTransaction 가능 (이미 DB 기록 있음)
    if (grantRes.kind === 'duplicate' || isDuplicateLikeError({ message: grantRes.message })) {
      console.log('[RNIAP] duplicate skipped', {
        reason: 'grant duplicate',
        transactionId,
        productId,
        source,
        message: grantRes.message,
      });

      if (shouldClearPendingGatheringAfterGrant(productId, true, 'duplicate')) {
        await clearPendingGatheringApplicationId();
      }

      try {
        await finishTransaction(purchase, productId);
      } catch (finishErr: any) {
        console.error('[RNIAP] finishTransaction failed after duplicate grant', finishErr);
        Alert.alert('결제 처리 실패', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
        // duplicate인데 finish 실패하면 pending이 계속될 수 있으니 결과는 duplicate_finished로는 처리하지 않음
        throw finishErr;
      }

      processedTransactionIds.add(transactionId);
      emitPurchaseUiIdle(productId);
      return { status: 'duplicate_finished', transactionId, productId };
    }

    // 실제 DB 지급 실패만 Alert (pending 유지: finishTransaction 호출 금지)
    const kind = String((grantRes as any)?.kind ?? '');
    const message = String(grantRes.message ?? '결제 처리 중 오류가 발생했습니다.');
    console.error('[RNIAP] grant failed (NOT finishing)', { ...grantRes, source });
    Alert.alert('결제 처리 실패', `source=${source}\nkind=${kind}\n${message}`);
    emitPurchaseUiIdle(productId);
    return { status: 'grant_failed', transactionId, productId, message, kind };
  }

  if (shouldClearPendingGatheringAfterGrant(productId, true, grantRes.kind)) {
    await clearPendingGatheringApplicationId();
  }

  emitIapGrantSuccessRefetch();

  // DB 지급 성공 후에만 finishTransaction
  try {
    await finishTransaction(purchase, productId);
  } catch (finishErr: any) {
    console.error('[RNIAP] finishTransaction failed after grant', finishErr);
    Alert.alert('결제 처리 실패', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
    throw finishErr;
  }

  processedTransactionIds.add(transactionId);

  if (!alertedTransactionIds.has(transactionId)) {
    alertedTransactionIds.add(transactionId);
    showPurchaseCompleteAlert('결제 완료', getIapPurchaseCompleteMessage(productId));
  }

  emitPurchaseUiIdle(productId);
  return { status: 'finished', transactionId, productId };
}

export async function initConnection(): Promise<boolean> {
  if (!CAN_USE_NATIVE_IAP) {
    return false;
  }
  if (billingReady) return true;
  if (connectingPromise) return await connectingPromise;

  connectingPromise = (async () => {
    try {
      const iap = await loadNativeModuleOnce();
      if (!iap) {
        billingReady = false;
        return false;
      }
      const ok = await iap.initConnection();
      billingReady = Boolean(ok);
      if (!billingReady) {
        console.warn('[RNIAP] initConnection native returned false');
      } else {
        void hydratePendingGatheringApplicationIdFromStorage();
      }
      return billingReady;
    } catch (e) {
      billingReady = false;
      console.error('[RNIAP] initConnection error', e);
      return false;
    } finally {
      connectingPromise = null;
    }
  })();

  return await connectingPromise;
}

/** Store 진입 등 선제 초기화 — 실패해도 throw 하지 않음 */
export async function ensureIapReady(): Promise<boolean> {
  if (!CAN_USE_NATIVE_IAP) return false;
  try {
    const ok = await initConnection();
    if (!ok) {
      console.warn('[RNIAP] ensureIapReady: connection not ready');
    }
    return ok;
  } catch (e) {
    billingReady = false;
    console.error('[RNIAP] ensureIapReady error', e);
    return false;
  }
}

export async function endConnection(): Promise<void> {
  if (!CAN_USE_NATIVE_IAP) return;
  try {
    const iap = await loadNativeModuleOnce();
    if (!iap) {
      billingReady = false;
      return;
    }
    await iap.endConnection();
  } catch (e) {
    console.error('[RNIAP] endConnection error', e);
  } finally {
    billingReady = false;
  }
}

export async function fetchProducts(productIds: readonly string[] = getAllAppleProductIds()): Promise<IapProduct[]> {
  if (!CAN_USE_NATIVE_IAP) return [];
  try {
    const ok = await initConnection();
    if (!ok) {
      console.warn('[RNIAP] fetchProducts skipped: billing not ready');
      return [];
    }
    const iap = await loadNativeModuleOnce();
    if (!iap) return [];
    const ids = productIds.map((x) => String(x ?? '').trim()).filter(Boolean);
    const products = (await iap.fetchProducts({ skus: ids, type: 'in-app' } as any)) as IapProduct[] | null | undefined;
    const list = (products ?? []) as IapProduct[];
    return list;
  } catch (e) {
    console.error('[RNIAP] fetchProducts error', e);
    return [];
  }
}

/** fetchProducts 별칭 — requestPurchase 직전 SKU 검증용 */
export const getProducts = fetchProducts;

function getProductLogFields(p: IapProduct): { productId: string; title: string; price: string } {
  const productId = getProductIdFromProduct(p);
  const title = String((p as any)?.title ?? (p as any)?.name ?? '').trim();
  const price = String(
    (p as any)?.displayPrice ?? (p as any)?.localizedPrice ?? (p as any)?.price ?? ''
  ).trim();
  return { productId, title, price };
}

export async function getAvailablePurchases(): Promise<IapPurchase[]> {
  if (!CAN_USE_NATIVE_IAP) return [];
  try {
    const ok = await initConnection();
    if (!ok) {
      Alert.alert('결제 오류', '결제 준비 중입니다. 잠시 후 다시 시도해주세요.');
      return [];
    }
    const iap = await loadNativeModuleOnce();
    if (!iap) return [];
    const list = (await iap.getAvailablePurchases()) as IapPurchase[] | null | undefined;
    return (list ?? []) as IapPurchase[];
  } catch (e) {
    console.error('[RNIAP] getAvailablePurchases error', e);
    Alert.alert('결제 오류', String((e as any)?.message ?? e ?? 'getAvailablePurchases error'));
    return [];
  }
}

export async function debugReprocessPendingPurchases(): Promise<void> {
  if (!CAN_USE_NATIVE_IAP) return;
  try {
    const purchases = await getAvailablePurchases();
    if (purchases.length === 0) {
      console.log('[RNIAP] pending reprocess: no available purchases');
      return;
    }

    const results: { status: ProcessResult['status']; transactionId: string; productId: string }[] = [];
    for (const p of purchases) {
      try {
        const res = await processPurchaseLikeListener(p, 'pending reprocess');
        results.push({ status: res.status, transactionId: res.transactionId, productId: res.productId });
      } catch (e: any) {
        const msg = String(e?.message ?? e ?? '');
        const tid = (() => {
          try {
            return extractPurchaseTransactionId(p);
          } catch {
            return '(missing)';
          }
        })();
        console.error('[RNIAP] pending reprocess item error', { tid, msg });
        results.push({ status: 'grant_failed', transactionId: tid, productId: String((p as any)?.productId ?? '').trim() });
      }
    }

    const summary = results.reduce(
      (acc, r) => {
        acc.total += 1;
        acc[r.status] = (acc as any)[r.status] ? (acc as any)[r.status] + 1 : 1;
        return acc;
      },
      { total: 0 } as any
    );

    console.log('[RNIAP] pending reprocess done', summary);
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? '');
    console.error('[RNIAP] pending reprocess failed', msg);
  }
}

/**
 * TEMP debug-only (TestFlight/Sandbox): clear iOS transaction queue.
 * - Never call DB grant logic here.
 * - Must be manually invoked from a debug button only.
 */
export async function debugClearTransactionQueueIOS(): Promise<void> {
  if (Platform.OS !== 'ios' || !CAN_USE_NATIVE_IAP) return;
  console.log('[IAP] clearTransactionIOS start');
  try {
    const ok = await initConnection();
    if (!ok) throw new Error('initConnection failed');

    const iap = await loadNativeModuleOnce();
    if (!iap) throw new Error('react-native-iap module unavailable');

    // react-native-iap v15 exports getPendingTransactionsIOS (clearTransactionIOS may not exist)
    const pending = ((await iap.getPendingTransactionsIOS()) as IapPurchase[] | null | undefined) ?? [];
    for (const p of pending) {
      console.log(
        '[IAP] finishing pending transaction only',
        JSON.stringify({
          productId: (p as any)?.productId,
          transactionId: (p as any)?.transactionId,
        })
      );
      // finish only; no DB grant/recording; do NOT use custom wrapper
      await iap.finishTransaction({
        purchase: p,
        isConsumable: true,
      } as any);
    }

    // Drop StoreKit/IAP connection after queue cleanup, then reconnect for a fresh session.
    await endConnection();
    billingReady = false;

    const okAfter = await initConnection();
    if (!okAfter) {
      billingReady = false;
      throw new Error('initConnection failed after queue clear (reconnect)');
    }

    console.log('[IAP] clearTransactionIOS success');
  } catch (e: any) {
    console.error('[IAP] clearTransactionIOS failed', e);
    billingReady = false;
  }
}

export function getProductIdFromProduct(p: IapProduct | null | undefined): string {
  if (!p) return '';
  return String((p as any)?.id ?? (p as any)?.productId ?? '').trim();
}

async function invalidateBillingConnection(reason: string): Promise<void> {
  console.warn('[RNIAP] invalidateBillingConnection', { reason });
  try {
    await endConnection();
  } catch (e) {
    console.error('[RNIAP] invalidateBillingConnection endConnection error', e);
    billingReady = false;
  }
}

export async function requestPurchase(productId: string): Promise<void> {
  if (!CAN_USE_NATIVE_IAP) {
    throw new Error(IAP_PURCHASE_USER_MESSAGE);
  }
  const sku = String(productId ?? '').trim();
  if (!sku) throw new Error('missing productId');

  const ok = await initConnection();
  if (!ok) {
    throw new Error('결제 준비 중입니다. 잠시 후 다시 시도해주세요.');
  }

  const iap = await loadNativeModuleOnce();
  if (!iap) {
    throw new Error(IAP_PURCHASE_USER_MESSAGE);
  }

  const storeProducts = await getProducts([sku]);
  const storeProductIds = storeProducts.map((p) => getProductIdFromProduct(p)).filter(Boolean);
  console.warn('[RNIAP] requestPurchase preflight', {
    sku,
    storeProductIds,
  });

  const matched = storeProducts.find((p) => getProductIdFromProduct(p) === sku);
  if (!matched) {
    console.warn('[RNIAP] requestPurchase: sku not returned by getProducts (continuing)', {
      sku,
      storeProductIdsCount: storeProductIds.length,
    });
  } else {
    const { productId: validatedId, title, price } = getProductLogFields(matched);
    console.log('[RNIAP] requestPurchase product validated', { productId: validatedId, title, price });
  }

  lastRequestPurchaseSku = sku;
  iapPurchaseFlowActive = true;
  notifyIapPurchaseFlowChange();

  // Finish manually only after DB grant succeeds (both stores).
  const payload = {
    type: 'in-app',
    request: {
      apple: {
        sku,
        andDangerouslyFinishTransactionAutomatically: false,
      },
      google: {
        skus: [sku],
      },
    },
  };
  try {
    await iap.requestPurchase(payload as any);
  } catch (e: any) {
    iapPurchaseFlowActive = false;
    lastRequestPurchaseSku = null;
    notifyIapPurchaseFlowChange();
    console.error('[IAP] requestPurchase throw', e);
    await invalidateBillingConnection('requestPurchase failed');
    throw e;
  }
}

export function startListeners(): void {
  if (!CAN_USE_NATIVE_IAP) return;
  if (listenersStarted) return;
  listenersStarted = true;

  void (async () => {
    const iap = await loadNativeModuleOnce();
    if (!iap) {
      console.warn('[RNIAP] startListeners: native module unavailable');
      listenersStarted = false;
      return;
    }
    try {
      void hydratePendingGatheringApplicationIdFromStorage();
      purchaseUpdatedSub = iap.purchaseUpdatedListener(async (purchase: unknown) => {
        let transactionId = '';
        let productId = '';
        let skipPurchaseUiIdle = false;
        try {
          productId = String((purchase as any)?.productId ?? '').trim();
          transactionId = extractPurchaseTransactionId(purchase as IapPurchase);

          // 1) 같은 세션에서 이미 처리한 transactionId면 silent skip
          if (processedTransactionIds.has(transactionId)) {
            console.log('[RNIAP] duplicate skipped', {
              reason: 'already processed in session',
              transactionId,
              productId,
            });
            try {
              await finishTransaction(purchase as IapPurchase, productId);
            } catch (finishErr: any) {
              console.log('[RNIAP] duplicate skipped finishTransaction error', finishErr);
              Alert.alert('결제 처리 실패', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
            }
            return;
          }

          // 2) 같은 transactionId에 대해 동시 처리 중이면 silent skip
          if (inflightTransactionIds.has(transactionId)) {
            console.log('[RNIAP] duplicate skipped', {
              reason: 'inflight',
              transactionId,
              productId,
            });
            skipPurchaseUiIdle = true;
            return;
          }
          inflightTransactionIds.add(transactionId);

          await processPurchaseLikeListener(purchase as IapPurchase, 'listener');
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? '');
          if (isAuthSessionMissingError({ code: e?.code, message: msg })) {
            console.log('[RNIAP] skip purchase update without auth session', {
              transactionId,
              productId,
              msg,
            });
            return;
          }
          if (isDuplicateLikeError({ message: msg })) {
            console.log('[RNIAP] duplicate skipped', {
              reason: 'thrown',
              transactionId,
              productId,
              msg,
            });
            return;
          }
          console.error('[RNIAP] purchaseUpdatedListener handler error (NOT finishing)', e);
          Alert.alert('결제 처리 실패', msg || '결제 처리 중 오류가 발생했습니다.');
        } finally {
          if (transactionId) inflightTransactionIds.delete(transactionId);
          if (!skipPurchaseUiIdle && productId) {
            emitPurchaseUiIdle(productId);
          }
        }
      });

      purchaseErrorSub = iap.purchaseErrorListener((error: unknown) => {
        const code = String((error as any)?.code ?? '').trim();
        const message = String((error as any)?.message ?? '');

        console.error('[IAP] purchaseErrorListener', error);

        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('billing is not prepared')) {
          emitPurchaseUiIdleFromError(error);
          Alert.alert('결제 오류', '결제 준비 중입니다. 잠시 후 다시 시도해주세요.');
          return;
        }

        // native(iOS)에서 중복 purchaseUpdated 이벤트를 감지했을 때 보내는 duplicate-purchase 에러는
        // 결제 실패가 아니라 dedup 알림이므로 사용자 Alert 없이 조용히 skip
        if (isDuplicateLikeError({ code, message })) {
          console.log('[RNIAP] duplicate skipped', {
            reason: 'purchaseErrorListener',
            code,
            message,
          });
          emitPurchaseUiIdleFromError(error);
          return;
        }

        if (isAuthSessionMissingError({ code, message })) {
          console.log('[RNIAP] skip purchase error without auth session', { code, message });
          emitPurchaseUiIdleFromError(error);
          return;
        }

        if (isUserCancelLikeError({ code, message })) {
          emitPurchaseUiIdleFromError(error);
          return;
        }

        emitPurchaseUiIdleFromError(error);
        Alert.alert('결제 오류', IAP_PURCHASE_USER_MESSAGE);
      });
    } catch (e) {
      console.error('[RNIAP] startListeners registration failed', e);
      listenersStarted = false;
    }
  })();
}

export function stopListeners(): void {
  if (!CAN_USE_NATIVE_IAP) return;
  try {
    purchaseUpdatedSub?.remove();
  } catch {}
  try {
    purchaseErrorSub?.remove();
  } catch {}
  purchaseUpdatedSub = null;
  purchaseErrorSub = null;
  listenersStarted = false;
}

export async function finishTransaction(purchase: IapPurchase, productId?: string): Promise<void> {
  if (!CAN_USE_NATIVE_IAP) return;
  const iap = await loadNativeModuleOnce();
  if (!iap) return;
  const pid = String(productId ?? (purchase as any)?.productId ?? '').trim();
  const isConsumable = getIsConsumable(pid);
  try {
    await iap.finishTransaction({ purchase, isConsumable } as any);
  } catch (e: any) {
    console.error('[RNIAP] rnFinishTransaction failed', { pid, e });
    throw e;
  }
}

/** Stable id for payments.transaction_id dedup (StoreKit transactionId or Play purchaseToken). */
export function extractPurchaseTransactionId(purchase: IapPurchase): string {
  const transactionId = String((purchase as any)?.transactionId ?? '').trim();
  if (transactionId) return transactionId;

  const purchaseToken = String(
    (purchase as any)?.purchaseToken ?? (purchase as any)?.purchaseTokenAndroid ?? ''
  ).trim();
  if (purchaseToken) return purchaseToken;

  const originalIos = String((purchase as any)?.originalTransactionIdentifierIOS ?? '').trim();
  if (originalIos) return originalIos;

  const receipt = String((purchase as any)?.transactionReceipt ?? '').trim();
  if (receipt) return `rcpt_${hashShort(receipt)}`;

  const id = String((purchase as any)?.id ?? '').trim();
  if (id) return id;

  throw new Error('transactionId not found on purchase');
}

/** @deprecated Use extractPurchaseTransactionId */
export const extractIosTransactionId = extractPurchaseTransactionId;

function getIsConsumable(productId: string): boolean {
  const pid = String(productId ?? '').trim();
  if (pid === 'com.hywoo.fitting.trainer_30') return false;
  if (pid.startsWith('com.hywoo.fitting.ticket_')) return true;
  return true;
}

function hashShort(input: string): string {
  // djb2 variant, stable across JS runtimes.
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  // unsigned 32-bit hex, shortened
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 10);
}

function getAllAppleProductIds(): readonly string[] {
  return [...APPLE_PRODUCT_IDS.matchingTickets, ...APPLE_PRODUCT_IDS.ptTickets];
}
