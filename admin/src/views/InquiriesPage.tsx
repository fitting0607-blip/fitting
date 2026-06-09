import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type InquiryStatus = 'pending' | 'answered'

type InquiryRow = {
  id: string
  user_id: string
  title: string
  content: string
  answer: string | null
  answered_at: string | null
  status: InquiryStatus | (string & {})
  created_at: string
  users?: { nickname: string | null } | { nickname: string | null }[] | null
}

type StatusTab = 'pending' | 'answered'

const TAB_ACTIVE = 'bg-[#6C47FF] text-white'
const TAB_INACTIVE = 'text-neutral-600 hover:bg-white'

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function normalizeStatus(s: unknown): InquiryStatus {
  return String(s ?? 'pending') === 'answered' ? 'answered' : 'pending'
}

function statusLabel(status: InquiryStatus) {
  return status === 'answered' ? '답변완료' : '답변대기'
}

function getNickname(row: InquiryRow): string {
  const u: unknown = row.users
  if (!u) return '-'
  if (Array.isArray(u)) return String((u[0] as { nickname?: string | null })?.nickname ?? '-') || '-'
  return String((u as { nickname?: string | null })?.nickname ?? '-') || '-'
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
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-4">
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

export function InquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<StatusTab>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  )

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('inquiries')
      .select('id,user_id,title,content,answer,answered_at,status,created_at,users(nickname)')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const list = ((data ?? []) as InquiryRow[]).map((r) => {
      const u = r.users
      return {
        ...r,
        users: Array.isArray(u) ? (u[0] ?? null) : u ?? null,
      }
    })

    setRows(list)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const visibleRows = useMemo(() => {
    return rows.filter((r) => normalizeStatus(r.status) === tab)
  }, [rows, tab])

  const pendingCount = useMemo(
    () => rows.filter((r) => normalizeStatus(r.status) === 'pending').length,
    [rows],
  )
  const answeredCount = useMemo(
    () => rows.filter((r) => normalizeStatus(r.status) === 'answered').length,
    [rows],
  )

  const openDetail = (row: InquiryRow) => {
    setSelectedId(row.id)
    setAnswerDraft(String(row.answer ?? ''))
  }

  const closeDetail = () => {
    setSelectedId(null)
    setAnswerDraft('')
  }

  const saveAnswer = async () => {
    if (!selected || saving) return
    const trimmed = answerDraft.trim()
    if (!trimmed) {
      alert('답변 내용을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const nowIso = new Date().toISOString()
      const { data, error } = await supabase
        .from('inquiries')
        .update({
          answer: trimmed,
          answered_at: nowIso,
          status: 'answered',
        })
        .eq('id', selected.id)
        .select('id,user_id,title,content,answer,answered_at,status,created_at,users(nickname)')
        .maybeSingle()

      if (error) throw error

      const updated = data
        ? ({
            ...(data as InquiryRow),
            users: Array.isArray((data as InquiryRow).users)
              ? ((data as InquiryRow).users as { nickname: string | null }[])[0] ?? null
              : (data as InquiryRow).users ?? null,
          } as InquiryRow)
        : ({
            ...selected,
            answer: trimmed,
            answered_at: nowIso,
            status: 'answered' as const,
          } as InquiryRow)

      setRows((prev) => prev.map((r) => (r.id === selected.id ? updated : r)))
      setTab('answered')
      closeDetail()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : '답변 저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="text-sm font-medium text-neutral-900">
        총 <span className="text-[#6C47FF]">{rows.length}</span>건의 문의가 있습니다.
      </div>

      <div className="mt-5 rounded-full bg-neutral-100 p-1">
        <div className="grid grid-cols-2 gap-1">
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'pending' ? TAB_ACTIVE : TAB_INACTIVE,
            ].join(' ')}
            onClick={() => setTab('pending')}
          >
            답변대기 ({pendingCount})
          </button>
          <button
            className={[
              'rounded-full px-3 py-2 text-sm font-medium',
              tab === 'answered' ? TAB_ACTIVE : TAB_INACTIVE,
            ].join(' ')}
            onClick={() => setTab('answered')}
          >
            답변완료 ({answeredCount})
          </button>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="text-sm text-neutral-500">로딩 중...</div>
        ) : visibleRows.length === 0 ? (
          <div className="text-sm text-neutral-500">문의가 없습니다.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">문의일</th>
                    <th className="whitespace-nowrap px-4 py-3">유저 닉네임</th>
                    <th className="whitespace-nowrap px-4 py-3">제목</th>
                    <th className="whitespace-nowrap px-4 py-3">상태</th>
                    <th className="whitespace-nowrap px-4 py-3">상세보기</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {visibleRows.map((r) => {
                    const status = normalizeStatus(r.status)
                    return (
                      <tr key={r.id} className="hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                          {formatDateTime(r.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-neutral-900">
                          {getNickname(r)}
                        </td>
                        <td className="max-w-[360px] truncate px-4 py-3 text-neutral-800">
                          {r.title}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <span
                            className={[
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                              status === 'answered'
                                ? 'bg-violet-100 text-[#6C47FF]'
                                : 'bg-neutral-100 text-neutral-600',
                            ].join(' ')}
                          >
                            {statusLabel(status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <button
                            className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                            onClick={() => openDetail(r)}
                          >
                            보기
                          </button>
                        </td>
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
        title={selected ? `문의 상세 · ${selected.title}` : '문의 상세'}
        onClose={closeDetail}
      >
        {selected ? (
          <div className="grid grid-cols-1 gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs text-neutral-500">유저 닉네임</div>
                <div className="mt-1 text-sm text-neutral-900">{getNickname(selected)}</div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">문의일</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {formatDateTime(selected.created_at)}
                </div>
              </div>
              <div>
                <div className="text-xs text-neutral-500">상태</div>
                <div className="mt-1 text-sm text-neutral-900">
                  {statusLabel(normalizeStatus(selected.status))}
                </div>
              </div>
              {selected.answered_at ? (
                <div>
                  <div className="text-xs text-neutral-500">답변일</div>
                  <div className="mt-1 text-sm text-neutral-900">
                    {formatDateTime(selected.answered_at)}
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <div className="text-xs text-neutral-500">제목</div>
              <div className="mt-1 text-sm font-medium text-neutral-900">{selected.title}</div>
            </div>

            <div>
              <div className="text-xs text-neutral-500">유저 문의 내용</div>
              <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm whitespace-pre-wrap text-neutral-900">
                {selected.content}
              </div>
            </div>

            <div>
              <div className="text-xs text-neutral-500">답변</div>
              <textarea
                value={answerDraft}
                onChange={(e) => setAnswerDraft(e.target.value)}
                placeholder="답변 내용을 입력해주세요"
                rows={6}
                className="mt-2 w-full resize-y rounded-lg border border-neutral-200 px-4 py-3 text-sm outline-none ring-[#6C47FF]/15 focus:ring-4"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={closeDetail}
                disabled={saving}
              >
                취소
              </button>
              <button
                className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#5B3CF0] disabled:opacity-60"
                onClick={() => void saveAnswer()}
                disabled={saving}
              >
                {saving ? '저장 중…' : '답변 저장'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-neutral-500">선택된 문의가 없습니다.</div>
        )}
      </Modal>
    </div>
  )
}
