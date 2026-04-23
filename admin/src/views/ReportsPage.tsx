import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolvePostImageUrls } from '../lib/resolvePostImageUrls'

type ReportRow = {
  id: string
  reporter_id: string
  target_id: string
  post_id: string | null
  reason: string | null
  detail: string | null
  created_at: string
  processed_at?: string | null
}

type UserLite = { id: string; nickname: string | null; email?: string | null }
type PostLite = { id: string; image_urls: string[] | null; display_image_urls?: string[] }

function includesLoose(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        aria-label="close modal overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div className="text-base font-semibold">{title}</div>
          <button
            className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ImageGrid({
  title,
  urls,
}: {
  title: string
  urls: string[] | null | undefined
}) {
  if (!urls || urls.length === 0) {
    return (
      <div>
        <div className="text-xs text-neutral-500">{title}</div>
        <div className="mt-2 text-sm text-neutral-500">이미지가 없습니다.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-xs text-neutral-500">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {urls.map((url, idx) => (
          <a
            key={`${title}-${idx}`}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
          >
            <img
              src={url}
              alt=""
              className="h-28 w-full object-cover"
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </div>
  )
}

export function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'processed' | 'pending'>('processed')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [usersById, setUsersById] = useState<Record<string, UserLite>>({})
  const [postsById, setPostsById] = useState<Record<string, PostLite>>({})

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('reports')
        .select(
          'id,reporter_id,target_id,post_id,reason,detail,created_at,processed_at',
        )
        .order('created_at', { ascending: false })

      if (!alive) return
      if (error) {
        alert(error.message)
        setRows([])
        setLoading(false)
        return
      }

      const reportRows = (data ?? []) as unknown as ReportRow[]
      setRows(reportRows)
      setLoading(false)

      const userIds = Array.from(
        new Set(reportRows.flatMap((r) => [r.reporter_id, r.target_id])),
      ).filter(Boolean)
      const postIds = Array.from(
        new Set(reportRows.map((r) => r.post_id).filter(Boolean) as string[]),
      )

      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id,nickname,email')
          .in('id', userIds)

        if (alive && usersError) alert(usersError.message)
        if (alive && usersData) {
          const map: Record<string, UserLite> = {}
          for (const u of usersData as any[]) {
            map[String(u.id)] = {
              id: String(u.id),
              nickname: u.nickname ?? null,
              email: u.email ?? null,
            }
          }
          setUsersById(map)
        }
      }

      if (postIds.length > 0) {
        const { data: postsData, error: postsError } = await supabase
          .from('posts')
          .select('id,image_urls')
          .in('id', postIds)

        if (alive && postsError) alert(postsError.message)
        if (alive && postsData) {
          const map: Record<string, PostLite> = {}
          for (const p of postsData as any[]) {
            const resolved = await resolvePostImageUrls(p.image_urls ?? null)
            const original = (Array.isArray(p.image_urls) ? p.image_urls : [])
              .filter(Boolean) as string[]
            map[String(p.id)] = {
              id: String(p.id),
              image_urls: (p.image_urls ?? null) as string[] | null,
              display_image_urls: resolved.length > 0 ? resolved : original,
            }
          }
          setPostsById(map)
        }
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [])

  const totalCount = rows.length

  const visibleRows = useMemo(() => {
    const q = query.trim()
    const byTab = rows.filter((r) => {
      const processed = Boolean(r.processed_at)
      return tab === 'processed' ? processed : !processed
    })
    if (!q) return byTab
    return byTab.filter((r) => {
      const reporter = usersById[r.reporter_id]
      const target = usersById[r.target_id]
      return (
        includesLoose(reporter?.nickname, q) ||
        includesLoose(target?.nickname, q) ||
        includesLoose(r.reason, q) ||
        includesLoose(r.detail, q) ||
        includesLoose(r.reporter_id, q) ||
        includesLoose(r.target_id, q)
      )
    })
  }, [rows, tab, query, usersById])

  const openDetail = (r: ReportRow) => setSelectedId(r.id)
  const closeDetail = () => setSelectedId(null)

  const processReport = async (r: ReportRow) => {
    const ok = confirm('해당 신고를 처리 완료로 변경하시겠습니까?')
    if (!ok) return

    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('reports')
      .update({ processed_at: nowIso })
      .eq('id', r.id)
      .select(
        'id,reporter_id,target_id,post_id,reason,detail,created_at,processed_at',
      )
      .maybeSingle()

    if (error) {
      alert(error.message)
      return
    }

    if (data) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? (data as any) : x)))
    } else {
      setRows((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, processed_at: nowIso } : x)),
      )
    }
  }

  const selectedReporter = selected ? usersById[selected.reporter_id] : null
  const selectedTarget = selected ? usersById[selected.target_id] : null
  const selectedPost =
    selected && selected.post_id ? postsById[selected.post_id] : null

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-neutral-900">
          총 <span className="text-[#6C47FF]">{totalCount}</span>개의 신고가 있습니다.
        </div>
        <div className="w-full sm:w-80">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임/사유/내용으로 검색해 주세요"
            className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
          />
        </div>
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'processed'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('processed')}
          >
            처리 완료
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'pending'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('pending')}
          >
            처리 대기
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : visibleRows.length === 0 ? (
          <div className="text-sm text-neutral-500">신고가 없습니다.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">신고일</th>
                    <th className="whitespace-nowrap px-4 py-3">신고자</th>
                    <th className="whitespace-nowrap px-4 py-3">피신고자</th>
                    <th className="whitespace-nowrap px-4 py-3">신고 사유</th>
                    <th className="whitespace-nowrap px-4 py-3">상세보기</th>
                    {tab === 'pending' ? (
                      <th className="whitespace-nowrap px-4 py-3">처리</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {visibleRows.map((r) => {
                    const reporter = usersById[r.reporter_id]
                    const target = usersById[r.target_id]
                    return (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                          {reporter?.nickname ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                          {target?.nickname ?? '-'}
                        </td>
                        <td className="max-w-[360px] truncate px-4 py-3 text-neutral-800">
                          {r.reason ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <button
                            className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                            onClick={() => openDetail(r)}
                          >
                            보기
                          </button>
                        </td>
                        {tab === 'pending' ? (
                          <td className="whitespace-nowrap px-4 py-3">
                            <button
                              className="rounded-md bg-[#6C47FF] px-3 py-1 text-xs font-medium text-white hover:bg-[#5B3CF0]"
                              onClick={() => void processReport(r)}
                            >
                              처리
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        title={tab === 'pending' ? '신고 상세 (처리 대기)' : '신고 상세'}
        onClose={closeDetail}
      >
        {selected ? (
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-neutral-500">신고자</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selectedReporter?.nickname ?? '-'}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  ID: {selected.reporter_id}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">피신고자</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selectedTarget?.nickname ?? '-'}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  ID: {selected.target_id}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">신고일</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {formatDateTime(selected.created_at)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">처리일</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selected.processed_at
                    ? formatDateTime(selected.processed_at)
                    : '-'}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500">신고 사유</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                {selected.reason ?? '-'}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500">상세 내용</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                {selected.detail ?? '-'}
              </div>
            </div>

            {selected.post_id ? (
              <div className="grid grid-cols-1 gap-4">
                <div className="text-xs text-neutral-500">
                  신고된 게시물 ID: {selected.post_id}
                </div>
                <ImageGrid
                  title="게시물 이미지"
                  urls={selectedPost?.display_image_urls ?? selectedPost?.image_urls ?? null}
                />
              </div>
            ) : null}

            {tab === 'pending' ? (
              <div className="flex justify-end">
                <button
                  className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5B3CF0]"
                  onClick={() => void processReport(selected)}
                >
                  처리 완료
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">선택된 신고가 없습니다.</div>
        )}
      </Modal>
    </div>
  )
}
