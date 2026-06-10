import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { GatheringApplicationsPage } from '../views/GatheringApplicationsPage'

type GatheringRow = {
  id: string
  title: string | null
  date: string | null
  time: string | null
  location: string | null
  address: string | null
  description: string | null
  max_male: number | null
  max_female: number | null
  price: number | null
  is_active: boolean | null
  created_at: string
}

function formatDate(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString()
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

type GatheringDraft = {
  title: string
  date: string
  time: string
  location: string
  address: string
  description: string
  max_male: string
  max_female: string
  price: string
  is_active: boolean
}

function toIntOrNull(s: string): number | null {
  const v = Number(String(s ?? '').trim())
  if (!Number.isFinite(v)) return null
  return Math.trunc(v)
}

function toFloatOrNull(s: string): number | null {
  const v = Number(String(s ?? '').trim())
  if (!Number.isFinite(v)) return null
  return v
}

function emptyDraft(): GatheringDraft {
  return {
    title: '',
    date: '',
    time: '',
    location: '',
    address: '',
    description: '',
    max_male: '',
    max_female: '',
    price: '',
    is_active: true,
  }
}

export function GatheringsPage() {
  const [tab, setTab] = useState<'list' | 'applications'>('list')
  const [rows, setRows] = useState<GatheringRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GatheringRow | null>(null)
  const [draft, setDraft] = useState<GatheringDraft>(emptyDraft())

  const title = useMemo(() => (editing ? '소모임 수정' : '소모임 생성'), [editing])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('gatherings')
      .select('id,title,date,time,location,address,description,max_male,max_female,price,is_active,created_at')
      .order('created_at', { ascending: false })

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }
    setRows((data ?? []) as GatheringRow[])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setDraft(emptyDraft())
    setModalOpen(true)
  }

  const openEdit = (row: GatheringRow) => {
    setEditing(row)
    setDraft({
      title: row.title ?? '',
      date: row.date ?? '',
      time: row.time ?? '',
      location: row.location ?? '',
      address: row.address ?? '',
      description: row.description ?? '',
      max_male: row.max_male == null ? '' : String(row.max_male),
      max_female: row.max_female == null ? '' : String(row.max_female),
      price: row.price == null ? '' : String(row.price),
      is_active: Boolean(row.is_active),
    })
    setModalOpen(true)
  }

  const onSave = async () => {
    if (busy) return
    setBusy(true)
    try {
      const payload = {
        title: draft.title.trim() || null,
        date: draft.date.trim() || null,
        // 자유 입력: "15:00~17:00" 등
        time: draft.time.trim() || null,
        location: draft.location.trim() || null,
        address: draft.address.trim() || null,
        description: draft.description.trim() || null,
        max_male: toIntOrNull(draft.max_male),
        max_female: toIntOrNull(draft.max_female),
        price: toFloatOrNull(draft.price),
        is_active: Boolean(draft.is_active),
      }

      if (editing) {
        const { error } = await supabase.from('gatherings').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('gatherings').insert(payload)
        if (error) throw error
      }
      setModalOpen(false)
      setEditing(null)
      await load()
    } catch (e: any) {
      alert(e?.message ?? '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (row: GatheringRow) => {
    if (busy) return
    if (!confirm('정말 삭제하시겠습니까?')) return
    setBusy(true)
    try {
      const { error } = await supabase.from('gatherings').delete().eq('id', row.id)
      if (error) throw error
      await load()
    } catch (e: any) {
      alert(e?.message ?? '삭제 실패')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-semibold text-neutral-900">소모임 관리</div>
          <div className="mt-1 text-sm text-neutral-500">gatherings / gathering_applications 관리</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={[
              'rounded-md px-3 py-2 text-sm font-medium',
              tab === 'list' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200',
            ].join(' ')}
            onClick={() => setTab('list')}
          >
            소모임 목록
          </button>
          <button
            className={[
              'rounded-md px-3 py-2 text-sm font-medium',
              tab === 'applications'
                ? 'bg-neutral-900 text-white'
                : 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200',
            ].join(' ')}
            onClick={() => setTab('applications')}
          >
            신청 관리
          </button>
          {tab === 'list' ? (
            <button
              className="rounded-md bg-[#6C47FF] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              onClick={openCreate}
              disabled={busy}
            >
              소모임 생성
            </button>
          ) : null}
        </div>
      </div>

      {tab === 'applications' ? (
        <div className="mt-4">
          <GatheringApplicationsPage />
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">제목</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">날짜</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">시간</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">장소</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">최대 인원</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">가격</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">활성</th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                      로딩 중...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-neutral-500" colSpan={8}>
                      소모임이 없습니다.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="max-w-[280px] truncate px-4 py-3 text-neutral-900">{r.title ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">{formatDate(r.date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">{r.time ?? '-'}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-neutral-800">{r.location ?? '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        남 {r.max_male ?? 0} / 여 {r.max_female ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {r.price == null ? '-' : r.price.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-800">
                        {r.is_active ? 'Y' : 'N'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                            onClick={() => openEdit(r)}
                            disabled={busy}
                          >
                            수정
                          </button>
                          <button
                            className="rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                            onClick={() => void onDelete(r)}
                            disabled={busy}
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} title={title} onClose={() => setModalOpen(false)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="제목" value={draft.title} onChange={(v) => setDraft((d) => ({ ...d, title: v }))} />
          <Field label="날짜" value={draft.date} onChange={(v) => setDraft((d) => ({ ...d, date: v }))} placeholder="YYYY-MM-DD" />
          <Field label="시간" value={draft.time} onChange={(v) => setDraft((d) => ({ ...d, time: v }))} placeholder="15:00~17:00" />
          <Field label="장소" value={draft.location} onChange={(v) => setDraft((d) => ({ ...d, location: v }))} />
          <Field label="주소" value={draft.address} onChange={(v) => setDraft((d) => ({ ...d, address: v }))} />
          <TextArea
            label="소개글"
            value={draft.description}
            onChange={(v) => setDraft((d) => ({ ...d, description: v }))}
            placeholder="소모임 소개글"
          />
          <Field label="최대 남성 인원" value={draft.max_male} onChange={(v) => setDraft((d) => ({ ...d, max_male: v }))} />
          <Field label="최대 여성 인원" value={draft.max_female} onChange={(v) => setDraft((d) => ({ ...d, max_female: v }))} />
          <Field label="참가비" value={draft.price} onChange={(v) => setDraft((d) => ({ ...d, price: v }))} />
          <div className="flex items-center gap-2">
            <input
              id="is_active"
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))}
            />
            <label htmlFor="is_active" className="text-sm text-neutral-800">
              활성화
            </label>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
            onClick={() => setModalOpen(false)}
          >
            취소
          </button>
          <button
            className="rounded-md bg-[#6C47FF] px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            onClick={() => void onSave()}
            disabled={busy}
          >
            저장
          </button>
        </div>
      </Modal>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <input
        className="rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#6C47FF]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-1 sm:col-span-2">
      <label className="text-xs font-medium text-neutral-500">{label}</label>
      <textarea
        className="min-h-[110px] resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-[#6C47FF]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

