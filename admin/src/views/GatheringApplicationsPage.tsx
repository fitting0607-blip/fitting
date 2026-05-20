import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type GatheringApplicationRow = {
  id: string
  user_id?: string | null
  gathering_id?: string | null
  name: string | null
  gender: string | null
  phone: string | null
  nickname: string | null
  status?: string | null
  created_at: string
  gatherings?:
    | { title: string | null; date: string | null; time: string | null }
    | { title: string | null; date: string | null; time: string | null }[]
    | null
}

function getJoinedGathering(
  row: GatheringApplicationRow,
): { title: string | null; date: string | null; time: string | null } | null {
  const g: unknown = row.gatherings
  if (!g) return null
  if (Array.isArray(g)) return (g[0] as any) ?? null
  return g as any
}

async function sendGatheringApprovedPush(params: { recipientUserId: string; gatheringId: string }) {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 필요합니다.')

  const baseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!baseUrl || !anonKey) throw new Error('환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 필요합니다.')

  const res = await fetch(`${String(baseUrl).replace(/\/$/, '')}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: String(anonKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'direct',
      recipientUserId: params.recipientUserId,
      type: 'gathering_approved',
      content: '소모임 신청이 승인되었습니다. 결제 후 참여할 수 있어요.',
      relatedId: params.gatheringId,
      route: { pathname: '/gathering' },
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `푸시 발송 실패 (HTTP ${res.status})`)
  }
}

export function GatheringApplicationsPage() {
  const [rows, setRows] = useState<GatheringApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'paid' | 'rejected'>('pending')

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('gathering_applications')
        .select('id,user_id,gathering_id,name,gender,phone,nickname,status,created_at,gatherings(title,date,time)')
        .order('created_at', { ascending: false })

      if (!alive) return

      if (error) {
        alert(error.message)
        setRows([])
        setLoading(false)
        return
      }

      const normalized = ((data ?? []) as any[]).map((r) => {
        const g = (r as any)?.gatherings
        return {
          ...r,
          // supabase can return joined rows as array depending on relationship shape
          gatherings: Array.isArray(g) ? (g[0] ?? null) : g ?? null,
        }
      })
      setRows(normalized as unknown as GatheringApplicationRow[])
      setLoading(false)
    }

    void run()
    return () => {
      alive = false
    }
  }, [])

  const filtered = useMemo(() => {
    const t = tab
    return rows.filter((r) => String(r.status ?? 'pending') === t)
  }, [rows, tab])

  const onApprove = async (row: GatheringApplicationRow) => {
    const userId = String(row.user_id ?? '').trim()
    const gatheringId = String(row.gathering_id ?? '').trim()
    if (!userId || !gatheringId) {
      alert('user_id / gathering_id가 필요합니다.')
      return
    }
    setBusyId(row.id)
    try {
      const { error } = await supabase
        .from('gathering_applications')
        .update({ status: 'approved' })
        .eq('id', row.id)
      if (error) throw error
      try {
        await sendGatheringApprovedPush({ recipientUserId: userId, gatheringId })
      } catch (pushErr) {
        console.error('[GatheringApplications] sendGatheringApprovedPush failed', pushErr)
      }
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'approved' } : r)))
    } catch (e: any) {
      alert(e?.message ?? '승인 실패')
    } finally {
      setBusyId(null)
    }
  }

  const onReject = async (row: GatheringApplicationRow) => {
    setBusyId(row.id)
    try {
      const { error } = await supabase
        .from('gathering_applications')
        .update({ status: 'rejected' })
        .eq('id', row.id)
      if (error) throw error
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: 'rejected' } : r)))
    } catch (e: any) {
      alert(e?.message ?? '거절 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-neutral-900">
          총 <span className="text-[#3B3BF9]">{loading ? '—' : filtered.length}</span>명의 신청이 있습니다.
        </div>
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-4 gap-1">
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'pending' ? 'bg-[#3B3BF9] text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
            onClick={() => setTab('pending')}
          >
            승인 대기
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'approved' ? 'bg-[#3B3BF9] text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
            onClick={() => setTab('approved')}
          >
            승인됨
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'paid' ? 'bg-[#3B3BF9] text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
            onClick={() => setTab('paid')}
          >
            결제 완료
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'rejected' ? 'bg-[#3B3BF9] text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50',
            ].join(' ')}
            onClick={() => setTab('rejected')}
          >
            거절
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-neutral-500">신청 내역이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filtered.map((r) => {
              const status = String(r.status ?? 'pending')
              const g = getJoinedGathering(r)
              const busy = busyId === r.id
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="truncate text-sm font-semibold text-neutral-900">
                        {r.nickname ?? '-'}
                      </div>
                      <div className="truncate text-xs text-neutral-700">
                        {r.phone ?? '-'}
                      </div>
                      <div className="mt-1 truncate text-xs text-neutral-500">
                        {g?.title ?? '-'}
                      </div>
                      <div className="mt-1 inline-flex w-fit items-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700">
                        {status === 'approved'
                          ? '결제 대기 중'
                          : status === 'paid'
                            ? '완료'
                            : status === 'rejected'
                              ? '거절됨'
                              : '승인 대기'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {tab === 'pending' ? (
                      <>
                        <button
                          className="rounded-md bg-[#3B3BF9] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                          onClick={() => void onApprove(r)}
                          disabled={busy}
                        >
                          승인
                        </button>
                        <button
                          className="rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
                          onClick={() => void onReject(r)}
                          disabled={busy}
                        >
                          거절
                        </button>
                      </>
                    ) : tab === 'approved' ? (
                      <div className="text-xs font-medium text-neutral-600">
                        결제 대기 중
                      </div>
                    ) : tab === 'paid' ? (
                      <div className="text-xs font-medium text-neutral-600">
                        완료
                      </div>
                    ) : (
                      <div className="text-xs font-medium text-neutral-600">
                        거절됨
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
