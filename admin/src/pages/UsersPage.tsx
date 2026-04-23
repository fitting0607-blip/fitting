import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type UserRow = {
  id: string
  email: string | null
  provider: string | null
  nickname: string | null
  phone: string | null
  gender: string | null
  age: number | null
  sports: string[] | null
  points: number | null
  matching_tickets: number | null
  created_at: string
  is_admin: boolean | null
}

type PostRow = {
  id: string
  user_id: string
  content: string | null
  post_type: '일반' | '바디' | (string & {})
  image_urls: string[] | null
  created_at: string
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function includesLoose(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
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
      <div className="relative w-full max-w-3xl rounded-xl bg-white shadow-lg">
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

export function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  const [selected, setSelected] = useState<UserRow | null>(null)
  const [modalTab, setModalTab] = useState<'info' | 'posts'>('info')
  const [postsSubTab, setPostsSubTab] = useState<'일반' | '바디'>('일반')

  const [posts, setPosts] = useState<PostRow[]>([])
  const [postsLoading, setPostsLoading] = useState(false)

  const visibleRows = useMemo(() => {
    const q = query.trim()
    const nonAdmins = rows.filter((r) => !r.is_admin)
    if (!q) return nonAdmins
    return nonAdmins.filter(
      (r) =>
        includesLoose(r.nickname, q) ||
        includesLoose(r.email, q) ||
        includesLoose(r.phone, q),
    )
  }, [rows, query])

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('users')
        .select(
          'id,email,provider,nickname,phone,gender,age,sports,points,matching_tickets,created_at,is_admin',
        )
        .order('created_at', { ascending: false })

      if (!alive) return
      if (error) {
        alert(error.message)
        setRows([])
        setLoading(false)
        return
      }

      setRows((data ?? []) as UserRow[])
      setLoading(false)
    }
    void run()
    return () => {
      alive = false
    }
  }, [])

  const openDetail = (u: UserRow) => {
    setSelected(u)
    setModalTab('info')
    setPostsSubTab('일반')
    setPosts([])
  }

  const closeDetail = () => {
    setSelected(null)
    setModalTab('info')
    setPostsSubTab('일반')
    setPosts([])
  }

  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!selected) return
      if (modalTab !== 'posts') return

      setPostsLoading(true)
      const { data, error } = await supabase
        .from('posts')
        .select('id,user_id,post_type,image_urls,content,created_at')
        .eq('user_id', selected.id)
        .eq('is_deleted', false)
        .eq('post_type', postsSubTab)
        .order('created_at', { ascending: false })

      if (!alive) return
      if (error) {
        alert(error.message)
        setPosts([])
        setPostsLoading(false)
        return
      }

      setPosts((data ?? []) as PostRow[])
      setPostsLoading(false)
    }
    void run()
    return () => {
      alive = false
    }
  }, [selected, modalTab, postsSubTab])

  const deleteUser = async (u: UserRow) => {
    const ok = confirm('정말 삭제하시겠습니까?')
    if (!ok) return

    const { error } = await supabase.from('users').delete().eq('id', u.id)
    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.filter((x) => x.id !== u.id))
    if (selected?.id === u.id) closeDetail()
  }

  const deletePost = async (postId: string) => {
    const ok = confirm('게시글을 삭제하시겠습니까?')
    if (!ok) return

    const { error } = await supabase.from('posts').delete().eq('id', postId)
    if (error) {
      alert(error.message)
      return
    }

    setPosts((prev) => prev.filter((p) => p.id !== postId))
  }

  const totalCount = rows.filter((r) => !r.is_admin).length

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-neutral-900">
          총 <span className="text-[#6C47FF]">{totalCount}</span>명의 유저가 있습니다.
        </div>
        <div className="w-full sm:w-80">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임, 혹은 이메일로 검색해 주세요"
            className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="whitespace-nowrap px-5 py-3 font-medium">가입일</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">가입방식</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">닉네임</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">이메일</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">전화번호</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">상세보기</th>
                <th className="whitespace-nowrap px-5 py-3 font-medium">유저 권한</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                <tr>
                  <td className="px-5 py-6 text-neutral-500" colSpan={7}>
                    로딩 중...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-neutral-500" colSpan={7}>
                    유저가 없습니다.
                  </td>
                </tr>
              ) : (
                visibleRows.map((u) => (
                  <tr key={u.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-5 py-4 text-neutral-900">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-neutral-700">
                      {u.provider ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-neutral-900">
                      {u.nickname ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-neutral-700">
                      {u.email ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-neutral-700">
                      {u.phone ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <button
                        className="rounded-full border border-[#6C47FF]/40 bg-white px-3 py-1 text-xs font-medium text-[#6C47FF] hover:bg-[#6C47FF]/5"
                        onClick={() => openDetail(u)}
                      >
                        상세보기
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <button
                        className="rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                        onClick={() => void deleteUser(u)}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={Boolean(selected)}
        title="일반 유저 관리"
        onClose={closeDetail}
      >
        {selected ? (
          <div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-neutral-900">
                  {selected.nickname ?? '-'}
                </div>
                <div className="mt-1 text-sm text-neutral-500">
                  매칭권 {selected.matching_tickets ?? 0}개 / 포인트 {selected.points ?? 0}
                  점
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-full bg-neutral-100 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  className={[
                    'rounded-full px-3 py-2 text-sm font-medium',
                    modalTab === 'info'
                      ? 'bg-[#6C47FF] text-white'
                      : 'text-neutral-600 hover:bg-white',
                  ].join(' ')}
                  onClick={() => setModalTab('info')}
                >
                  유저 정보
                </button>
                <button
                  className={[
                    'rounded-full px-3 py-2 text-sm font-medium',
                    modalTab === 'posts'
                      ? 'bg-[#6C47FF] text-white'
                      : 'text-neutral-600 hover:bg-white',
                  ].join(' ')}
                  onClick={() => setModalTab('posts')}
                >
                  게시글
                </button>
              </div>
            </div>

            {modalTab === 'info' ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-neutral-500">이메일</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {selected.email ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">전화번호</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {selected.phone ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">성별</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {selected.gender ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">나이</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {selected.age ?? '-'}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-neutral-500">관심사(sports)</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {selected.sports && selected.sports.length > 0
                      ? selected.sports.join(', ')
                      : '-'}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="rounded-full bg-neutral-100 p-1">
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        className={[
                          'rounded-full px-3 py-2 text-sm font-medium',
                          postsSubTab === '일반'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-600 hover:bg-white',
                        ].join(' ')}
                        onClick={() => setPostsSubTab('일반')}
                      >
                        일반
                      </button>
                      <button
                        className={[
                          'rounded-full px-3 py-2 text-sm font-medium',
                          postsSubTab === '바디'
                            ? 'bg-white text-neutral-900 shadow-sm'
                            : 'text-neutral-600 hover:bg-white',
                        ].join(' ')}
                        onClick={() => setPostsSubTab('바디')}
                      >
                        바디
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {postsSubTab === '일반' ? 'post_type=일반' : 'post_type=바디'}
                  </div>
                </div>

                {postsLoading ? (
                  <div className="text-sm text-neutral-500">로딩 중...</div>
                ) : posts.length === 0 ? (
                  <div className="text-sm text-neutral-500">게시글이 없습니다.</div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-white p-4"
                      >
                        <div className="min-w-0">
                          <div className="text-xs text-neutral-500">
                            {formatDate(p.created_at)}
                          </div>
                          {p.image_urls && p.image_urls.length > 0 ? (
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {p.image_urls.map((url, idx) => (
                                <a
                                  key={`${p.id}-${idx}`}
                                  href={url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-md border border-neutral-200 bg-neutral-50"
                                >
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-24 w-full object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                            {p.content ?? ''}
                          </div>
                        </div>
                        <button
                          className="shrink-0 rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                          onClick={() => void deletePost(p.id)}
                        >
                          삭제
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-neutral-500">선택된 유저가 없습니다.</div>
        )}
      </Modal>
    </div>
  )
}

