# fitting 앱 개발 현황

## 스택
- Expo + Supabase + Cursor
- 언어: TypeScript
- 스타일: StyleSheet (NativeWind 사용 안 함)
- 라우팅: Expo Router

## 완료된 기능
- 회원가입 멀티스텝 (1~9단계)
- 로그인/로그아웃
- 홈 피드 (게시물 카드, 배너, 좋아요, 매칭하기, 덤벨 버튼)
- 게시물 작성/삭제 (사진 1장, 크롭 기능)
- 마이 탭 (프로필, 설정, 프로필 수정)
- 상대방 프로필 보기 (10p 차감)
- 매칭하기 기능 (일일 3회 무료, 매칭권 차감, 단방향 DM)
- 채팅 탭 (채팅 목록, 실시간 채팅방, 매칭 후 자동 이동, 알림 벨 아이콘)
- 좋아요 기능 (일일 5회 무료, 초과 시 -3p, point_logs 기록, 취소 후 재전송 가능)
- 프로필 열람 point_logs 기록 (-10p)
- 매칭 시 point_logs 기록 (+5p)
- 리워드 탭 (보유 매칭권/포인트 카드, 상점, 포인트→매칭권 교환, 출석체크/광고시청/친구초대 미션)
- 상점 화면 (홈 상단 버튼, 리워드 탭 매칭권 구매 버튼으로 진입)
- 로그인 시 출석 자동 지급 + 홈 진입 후 팝업 알림
- 알림 화면 (매칭/좋아요/포인트 알림, 읽음 처리)
- 매칭/좋아요 알림 DB 트리거 (notify_match_target, notify_like_target)
- 알림에서 프로필 보기 기능

## 알려진 버그 (미수정)
- 관리자 페이지 승인 완료 탭에 승인/거절 버튼 노출 오류

## Supabase 테이블
### 기존
- public.users (id, email, provider, nickname, gender, age, mbti, sports, workout_goals, workout_frequency, profile_image_url, points, matching_tickets, is_trainer, is_banned, last_daily_reset, daily_likes_used, daily_matches_used, fcm_token, created_at, updated_at)
- public.posts (id, user_id, content, post_type, image_urls, likes_count, is_deleted, created_at)
- public.matches (id, requester_id, target_id, created_at)

### 신규 추가
- public.likes (id, user_id, post_id, created_at)
- public.chat_rooms (id, match_id, created_at)
- public.messages (id, room_id, sender_id, content, is_read, created_at)
- public.point_logs (id, user_id, amount, reason, created_at)
- public.notifications (id, user_id, type, content, is_read, related_id, created_at)

### RLS 보안
- likes, chat_rooms, messages, point_logs, notifications → RLS 활성화 완료
- matches, posts, users → RLS 미설정 (추후 배포 전 설정 필요)

### Realtime 활성화
- messages, notifications

### 매칭 로직
- 단방향 DM 방식 (인스타 DM과 동일)
- 매칭권 사용 → matches row 생성 → chat_rooms row 자동 생성 → 상대 알림
- 맞매칭 개념 없음, 양쪽이 각각 매칭권 쓰면 채팅방 2개 생성

### point_logs reason 값 기준
- 적립: attendance +5, ad_watch +10, match_request +5, invite +30, like_received +1
- 차감: like_sent -3, profile_view -10, post_upload -10, ticket_exchange -50

## 앱 구조
- app/(auth)/login.tsx
- app/(auth)/register.tsx
- app/(auth)/steps/ (멀티스텝 컴포넌트)
- app/(tabs)/index.tsx (홈 피드)
- app/(tabs)/map.tsx
- app/(tabs)/chat.tsx
- app/(tabs)/reward.tsx
- app/store.tsx (상점)
- app/(tabs)/my.tsx
- app/settings.tsx
- app/profile-edit.tsx
- app/post-create.tsx
- app/post-detail.tsx
- app/user-profile.tsx
- app/matching.ts
- app/hooks/useMatchModal.tsx
- app/hooks/usePostLike.tsx
- app/chat-room.tsx
