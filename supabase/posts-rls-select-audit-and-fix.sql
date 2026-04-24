-- posts 테이블 RLS SELECT 점검 및 강화 (Supabase SQL Editor에서 실행)
--
-- 배경: 클라이언트에서 .eq('is_deleted', false)를 써도, RLS가 삭제 행 SELECT를 허용하면
--   다른 쿼리/도구에서 삭제 게시물이 노출될 수 있고, 정책이 여러 개일 때 OR로 합쳐지는
--   permissive 정책이 있으면 의도와 다르게 동작할 수 있습니다.
--
-- 1) 현재 정책 확인 (실행 후 결과를 보고 불필요한 SELECT 정책 이름을 파악하세요)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'posts'
order by cmd, policyname;

-- 2) is_deleted 분포 확인 (삭제 처리된 행이 실제로 true인지)
select is_deleted, count(*) as cnt
from public.posts
group by is_deleted
order by is_deleted nulls last;

-- 3) 최근 soft-delete 후보 샘플
select id, user_id, post_type, is_deleted, created_at
from public.posts
where is_deleted is true
order by created_at desc
limit 20;

-- ---------------------------------------------------------------------------
-- 아래 "예시" 수정은 (1)에서 넓은 SELECT 정책(qual이 항상 참)을 정리한 뒤에만 적용하세요.
-- permissive 정책은 OR로 합쳐집니다. `using (true)` 정책이 남아 있으면 이 CREATE만으로는
-- 삭제 행 SELECT가 막히지 않습니다.
-- ---------------------------------------------------------------------------

-- 예: 기존에 너무 넓은 SELECT 정책이 있다면 이름을 맞춰 drop 후, 비삭제만 보이게 정책을 하나로 정리
-- drop policy if exists "기존_넓은_select_정책_이름" on public.posts;

-- 비삭제 행만 읽기 (주석 해제 후 실행). 관리자 전체 조회 정책이 있다면 roles/qual을 맞추세요.
-- drop policy if exists "posts_select_non_deleted" on public.posts;
-- create policy "posts_select_non_deleted"
-- on public.posts
-- for select
-- to anon, authenticated
-- using (coalesce(is_deleted, false) = false);
