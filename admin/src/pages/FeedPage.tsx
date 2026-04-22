import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type PostTypeTab = '일반' | '바디'

type PostRow = {
  id: string
  user_id: string
  content: string | null
  post_type: '일반' | '바디' | (string & {})
  image_urls: string[] | null
  created_at: string
  is_deleted: boolean
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function FeedPage() {
  const [tab, setTab] = useState<PostTypeTab>('일반')
  const [rows, setRows] = useState<PostRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [nicknameByUserId, setNicknameByUserId] = useState<
    Record<string, string | null>
  >({})
  const [reportCountByPostId, setReportCountByPostId] = useState<
    Record<string, number>
  >({})

  const fetchPosts = useCallback(async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('posts')
      .select('id,user_id,content,post_type,image_urls,created_at,is_deleted')
      .eq('is_deleted', false)
      .eq('post_type', tab)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      alert(error.message)
      setRows([])
      setNicknameByUserId({})
      setReportCountByPostId({})
      setLoading(false)
      return
    }

    const postRows = (data ?? []) as unknown as PostRow[]
    setRows(postRows)
    setLastUpdatedAt(new Date().toLocaleString())

    const userIds = Array.from(new Set(postRows.map((r) => r.user_id))).filter(
      Boolean,
    )
    if (userIds.length > 0) {
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id,nickname')
        .in('id', userIds)

      if (usersError) {
        alert(usersError.message)
        setNicknameByUserId({})
      } else if (usersData) {
        const map: Record<string, string | null> = {}
        for (const u of usersData as any[]) {
          map[String(u.id)] = (u.nickname ?? null) as string | null
        }
        setNicknameByUserId(map)
      }
    } else {
      setNicknameByUserId({})
    }

    const postIds = postRows.map((r) => r.id).filter(Boolean)
    if (postIds.length === 0) {
      setReportCountByPostId({})
      setLoading(false)
      return
    }

    const { data: reportsData, error: reportsError } = await supabase
      .from('reports')
      .select('id,post_id')
      .in('post_id', postIds)

    if (reportsError) {
      alert(reportsError.message)
      setReportCountByPostId({})
      setLoading(false)
      return
    }

    const map: Record<string, number> = {}
    for (const r of (reportsData ?? []) as any[]) {
      const pid = r.post_id ? String(r.post_id) : ''
      if (!pid) continue
      map[pid] = (map[pid] ?? 0) + 1
    }
    setReportCountByPostId(map)
    setLoading(false)
  }, [tab])

  useEffect(() => {
    let alive = true
    const run = async () => {
      await fetchPosts()
      if (!alive) return
    }
    void run()

    const id = window.setInterval(() => {
      void fetchPosts()
    }, 30_000)

    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [fetchPosts])

  const deletePost = async (postId: string) => {
    const ok = confirm('해당 게시물을 삭제 처리(is_deleted=true) 하시겠습니까?')
    if (!ok) return

    const { error } = await supabase
      .from('posts')
      .update({ is_deleted: true })
      .eq('id', postId)

    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.filter((p) => p.id !== postId))
    setReportCountByPostId((prev) => {
      const { [postId]: _, ...rest } = prev
      return rest
    })
  }

  const totalCount = rows.length

  const headerHint = useMemo(
    () => (tab === '일반' ? "post_type='일반'" : "post_type='바디'"),
    [tab],
  )

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-semibold text-neutral-900">피드 관리</div>
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
            onClick={() => void fetchPosts()}
            disabled={loading}
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-full bg-neutral-100 p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              className={[
                'rounded-full px-3 py-2 text-sm font-medium',
                tab === '일반'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:bg-white',
              ].join(' ')}
              onClick={() => setTab('일반')}
            >
              일반
            </button>
            <button
              className={[
                'rounded-full px-3 py-2 text-sm font-medium',
                tab === '바디'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:bg-white',
              ].join(' ')}
              onClick={() => setTab('바디')}
            >
              바디
            </button>
          </div>
        </div>

        <div className="text-sm text-neutral-700">
          현재 탭: <span className="text-[#6C47FF]">{tab}</span>{' '}
          <span className="text-xs text-neutral-400">({headerHint})</span> · 총{' '}
          <span className="text-[#6C47FF]">{totalCount}</span>건
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  작성자
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  이미지
                </th>
                <th className="min-w-[360px] px-4 py-3 font-medium">내용</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  작성일
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  신고
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  삭제
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={6}>
                    로딩 중...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-neutral-500" colSpan={6}>
                    게시물이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const nickname = nicknameByUserId[p.user_id] ?? '-'
                  const thumb = p.image_urls?.[0] ?? null
                  const reportCount = reportCountByPostId[p.id] ?? 0
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                        {nickname}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {thumb ? (
                          <a
                            href={thumb}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-12 w-12 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                          >
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        ) : (
                          <div className="h-12 w-12 rounded-md border border-neutral-200 bg-neutral-50" />
                        )}
                      </td>
                      <td className="max-w-[720px] px-4 py-3 text-neutral-800">
                        <div className="max-h-12 overflow-hidden whitespace-pre-wrap">
                          {p.content ?? ''}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="rounded-full bg-[#6C47FF]/10 px-2 py-1 text-xs font-medium text-[#6C47FF]">
                          {reportCount}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          className="rounded-md bg-neutral-700 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
                          onClick={() => void deletePost(p.id)}
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

