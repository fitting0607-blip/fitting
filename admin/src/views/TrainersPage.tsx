import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type TrainerProfileRow = {
  id: string
  user_id: string
  facility_name: string | null
  facility_addr: string | null
  facility_addr_detail: string | null
  intro: string | null
  latitude: number | null
  longitude: number | null
  status: string | null
  is_approved: boolean | null
  facility_images: string[] | null
  cert_images: string[] | null
  profile_images: string[] | null
  created_at: string
  updated_at: string
  users?:
    | { nickname: string | null; email: string | null }
    | { nickname: string | null; email: string | null }[]
    | null
}

function includesLoose(haystack: string | null | undefined, needle: string) {
  if (!needle) return true
  if (!haystack) return false
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function pickFirstImage(urls: string[] | null | undefined) {
  if (!urls || urls.length === 0) return null
  return urls[0] ?? null
}

function getJoinedUser(
  row: TrainerProfileRow,
): { nickname: string | null; email: string | null } | null {
  const u: unknown = row.users
  if (!u) return null
  if (Array.isArray(u)) return (u[0] as any) ?? null
  return u as any
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

export function TrainersPage() {
  const [rows, setRows] = useState<TrainerProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'completed' | 'payment_pending' | 'pending'>(
    'completed',
  )
  const [selected, setSelected] = useState<TrainerProfileRow | null>(null)

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('trainer_profiles')
        .select(
          'id,user_id,facility_name,facility_addr,facility_addr_detail,intro,latitude,longitude,status,is_approved,facility_images,cert_images,profile_images,created_at,updated_at,users (nickname,email)',
        )
        .order('created_at', { ascending: false })

      if (!alive) return
      if (error) {
        alert(error.message)
        setRows([])
        setLoading(false)
        return
      }

      setRows((data ?? []) as unknown as TrainerProfileRow[])
      setLoading(false)
    }
    void run()
    return () => {
      alive = false
    }
  }, [])

  const visibleRows = useMemo(() => {
    const q = query.trim()
    const filteredByTab = rows.filter((r) => {
      const status = (r.status ?? '').trim()
      if (tab === 'completed') return status === 'approved' && r.is_approved === true
      if (tab === 'payment_pending')
        return status === 'approved' && r.is_approved === false
      return status === 'pending'
    })
    if (!q) return filteredByTab
    return filteredByTab.filter((r) => {
      const u = getJoinedUser(r)
      return (
        includesLoose(u?.nickname, q) ||
        includesLoose(u?.email, q) ||
        includesLoose(r.facility_name, q)
      )
    })
  }, [rows, query, tab])

  const totalCount = rows.length

  const openDetail = (r: TrainerProfileRow) => setSelected(r)
  const closeDetail = () => setSelected(null)

  const deleteProfile = async (r: TrainerProfileRow) => {
    const ok = confirm('해당 피티 유저 프로필을 삭제하시겠습니까?')
    if (!ok) return

    const { error } = await supabase
      .from('trainer_profiles')
      .delete()
      .eq('id', r.id)
    if (error) {
      alert(error.message)
      return
    }

    setRows((prev) => prev.filter((x) => x.id !== r.id))
    if (selected?.id === r.id) closeDetail()
  }

  const approveProfile = async (r: TrainerProfileRow) => {
    const ok = confirm('승인 처리하시겠습니까?')
    if (!ok) return

    const { data, error } = await supabase
      .from('trainer_profiles')
      .update({ status: 'approved', is_approved: false })
      .eq('id', r.id)
      .select(
        'id,user_id,facility_name,facility_addr,facility_addr_detail,intro,latitude,longitude,status,is_approved,facility_images,cert_images,profile_images,created_at,updated_at,users (nickname,email)',
      )
      .maybeSingle()

    if (error) {
      alert(error.message)
      return
    }

    if (data) {
      setRows((prev) => prev.map((x) => (x.id === r.id ? (data as any) : x)))
      if (selected?.id === r.id) setSelected(data as any)
    } else {
      setRows((prev) =>
        prev.map((x) =>
          x.id === r.id ? { ...x, status: 'approved', is_approved: false } : x,
        ),
      )
      if (selected?.id === r.id)
        setSelected((prev) =>
          prev ? { ...prev, status: 'approved', is_approved: false } : prev,
        )
    }
  }

  const rejectProfile = async (r: TrainerProfileRow) => {
    const ok = confirm('거절 처리(삭제)하시겠습니까?')
    if (!ok) return
    await deleteProfile(r)
  }

  const selectedUser = selected ? getJoinedUser(selected) : null
  const selectedAddress = selected
    ? [selected.facility_addr, selected.facility_addr_detail]
        .filter(Boolean)
        .join(' ')
    : ''

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-medium text-neutral-900">
          총 <span className="text-[#6C47FF]">{totalCount}</span>명의 피티 유저가
          있습니다.
        </div>
        <div className="w-full sm:w-80">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="닉네임/이메일로 검색해 주세요"
            className="w-full rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
          />
        </div>
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-3 gap-1">
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'completed'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('completed')}
          >
            승인 완료
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'payment_pending'
                ? 'bg-[#6C47FF] text-white'
                : 'text-neutral-600 hover:bg-white',
            ].join(' ')}
            onClick={() => setTab('payment_pending')}
          >
            결제 대기
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
            승인 대기
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : visibleRows.length === 0 ? (
          <div className="text-sm text-neutral-500">피티 유저가 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {visibleRows.map((r) => {
              const u = getJoinedUser(r)
              const avatar = pickFirstImage(r.profile_images)
              return (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
                      {avatar ? (
                        <img
                          src={avatar}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-neutral-900">
                        {u?.nickname ?? '-'}
                      </div>
                      <div className="truncate text-xs text-neutral-500">
                        {u?.email ?? '-'}
                      </div>
                      <div className="mt-1 truncate text-xs text-neutral-700">
                        {r.facility_name ?? '-'}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {tab === 'pending' ? (
                      <>
                        <button
                          className="rounded-md bg-[#6C47FF] px-3 py-1 text-xs font-medium text-white hover:bg-[#5B3CF0]"
                          onClick={() => void approveProfile(r)}
                        >
                          승인
                        </button>
                        <button
                          className="rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                          onClick={() => void rejectProfile(r)}
                        >
                          거절
                        </button>
                      </>
                    ) : (
                      <button
                        className="rounded-md bg-neutral-600 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-700"
                        onClick={() => void deleteProfile(r)}
                      >
                        삭제
                      </button>
                    )}

                    <button
                      aria-label="open detail"
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
                      onClick={() => openDetail(r)}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(selected)}
        title={
          tab === 'pending'
            ? '피티 유저 상세 (승인 대기)'
            : tab === 'payment_pending'
              ? '피티 유저 상세 (결제 대기)'
              : '피티 유저 상세'
        }
        onClose={closeDetail}
      >
        {selected ? (
          <div>
            <div className="flex flex-col gap-1">
              <div className="text-lg font-semibold text-neutral-900">
                {selectedUser?.nickname ?? '-'}
              </div>
              <div className="text-sm text-neutral-500">
                {selectedUser?.email ?? '-'}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-neutral-500">시설명</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selected.facility_name ?? '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">주소</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selectedAddress || '-'}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-neutral-500">소개글</div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-900">
                  {selected.intro ?? '-'}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6">
              <ImageGrid title="자격증 이미지" urls={selected.cert_images} />
              <ImageGrid title="시설 이미지" urls={selected.facility_images} />
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {tab === 'pending' ? (
                <>
                  <button
                    className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5B3CF0]"
                    onClick={() => void approveProfile(selected)}
                  >
                    승인
                  </button>
                  <button
                    className="rounded-md bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                    onClick={() => void rejectProfile(selected)}
                  >
                    거절(삭제)
                  </button>
                </>
              ) : (
                <button
                  className="rounded-md bg-neutral-600 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
                  onClick={() => void deleteProfile(selected)}
                >
                  삭제
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">선택된 피티 유저가 없습니다.</div>
        )}
      </Modal>
    </div>
  )
}
