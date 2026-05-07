import { Alert, Platform } from 'react-native';
import {
  endConnection as rnEndConnection,
  fetchProducts as rnFetchProducts,
  finishTransaction as rnFinishTransaction,
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

export async function initConnection(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  try {
    const ok = await rnInitConnection();
    return Boolean(ok);
  } catch (e) {
    console.error('[RNIAP] initConnection error', e);
    return false;
  }
}

export async function endConnection(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await rnEndConnection();
  } catch (e) {
    console.error('[RNIAP] endConnection error', e);
  }
}

export async function fetchProducts(productIds: readonly string[] = getAllAppleProductIds()): Promise<Product[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const ids = productIds.map((x) => String(x ?? '').trim()).filter(Boolean);
    const products = (await rnFetchProducts({ skus: ids, type: 'in-app' } as any)) as Product[] | null | undefined;
    const list = (products ?? []) as Product[];
    console.log(
      '[RNIAP] fetched products',
      list.map((p: any) => ({
        id: String(p?.id ?? p?.productId ?? '').trim(),
        title: p?.title,
        displayPrice: p?.displayPrice,
        price: p?.price,
        type: p?.type,
      }))
    );
    return list;
  } catch (e) {
    console.error('[RNIAP] fetchProducts error', e);
    return [];
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

  console.log('[RNIAP] requestPurchase sku', sku);

  // App Store에서 해당 SKU가 실제로 조회 가능한지 확인 (3개/5개 결제창 미출현 진단)
  // - 조회 결과 자체가 비어 있거나 해당 SKU가 누락된 경우 결제창은 절대 뜨지 않음.
  //   App Store Connect 측 상품 상태(Approved/Ready to Submit)와 가격대 적용 여부,
  //   bundle id mismatch, sandbox account region 등 환경 문제일 가능성이 높음.
  try {
    const fetched = await fetchProducts([sku]);
    const found = fetched.some((p) => getProductIdFromProduct(p) === sku);
    if (!found) {
      console.warn('[RNIAP] sku not found in fetchProducts result', {
        sku,
        fetched: fetched.map((p) => getProductIdFromProduct(p)),
      });
      Alert.alert('상품 조회 실패', sku);
      throw new Error(`product not available on App Store: ${sku}`);
    }
  } catch (verifyErr: any) {
    const msg = String(verifyErr?.message ?? '');
    if (msg.startsWith('product not available on App Store')) {
      throw verifyErr;
    }
    // fetchProducts 자체가 실패한 경우는 결제창은 띄워보고 native 단의 에러로 fallback
    console.warn('[RNIAP] fetchProducts verify failed (falling through to requestPurchase)', verifyErr);
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
        try {
          await finishTransaction(purchase, productId);
        } catch (finishErr) {
          console.log('[RNIAP] duplicate skipped finishTransaction error', finishErr);
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

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) {
        // 앱 시작 시(로그인 화면 등) replay/restore 이벤트가 와도 Alert 없이 조용히 무시
        console.log('[RNIAP] duplicate skipped', {
          reason: 'no session at replay',
          transactionId,
          productId,
        });
        return;
      }

      const grantRes = await grantAppleIapAndRecord({
        userId: user.id,
        productId,
        transactionId,
        productRow: null,
      });

      if (!grantRes.ok) {
        // duplicate 결과는 사용자 Alert 없이 finish 후 종료 (Apple replay 종결)
        if (grantRes.kind === 'duplicate' || isDuplicateLikeError({ message: grantRes.message })) {
          console.log('[RNIAP] duplicate skipped', {
            reason: 'grant duplicate',
            transactionId,
            productId,
            message: grantRes.message,
          });
          try {
            await finishTransaction(purchase, productId);
          } catch (finishErr) {
            console.log('[RNIAP] duplicate skipped finishTransaction error', finishErr);
          }
          processedTransactionIds.add(transactionId);
          return;
        }
        // 실제 DB 지급 실패만 Alert (pending 유지: finishTransaction 호출 금지)
        console.error('[RNIAP] grant failed (NOT finishing)', grantRes);
        Alert.alert('결제 처리 실패', String(grantRes.message ?? '결제 처리 중 오류가 발생했습니다.'));
        return;
      }

      await finishTransaction(purchase, productId);
      processedTransactionIds.add(transactionId);

      if (!alertedTransactionIds.has(transactionId)) {
        alertedTransactionIds.add(transactionId);
        Alert.alert('결제 완료', '매칭권 지급 완료');
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
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

