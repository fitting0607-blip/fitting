import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type StatKey =
  | 'totalUsers'
  | 'todayUsers'
  | 'totalPosts'
  | 'pendingReports'
  | 'pendingTrainers'
  | 'totalMatches'
  | 'todayRevenue'

type Stats = Record<StatKey, number>

function startOfTodayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function startOfTomorrowIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    todayUsers: 0,
    totalPosts: 0,
    pendingReports: 0,
    pendingTrainers: 0,
    totalMatches: 0,
    todayRevenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)

    const todayStart = startOfTodayIso()
    const tomorrowStart = startOfTomorrowIso()

    const [
      totalUsersRes,
      todayUsersRes,
      totalPostsRes,
      pendingReportsRes,
      pendingTrainersRes,
      totalMatchesRes,
      todayPaymentsRes,
    ] = await Promise.all([
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', false),
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', false)
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart),
      supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('is_deleted', false),
      supabase
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .is('processed_at', null),
      supabase
        .from('trainer_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('matches')
        .select('id', { count: 'exact', head: true }),
      supabase
        .from('payments')
        .select('amount,created_at')
        .gte('created_at', todayStart)
        .lt('created_at', tomorrowStart),
    ])

    const firstError =
      totalUsersRes.error ??
      todayUsersRes.error ??
      totalPostsRes.error ??
      pendingReportsRes.error ??
      pendingTrainersRes.error ??
      totalMatchesRes.error ??
      todayPaymentsRes.error

    if (firstError) {
      alert(firstError.message)
      setLoading(false)
      return
    }

    const todayRevenue = ((todayPaymentsRes.data ?? []) as any[]).reduce(
      (sum, row) => sum + (typeof row.amount === 'number' ? row.amount : 0),
      0,
    )

    setStats({
      totalUsers: totalUsersRes.count ?? 0,
      todayUsers: todayUsersRes.count ?? 0,
      totalPosts: totalPostsRes.count ?? 0,
      pendingReports: pendingReportsRes.count ?? 0,
      pendingTrainers: pendingTrainersRes.count ?? 0,
      totalMatches: totalMatchesRes.count ?? 0,
      todayRevenue,
    })
    setLastUpdatedAt(new Date().toLocaleString())
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    const run = async () => {
      await fetchStats()
      if (!alive) return
    }
    void run()

    const id = window.setInterval(() => {
      void fetchStats()
    }, 30_000)

    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [fetchStats])

  type CardItem = {
    key: StatKey
    label: string
    value: number
    icon: string
    format?: 'krw'
  }

  const cards = useMemo(
    (): CardItem[] => [
      { key: 'totalUsers', label: '총 유저 수', value: stats.totalUsers, icon: '👥' },
      { key: 'todayUsers', label: '오늘 가입자 수', value: stats.todayUsers, icon: '🆕' },
      { key: 'totalPosts', label: '총 게시물 수', value: stats.totalPosts, icon: '📝' },
      {
        key: 'pendingReports',
        label: '처리 대기 신고 건수',
        value: stats.pendingReports,
        icon: '🚨',
      },
      {
        key: 'pendingTrainers',
        label: '승인 대기 트레이너 수',
        value: stats.pendingTrainers,
        icon: '🏋️',
      },
      { key: 'totalMatches', label: '총 매칭 수', value: stats.totalMatches, icon: '💘' },
      {
        key: 'todayRevenue',
        label: '오늘 매출',
        value: stats.todayRevenue,
        icon: '💰',
        format: 'krw',
      },
    ],
    [stats],
  )

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-semibold text-neutral-900">대시보드</div>
          <div className="mt-1 text-sm text-neutral-500">
            30초마다 자동으로 새로고침됩니다.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-neutral-500">
            마지막 업데이트: {lastUpdatedAt ?? '-'}
          </div>
          <button
            className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5B3CF0] disabled:opacity-60"
            onClick={() => void fetchStats()}
            disabled={loading}
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-800">
                  {c.label}
                </div>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#6C47FF]/10 text-lg">
                {c.icon}
              </div>
            </div>

            <div className="mt-4 text-3xl font-semibold tracking-tight text-neutral-900">
              <span className="text-[#6C47FF]">
                {c.format === 'krw'
                  ? `₩${c.value.toLocaleString()}`
                  : c.value.toLocaleString()}
              </span>
            </div>
            {loading ? (
              <div className="mt-2 text-xs text-neutral-400">업데이트 중...</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

