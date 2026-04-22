import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type TermsType = 'service' | 'privacy' | 'point'

type TermsRow = {
  id: string
  type: TermsType
  content: string
  updated_at: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function isTermsType(value: unknown): value is TermsType {
  return value === 'service' || value === 'privacy' || value === 'point'
}

function normalizeTermsRow(raw: unknown): TermsRow | null {
  const r = asRecord(raw)
  if (!r) return null
  const id = r.id
  const type = r.type
  if (typeof id !== 'string' || !id) return null
  if (!isTermsType(type)) return null
  return {
    id,
    type,
    content: typeof r.content === 'string' ? r.content : '',
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : null,
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch {
    return value
  }
}

const TAB_LABEL: Record<TermsType, string> = {
  service: '서비스 이용약관',
  privacy: '개인정보 처리방침',
  point: '포인트 정책',
}

export function TermsPage() {
  const [active, setActive] = useState<TermsType>('service')
  const [rows, setRows] = useState<Partial<Record<TermsType, TermsRow>>>({})
  const [drafts, setDrafts] = useState<Record<TermsType, string>>({
    service: '',
    privacy: '',
    point: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const activeRow = rows[active] ?? null
  const updatedAtText = useMemo(
    () => formatDateTime(activeRow?.updated_at ?? null),
    [activeRow?.updated_at],
  )

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('terms')
      .select('id,type,content,updated_at')
      .in('type', ['service', 'privacy', 'point'])

    if (error) {
      alert(error.message)
      setRows({})
      setLoading(false)
      return
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((x) => normalizeTermsRow(x))
      .filter(Boolean) as TermsRow[]

    const nextRows: Partial<Record<TermsType, TermsRow>> = {}
    const nextDrafts: Record<TermsType, string> = { service: '', privacy: '', point: '' }
    for (const r of mapped) {
      nextRows[r.type] = r
      nextDrafts[r.type] = r.content ?? ''
    }

    setRows(nextRows)
    setDrafts(nextDrafts)
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  const save = async () => {
    if (saving) return
    const type = active
    const content = drafts[type] ?? ''

    setSaving(true)
    try {
      const payload = { type, content, updated_at: new Date().toISOString() }

      const { data, error } = await supabase
        .from('terms')
        .upsert(payload, { onConflict: 'type' })
        .select('id,type,content,updated_at')
        .maybeSingle()

      if (error) throw error

      const normalized = data ? normalizeTermsRow(data) : null
      if (normalized) {
        setRows((prev) => ({ ...prev, [normalized.type]: normalized }))
      } else {
        await load()
      }
    } catch (e: unknown) {
      const rec = asRecord(e)
      const msg = rec && typeof rec.message === 'string' ? String(rec.message) : null
      alert(msg ?? '저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xl font-semibold text-neutral-900">약관 관리</div>
        <div className="flex items-center justify-end gap-2">
          <button
            className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() => void load()}
            disabled={loading || saving}
          >
            새로고침
          </button>
          <button
            className="rounded-md bg-[#6C47FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5B3CF0] disabled:opacity-50"
            onClick={() => void save()}
            disabled={loading || saving}
          >
            {saving ? '저장 중…' : '저장하기'}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
          {(Object.keys(TAB_LABEL) as TermsType[]).map((t) => {
            const isActive = t === active
            return (
              <button
                key={t}
                className={[
                  'rounded-full px-3 py-1 text-sm font-semibold',
                  isActive
                    ? 'bg-[#6C47FF]/10 text-[#6C47FF] ring-1 ring-[#6C47FF]/20'
                    : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-50',
                ].join(' ')}
                onClick={() => setActive(t)}
                disabled={loading || saving}
              >
                {TAB_LABEL[t]}
              </button>
            )
          })}
        </div>

        <div className="px-4 py-4">
          {loading ? (
            <div className="text-sm text-neutral-500">로딩 중...</div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-neutral-900">{TAB_LABEL[active]}</div>
                <div className="text-xs text-neutral-500">마지막 업데이트: {updatedAtText}</div>
              </div>

              <textarea
                value={drafts[active] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [active]: e.target.value }))}
                placeholder="약관 내용을 입력해 주세요."
                className="min-h-[420px] w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm leading-6 text-neutral-900 outline-none ring-[#6C47FF]/15 focus:ring-4"
                disabled={saving}
              />

              <div className="text-[11px] text-neutral-500">
                저장 시 Supabase <span className="font-semibold text-neutral-700">terms</span>{' '}
                테이블({`type='${active}'`})의 <span className="font-semibold text-neutral-700">content</span>
                가 업데이트됩니다.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
