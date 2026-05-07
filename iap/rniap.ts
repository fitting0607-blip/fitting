import { Alert, Platform } from 'react-native';
import {
  endConnection as rnEndConnection,
  fetchProducts as rnFetchProducts,
  finishTransaction as rnFinishTransaction,
  getAvailablePurchases as rnGetAvailablePurchases,
  initConnection as rnInitConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase as rnRequestPurchase,
  type MutationRequestPurchaseArgs,
  type Product,
  type Purchase,
  type PurchaseError,
} from 'react-native-iap';

import { supabase } from '@/supabase';
import { grantAppleIapAndRecord } from '@/iap/grant';
import { APPLE_PRODUCT_IDS } from '@/iap/productIds';

let listenersStarted = false;
let purchaseUpdatedSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;
const alertedTransactionIds = new Set<string>();
const debugAlertedTransactionIds = new Set<string>();

let billingReady = false;
let connectingPromise: Promise<boolean> | null = null;

// 같은 세션에서 이미 처리한 transactionId를 추적해 중복 purchaseUpdated/replay 이벤트를 silent skip 한다.
const processedTransactionIds = new Set<string>();
const inflightTransactionIds = new Set<string>();

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

function debugIapAlert(transactionId: string, step: string, detail?: string): void {
  // 임시 진단용: 같은 transactionId에 대해 과도한 Alert 반복 방지
  const key = `${transactionId}:${step}`;
  if (debugAlertedTransactionIds.has(key)) return;
  debugAlertedTransactionIds.add(key);
  try {
    Alert.alert('IAP DEBUG', detail ? `${step}\n${detail}` : step);
  } catch {
    // ignore
  }
}

type ProcessResult =
  | { status: 'no_session'; transactionId: string; productId: string }
  | { status: 'grant_failed'; transactionId: string; productId: string; message: string; kind?: string }
  | { status: 'duplicate_finished'; transactionId: string; productId: string }
  | { status: 'finished'; transactionId: string; productId: string };

async function processPurchaseLikeListener(purchase: Purchase, source: string): Promise<ProcessResult> {
  const productId = String((purchase as any)?.productId ?? '').trim();
  const transactionId = extractIosTransactionId(purchase);

  debugIapAlert(transactionId, 'listener received', `source=${source}\nproductId=${productId || '(missing)'}`);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    debugIapAlert(
      transactionId,
      'userId missing',
      `source=${source}\nproductId=${productId || '(missing)'}\nauthError=${String((authError as any)?.message ?? '')}`
    );
    console.log('[RNIAP] skip purchase update without auth session', {
      transactionId,
      productId,
      source,
      authErrorMessage: String((authError as any)?.message ?? ''),
    });
    return { status: 'no_session', transactionId, productId };
  }

  debugIapAlert(transactionId, 'userId ok', `source=${source}\nuserId=${user.id}`);
  debugIapAlert(transactionId, 'grant start', `source=${source}`);

  const grantRes = await grantAppleIapAndRecord({
    userId: user.id,
    productId,
    transactionId,
    productRow: null,
  });

  debugIapAlert(
    transactionId,
    'grant result',
    `source=${source}\nok=${String((grantRes as any)?.ok)} kind=${String((grantRes as any)?.kind ?? '')}`
  );

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

      debugIapAlert(transactionId, 'finish start', `source=${source}\nreason=duplicate`);
      try {
        await finishTransaction(purchase, productId);
        debugIapAlert(transactionId, 'finish done', `source=${source}\nreason=duplicate`);
      } catch (finishErr: any) {
        console.error('[RNIAP] finishTransaction failed after duplicate grant', finishErr);
        debugIapAlert(
          transactionId,
          'finish error',
          `source=${source}\nreason=duplicate\n${String(finishErr?.message ?? finishErr ?? 'finishTransaction error')}`
        );
        Alert.alert('결제 처리 실패', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
        // duplicate인데 finish 실패하면 pending이 계속될 수 있으니 결과는 duplicate_finished로는 처리하지 않음
        throw finishErr;
      }

      processedTransactionIds.add(transactionId);
      return { status: 'duplicate_finished', transactionId, productId };
    }

    // 실제 DB 지급 실패만 Alert (pending 유지: finishTransaction 호출 금지)
    const kind = String((grantRes as any)?.kind ?? '');
    const message = String(grantRes.message ?? '결제 처리 중 오류가 발생했습니다.');
    console.error('[RNIAP] grant failed (NOT finishing)', { ...grantRes, source });
    Alert.alert('결제 처리 실패', `source=${source}\nkind=${kind}\n${message}`);
    return { status: 'grant_failed', transactionId, productId, message, kind };
  }

  // DB 지급 성공 후에만 finishTransaction
  debugIapAlert(transactionId, 'finish start', `source=${source}`);
  try {
    await finishTransaction(purchase, productId);
    debugIapAlert(transactionId, 'finish done', `source=${source}`);
  } catch (finishErr: any) {
    console.error('[RNIAP] finishTransaction failed after grant', finishErr);
    debugIapAlert(transactionId, 'finish error', `source=${source}\n${String(finishErr?.message ?? finishErr ?? 'finishTransaction error')}`);
    Alert.alert('결제 처리 실패', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
    throw finishErr;
  }

  processedTransactionIds.add(transactionId);

  if (!alertedTransactionIds.has(transactionId)) {
    alertedTransactionIds.add(transactionId);
    const doneMsg = productId === 'com.hywoo.fitting.trainer_30' ? '피티권 지급 완료' : '매칭권 지급 완료';
    Alert.alert('결제 완료', doneMsg);
  }

  return { status: 'finished', transactionId, productId };
}

export async function initConnection(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  if (billingReady) return true;
  if (connectingPromise) return await connectingPromise;

  connectingPromise = (async () => {
    try {
      const ok = await rnInitConnection();
      billingReady = Boolean(ok);
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

export async function endConnection(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await rnEndConnection();
  } catch (e) {
    console.error('[RNIAP] endConnection error', e);
  } finally {
    billingReady = false;
  }
}

export async function fetchProducts(productIds: readonly string[] = getAllAppleProductIds()): Promise<Product[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const ids = productIds.map((x) => String(x ?? '').trim()).filter(Boolean);
    const products = (await rnFetchProducts({ skus: ids, type: 'in-app' } as any)) as Product[] | null | undefined;
    const list = (products ?? []) as Product[];
    return list;
  } catch (e) {
    console.error('[RNIAP] fetchProducts error', e);
    return [];
  }
}

export async function getAvailablePurchases(): Promise<Purchase[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const ok = await initConnection();
    if (!ok) {
      Alert.alert('결제 오류', '결제 준비 중입니다. 잠시 후 다시 시도해주세요.');
      return [];
    }
    const list = (await rnGetAvailablePurchases()) as Purchase[] | null | undefined;
    return (list ?? []) as Purchase[];
  } catch (e) {
    console.error('[RNIAP] getAvailablePurchases error', e);
    Alert.alert('결제 오류', String((e as any)?.message ?? e ?? 'getAvailablePurchases error'));
    return [];
  }
}

export async function debugReprocessPendingPurchases(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  debugIapAlert('pending', 'reprocess start');
  try {
    const purchases = await getAvailablePurchases();
    debugIapAlert('pending', 'available purchases', `count=${purchases.length}`);
    if (purchases.length === 0) {
      Alert.alert('Pending Reprocess', '처리할 pending purchase가 없습니다.');
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
            return extractIosTransactionId(p);
          } catch {
            return '(missing)';
          }
        })();
        debugIapAlert(tid, 'listener error', msg || '(no message)');
        Alert.alert('Pending Reprocess', `error\ntransactionId=${tid}\n${msg}`);
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

    Alert.alert(
      'Pending Reprocess 완료',
      `total=${summary.total}\nfinished=${summary.finished ?? 0}\nduplicate_finished=${summary.duplicate_finished ?? 0}\nno_session=${
        summary.no_session ?? 0
      }\ngrant_failed=${summary.grant_failed ?? 0}`
    );
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? '');
    Alert.alert('Pending Reprocess', msg || 'pending reprocess error');
  }
}

export function getProductIdFromProduct(p: Product | null | undefined): string {
  if (!p) return '';
  return String((p as any)?.id ?? (p as any)?.productId ?? '').trim();
}

export async function requestPurchase(productId: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }
  const sku = String(productId ?? '').trim();
  if (!sku) throw new Error('missing productId');
  if (sku === 'com.hywoo.fitting.ticket_unlimited') {
    throw new Error('프리미엄 상품은 준비 중입니다.');
  }

  const ok = await initConnection();
  if (!ok) {
    throw new Error('결제 준비 중입니다. 잠시 후 다시 시도해주세요.');
  }

  // Ensure we always finish manually only after DB grant succeeds.
  // react-native-iap v8+ (current: v15) expects an object payload.
  const payload: MutationRequestPurchaseArgs = {
    type: 'in-app',
    request: {
      apple: {
        sku,
        andDangerouslyFinishTransactionAutomatically: false,
      },
    },
  };
  await rnRequestPurchase(payload);
}

export function startListeners(): void {
  if (Platform.OS !== 'ios') return;
  if (listenersStarted) return;
  listenersStarted = true;

  purchaseUpdatedSub = purchaseUpdatedListener(async (purchase: Purchase) => {
    let transactionId = '';
    let productId = '';
    try {
      productId = String((purchase as any)?.productId ?? '').trim();
      transactionId = extractIosTransactionId(purchase);

      // 1) 같은 세션에서 이미 처리한 transactionId면 silent skip
      if (processedTransactionIds.has(transactionId)) {
        console.log('[RNIAP] duplicate skipped', {
          reason: 'already processed in session',
          transactionId,
          productId,
        });
        debugIapAlert(transactionId, 'finish start', 'reason=already processed in session');
        try {
          await finishTransaction(purchase, productId);
          debugIapAlert(transactionId, 'finish done', 'reason=already processed in session');
        } catch (finishErr: any) {
          console.log('[RNIAP] duplicate skipped finishTransaction error', finishErr);
          debugIapAlert(transactionId, 'finish error', String(finishErr?.message ?? finishErr ?? 'finishTransaction error'));
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
        return;
      }
      inflightTransactionIds.add(transactionId);

      await processPurchaseLikeListener(purchase, 'listener');
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
      debugIapAlert(transactionId || '(missing)', 'listener error', msg || '(no message)');
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
    }
  });

  purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
    const code = String((error as any)?.code ?? '').trim();
    const message = String((error as any)?.message ?? '');
    if (code === 'user-cancelled' || code === 'E_USER_CANCELLED') return;

    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes('billing is not prepared')) {
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
      return;
    }

    if (isAuthSessionMissingError({ code, message })) {
      console.log('[RNIAP] skip purchase error without auth session', { code, message });
      return;
    }

    console.error('[RNIAP] purchaseErrorListener', error);
    Alert.alert('결제 오류', message || '결제 중 오류가 발생했습니다.');
  });
}

export function stopListeners(): void {
  if (Platform.OS !== 'ios') return;
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

export async function finishTransaction(purchase: Purchase, productId?: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const pid = String(productId ?? (purchase as any)?.productId ?? '').trim();
  const isConsumable = getIsConsumable(pid);
  await rnFinishTransaction({ purchase, isConsumable } as any);
}

export function extractIosTransactionId(purchase: Purchase): string {
  const t1 = String((purchase as any)?.transactionId ?? '').trim();
  if (t1) return t1;

  const t2 = String((purchase as any)?.originalTransactionIdentifierIOS ?? '').trim();
  if (t2) return t2;

  const receipt = String((purchase as any)?.transactionReceipt ?? '').trim();
  if (receipt) return `rcpt_${hashShort(receipt)}`;

  throw new Error('transactionId not found on iOS purchase');
}

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
  return [
    ...APPLE_PRODUCT_IDS.matchingTickets,
    ...APPLE_PRODUCT_IDS.ptTickets,
    ...APPLE_PRODUCT_IDS.premium,
  ];
}

