import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type PaymentRow = {
  id: string
  user_id: string
  product_title: string | null
  amount: number | null
  created_at: string
}

type UserLite = { id: string; nickname: string | null; email: string | null }

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatKrw(value: number | null | undefined) {
  const v = typeof value === 'number' ? value : 0
  return `₩${v.toLocaleString()}`
}

function shortId(id: string) {
  return String(id).slice(0, 8)
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

export function PaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [usersById, setUsersById] = useState<Record<string, UserLite>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)

      const { data, error } = await supabase
        .from('payments')
        .select('id,user_id,product_title,amount,created_at')
        .order('created_at', { ascending: false })

      if (!alive) return

      if (error) {
        alert(error.message)
        setRows([])
        setUsersById({})
        setLoading(false)
        return
      }

      const paymentRows = (data ?? []) as unknown as PaymentRow[]
      setRows(paymentRows)
      setLoading(false)

      const userIds = Array.from(new Set(paymentRows.map((p) => p.user_id))).filter(
        Boolean,
      )
      if (userIds.length === 0) {
        setUsersById({})
        return
      }

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id,nickname,email')
        .in('id', userIds)

      if (!alive) return

      if (usersError) {
        alert(usersError.message)
        setUsersById({})
        return
      }

      const map: Record<string, UserLite> = {}
      for (const u of (usersData ?? []) as any[]) {
        map[String(u.id)] = {
          id: String(u.id),
          nickname: (u.nickname ?? null) as string | null,
          email: (u.email ?? null) as string | null,
        }
      }
      setUsersById(map)
    }

    void run()
    return () => {
      alive = false
    }
  }, [])

  const openDetail = (id: string) => setSelectedId(id)
  const closeDetail = () => setSelectedId(null)

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-semibold text-neutral-900">
            결제 정보 관리
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            payments 테이블을 기반으로 결제 내역을 조회합니다.
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  고유번호
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  상품명
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  가격(₩)
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  결제자
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  결제일
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  상세보기
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
                    결제 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((p) => {
                  const user = usersById[p.user_id]
                  return (
                    <tr key={p.id} className="hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-neutral-800">
                        {shortId(p.id)}
                      </td>
                      <td className="max-w-[420px] truncate px-4 py-3 text-neutral-900">
                        {p.product_title ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                        {formatKrw(p.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                        {user?.nickname ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                          onClick={() => openDetail(p.id)}
                        >
                          보기
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

      <Modal open={Boolean(selected)} title="결제 상세" onClose={closeDetail}>
        {selected ? (
          <div className="grid grid-cols-1 gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-neutral-500">고유번호</div>
                <div className="mt-1 font-mono text-sm text-neutral-900">
                  {shortId(selected.id)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">결제일</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {formatDateTime(selected.created_at)}
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-neutral-500">상품명</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {selected.product_title ?? '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">가격(₩)</div>
                <div className="mt-1 text-sm font-semibold text-neutral-900">
                  {formatKrw(selected.amount)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">결제자</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {usersById[selected.user_id]?.nickname ?? '-'}
                </div>
                <div className="mt-1 text-xs text-neutral-500">
                  {usersById[selected.user_id]?.email ?? '-'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">선택된 결제가 없습니다.</div>
        )}
      </Modal>
    </div>
  )
}

