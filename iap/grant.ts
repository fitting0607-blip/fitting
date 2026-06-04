import { supabase } from '@/supabase';
import { isKnownAppleProductId, TICKET_QTY_BY_PRODUCT_ID } from '@/iap/productIds';

export type StoreItemRow = {
  id: string;
  category: 'ticket' | 'matching_ticket' | 'pt_ticket' | 'gathering';
  apple_product_id: string;
  title: string;
  ticket_count: number;
  price: number;
  bonus_points: number;
};

export type GrantPurchaseInput = {
  userId: string;
  productId: string;
  transactionId: string | null;
  // Optional contextual info for better fallbacks.
  productRow?: StoreItemRow | null;
  context?: { gatheringApplicationId?: string | null };
};

export type GrantPurchaseResult =
  | { ok: true; kind: 'matching_ticket' | 'pt_ticket' | 'gathering_fee'; grantedTickets?: number; grantedPoints?: number }
  | { ok: false; kind: 'duplicate' | 'unknown_product' | 'not_eligible' | 'db_error'; message: string };

function isUniqueViolationError(error: unknown): boolean {
  const code = String((error as any)?.code ?? '').trim();
  if (code === '23505') return true;
  const msg = String((error as any)?.message ?? error ?? '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique constraint') || msg.includes('unique_violation');
}

async function insertPayment(payload: {
  user_id: string;
  product_id: string | null;
  product_title: string | null;
  amount: number | null;
  status: 'succeeded' | 'failed' | 'cancelled';
  transaction_id: string | null;
}): Promise<{ ok: true } | { ok: false; duplicate: boolean; message: string }> {
  const { error } = await supabase.from('payments').insert(payload);
  if (error) {
    const message = String((error as any)?.message ?? error);
    return { ok: false, duplicate: isUniqueViolationError(error), message };
  }
  return { ok: true };
}

export async function hasDuplicateTransactionId(transactionId: string): Promise<boolean> {
  const trimmed = String(transactionId ?? '').trim();
  if (!trimmed) return false;
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    // @ts-ignore: 실제 DB 컬럼 존재 전제 (transaction_id)
    .eq('transaction_id', trimmed)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function fetchActiveProductByAppleProductId(productId: string): Promise<StoreItemRow | null> {
  const trimmed = String(productId ?? '').trim();
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
    category: String((data as any).category) as StoreItemRow['category'],
    apple_product_id: String((data as any).apple_product_id ?? trimmed).trim(),
    title: String((data as any).title ?? '상품'),
    ticket_count: typeof (data as any).ticket_count === 'number' ? (data as any).ticket_count : 0,
    price: typeof (data as any).price === 'number' ? (data as any).price : 0,
    bonus_points: typeof (data as any).bonus_points === 'number' ? (data as any).bonus_points : 0,
  };
}

export async function grantAppleIapAndRecord(input: GrantPurchaseInput): Promise<GrantPurchaseResult> {
  const userId = String(input.userId ?? '').trim();
  const productId = String(input.productId ?? '').trim();
  const transactionId = String(input.transactionId ?? '').trim();

  if (!userId) return { ok: false, kind: 'db_error', message: 'missing userId' };
  if (!productId) return { ok: false, kind: 'unknown_product', message: 'missing productId' };
  if (!transactionId) return { ok: false, kind: 'db_error', message: 'missing transactionId' };
  if (!isKnownAppleProductId(productId)) {
    return { ok: false, kind: 'unknown_product', message: `unknown productId: ${productId}` };
  }

  try {
    const isDup = await hasDuplicateTransactionId(transactionId);
    if (isDup) return { ok: false, kind: 'duplicate', message: `duplicate transactionId: ${transactionId}` };

    const productRow =
      input.productRow ??
      (await fetchActiveProductByAppleProductId(productId));

    if (!productRow) {
      return { ok: false, kind: 'db_error', message: `product not found in DB: ${productId}` };
    }

    const isGathering =
      productId === 'com.hywoo.fitting.gathering_fee' || productRow.category === 'gathering';

    let gatheringGrant: { applicationId: string; gatheringAddress: string | null } | null = null;

    // 소모임: payments INSERT 전에 신청 상태 검증 (중복 지급·이중 결제 기록 방지)
    if (isGathering) {
      const applicationId = String(input.context?.gatheringApplicationId ?? '').trim();
      if (!applicationId) {
        return { ok: false, kind: 'db_error', message: 'missing gatheringApplicationId' };
      }

      const { data: appRow, error: appErr } = await supabase
        .from('gathering_applications')
        .select('id,status,gathering_id')
        .eq('id', applicationId)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();
      if (appErr) throw appErr;
      if (!appRow) return { ok: false, kind: 'not_eligible', message: 'application not found' };

      const curStatus = String((appRow as any)?.status ?? '').trim();
      if (curStatus === 'paid') {
        return { ok: false, kind: 'duplicate', message: 'application already paid' };
      }
      if (curStatus !== 'approved') {
        return { ok: false, kind: 'not_eligible', message: `invalid application status: ${curStatus || '(empty)'}` };
      }

      const gatheringId = String((appRow as any)?.gathering_id ?? '').trim();
      if (!gatheringId) {
        return { ok: false, kind: 'not_eligible', message: 'missing gathering_id on application' };
      }

      const { data: gatheringRow, error: gatheringErr } = await supabase
        .from('gatherings')
        .select('address')
        .eq('id', gatheringId)
        .limit(1)
        .maybeSingle();
      if (gatheringErr) throw gatheringErr;

      const gatheringAddress = String((gatheringRow as any)?.address ?? '').trim() || null;
      gatheringGrant = { applicationId, gatheringAddress };
    }

    // 1) payments INSERT (transactionId 중복 체크 이후)
    {
      const res = await insertPayment({
        user_id: userId,
        product_id: productRow.id ?? null,
        product_title: productRow.title ?? productId,
        amount: typeof productRow.price === 'number' ? productRow.price : null,
        status: 'succeeded',
        transaction_id: transactionId,
      });
      if (!res.ok) {
        if (res.duplicate) {
          return { ok: false, kind: 'duplicate', message: `duplicate transactionId: ${transactionId}` };
        }
        return { ok: false, kind: 'db_error', message: `payments insert failed: ${res.message}` };
      }
    }

    // 2) 지급 로직
    if (isGathering && gatheringGrant) {
      const { applicationId, gatheringAddress } = gatheringGrant;

      const { data: updatedApp, error: upErr } = await supabase
        .from('gathering_applications')
        .update({ status: 'paid', gathering_address: gatheringAddress })
        .eq('id', applicationId)
        .eq('user_id', userId)
        .eq('status', 'approved')
        .select('id')
        .maybeSingle();
      if (upErr) throw upErr;
      if (!updatedApp) {
        return { ok: false, kind: 'duplicate', message: 'application already paid' };
      }

      return { ok: true, kind: 'gathering_fee' };
    }

    if (productId === 'com.hywoo.fitting.trainer_30' || productRow.category === 'pt_ticket') {
      // trainer_profiles 최신 1건 is_approved=true
      const { data: latestProfile, error: profErr } = await supabase
        .from('trainer_profiles')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (profErr) throw profErr;
      const profileId = (latestProfile as any)?.id;
      if (!profileId) return { ok: false, kind: 'not_eligible', message: 'trainer profile not found' };

      const { error: upErr } = await supabase
        .from('trainer_profiles')
        .update({ is_approved: true })
        .eq('id', profileId);
      if (upErr) throw upErr;

      return { ok: true, kind: 'pt_ticket' };
    }

    // matching tickets
    const addTicketsFromMap = TICKET_QTY_BY_PRODUCT_ID[productId];
    const addTickets = Math.max(
      0,
      typeof addTicketsFromMap === 'number' ? addTicketsFromMap : (productRow.ticket_count ?? 0),
    );
    const addPoints = Math.max(0, productRow.bonus_points ?? 0);

    if (addPoints > 0) {
      const { error: logErr } = await supabase.from('point_logs').insert({
        user_id: userId,
        amount: addPoints,
        reason: 'ticket_purchase_bonus',
      });
      if (logErr) throw logErr;
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('points,matching_tickets')
      .eq('id', userId)
      .maybeSingle();
    if (meError) throw meError;

    const curTickets = typeof (me as any)?.matching_tickets === 'number' ? (me as any).matching_tickets : 0;
    const curPoints = typeof (me as any)?.points === 'number' ? (me as any).points : 0;

    const { error: upErr } = await supabase
      .from('users')
      .update({
        matching_tickets: curTickets + addTickets,
        ...(addPoints > 0 ? { points: curPoints + addPoints } : {}),
      })
      .eq('id', userId);
    if (upErr) throw upErr;

    return { ok: true, kind: 'matching_ticket', grantedTickets: addTickets, grantedPoints: addPoints };
  } catch (e: any) {
    return { ok: false, kind: 'db_error', message: String(e?.message ?? e ?? 'unknown error') };
  }
}

