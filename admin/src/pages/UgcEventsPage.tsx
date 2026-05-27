import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type EntryRow = {
  id: string
  user_id: string
  instagram_id: string | null
  tiktok_id: string | null
  created_at: string
  status: 'pending' | 'approved' | 'rejected' | (string & {})
  admin_note: string | null
  reward_paid: boolean | null
  users?: { nickname: string | null } | { nickname: string | null }[] | null
}

type StatusTab = 'all' | 'approved' | 'rejected'

const TAB_ACTIVE = 'bg-[#3B3BF9] text-white'
const TAB_INACTIVE = 'bg-white text-neutral-700 hover:bg-neutral-50'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function getNickname(row: EntryRow): string {
  const u: unknown = row.users
  if (!u) return '-'
  if (Array.isArray(u)) return String((u[0] as any)?.nickname ?? '-') || '-'
  return String((u as any)?.nickname ?? '-') || '-'
}

function normalizeStatus(s: unknown): 'pending' | 'approved' | 'rejected' {
  const v = String(s ?? 'pending')
  if (v === 'approved') return 'approved'
  if (v === 'rejected') return 'rejected'
  return 'pending'
}

function statusLabel(status: 'pending' | 'approved' | 'rejected') {
  switch (status) {
    case 'approved':
      return '승인됨'
    case 'rejected':
      return '거절됨'
    default:
      return '심사 대기'
  }
}

export function UgcEventsPage() {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('all')

  const [postCountByUserId, setPostCountByUserId] = useState<Record<string, number>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dirtyNoteById, setDirtyNoteById] = useState<Record<string, string>>({})

  const load = async () => {
    setLoading(true)
    setPostCountByUserId({})
    setDirtyNoteById({})

    const { data, error } = await supabase
      .from('ugc_event_entries')
      .select(
        'id,user_id,instagram_id,tiktok_id,created_at,status,admin_note,reward_paid,users(nickname)',
      )
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const list = ((data ?? []) as any[]).map((r) => {
      const u = (r as any)?.users
      return {
        ...r,
        users: Array.isArray(u) ? (u[0] ?? null) : u ?? null,
      }
    }) as EntryRow[]

    setRows(list)
    setDirtyNoteById(
      Object.fromEntries(
        list.map((r) => [r.id, String(r.admin_note ?? '')]),
      ),
    )

    const userIds = Array.from(new Set(list.map((r) => String(r.user_id ?? '').trim()).filter(Boolean)))
    if (userIds.length === 0) {
      setPostCountByUserId({})
      setLoading(false)
      return
    }

    const { data: posts, error: postErr } = await supabase
      .from('posts')
      .select('user_id')
      .in('user_id', userIds)
      .eq('is_deleted', false)
      .limit(5000)

    if (postErr) {
      console.error('[UgcEventsPage] posts count fetch failed', postErr)
      setPostCountByUserId({})
      setLoading(false)
      return
    }

    const counts: Record<string, number> = {}
    for (const p of (posts ?? []) as any[]) {
      const uid = String((p as any)?.user_id ?? '').trim()
      if (!uid) continue
      counts[uid] = (counts[uid] ?? 0) + 1
    }
    setPostCountByUserId(counts)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    return rows.filter((r) => normalizeStatus(r.status) === tab)
  }, [rows, tab])

  const onSetStatus = async (row: EntryRow, next: 'approved' | 'rejected') => {
    if (busyId) return
    setBusyId(row.id)
    try {
      const { error } = await supabase
        .from('ugc_event_entries')
        .update({ status: next })
        .eq('id', row.id)
      if (error) throw error
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status: next } : r)))
      if (next === 'approved') {
        setTab('approved')
      }
    } catch (e: any) {
      alert(e?.message ?? '상태 업데이트 실패')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleRewardPaid = async (row: EntryRow, next: boolean) => {
    if (busyId) return
    setBusyId(row.id)
    try {
      const { error } = await supabase
        .from('ugc_event_entries')
        .update({ reward_paid: next })
        .eq('id', row.id)
      if (error) throw error
      setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, reward_paid: next } : r)))
    } catch (e: any) {
      alert(e?.message ?? '보상 지급 상태 업데이트 실패')
    } finally {
      setBusyId(null)
    }
  }

  const onSaveNote = async (row: EntryRow) => {
    if (busyId) return
    const note = String(dirtyNoteById[row.id] ?? '').trim()
    setBusyId(row.id)
    try {
      const { error } = await supabase
        .from('ugc_event_entries')
        .update({ admin_note: note || null })
        .eq('id', row.id)
      if (error) throw error
      setRows((cur) =>
        cur.map((r) => (r.id === row.id ? { ...r, admin_note: note || null } : r)),
      )
    } catch (e: any) {
      alert(e?.message ?? '메모 저장 실패')
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = async (row: EntryRow) => {
    if (busyId) return
    if (!confirm('정말 삭제하시겠습니까?')) return
    setBusyId(row.id)
    try {
      const { error } = await supabase.from('ugc_event_entries').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e: any) {
      alert(e?.message ?? '삭제 실패')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-neutral-900">
          총 <span className="text-[#3B3BF9]">{loading ? '—' : filtered.length}</span>건의 참여가
          있습니다.
        </div>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200 disabled:opacity-60"
          onClick={() => void load()}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'all' ? TAB_ACTIVE : TAB_INACTIVE,
            ].join(' ')}
            onClick={() => setTab('all')}
          >
            전체
          </button>
          <button
            type="button"
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'approved' ? TAB_ACTIVE : TAB_INACTIVE,
            ].join(' ')}
            onClick={() => setTab('approved')}
          >
            승인됨
          </button>
          <button
            type="button"
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'rejected' ? TAB_ACTIVE : TAB_INACTIVE,
            ].join(' ')}
            onClick={() => setTab('rejected')}
          >
            거절됨
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-neutral-500">참여 내역이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filtered.map((r) => {
              const busy = busyId === r.id
              const status = normalizeStatus(r.status)
              const note = String(dirtyNoteById[r.id] ?? '')
              const postCnt = postCountByUserId[String(r.user_id ?? '').trim()] ?? 0
              const paid = Boolean(r.reward_paid)
              const showActions = status === 'pending' && tab === 'all'

              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-neutral-900">
                        {getNickname(r)}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                        {r.user_id}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-neutral-700">
                        <div>
                          인스타: <span className="text-neutral-900">{r.instagram_id ?? '-'}</span>
                        </div>
                        <div>
                          틱톡: <span className="text-neutral-900">{r.tiktok_id ?? '-'}</span>
                        </div>
                        <div>
                          게시글 수: <span className="text-neutral-900">{postCnt}</span>
                        </div>
                        <div className="text-neutral-500">{formatDateTime(r.created_at)}</div>
                      </div>
                      <div className="mt-2 inline-flex w-fit items-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700">
                        {statusLabel(status)}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {showActions ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-md bg-[#3B3BF9] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                            onClick={() => void onSetStatus(r, 'approved')}
                            disabled={busy}
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            className="rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
                            onClick={() => void onSetStatus(r, 'rejected')}
                            disabled={busy}
                          >
                            거절
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-neutral-600">
                          {statusLabel(status)}
                        </div>
                      )}
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-xs font-medium text-neutral-700">
                    <input
                      type="checkbox"
                      checked={paid}
                      disabled={busy}
                      onChange={(e) => void onToggleRewardPaid(r, e.target.checked)}
                    />
                    보상 지급 완료
                  </label>

                  <div>
                    <div className="mb-1 text-xs font-medium text-neutral-500">관리자 메모</div>
                    <textarea
                      className="min-h-[70px] w-full resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#3B3BF9]"
                      value={note}
                      disabled={busy}
                      onChange={(e) =>
                        setDirtyNoteById((cur) => ({ ...cur, [r.id]: e.target.value }))
                      }
                      placeholder="관리자 메모"
                    />
                    <div className="mt-2 flex items-center justify-end">
                      <button
                        type="button"
                        className="rounded-md bg-[#3B3BF9] px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                        onClick={() => void onSaveNote(r)}
                        disabled={busy}
                      >
                        메모 저장
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end border-t border-neutral-100 pt-3">
                    <button
                      type="button"
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      onClick={() => void onDelete(r)}
                      disabled={busy}
                    >
                      삭제
                    </button>
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
