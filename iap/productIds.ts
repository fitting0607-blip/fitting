export const APPLE_PRODUCT_IDS = {
  matchingTickets: [
    'com.hywoo.fitting.ticket_3',
    'com.hywoo.fitting.ticket_5',
    'com.hywoo.fitting.ticket_10',
    'com.hywoo.fitting.ticket_30',
    'com.hywoo.fitting.ticket_50',
  ] as const,
  ptTickets: ['com.hywoo.fitting.trainer_30'] as const,
  premium: ['com.hywoo.fitting.ticket_unlimited'] as const,
} as const;

export type AppleProductId =
  | (typeof APPLE_PRODUCT_IDS.matchingTickets)[number]
  | (typeof APPLE_PRODUCT_IDS.ptTickets)[number]
  | (typeof APPLE_PRODUCT_IDS.premium)[number];

export const TICKET_QTY_BY_PRODUCT_ID: Record<string, number> = {
  'com.hywoo.fitting.ticket_3': 3,
  'com.hywoo.fitting.ticket_5': 5,
  'com.hywoo.fitting.ticket_10': 10,
  'com.hywoo.fitting.ticket_30': 30,
  'com.hywoo.fitting.ticket_50': 50,
};

export function isKnownAppleProductId(productId: string): boolean {
  const id = String(productId ?? '').trim();
  if (!id) return false;
  if (id in TICKET_QTY_BY_PRODUCT_ID) return true;
  if (APPLE_PRODUCT_IDS.ptTickets.includes(id as any)) return true;
  if (APPLE_PRODUCT_IDS.premium.includes(id as any)) return true;
  return false;
}

