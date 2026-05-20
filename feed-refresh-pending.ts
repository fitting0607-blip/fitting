/** 차단 후 홈 피드에서 해당 유저 게시물을 즉시 제거·새로고침하기 위한 1회성 값 */

let pendingBlockedUserId: string | null = null;

export function markHomeFeedRefresh(blockedUserId: string) {
  const id = String(blockedUserId ?? '').trim();
  if (id.length > 0) pendingBlockedUserId = id;
}

export function consumeHomeFeedBlockedUserId(): string | null {
  const id = pendingBlockedUserId;
  pendingBlockedUserId = null;
  return id;
}
