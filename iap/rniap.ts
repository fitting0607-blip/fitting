import { Platform } from 'react-native';
import {
  endConnection as rnEndConnection,
  finishTransaction as rnFinishTransaction,
  getProducts as rnGetProducts,
  initConnection as rnInitConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase as rnRequestPurchase,
  type Product,
  type ProductPurchase,
  type PurchaseError,
} from 'react-native-iap';

import { supabase } from '@/supabase';
import { grantAppleIapAndRecord } from '@/iap/grant';
import { APPLE_PRODUCT_IDS } from '@/iap/productIds';

let listenersStarted = false;
let purchaseUpdatedSub: { remove: () => void } | null = null;
let purchaseErrorSub: { remove: () => void } | null = null;

export async function initConnection(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    console.log('[RNIAP] initConnection skipped (not ios)');
    return false;
  }
  try {
    console.log('[RNIAP] initConnection start');
    const ok = await rnInitConnection();
    console.log('[RNIAP] initConnection ok', ok);
    return Boolean(ok);
  } catch (e) {
    console.log('[RNIAP] initConnection error', e);
    return false;
  }
}

export async function endConnection(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    console.log('[RNIAP] endConnection start');
    await rnEndConnection();
    console.log('[RNIAP] endConnection done');
  } catch (e) {
    console.log('[RNIAP] endConnection error', e);
  }
}

export async function getProducts(productIds: readonly string[] = getAllAppleProductIds()): Promise<Product[]> {
  if (Platform.OS !== 'ios') return [];
  try {
    const ids = productIds.map((x) => String(x ?? '').trim()).filter(Boolean);
    console.log('[RNIAP] getProducts start', ids);
    const products = await rnGetProducts({ skus: ids } as any);
    console.log('[RNIAP] getProducts done', products?.length ?? 0);
    return (products ?? []) as any;
  } catch (e) {
    console.log('[RNIAP] getProducts error', e);
    return [];
  }
}

export async function requestPurchase(productId: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    console.log('[RNIAP] requestPurchase skipped (not ios)');
    return;
  }
  const sku = String(productId ?? '').trim();
  if (!sku) throw new Error('missing productId');
  if (sku === 'com.hywoo.fitting.ticket_unlimited') {
    console.log('[RNIAP] requestPurchase blocked (premium)', sku);
    throw new Error('프리미엄 상품은 준비 중입니다.');
  }
  console.log('[RNIAP] requestPurchase start', sku);

  // Ensure we always finish manually only after DB grant succeeds.
  await rnRequestPurchase({
    sku,
    andDangerouslyFinishTransactionAutomaticallyIOS: false,
  } as any);
}

export function startListeners(): void {
  if (Platform.OS !== 'ios') return;
  if (listenersStarted) return;
  listenersStarted = true;

  console.log('[RNIAP] startListeners');

  purchaseUpdatedSub = purchaseUpdatedListener(async (purchase: ProductPurchase) => {
    console.log('[RNIAP] purchaseUpdatedListener event', {
      productId: (purchase as any)?.productId,
      transactionId: (purchase as any)?.transactionId,
      originalTransactionIdentifierIOS: (purchase as any)?.originalTransactionIdentifierIOS,
      hasReceipt: Boolean((purchase as any)?.transactionReceipt),
    });

    try {
      const productId = String((purchase as any)?.productId ?? '').trim();
      const receipt = String((purchase as any)?.transactionReceipt ?? '').trim() || null;
      const transactionId = extractIosTransactionId(purchase);

      console.log('[RNIAP] extracted', { productId, transactionId, hasReceipt: Boolean(receipt) });

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user?.id) throw new Error('로그인이 필요합니다.');

      const grantRes = await grantAppleIapAndRecord({
        userId: user.id,
        productId,
        transactionId,
        productRow: null,
      });

      console.log('[RNIAP] grant result', grantRes);

      if (!grantRes.ok) {
        // 실패 시 finishTransaction 금지 (pending 유지)
        throw new Error(grantRes.message);
      }

      console.log('[RNIAP] finishTransaction start', { transactionId });
      await finishTransaction(purchase, productId);
      console.log('[RNIAP] finishTransaction done', { transactionId });
    } catch (e) {
      console.log('[RNIAP] purchaseUpdatedListener handler error (NOT finishing)', e);
    }
  });

  purchaseErrorSub = purchaseErrorListener((error: PurchaseError) => {
    console.log('[RNIAP] purchaseErrorListener', error);
  });
}

export function stopListeners(): void {
  if (Platform.OS !== 'ios') return;
  console.log('[RNIAP] stopListeners');
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

export async function finishTransaction(purchase: ProductPurchase, productId?: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  const pid = String(productId ?? (purchase as any)?.productId ?? '').trim();
  const isConsumable = getIsConsumable(pid);
  console.log('[RNIAP] finishTransaction wrapper', { productId: pid, isConsumable });
  await rnFinishTransaction({ purchase, isConsumable } as any);
}

export function extractIosTransactionId(purchase: ProductPurchase): string {
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

