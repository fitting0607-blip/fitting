import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type GatheringApplicationRow = {
  id: string
  name: string | null
  gender: string | null
  phone: string | null
  nickname: string | null
  created_at: string
}

function formatDateTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function GatheringApplicationsPage() {
  const [rows, setRows] = useState<GatheringApplicationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('gathering_applications')
        .select('id,name,gender,phone,nickname,created_at')
        .order('created_at', { ascending: false })

      if (!alive) return

      if (error) {
        alert(error.message)
        setRows([])
        setLoading(false)
        return
      }

      setRows((data ?? []) as GatheringApplicationRow[])
      setLoading(false)
    }

    void run()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-semibold text-neutral-900">
            소모임 신청
          </div>
          <div className="mt-1 text-sm text-neutral-500">
            gathering_applications 테이블을 기반으로 신청 내역을 조회합니다.
          </div>
        </div>
        <div className="text-sm text-neutral-600">
          총{' '}
          <span className="font-medium text-[#6C47FF]">
            {loading ? '—' : rows.length}
          </span>
          건
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 font-medium">ID</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">이름</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">성별</th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  전화번호
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  닉네임
                </th>
                <th className="whitespace-nowrap px-4 py-3 font-medium">
                  신청일시
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
                    신청 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="max-w-[min(360px,45vw)] break-all px-4 py-3 font-mono text-xs text-neutral-800">
                      {r.id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                      {r.name ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                      {r.gender ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                      {r.phone ?? '-'}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-neutral-900">
                      {r.nickname ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                      {formatDateTime(r.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
