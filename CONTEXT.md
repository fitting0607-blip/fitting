# fitting 앱 개발 현황

## 스택
- Expo + Supabase + Cursor
- 언어: TypeScript
- 스타일: StyleSheet (NativeWind 사용 안 함)
- 라우팅: Expo Router

## 완료된 기능
- 회원가입 멀티스텝 (1~10단계)
- 회원가입 전화번호 입력 단계 추가 (프로필 사진 단계 바로 전, 010-XXXX-XXXX 자동 하이픈, users.phone 컬럼 저장)
- 이메일 중복 체크 (가입 1단계에서 DB 조회 후 차단)
- 닉네임 중복 체크 (500ms debounce 실시간 검증, 사용가능/중복 표시)
- users 테이블 nickname unique constraint 추가
- 로그인/로그아웃
- 관리자 웹 (admin/ 폴더):
  - React + Vite + TypeScript + Tailwind CSS + React Router v6
  - Supabase 연동
  - 관리자 로그인 (is_admin 권한 체크)
  - 대시보드 페이지 (총 유저수, 오늘 가입자, 게시물수, 신고건수, 트레이너 승인대기, 매칭수, 오늘매출)
  - 피드 관리 페이지 (일반/바디 탭, 게시물 목록, 이미지 썸네일, 신고횟수, 삭제)
  - (2026-04-23) 관리자 웹 피드 이미지 로딩 개선 작업 (미완료, Supabase 업그레이드 후 재확인 필요)
  - 결제 정보 관리 페이지 (결제 목록, 상세보기)
  - 30초 자동 새로고침
  - 유저목록 페이지 (조회/검색/상세보기/삭제)
  - 유저목록 가입방식(provider) 컬럼 추가
  - 피티 유저 관리 페이지 (승인 완료/결제 대기/승인 대기 탭)
  - 피티 유저 승인 버튼: status = 'approved'로 업데이트
  - 유저 상세보기 게시글 탭 일반/바디 서브탭 추가
  - 게시물 이미지 그리드 표시
  - auth 타임아웃 추가 (3초, 회사 네트워크 대응)
  - admin_select_all_posts RLS 정책 추가
  - admin_update_trainer_profiles RLS 정책 추가
  - 신고 목록 페이지 (처리 완료/처리 대기 탭)
  - 신고 처리 완료 버튼 (reports.processed_at 업데이트)
  - admin_select_reports, admin_update_reports RLS 정책 추가
  - 상품 관리 페이지 (매칭권/피티권 탭, 등록/수정/삭제/노출상태 토글)
  - 원가 + 할인율 입력 시 가격 자동 계산
  - admin INSERT/UPDATE/DELETE products RLS 정책 추가
  - 배너 관리 페이지 (등록/수정/삭제/노출상태 토글)
  - 배너 이미지 업로드 시 670:240 비율 크롭 기능 (react-easy-crop)
  - Supabase Storage banners 버킷 연동
  - 약관 관리 페이지 (서비스 이용약관/개인정보 처리방침/포인트 정책 탭)
  - 약관 내용 편집 및 저장 (terms 테이블 upsert)
  - 마지막 업데이트 일자 표시
  - 사이드바 레이아웃 (유저목록, 피티유저, 신고목록, 상품관리, 배너관리, 약관관리)
  - 사이드바 섹션 구분 및 간격 정리 (유저관리/고객센터/결제관리/콘텐츠)
- 홈 피드 (게시물 카드, 배너, 좋아요, 매칭하기, 덤벨 버튼)
  - 홈 배너 Supabase banners 테이블 연동 (is_active=true만 표시)
  - 배너 비율 670:240 고정
  - 배너 클릭 시 click_url로 이동 (Linking.openURL)
  - dot 인디케이터 (흰색 점)
  - 3초 자동 슬라이드 (수동 넘기면 타이머 초기화)
  - (2026-04-23) 홈 피드 배너 제거 후 리워드 탭으로 이동
  - (2026-04-23) 홈 피드 카드 사진 4:5 비율 고정
  - (2026-04-23) 홈 피드 카드 좋아요 버튼 좌상단, 매칭 버튼 우상단으로 이동 및 크기 통일
- 홈 피드 필터 및 정렬:
  - 성별 필터 (남성=여성 게시물만, 여성=남성 게시물만)
  - 이미 매칭한 유저 게시물 제외
  - 본인 게시물 제외
  - 차단 유저 게시물 제외
  - 정렬: 오늘 게시물 우선 + 랜덤 셔플
- 게시물 작성/삭제 (사진 1장, 크롭 기능)
  - (2026-04-23) 게시물 작성 시 크롭 제거 (원본 선택)
- 마이 탭 (프로필, 설정, 프로필 수정)
  - (2026-04-23) 마이 탭 게시물 그리드 1:1 유지, 상세 화면에서만 4:5 비율 적용
- 상대방 프로필 보기 (10p 차감)
- 매칭하기 기능 (일일 3회 무료, 매칭권 차감, 단방향 DM)
- 채팅 탭 (채팅 목록, 실시간 채팅방, 매칭 후 자동 이동, 알림 벨 아이콘)
  - 채팅 unread 뱃지 정상 표시 (읽음 처리 sender 필터 수정)
  - 채팅방 레이아웃 수정 (상단 여백, 메시지 정렬)
  - (2026-04-23) 채팅방 상단 프로필 보기 버튼 추가 (포인트 차감 팝업 포함)
- 좋아요 기능 (일일 5회 무료, 초과 시 -3p, point_logs 기록, 취소 후 재전송 가능)
- 프로필 열람 point_logs 기록 (-10p)
- 매칭 시 point_logs 기록 (+5p)
- 리워드 탭 (보유 매칭권/포인트 카드, 상점, 포인트→매칭권 교환, 출석체크/광고시청/친구초대 미션)
- 상점 화면 (홈 상단 버튼, 리워드 탭 매칭권 구매 버튼으로 진입)
- 상점 피티권 탭 추가 (승인된 트레이너만 구매 가능)
- 상점 상품 카드 원가 취소선 + 할인가 + 할인율 뱃지 표시
- 로그인 시 출석 자동 지급 + 홈 진입 후 팝업 알림
- 알림 화면 (매칭/좋아요/포인트 알림, 읽음 처리)
- 매칭/좋아요 알림 DB 트리거 (notify_match_target, notify_like_target)
- 알림에서 프로필 보기 기능
- 신고 기능 (신고 사유 6가지, reports 테이블)
- 신고 화면 키보드 내려가기 수정 (빈 화면 터치 시 Keyboard.dismiss)
- 차단 기능 (차단/해제, 차단목록, 홈 피드 필터링)
- 채팅 읽음 처리 (채팅방 진입 시 읽음, 목록 뱃지 사라짐)
- 지도 탭 (구글맵, 내 위치, 지역 검색, 트레이너 목록 바텀시트)
  - (2026-04-23) 지도 탭 검색 기능 수정 (Google Places API 키 fallback 처리)
- 트레이너 상태 흐름 수정 (pending → approved+미결제 → approved+결제완료)
- 결제 대기 중 상태에서 결제하기 버튼 → 상점으로 이동
- 피티 등록 신청 화면 (3단계 플로우, 자격증 선택사항, 승인 대기/취소/결제 대기 상태)
- 트레이너 상세 화면

## 알려진 버그 (미수정)
- 관리자 페이지 승인 완료 탭에 승인/거절 버튼 노출 오류

## 추후 작업
- SMS 인증 로직 추가
- 전화번호 중복 체크
- users.phone unique 제약조건 추가

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
- public.reports (id, reporter_id, target_id, post_id, reason, detail, created_at)
- public.blocks (id, blocker_id, blocked_id, created_at)
- public.trainer_profiles (id, user_id, facility_name, facility_addr, facility_addr_detail, intro, latitude, longitude, status, is_approved, facility_images, cert_images, profile_images, created_at, updated_at)
- public.products (상품 관리용)
- public.banners (id, title, image_url, click_url, is_active, created_at)
- public.terms (id, type, content, updated_at)
- public.payments (id, user_id, product_id, product_title, amount, status, created_at)

### DB 변경
- users 테이블 is_admin 컬럼 추가 (boolean, default false)
- users 테이블 phone 컬럼 추가 (text)
- products 테이블 생성 (상품 관리용)
- products 테이블 original_price 컬럼 추가
- reports 테이블 processed_at 컬럼 추가
- banners 테이블 생성 (id, title, image_url, click_url, is_active, created_at)

### RLS 보안
- likes, chat_rooms, messages, point_logs, notifications → RLS 활성화 완료
  - chat_rooms SELECT 무한 재귀 수정 (match_id in 방식으로 변경)
  - messages SELECT 정책 수정 (room_id in 방식으로 변경)
- matches, posts, users → RLS 활성화 및 정책 설정 완료
  - matches: 본인 requester/target만 조회, requester만 INSERT/DELETE
  - posts: is_deleted=false 전체 조회, 본인만 INSERT/UPDATE/DELETE
  - users: 로그인 유저 전체 조회, 본인만 UPDATE
- admin_delete_users, admin_delete_posts RLS 정책 추가
- banners RLS 정책 추가 (전체 조회, 관리자만 CUD)
- terms RLS 정책 추가 (전체 조회, 관리자만 INSERT/UPDATE)
- payments RLS 정책 추가 (관리자 전체 조회, 유저 본인 조회)

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
- app/(tabs)/map.tsx (구글맵, 승인된 트레이너 마커·목록)
- app/trainer-detail.tsx
- app/trainer-apply.tsx
- app/(tabs)/chat.tsx
- app/(tabs)/reward.tsx
- app/store.tsx (상점)
- app/(tabs)/my.tsx
- app/settings.tsx
- app/terms/[type].tsx (service/privacy/point)
- app/profile-edit.tsx
- app/post-create.tsx
- app/post-detail.tsx
- app/user-profile.tsx
- app/matching.ts
- app/hooks/useMatchModal.tsx
- app/hooks/usePostLike.tsx
- app/chat-room.tsx
